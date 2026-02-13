import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SaleListing } from "@/lib/models";
import { sendSignedTxB64, signedTxMatchesPrepared } from "@/lib/solana/trades";

export async function POST(req: Request) {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const listingId = String(body?.listingId ?? "").trim();
  const signedTxB64 = String(body?.signedTxB64 ?? "").trim();
  const walletPubkey = String(body?.walletPubkey ?? "").trim();
  if (!listingId || !signedTxB64 || !walletPubkey) {
    return new NextResponse("Missing params", { status: 400 });
  }

  await db();

  const listing = await SaleListing.findOne({
    listingId,
    sellerTwitchUserId: twitchUserId,
  }).lean();
  if (!listing) return new NextResponse("Listing not found", { status: 404 });
  if (listing.status !== "DRAFT") {
    return new NextResponse("Listing is not in DRAFT state", { status: 409 });
  }
  if (listing.expiresAt && new Date(listing.expiresAt) < new Date()) {
    await SaleListing.updateOne(
      { listingId },
      { $set: { status: "EXPIRED", error: "LISTING_EXPIRED" } }
    );
    return new NextResponse("Listing expired", { status: 409 });
  }
  if (String(listing.sellerWallet) !== walletPubkey) {
    return new NextResponse("Wallet mismatch", { status: 409 });
  }
  if (!listing.preparedDelegationTxB64) {
    return new NextResponse("Missing prepared delegation tx", { status: 409 });
  }

  try {
    const matchesPrepared = signedTxMatchesPrepared(
      signedTxB64,
      listing.preparedDelegationTxB64
    );
    if (!matchesPrepared) {
      console.warn("market/listings/submit: signed tx differs from prepared tx", {
        listingId,
      });
    }

    const sig = await sendSignedTxB64(signedTxB64);
    await SaleListing.updateOne(
      { listingId, status: "DRAFT" },
      {
        $set: {
          status: "OPEN",
          sellerDelegationTxSig: sig,
          preparedDelegationTxB64: null,
          error: null,
        },
      }
    );

    return NextResponse.json({ ok: true, listingId, tx: sig });
  } catch (e) {
    const message = (e as Error)?.message ?? "Listing submit failed";
    await SaleListing.updateOne(
      { listingId },
      {
        $set: {
          status: "FAILED",
          error: message,
        },
      }
    );

    return new NextResponse(`Listing submit failed: ${message}`, { status: 500 });
  }
}
