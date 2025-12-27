import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { Collection } from "@/lib/models";

type Params = { id: string };

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const { id } = await params;

  const { name, merkleTreePubkey, coreCollectionPubkey, isActive } = (await req
    .json()
    .catch(() => ({}))) as {
    name?: string;
    merkleTreePubkey?: string;
    coreCollectionPubkey?: string | null;
    isActive?: boolean;
  };

  await db();

  if (isActive === true) {
    await Collection.updateMany(
      { isActive: true },
      { $set: { isActive: false } }
    );
  }

  const updated = await Collection.findByIdAndUpdate(
    id,
    {
      $set: {
        ...(name ? { name } : {}),
        ...(merkleTreePubkey ? { merkleTreePubkey } : {}),
        ...(coreCollectionPubkey !== undefined ? { coreCollectionPubkey } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    },
    { new: true }
  ).lean();

  if (!updated) return new NextResponse("Not found", { status: 404 });
  return NextResponse.json({ ok: true, item: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const { id } = await params;

  await db();
  await Collection.findByIdAndDelete(id);

  return NextResponse.json({ ok: true });
}
