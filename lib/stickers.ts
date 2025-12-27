import data from "@/stickers/stickers.json";

export type Sticker = {
  id: string;
  name?: string;
  image?: string; // ex: "000.png"
  weight?: number; // rareté (plus grand = plus fréquent)
};

type StickerJson = {
  total?: number;
  items: Sticker[];
};

const ST = data as StickerJson;

export const STICKERS = ST.items;
export const STICKERS_TOTAL = (ST.total ?? ST.items.length) as number;

export function getSticker(id: string): Sticker | null {
  return STICKERS.find((s) => String(s.id) === String(id)) ?? null;
}

function pickWeighted(items: Sticker[]): Sticker {
  const weights = items.map((s) => {
    const w = typeof s.weight === "number" ? s.weight : 1;
    return Number.isFinite(w) && w > 0 ? w : 1;
  });

  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;

  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function pickRandomStickerId(): string {
  if (!STICKERS.length) return "0";
  return String(pickWeighted(STICKERS).id);
}
