import { NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SaleListing } from "@/lib/models";
import { prepareDelegateTxForAsset } from "@/lib/solana/trades";
import { tradeDelegatePublicKeyBase58 } from "@/lib/solana/umi";

function oid() {
  return crypto.randomBytes(16).toString("hex");
}

function nowPlusHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function parsePriceLamports(value: unknown) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;
  const lamports = Math.floor(raw);
  if (lamports <= 0) return null;
  return lamports;
}

export async function GET() {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  await db();

  await SaleListing.updateMany(
    {
      status: { $in: ["DRAFT", "OPEN", "LOCKED"] },
      expiresAt: { $ne: null, $lt: new Date() },
    },
    { $set: { status: "EXPIRED", error: "LISTING_EXPIRED" } }
  );

  const [open, mine] = await Promise.all([
    SaleListing.find({ status: "OPEN", sellerTwitchUserId: { $ne: twitchUserId } })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
    SaleListing.find({
      sellerTwitchUserId: twitchUserId,
      status: { $in: ["DRAFT", "OPEN", "LOCKED", "SOLD"] },
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean(),
  ]);

  return NextResponse.json({
    delegateWallet: tradeDelegatePublicKeyBase58(),
    open: open.map((listing) => ({
      listingId: listing.listingId,
      sellerStickerId: listing.sellerStickerId,
      priceLamports: listing.priceLamports,
      status: listing.status,
      expiresAt: listing.expiresAt,
      createdAt: listing.createdAt,
    })),
    mine: mine.map((listing) => ({
      listingId: listing.listingId,
      sellerStickerId: listing.sellerStickerId,
      sellerAssetId: listing.sellerAssetId,
      priceLamports: listing.priceLamports,
      status: listing.status,
      error: listing.error,
      buyerWallet: listing.buyerWallet,
      sellerDelegationTxSig: listing.sellerDelegationTxSig,
      buyTxSig: listing.buyTxSig,
      expiresAt: listing.expiresAt,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const walletPubkey = String(body?.walletPubkey ?? "").trim();
  const sellerAssetId = String(body?.sellerAssetId ?? "").trim();
  const priceLamports = parsePriceLamports(body?.priceLamports);

  if (!walletPubkey || !sellerAssetId || !priceLamports) {
    return new NextResponse("Missing params", { status: 400 });
  }

  await db();

  const activeOnSameAsset = await SaleListing.findOne({
    sellerAssetId,
    status: { $in: ["DRAFT", "OPEN", "LOCKED"] },
  }).lean();
  if (activeOnSameAsset) {
    return new NextResponse("Asset already used by another active listing", {
      status: 409,
    });
  }

  const delegateWallet = tradeDelegatePublicKeyBase58();
  const { txB64, stickerId } = await prepareDelegateTxForAsset({
    assetId: sellerAssetId,
    ownerWallet: walletPubkey,
    newDelegateWallet: delegateWallet,
  });

  if (!stickerId) {
    return new NextResponse("Cannot detect sticker_id on seller asset metadata", {
      status: 409,
    });
  }

  const LISTING_TTL_HOURS = Number(
    process.env.MARKET_LISTING_TTL_HOURS ??
      process.env.TRADE_OFFER_TTL_HOURS ??
      24
  );
  const listingId = oid();
  const expiresAt = nowPlusHours(
    Number.isFinite(LISTING_TTL_HOURS) && LISTING_TTL_HOURS > 0
      ? LISTING_TTL_HOURS
      : 24
  );

  await SaleListing.create({
    listingId,
    sellerTwitchUserId: twitchUserId,
    sellerWallet: walletPubkey,
    sellerAssetId,
    sellerStickerId: stickerId,
    priceLamports,
    preparedDelegationTxB64: txB64,
    status: "DRAFT",
    expiresAt,
  });

  return NextResponse.json({
    listingId,
    txB64,
    sellerStickerId: stickerId,
    priceLamports,
    delegateWallet,
    expiresAt,
  });
}
