import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Redemption, MintIntent, Collection, Mint } from "@/lib/models";
import {
  getAvailableStickerIds,
  getSticker,
  pickUniformAvailableStickerIdFromHex,
} from "@/lib/stickers";
import { drawSwitchboardRandomness } from "@/lib/solana/randomness";

import { umiServer } from "@/lib/solana/umi";
import { mintV2 } from "@metaplex-foundation/mpl-bubblegum";
import { createNoopSigner, publicKey } from "@metaplex-foundation/umi";
import { some, none } from "@metaplex-foundation/umi";

function rid() {
  return crypto.randomBytes(16).toString("hex");
}

function safePublicKey(input?: string | null) {
  const v = (input ?? "").trim();
  if (!v) return null;
  try {
    return publicKey(v);
  } catch {
    return null;
  }
}

type CountByStickerAgg = { _id: string; count: number };

function toCountMap(rows: CountByStickerAgg[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(String(row._id), Number(row.count) || 0);
  }
  return map;
}

export async function POST(req: Request) {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const walletPubkey = body?.walletPubkey as string | undefined;
  if (!walletPubkey)
    return new NextResponse("Missing walletPubkey", { status: 400 });

  await db();

  const LOCK_TTL_MINUTES = Number(process.env.LOCK_TTL_MINUTES ?? 10);
  const staleBefore = new Date(Date.now() - LOCK_TTL_MINUTES * 60_000);
  const rewardId = process.env.TWITCH_REWARD_ID;

  await MintIntent.updateMany(
    {
      status: "PREPARED",
      updatedAt: { $lt: staleBefore },
    },
    { $set: { status: "FAILED", error: "INTENT_EXPIRED" } }
  );

  await Redemption.updateMany(
    {
      status: "PENDING",
      lockedByIntentId: { $ne: null },
      updatedAt: { $lt: staleBefore },
      ...(rewardId ? { rewardId } : {}),
    },
    { $set: { lockedByIntentId: null } }
  );

  const intentId = rid();

  // 1) lock 1 ticket atomiquement

  const ticket = await Redemption.findOneAndUpdate(
    {
      twitchUserId,
      status: "PENDING",
      lockedByIntentId: null,
      ...(rewardId ? { rewardId } : {}),
    },
    { $set: { lockedByIntentId: intentId } },
    { sort: { createdAt: 1 }, new: true }
  );

  if (!ticket) return new NextResponse("No tickets", { status: 409 });

  try {
    const [mintedAgg, reservedAgg] = await Promise.all([
      Mint.aggregate<CountByStickerAgg>([
        { $group: { _id: "$stickerId", count: { $sum: 1 } } },
      ]),
      MintIntent.aggregate<CountByStickerAgg>([
        { $match: { status: "PREPARED" } },
        { $group: { _id: "$stickerId", count: { $sum: 1 } } },
      ]),
    ]);

    const availableStickerIds = getAvailableStickerIds({
      mintedCounts: toCountMap(mintedAgg),
      reservedCounts: toCountMap(reservedAgg),
    });

    if (!availableStickerIds.length) {
      await Redemption.updateOne(
        { redemptionId: ticket.redemptionId },
        { $set: { lockedByIntentId: null } }
      );
      return new NextResponse("Collection sold out", { status: 409 });
    }

    const randomnessProof = await drawSwitchboardRandomness();
    const draw = pickUniformAvailableStickerIdFromHex(
      availableStickerIds,
      randomnessProof.randomHex,
    );
    const stickerId = draw.stickerId;

    const umi = umiServer();
    const ownerPk = publicKey(walletPubkey);
    const feePayer = createNoopSigner(ownerPk);

    const metaBase = process.env.METADATA_BASE_URI;
    if (!metaBase)
      return new NextResponse("Missing METADATA_BASE_URI", { status: 500 });

    const uri = `${metaBase}/${stickerId}.json`;
    const sticker = getSticker(stickerId);
    const onchainName = sticker?.name ?? `Panini #${stickerId}`;

    const active = await Collection.findOne({ isActive: true }).lean();

    const merkleTreePk =
      (active?.merkleTreePubkey as string | undefined) ??
      process.env.MERKLE_TREE_PUBKEY;

    if (!merkleTreePk)
      return new NextResponse("Missing MERKLE_TREE_PUBKEY", { status: 500 });

    const merkleTree = safePublicKey(merkleTreePk);
    if (!merkleTree)
      return new NextResponse("Invalid MERKLE_TREE_PUBKEY", { status: 500 });

    const coreCollectionStr =
      (active?.coreCollectionPubkey as string | undefined) ??
      process.env.CORE_COLLECTION_PUBKEY;

    const coreCollectionPk = safePublicKey(coreCollectionStr);

    const builder = await mintV2(umi, {
      merkleTree,
      leafOwner: ownerPk,
      ...(coreCollectionPk
        ? {
            coreCollection: coreCollectionPk,
            collectionAuthority: umi.identity,
            metadata: {
              name: onchainName,
              uri,
              sellerFeeBasisPoints: 0,
              collection: some(coreCollectionPk),
              creators: [],
            },
          }
        : {
            metadata: {
              name: onchainName,
              uri,
              sellerFeeBasisPoints: 0,
              collection: none(),
              creators: [],
            },
          }),
    });

    const built = await (
      await builder.setFeePayer(feePayer).setLatestBlockhash(umi)
    ).buildAndSign(umi);

    const bytes = umi.transactions.serialize(built);
    const txB64 = Buffer.from(bytes).toString("base64");

    await MintIntent.create({
      intentId,
      twitchUserId,
      wallet: walletPubkey,
      redemptionId: ticket.redemptionId,
      stickerId,
      randomnessProvider: randomnessProof.provider,
      randomnessQueuePubkey: randomnessProof.queuePubkey,
      randomnessAccount: randomnessProof.randomnessAccount,
      randomnessCommitTx: randomnessProof.commitTx,
      randomnessRevealTx: randomnessProof.revealTx,
      randomnessCloseTx: randomnessProof.closeTx,
      randomnessValueHex: randomnessProof.randomHex,
      randomnessSeedSlot: randomnessProof.seedSlot,
      randomnessRevealSlot: randomnessProof.revealSlot,
      drawAvailableStickerIds: availableStickerIds,
      drawIndex: draw.index,
      preparedTxB64: txB64,
      status: "PREPARED",
    });

    return NextResponse.json({
      intentId,
      txB64,
      proof: {
        provider: randomnessProof.provider,
        queuePubkey: randomnessProof.queuePubkey,
        randomnessAccount: randomnessProof.randomnessAccount,
        commitTx: randomnessProof.commitTx,
        revealTx: randomnessProof.revealTx,
        closeTx: randomnessProof.closeTx,
        randomHex: randomnessProof.randomHex,
        drawIndex: draw.index,
        availableCount: availableStickerIds.length,
      },
    });
  } catch (e) {
    console.error("mint/prepare failed", e);

    await Redemption.updateOne(
      { redemptionId: ticket.redemptionId },
      { $set: { lockedByIntentId: null } }
    );

    return new NextResponse("Prepare failed", { status: 500 });
  }
}
