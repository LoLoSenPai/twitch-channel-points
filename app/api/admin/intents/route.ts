import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { MintIntent, Redemption } from "@/lib/models";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "PREPARED";
  const limit = Math.max(
    1,
    Math.min(200, Number(url.searchParams.get("limit") ?? 50))
  );

  await db();

  const items = await MintIntent.find({ status })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const { intentId, action } = await req.json();
  if (!intentId || !action)
    return new NextResponse("Missing params", { status: 400 });

  await db();

  if (action === "unlock") {
    const intent = await MintIntent.findOne({ intentId }).lean();
    if (!intent) return new NextResponse("Not found", { status: 404 });

    // unlock ticket + mark intent failed (ou keep)
    await Redemption.updateOne(
      { redemptionId: intent.redemptionId },
      { $set: { lockedByIntentId: null } }
    );
    await MintIntent.updateOne({ intentId }, { $set: { status: "FAILED" } });

    return NextResponse.json({ ok: true });
  }

  return new NextResponse("Unknown action", { status: 400 });
}
