import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { TradeOffer } from "@/lib/models";
import {
  prepareDelegateTxForAsset,
} from "@/lib/solana/trades";
import { tradeDelegatePublicKeyBase58 } from "@/lib/solana/umi";

function oid() {
  return crypto.randomBytes(16).toString("hex");
}

function nowPlusHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function lockTtlMs() {
  const minutes = Number(process.env.TRADE_LOCK_TTL_MINUTES ?? 5);
  if (!Number.isFinite(minutes) || minutes <= 0) return 5 * 60 * 1000;
  return Math.floor(minutes * 60 * 1000);
}

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

export async function GET() {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  await db();

  await TradeOffer.updateMany(
    {
      status: { $in: ["DRAFT", "OPEN", "LOCKED"] },
      expiresAt: { $ne: null, $lt: new Date() },
    },
    { $set: { status: "EXPIRED", error: "OFFER_EXPIRED" } }
  );

  const staleBefore = new Date(Date.now() - lockTtlMs());
  await TradeOffer.updateMany(
    {
      status: "LOCKED",
      updatedAt: { $lt: staleBefore },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    },
    {
      $set: {
        status: "OPEN",
        takerTwitchUserId: null,
        takerWallet: null,
        takerAssetId: null,
        takerStickerId: null,
        takerPreparedDelegationTxB64: null,
        takerDelegationTxSig: null,
        error: null,
      },
    }
  );

  const [open, mine] = await Promise.all([
    TradeOffer.find({ status: "OPEN", makerTwitchUserId: { $ne: twitchUserId } })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
    TradeOffer.find({
      makerTwitchUserId: twitchUserId,
      status: { $in: ["DRAFT", "OPEN", "LOCKED", "DONE"] },
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean(),
  ]);

  return NextResponse.json({
    delegateWallet: tradeDelegatePublicKeyBase58(),
    open: open.map((o) => ({
      offerId: o.offerId,
      makerStickerId: o.makerStickerId,
      wantedStickerIds: wantedStickerIdsFromOffer(o),
      status: o.status,
      expiresAt: o.expiresAt,
      createdAt: o.createdAt,
    })),
    mine: mine.map((o) => ({
      offerId: o.offerId,
      makerStickerId: o.makerStickerId,
      wantedStickerIds: wantedStickerIdsFromOffer(o),
      makerAssetId: o.makerAssetId,
      takerAssetId: o.takerAssetId,
      takerStickerId: o.takerStickerId ?? null,
      status: o.status,
      error: o.error,
      expiresAt: o.expiresAt,
      makerDelegationTxSig: o.makerDelegationTxSig,
      takerDelegationTxSig: o.takerDelegationTxSig,
      settlementTxSig: o.settlementTxSig,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const walletPubkey = String(body?.walletPubkey ?? "").trim();
  const makerAssetId = String(body?.makerAssetId ?? "").trim();
  const wantedStickerIds = sanitizeStickerIds(
    body?.wantedStickerIds ?? body?.wantedStickerId
  );

  if (!walletPubkey || !makerAssetId || !wantedStickerIds.length) {
    return new NextResponse("Missing params", { status: 400 });
  }

  await db();

  const activeOnSameAsset = await TradeOffer.findOne({
    makerAssetId,
    status: { $in: ["DRAFT", "OPEN", "LOCKED"] },
  }).lean();
  if (activeOnSameAsset) {
    return new NextResponse("Asset already used by another active offer", {
      status: 409,
    });
  }

  const delegateWallet = tradeDelegatePublicKeyBase58();
  const { txB64, stickerId } = await prepareDelegateTxForAsset({
    assetId: makerAssetId,
    ownerWallet: walletPubkey,
    newDelegateWallet: delegateWallet,
  });

  if (!stickerId) {
    return new NextResponse("Cannot detect sticker_id on maker asset metadata", {
      status: 409,
    });
  }

  const OFFER_TTL_HOURS = Number(process.env.TRADE_OFFER_TTL_HOURS ?? 168);
  const offerId = oid();
  const expiresAt = nowPlusHours(
    Number.isFinite(OFFER_TTL_HOURS) && OFFER_TTL_HOURS > 0
      ? OFFER_TTL_HOURS
      : 168
  );

  await TradeOffer.create({
    offerId,
    makerTwitchUserId: twitchUserId,
    makerWallet: walletPubkey,
    makerAssetId,
    makerStickerId: stickerId,
    wantedStickerId: wantedStickerIds[0],
    wantedStickerIds,
    preparedDelegationTxB64: txB64,
    status: "DRAFT",
    expiresAt,
  });

  return NextResponse.json({
    offerId,
    txB64,
    makerStickerId: stickerId,
    wantedStickerIds,
    delegateWallet,
    expiresAt,
  });
}
