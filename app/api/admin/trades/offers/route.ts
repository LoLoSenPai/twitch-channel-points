import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { TradeOffer } from "@/lib/models";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const url = new URL(req.url);
  const status = String(url.searchParams.get("status") ?? "LOCKED").trim();
  const limit = Math.max(
    1,
    Math.min(200, Number(url.searchParams.get("limit") ?? 50))
  );

  await db();

  const items = await TradeOffer.find({ status })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const { offerId, action } = await req.json();
  if (!offerId || !action) {
    return new NextResponse("Missing params", { status: 400 });
  }

  await db();

  if (action === "forceUnlock") {
    const result = await TradeOffer.updateOne(
      { offerId: String(offerId), status: "LOCKED" },
      {
        $set: {
          status: "OPEN",
          takerTwitchUserId: null,
          takerWallet: null,
          takerAssetId: null,
          takerStickerId: null,
          takerPreparedDelegationTxB64: null,
          takerDelegationTxSig: null,
          error: "ADMIN_UNLOCKED",
        },
      }
    );

    if (!result.matchedCount) {
      return new NextResponse("Offer not found or not locked", { status: 404 });
    }

    return NextResponse.json({ ok: true });
  }

  return new NextResponse("Unknown action", { status: 400 });
}
