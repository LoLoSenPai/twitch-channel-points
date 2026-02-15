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

export function getAvailableStickerIds(params: {
  mintedCounts: Map<string, number>;
  reservedCounts?: Map<string, number>;
}): string[] {
  const { mintedCounts, reservedCounts } = params;

  const available = STICKERS.filter((sticker) => {
    const id = String(sticker.id);
    const minted = mintedCounts.get(id) ?? 0;
    const reserved = reservedCounts?.get(id) ?? 0;
    const maxSupply = sticker.maxSupply ?? null;

    if (!maxSupply) return true;
    return minted + reserved < maxSupply;
  }).map((sticker) => String(sticker.id));

  // deterministic ordering for reproducible selection
  return available.sort((a, b) => {
    const aNum = Number(a);
    const bNum = Number(b);
    const aIsNum = Number.isFinite(aNum);
    const bIsNum = Number.isFinite(bNum);

    if (aIsNum && bIsNum) return aNum - bNum;
    return a.localeCompare(b);
  });
}

export function uniformIndexFromHex(randomHex: string, size: number): number {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error("uniformIndexFromHex: invalid size");
  }
  const clean = randomHex.replace(/^0x/i, "").trim();
  if (!clean) throw new Error("uniformIndexFromHex: empty randomHex");
  const n = BigInt(`0x${clean}`);
  return Number(n % BigInt(size));
}

export function pickUniformAvailableStickerIdFromHex(
  availableIds: string[],
  randomHex: string,
): { stickerId: string; index: number } {
  if (!availableIds.length) {
    throw new Error("pickUniformAvailableStickerIdFromHex: no available IDs");
  }
  const index = uniformIndexFromHex(randomHex, availableIds.length);
  return { stickerId: String(availableIds[index]), index };
}
