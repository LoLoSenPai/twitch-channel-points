import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { Collection } from "@/lib/models";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  const { name, merkleTreePubkey, coreCollectionPubkey, isActive } =
    await req.json();
  await db();

  if (isActive === true) {
    await Collection.updateMany(
      { isActive: true },
      { $set: { isActive: false } }
    );
  }

  const updated = await Collection.findByIdAndUpdate(
    params.id,
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
  _: Request,
  { params }: { params: { id: string } }
) {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  await db();
  await Collection.findByIdAndDelete(params.id);
  return NextResponse.json({ ok: true });
}
