import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { Redemption } from "@/lib/models";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "PENDING";
  const limit = Math.max(
    1,
    Math.min(200, Number(url.searchParams.get("limit") ?? 50))
  );

  await db();

  const items = await Redemption.find({ status })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const { redemptionId, action } = await req.json();
  if (!redemptionId || !action)
    return new NextResponse("Missing params", { status: 400 });

  await db();

  if (action === "forceUnlock") {
    await Redemption.updateOne(
      { redemptionId },
      { $set: { lockedByIntentId: null } }
    );
    return NextResponse.json({ ok: true });
  }

  return new NextResponse("Unknown action", { status: 400 });
}
