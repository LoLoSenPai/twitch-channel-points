import { NextResponse } from "next/server";
import { getSticker } from "@/lib/stickers";

type Params = { id: string };

function resolveImageUrl(imageBase: string, image?: string | null) {
  const img = (image ?? "").trim();
  if (!img) return null;

  if (img.startsWith("http://") || img.startsWith("https://")) return img;

  const base = imageBase.endsWith("/") ? imageBase : `${imageBase}/`;
  return `${base}${img}`;
}

export async function GET(
  _: Request,
  { params }: { params: Params | Promise<Params> }
) {
  const { id } = await Promise.resolve(params);
  const stickerId = String(id);

  const appBase = process.env.APP_URL || "http://localhost:3000";
  const sticker = getSticker(stickerId);

  const name = sticker?.name ?? `Sticker #${stickerId}`;
  const attributes: Array<{ trait_type: string; value: string | number }> = [
    { trait_type: "sticker_id", value: stickerId },
    { trait_type: "series", value: "v0" },
  ];

  if (sticker?.rarity) {
    attributes.push({ trait_type: "rarity", value: sticker.rarity });
  }

  if (typeof sticker?.maxSupply === "number") {
    attributes.push({ trait_type: "max_supply", value: sticker.maxSupply });
  }

  // IPFS/gateway en priorité, sinon public/stickers
  const imageBase = process.env.STICKERS_IMAGE_BASE || `${appBase}/stickers/`;

  const imageUrl =
    resolveImageUrl(imageBase, sticker?.image) ||
    `${appBase}/stickers/placeholder.png`;

  return NextResponse.json({
    name,
    symbol: "PANINI",
    description: "Panini V0 (test).",
    image: imageUrl,
    attributes,
    external_url: appBase,
    properties: {
      category: "image",
      files: [{ uri: imageUrl, type: "image/png" }],
    },
  });
}
