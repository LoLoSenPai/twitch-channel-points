import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { TradeOffer } from "@/lib/models";

type Params = { id: string };

export async function POST(
  _: Request,
  { params }: { params: Params | Promise<Params> }
) {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await Promise.resolve(params);
  const offerId = String(id ?? "").trim();
  if (!offerId) return new NextResponse("Missing offer id", { status: 400 });

  await db();

  const offer = await TradeOffer.findOne({ offerId, status: "LOCKED" }).lean();
  if (!offer) return new NextResponse("Offer is not locked", { status: 409 });

  const isMaker = String(offer.makerTwitchUserId) === twitchUserId;
  const isTaker = String(offer.takerTwitchUserId ?? "") === twitchUserId;
  if (!isMaker && !isTaker) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  await TradeOffer.updateOne(
    { offerId, status: "LOCKED" },
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

  return NextResponse.json({ ok: true, offerId });
}
