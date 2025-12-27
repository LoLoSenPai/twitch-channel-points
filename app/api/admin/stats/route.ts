import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { Redemption, Mint, MintIntent, Collection } from "@/lib/models";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  await db();

  const [
    ticketsPending,
    ticketsConsumed,
    mintsTotal,
    intentsPrepared,
    intentsFailed,
    collections,
    activeCollection,
  ] = await Promise.all([
    Redemption.countDocuments({ status: "PENDING" }),
    Redemption.countDocuments({ status: "CONSUMED" }),
    Mint.countDocuments({}),
    MintIntent.countDocuments({ status: "PREPARED" }),
    MintIntent.countDocuments({ status: "FAILED" }),
    Collection.countDocuments({}),
    Collection.findOne({ isActive: true }).lean(),
  ]);

  return NextResponse.json({
    ticketsPending,
    ticketsConsumed,
    mintsTotal,
    intentsPrepared,
    intentsFailed,
    collections,
    activeCollection: activeCollection
      ? {
          name: activeCollection.name,
          coreCollectionPubkey: activeCollection.coreCollectionPubkey,
          merkleTreePubkey: activeCollection.merkleTreePubkey,
        }
      : null,
  });
}
