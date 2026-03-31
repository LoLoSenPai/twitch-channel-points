import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Collection, Mint, UserWallet } from "@/lib/models";
import { STICKERS_TOTAL } from "@/lib/stickers";
import { isAssetIdBlocked } from "@/lib/blocked-assets";
import { getTwitchAppAccessToken } from "@/lib/twitch/app-token";

type DasAsset = {
  id: string;
  grouping?: Array<{
    group_key?: string;
    group_value?: string;
  }>;
  compression?: {
    compressed?: boolean;
  };
  content?: {
    metadata?: {
      attributes?: Array<{ trait_type?: string; value?: string | number }>;
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
      String(group.group_value ?? "").trim() === expected,
  );
}

function stickerIdFromAsset(asset: DasAsset): string | null {
  const attrs = asset.content?.metadata?.attributes ?? [];
  const stickerAttr = attrs.find(
    (a) => String(a.trait_type ?? "").toLowerCase() === "sticker_id",
  );
  if (!stickerAttr) return null;
  return String(stickerAttr.value ?? "").trim() || null;
}

async function fetchOwnerCollectionAssets(params: {
  rpcUrl: string;
  walletPubkey: string;
  collectionPubkey: string;
}) {
  const result: Array<{ assetId: string; stickerId: string }> = [];
  let page = 1;
  const limit = 200;
  const maxPages = 10;

  while (page <= maxPages) {
    const response = await fetch(params.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `album-assets-${params.walletPubkey}-${page}`,
        method: "getAssetsByOwner",
        params: {
          ownerAddress: params.walletPubkey,
          page,
          limit,
          sortBy: { sortBy: "created", sortDirection: "desc" },
        },
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch assets (${response.status})`);
    }

    const json = (await response.json()) as {
      result?: { items?: DasAsset[] };
      error?: { message?: string };
    };

    if (json.error) {
      throw new Error(json.error.message ?? "DAS error");
    }

    const items = json.result?.items ?? [];
    for (const asset of items) {
      if (asset.compression?.compressed === false) continue;
      if (isAssetIdBlocked(asset.id)) continue;
      if (!isInCollection(asset, params.collectionPubkey)) continue;
      const stickerId = stickerIdFromAsset(asset);
      if (!stickerId) continue;
      result.push({ assetId: asset.id, stickerId });
    }

    if (items.length < limit) break;
    page += 1;
  }

  return result;
}

/** Resolves either a numeric Twitch user ID or a login name.
 * Returns { id, displayName } — `id` is always the numeric Twitch user ID.
 */
async function resolveTwitchUser(
  param: string,
): Promise<{ id: string; displayName: string }> {
  const isNumericId = /^\d+$/.test(param);
  try {
    const accessToken = await getTwitchAppAccessToken();
    const clientId = String(process.env.TWITCH_CLIENT_ID ?? "").trim();
    if (!accessToken || !clientId) return { id: param, displayName: param };

    const url = new URL("https://api.twitch.tv/helix/users");
    if (isNumericId) {
      url.searchParams.set("id", param);
    } else {
      url.searchParams.set("login", param);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": clientId,
      },
      cache: "no-store",
    });

    if (!response.ok) return { id: param, displayName: param };
    const json = (await response.json()) as {
      data?: Array<{ id?: string; display_name?: string; login?: string }>;
    };
    const user = json.data?.[0];
    const resolvedId = String(user?.id ?? param).trim() || param;
    const displayName =
      String(user?.display_name ?? user?.login ?? param).trim() || param;
    return { id: resolvedId, displayName };
  } catch {
    return { id: param, displayName: param };
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const rawParam = String(userId ?? "").trim();
  if (!rawParam) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  await db();

  const { id: twitchUserId, displayName: resolvedDisplayName } =
    await resolveTwitchUser(rawParam);

  const active = await Collection.findOne({ isActive: true }).lean();
  const collectionPubkey = String(
    (active?.coreCollectionPubkey as string | undefined) ??
      process.env.CORE_COLLECTION_PUBKEY ??
      "",
  ).trim();
  const rpcUrl = String(process.env.HELIUS_RPC_URL ?? "").trim();

  const [walletsFromMint, walletRows] = await Promise.all([
    Mint.distinct("wallet", { twitchUserId }),
    UserWallet.find({ twitchUserId }).select({ wallet: 1 }).lean(),
  ]);

  const wallets = [
    ...new Set(
      [
        ...walletsFromMint.map((w) => String(w ?? "").trim()),
        ...walletRows.map((row) =>
          String((row as { wallet?: string }).wallet ?? "").trim(),
        ),
      ].filter(Boolean),
    ),
  ];

  let mints: Array<{ stickerId: string; mintTx: string }> = [];
  const canUseOnchain = Boolean(collectionPubkey && rpcUrl && wallets.length);
  let onchainFailed = false;

  if (canUseOnchain) {
    try {
      const allAssets = await Promise.all(
        wallets.map((walletPubkey) =>
          fetchOwnerCollectionAssets({
            rpcUrl,
            walletPubkey,
            collectionPubkey,
          }),
        ),
      );
      mints = allAssets.flat().map((asset) => ({
        stickerId: asset.stickerId,
        mintTx: asset.assetId,
      }));
    } catch (e) {
      console.error("users/album onchain fallback", e);
      onchainFailed = true;
    }
  }

  if (!canUseOnchain || onchainFailed) {
    const dbMints = await Mint.find({ twitchUserId })
      .sort({ createdAt: -1 })
      .lean();
    mints = dbMints.map((mint) => ({
      stickerId: String((mint as { stickerId?: string }).stickerId ?? ""),
      mintTx: String((mint as { mintTx?: string }).mintTx ?? ""),
    }));
  }

  return NextResponse.json({
    user: { id: twitchUserId, displayName: resolvedDisplayName },
    totalStickers: STICKERS_TOTAL,
    mints,
  });
}
