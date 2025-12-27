import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { Collection } from "@/lib/models";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  await db();
  const items = await Collection.find({}).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const {
    name,
    merkleTreePubkey,
    coreCollectionPubkey = null,
    isActive = false,
  } = await req.json();
  if (!name || !merkleTreePubkey)
    return new NextResponse("Missing params", { status: 400 });

  await db();

  if (isActive)
    await Collection.updateMany(
      { isActive: true },
      { $set: { isActive: false } }
    );

  const doc = await Collection.create({
    name,
    merkleTreePubkey,
    coreCollectionPubkey,
    isActive,
  });
  return NextResponse.json({ ok: true, item: doc });
}
