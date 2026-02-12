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

  const offer = await TradeOffer.findOne({
    offerId,
    makerTwitchUserId: twitchUserId,
  }).lean();
  if (!offer) return new NextResponse("Offer not found", { status: 404 });

  if (!["DRAFT", "OPEN"].includes(String(offer.status))) {
    return new NextResponse("Cannot cancel this offer state", { status: 409 });
  }

  await TradeOffer.updateOne(
    { offerId },
    {
      $set: {
        status: "CANCELLED",
        error: "USER_CANCELLED",
      },
    }
  );

  return NextResponse.json({ ok: true, offerId });
}
