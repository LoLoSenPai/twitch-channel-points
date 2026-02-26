import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Collection, Redemption, Mint, UserWallet } from "@/lib/models";
import { touchWalletForUser } from "@/lib/wallet-link";
import { STICKERS_TOTAL } from "@/lib/stickers";

interface TwitchUser {
  id: string;
  displayName?: string;
}

type DasAsset = {
  id: string;
  grouping?: Array<{
    group_key?: string;
    group_value?: string;
  }>;
  compression?: {
    compressed?: boolean;
  };
  content?: {
    metadata?: {
      attributes?: Array<{ trait_type?: string; value?: string | number }>;
    };
  };
};

function isInCollection(asset: DasAsset, collectionPubkey: string) {
  const expected = collectionPubkey.trim();
  if (!expected) return true;
  const groups = asset.grouping ?? [];
  return groups.some(
    (group) =>
      String(group.group_key ?? "").toLowerCase() === "collection" &&
      String(group.group_value ?? "").trim() === expected
  );
}

function stickerIdFromAsset(asset: DasAsset): string | null {
  const attrs = asset.content?.metadata?.attributes ?? [];
  const stickerAttr = attrs.find(
    (a) => String(a.trait_type ?? "").toLowerCase() === "sticker_id"
  );
  if (!stickerAttr) return null;
  return String(stickerAttr.value ?? "").trim() || null;
}

async function fetchOwnerCollectionAssets(params: {
  rpcUrl: string;
  walletPubkey: string;
  collectionPubkey: string;
}) {
  const result: Array<{ assetId: string; stickerId: string }> = [];
  let page = 1;
  const limit = 200;
  const maxPages = 10;

  while (page <= maxPages) {
    const response = await fetch(params.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `me-assets-${params.walletPubkey}-${page}`,
        method: "getAssetsByOwner",
        params: {
          ownerAddress: params.walletPubkey,
          page,
          limit,
          sortBy: { sortBy: "created", sortDirection: "desc" },
        },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch assets (${response.status})`);
    }

    const json = (await response.json()) as {
      result?: { items?: DasAsset[] };
      error?: { message?: string };
    };

    if (json.error) {
      throw new Error(json.error.message ?? "DAS error");
    }

    const items = json.result?.items ?? [];
    for (const asset of items) {
      if (asset.compression?.compressed === false) continue;
      if (!isInCollection(asset, params.collectionPubkey)) continue;
      const stickerId = stickerIdFromAsset(asset);
      if (!stickerId) continue;
      result.push({ assetId: asset.id, stickerId });
    }

    if (items.length < limit) break;
    page += 1;
  }

  return result;
}

function normalizeWallet(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    return new PublicKey(raw).toBase58();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const session = await auth();
  const twitchUserId = (session?.user as TwitchUser | undefined)?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  await db();

  const { searchParams } = new URL(req.url);
  const connectedWallet = normalizeWallet(searchParams.get("walletPubkey"));
  let linkedConnectedWallet: string | null = connectedWallet;
  if (connectedWallet) {
    const link = await touchWalletForUser(twitchUserId, connectedWallet);
    if (!link.ok) {
      linkedConnectedWallet = null;
    }
  }

  const rewardId = process.env.TWITCH_REWARD_ID;

  const baseFilter: Record<string, unknown> = {
    twitchUserId,
    status: "PENDING",
    ...(rewardId ? { rewardId } : {}),
  };

  const ticketsAvailable = await Redemption.countDocuments({
    ...baseFilter,
    lockedByIntentId: null,
  });

  const ticketsLocked = await Redemption.countDocuments({
    ...baseFilter,
    lockedByIntentId: { $ne: null },
  });

  const active = await Collection.findOne({ isActive: true }).lean();
  const collectionPubkey = String(
    (active?.coreCollectionPubkey as string | undefined) ??
      process.env.CORE_COLLECTION_PUBKEY ??
      ""
  ).trim();
  const rpcUrl = String(process.env.HELIUS_RPC_URL ?? "").trim();

  const [walletsFromMint, walletRows] = await Promise.all([
    Mint.distinct("wallet", { twitchUserId }),
    UserWallet.find({ twitchUserId }).select({ wallet: 1 }).lean(),
  ]);
  const wallets = [
    ...new Set(
      [
        ...walletsFromMint.map((w) => String(w ?? "").trim()),
        ...walletRows.map((row) => String((row as { wallet?: string }).wallet ?? "").trim()),
        linkedConnectedWallet ?? "",
      ].filter(Boolean)
    ),
  ];

  let mints: Array<{ stickerId: string; mintTx: string }> = [];
  const canUseOnchain = Boolean(collectionPubkey && rpcUrl && wallets.length);
  let onchainFailed = false;

  if (canUseOnchain) {
    try {
      const allAssets = await Promise.all(
        wallets.map((walletPubkey) =>
          fetchOwnerCollectionAssets({ rpcUrl, walletPubkey, collectionPubkey })
        )
      );

      mints = allAssets
        .flat()
        .map((asset) => ({ stickerId: asset.stickerId, mintTx: asset.assetId }));
    } catch (e) {
      console.error("me/route onchain assets fallback", e);
      onchainFailed = true;
    }
  }

  if (!canUseOnchain || onchainFailed) {
    const dbMints = await Mint.find({ twitchUserId })
      .sort({ createdAt: -1 })
      .lean();
    mints = dbMints.map((mint) => ({
      stickerId: String((mint as { stickerId?: string }).stickerId ?? ""),
      mintTx: String((mint as { mintTx?: string }).mintTx ?? ""),
    }));
  }

  return NextResponse.json({
    user: {
      id: twitchUserId,
      displayName:
        (session?.user as TwitchUser | undefined)?.displayName ?? "viewer",
    },
    tickets: ticketsAvailable,
    ticketsLocked,
    totalStickers: STICKERS_TOTAL,
    mints,
  });
}
