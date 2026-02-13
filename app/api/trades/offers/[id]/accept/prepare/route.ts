import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { TradeOffer } from "@/lib/models";
import { prepareDelegateTxForAsset } from "@/lib/solana/trades";
import { tradeDelegatePublicKeyBase58 } from "@/lib/solana/umi";

type Params = { id: string };

function sanitizeStickerId(value: unknown) {
  return String(value ?? "").trim();
}

function sanitizeStickerIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    const unique = new Set<string>();
    for (const entry of value) {
      const id = sanitizeStickerId(entry);
      if (!id) continue;
      unique.add(id);
    }
    return [...unique];
  }
  const single = sanitizeStickerId(value);
  return single ? [single] : [];
}

function wantedStickerIdsFromOffer(offer: {
  wantedStickerIds?: unknown;
  wantedStickerId?: unknown;
}) {
  const ids = sanitizeStickerIds(offer.wantedStickerIds);
  if (ids.length) return ids;
  return sanitizeStickerIds(offer.wantedStickerId);
}

async function unlockOfferOnError(offerId: string) {
  await TradeOffer.updateOne(
    { offerId, status: "LOCKED" },
    {
      $set: {
        status: "OPEN",
        takerTwitchUserId: null,
        takerWallet: null,
        takerAssetId: null,
        takerPreparedDelegationTxB64: null,
      },
    }
  );
}

export async function POST(
  req: Request,
  { params }: { params: Params | Promise<Params> }
) {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await Promise.resolve(params);
  const offerId = String(id ?? "").trim();
  if (!offerId) return new NextResponse("Missing offer id", { status: 400 });

  const body = await req.json().catch(() => null);
  const walletPubkey = String(body?.walletPubkey ?? "").trim();
  const takerAssetId = String(body?.takerAssetId ?? "").trim();
  if (!walletPubkey || !takerAssetId) {
    return new NextResponse("Missing params", { status: 400 });
  }

  await db();

  const lock = await TradeOffer.findOneAndUpdate(
    {
      offerId,
      status: "OPEN",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    },
    {
      $set: {
        status: "LOCKED",
        takerTwitchUserId: twitchUserId,
        takerWallet: walletPubkey,
      },
    },
    { new: true }
  ).lean();

  if (!lock) return new NextResponse("Offer not available", { status: 409 });
  if (String(lock.makerTwitchUserId) === twitchUserId) {
    await unlockOfferOnError(offerId);
    return new NextResponse("Maker cannot accept own offer", { status: 409 });
  }

  try {
    const delegateWallet = tradeDelegatePublicKeyBase58();
    const { txB64, stickerId } = await prepareDelegateTxForAsset({
      assetId: takerAssetId,
      ownerWallet: walletPubkey,
      newDelegateWallet: delegateWallet,
    });

    if (!stickerId) {
      throw new Error("Cannot detect sticker_id on taker asset metadata");
    }
    const wantedStickerIds = wantedStickerIdsFromOffer(lock);
    if (!wantedStickerIds.includes(String(stickerId))) {
      throw new Error("Taker asset sticker does not match wanted sticker");
    }
    if (String(takerAssetId) === String(lock.makerAssetId)) {
      throw new Error("Cannot trade the same asset");
    }

    await TradeOffer.updateOne(
      { offerId, status: "LOCKED" },
      {
        $set: {
          takerAssetId,
          takerPreparedDelegationTxB64: txB64,
          error: null,
        },
      }
    );

    return NextResponse.json({
      offerId,
      txB64,
      takerStickerId: stickerId,
      delegateWallet,
    });
  } catch (e) {
    await unlockOfferOnError(offerId);
    return new NextResponse((e as Error)?.message ?? "Prepare accept failed", {
      status: 409,
    });
  }
}
