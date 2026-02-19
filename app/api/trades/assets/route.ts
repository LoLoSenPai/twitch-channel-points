import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { UserWallet } from "@/lib/models";

type DasAsset = {
  id: string;
  grouping?: Array<{
    group_key?: string;
    group_value?: string;
  }>;
  ownership?: {
    owner?: string;
    delegate?: string | null;
  };
  compression?: {
    compressed?: boolean;
  };
  content?: {
    metadata?: {
      name?: string;
      attributes?: Array<{ trait_type?: string; value?: string | number }>;
    };
    links?: {
      image?: string;
    };
  };
};

function isInCollection(asset: DasAsset, collectionPubkey: string) {
  const expected = collectionPubkey.trim();
  if (!expected) return true;
  const groups = asset.grouping ?? [];
  return groups.some(
    (group) =>
      String(group.group_key ?? "").toLowerCase() === "collection" &&
      String(group.group_value ?? "").trim() === expected
  );
}

function stickerIdFromAsset(asset: DasAsset): string | null {
  const attrs = asset.content?.metadata?.attributes ?? [];
  const stickerAttr = attrs.find(
    (a) => String(a.trait_type ?? "").toLowerCase() === "sticker_id"
  );
  if (!stickerAttr) return null;
  return String(stickerAttr.value ?? "").trim() || null;
}

function normalizeWallet(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    return new PublicKey(raw).toBase58();
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const walletPubkey = normalizeWallet(searchParams.get("walletPubkey"));
  if (!walletPubkey) {
    return new NextResponse("Missing walletPubkey query param", { status: 400 });
  }

  await db();
  await UserWallet.updateOne(
    { twitchUserId, wallet: walletPubkey },
    { $set: { lastSeenAt: new Date() } },
    { upsert: true }
  );

  const rpc = process.env.HELIUS_RPC_URL;
  if (!rpc) return new NextResponse("Missing HELIUS_RPC_URL", { status: 500 });
  const collectionPubkey = String(process.env.CORE_COLLECTION_PUBKEY ?? "").trim();

  const result: DasAsset[] = [];
  let page = 1;
  const limit = 200;
  const maxPages = 10;

  while (page <= maxPages) {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `assets-${page}`,
        method: "getAssetsByOwner",
        params: {
          ownerAddress: walletPubkey,
          page,
          limit,
          sortBy: { sortBy: "created", sortDirection: "desc" },
        },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return new NextResponse("Failed to fetch assets from DAS", { status: 502 });
    }

    const json = (await response.json()) as {
      result?: { items?: DasAsset[] };
      error?: { message?: string };
    };

    if (json.error) {
      return new NextResponse(json.error.message ?? "DAS error", { status: 502 });
    }

    const items = json.result?.items ?? [];
    result.push(...items);
    if (items.length < limit) break;
    page += 1;
  }

  const assets = result
    .filter((asset) => asset.compression?.compressed !== false)
    .filter((asset) => isInCollection(asset, collectionPubkey))
    .map((asset) => {
      const stickerId = stickerIdFromAsset(asset);
      return {
        assetId: asset.id,
        stickerId,
        name: asset.content?.metadata?.name ?? null,
        image: asset.content?.links?.image ?? null,
        owner: asset.ownership?.owner ?? walletPubkey,
        delegate: asset.ownership?.delegate ?? null,
      };
    })
    .filter((asset) => !!asset.stickerId);

  return NextResponse.json({
    wallet: walletPubkey,
    count: assets.length,
    items: assets,
  });
}
