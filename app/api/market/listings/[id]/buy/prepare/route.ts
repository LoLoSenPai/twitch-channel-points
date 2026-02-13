import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SaleListing } from "@/lib/models";
import { prepareDelegatedSalePurchaseTx } from "@/lib/solana/trades";
import { tradeDelegatePublicKeyBase58 } from "@/lib/solana/umi";

type Params = { id: string };

async function unlockListingOnError(listingId: string) {
  await SaleListing.updateOne(
    { listingId, status: "LOCKED" },
    {
      $set: {
        status: "OPEN",
        buyerTwitchUserId: null,
        buyerWallet: null,
        preparedBuyTxB64: null,
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
  const listingId = String(id ?? "").trim();
  if (!listingId) return new NextResponse("Missing listing id", { status: 400 });

  const body = await req.json().catch(() => null);
  const walletPubkey = String(body?.walletPubkey ?? "").trim();
  if (!walletPubkey) return new NextResponse("Missing walletPubkey", { status: 400 });

  await db();

  const lock = await SaleListing.findOneAndUpdate(
    {
      listingId,
      status: "OPEN",
      $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
    },
    {
      $set: {
        status: "LOCKED",
        buyerTwitchUserId: twitchUserId,
        buyerWallet: walletPubkey,
      },
    },
    { new: true }
  ).lean();

  if (!lock) return new NextResponse("Listing not available", { status: 409 });
  if (String(lock.sellerTwitchUserId) === twitchUserId) {
    await unlockListingOnError(listingId);
    return new NextResponse("Seller cannot buy own listing", { status: 409 });
  }

  try {
    const delegateWallet = tradeDelegatePublicKeyBase58();
    const { txB64 } = await prepareDelegatedSalePurchaseTx({
      sellerAssetId: String(lock.sellerAssetId),
      sellerWallet: String(lock.sellerWallet),
      buyerWallet: walletPubkey,
      priceLamports: Number(lock.priceLamports),
      delegateWallet,
    });

    await SaleListing.updateOne(
      { listingId, status: "LOCKED" },
      {
        $set: {
          preparedBuyTxB64: txB64,
          error: null,
        },
      }
    );

    return NextResponse.json({
      listingId,
      txB64,
      delegateWallet,
      priceLamports: Number(lock.priceLamports),
      sellerStickerId: String(lock.sellerStickerId),
    });
  } catch (e) {
    await unlockListingOnError(listingId);
    return new NextResponse((e as Error)?.message ?? "Prepare buy failed", {
      status: 409,
    });
  }
}
