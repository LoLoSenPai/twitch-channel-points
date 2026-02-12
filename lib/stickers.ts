import data from "@/stickers/stickers.json";

export type StickerRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "legendary"
  | "mythic"
  | "R"
  | "SR"
  | "SSR";

export type Sticker = {
  id: string;
  name?: string;
  image?: string; // ex: "000.png"
  weight?: number; // rarity weight (higher = more common)
  rarity?: StickerRarity;
  maxSupply?: number | null;
};

type RawSticker = Omit<Sticker, "maxSupply"> & {
  rarity?: string | null;
  maxSupply?: number | null;
  max_supply?: number | null;
};

type StickerJson = {
  total?: number;
  items: RawSticker[];
};

const ST = data as StickerJson;

function toPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  return n > 0 ? n : null;
}

function normalizeSticker(item: RawSticker): Sticker {
  return {
    ...item,
    rarity: normalizeRarity(item.rarity),
    maxSupply: toPositiveInt(item.maxSupply ?? item.max_supply),
  };
}

export function normalizeRarity(value: unknown): StickerRarity | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v) return undefined;

  const lower = v.toLowerCase();
  if (lower === "common") return "common";
  if (lower === "uncommon") return "uncommon";
  if (lower === "rare") return "rare";
  if (lower === "legendary") return "legendary";
  if (lower === "mythic") return "mythic";
  if (lower === "r") return "R";
  if (lower === "sr") return "SR";
  if (lower === "ssr") return "SSR";
  return undefined;
}

export const STICKERS = ST.items.map(normalizeSticker);
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

  for (let i = 0; i < items.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export function pickRandomStickerId(): string {
  if (!STICKERS.length) return "0";
  return String(pickWeighted(STICKERS).id);
}

export function pickRandomAvailableStickerId(params: {
  mintedCounts: Map<string, number>;
  reservedCounts?: Map<string, number>;
}): string | null {
  const { mintedCounts, reservedCounts } = params;

  const available = STICKERS.filter((sticker) => {
    const id = String(sticker.id);
    const minted = mintedCounts.get(id) ?? 0;
    const reserved = reservedCounts?.get(id) ?? 0;
    const maxSupply = sticker.maxSupply ?? null;

    if (!maxSupply) return true;
    return minted + reserved < maxSupply;
  });

  if (!available.length) return null;
  return String(pickWeighted(available).id);
}
