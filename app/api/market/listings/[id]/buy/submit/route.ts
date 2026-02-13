import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SaleListing } from "@/lib/models";
import { assertSignedTxMatchesPrepared, sendSignedTxB64 } from "@/lib/solana/trades";

type Params = { id: string };

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
  const signedTxB64 = String(body?.signedTxB64 ?? "").trim();
  const walletPubkey = String(body?.walletPubkey ?? "").trim();
  if (!signedTxB64 || !walletPubkey) {
    return new NextResponse("Missing params", { status: 400 });
  }

  await db();

  const listing = await SaleListing.findOne({
    listingId,
    status: "LOCKED",
    buyerTwitchUserId: twitchUserId,
  }).lean();

  if (!listing) return new NextResponse("Listing is not ready for buy submit", { status: 409 });
  if (!listing.preparedBuyTxB64 || !listing.buyerWallet) {
    return new NextResponse("Missing prepared buy state", { status: 409 });
  }
  if (String(listing.buyerWallet) !== walletPubkey) {
    return new NextResponse("Wallet mismatch", { status: 409 });
  }

  try {
    assertSignedTxMatchesPrepared(signedTxB64, listing.preparedBuyTxB64);
    const sig = await sendSignedTxB64(signedTxB64);

    await SaleListing.updateOne(
      { listingId, status: "LOCKED" },
      {
        $set: {
          status: "SOLD",
          buyTxSig: sig,
          preparedBuyTxB64: null,
          error: null,
        },
      }
    );

    return NextResponse.json({ ok: true, listingId, buyTxSig: sig });
  } catch (e) {
    const message = (e as Error)?.message ?? "Buy submit failed";
    await SaleListing.updateOne(
      { listingId },
      {
        $set: {
          status: "OPEN",
          buyerTwitchUserId: null,
          buyerWallet: null,
          preparedBuyTxB64: null,
          error: message,
        },
      }
    );

    return new NextResponse(`Buy submit failed: ${message}`, { status: 500 });
  }
}
