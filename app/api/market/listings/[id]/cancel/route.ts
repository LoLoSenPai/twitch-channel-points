import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { SaleListing } from "@/lib/models";

type Params = { id: string };

export async function POST(
  _: Request,
  { params }: { params: Params | Promise<Params> }
) {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await Promise.resolve(params);
  const listingId = String(id ?? "").trim();
  if (!listingId) return new NextResponse("Missing listing id", { status: 400 });

  await db();

  const listing = await SaleListing.findOne({
    listingId,
    sellerTwitchUserId: twitchUserId,
  }).lean();
  if (!listing) return new NextResponse("Listing not found", { status: 404 });
  if (!["DRAFT", "OPEN"].includes(String(listing.status))) {
    return new NextResponse("Cannot cancel this listing state", { status: 409 });
  }

  await SaleListing.updateOne(
    { listingId },
    {
      $set: {
        status: "CANCELLED",
        error: "USER_CANCELLED",
      },
    }
  );

  return NextResponse.json({ ok: true, listingId });
}
