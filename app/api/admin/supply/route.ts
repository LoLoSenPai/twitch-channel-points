import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { Mint, MintIntent } from "@/lib/models";
import { STICKERS } from "@/lib/stickers";

type CountByStickerAgg = { _id: string; count: number };

function toCountMap(rows: CountByStickerAgg[]) {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(String(row._id), Number(row.count) || 0);
  }
  return map;
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return new NextResponse("Forbidden", { status: guard.status });

  await db();

  const [mintedAgg, reservedAgg] = await Promise.all([
    Mint.aggregate<CountByStickerAgg>([
      { $group: { _id: "$stickerId", count: { $sum: 1 } } },
    ]),
    MintIntent.aggregate<CountByStickerAgg>([
      { $match: { status: "PREPARED" } },
      { $group: { _id: "$stickerId", count: { $sum: 1 } } },
    ]),
  ]);

  const mintedMap = toCountMap(mintedAgg);
  const reservedMap = toCountMap(reservedAgg);

  const items = STICKERS.map((sticker) => {
    const id = String(sticker.id);
    const minted = mintedMap.get(id) ?? 0;
    const reserved = reservedMap.get(id) ?? 0;
    const maxSupply =
      typeof sticker.maxSupply === "number" ? sticker.maxSupply : null;
    const remaining =
      maxSupply === null ? null : Math.max(0, maxSupply - minted - reserved);
    const soldOut =
      maxSupply === null ? false : maxSupply - minted - reserved <= 0;

    return {
      id,
      name: sticker.name ?? `Sticker #${id}`,
      rarity: sticker.rarity ?? null,
      maxSupply,
      minted,
      reserved,
      remaining,
      soldOut,
    };
  }).sort((a, b) => {
    const ai = Number(a.id);
    const bi = Number(b.id);
    if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
    return a.id.localeCompare(b.id);
  });

  const summary = items.reduce(
    (acc, item) => {
      acc.mintedTotal += item.minted;
      acc.reservedTotal += item.reserved;
      if (item.maxSupply !== null) {
        acc.cappedMaxTotal += item.maxSupply;
        acc.cappedRemainingTotal += item.remaining ?? 0;
        if (item.soldOut) acc.soldOutCount += 1;
      }
      return acc;
    },
    {
      mintedTotal: 0,
      reservedTotal: 0,
      cappedMaxTotal: 0,
      cappedRemainingTotal: 0,
      soldOutCount: 0,
    }
  );

  return NextResponse.json({
    summary: {
      ...summary,
      totalConfigured: items.length,
      cappedCount: items.filter((i) => i.maxSupply !== null).length,
    },
    items,
  });
}
