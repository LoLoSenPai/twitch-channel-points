import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Collection, Mint, Redemption, TradeOffer, UserWallet } from "@/lib/models";
import { STICKERS_TOTAL } from "@/lib/stickers";
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

type LeaderboardEntry = {
  twitchUserId: string;
  displayName: string;
  totalCards: number;
  uniqueCards: number;
  completionPct: number;
};

type InsightsPayload = {
  totalStickers: number;
  history: Array<{
    offerId: string;
    makerStickerId: string;
    takerStickerId: string | null;
    wantedStickerIds: string[];
    makerTwitchUserId: string;
    makerDisplayName: string;
    takerTwitchUserId: string | null;
    takerDisplayName: string | null;
    settlementTxSig: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
  leaderboard: LeaderboardEntry[];
};

type InsightsCacheState = {
  expiresAt: number;
  payload: InsightsPayload;
};

const g = globalThis as typeof globalThis & {
  __tradeInsightsCache?: InsightsCacheState;
};

function sanitizeStickerId(value: unknown) {
  return String(value ?? "").trim();
}

function sanitizeStickerIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    const unique = new Set<string>();
    for (const entry of value) {
      const id = sanitizeStickerId(entry);
      if (!id) continue;
      unique.add(id);
    }
    return [...unique];
  }
  const single = sanitizeStickerId(value);
  return single ? [single] : [];
}

function wantedStickerIdsFromOffer(offer: {
  wantedStickerIds?: unknown;
  wantedStickerId?: unknown;
}) {
  const ids = sanitizeStickerIds(offer.wantedStickerIds);
  if (ids.length) return ids;
  return sanitizeStickerIds(offer.wantedStickerId);
}

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
        id: `insights-assets-${params.walletPubkey}-${page}`,
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

async function fetchTwitchDisplayNames(
  twitchUserIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ids = [...new Set(twitchUserIds.map((v) => String(v).trim()).filter(Boolean))];
  if (!ids.length) return map;

  try {
    const accessToken = await getTwitchAppAccessToken();
    const clientId = String(process.env.TWITCH_CLIENT_ID ?? "").trim();
    if (!accessToken || !clientId) return map;

    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const url = new URL("https://api.twitch.tv/helix/users");
      for (const id of chunk) {
        url.searchParams.append("id", id);
      }

      const response = await fetch(url.toString(), {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Client-Id": clientId,
        },
        cache: "no-store",
      });

      if (!response.ok) continue;
      const json = (await response.json()) as {
        data?: Array<{ id?: string; display_name?: string; login?: string }>;
      };
      for (const row of json.data ?? []) {
        const id = String(row.id ?? "").trim();
        if (!id) continue;
        const display = String(row.display_name ?? row.login ?? id).trim();
        map.set(id, display || id);
      }
    }
  } catch (error) {
    console.warn("trades/insights: twitch name lookup failed", error);
  }

  return map;
}

function completionPct(uniqueCards: number) {
  const total = Number(STICKERS_TOTAL) || 44;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((uniqueCards / total) * 100)));
}

function insightsCacheTtlMs() {
  const seconds = Number(process.env.TRADE_INSIGHTS_CACHE_SECONDS ?? 15);
  if (!Number.isFinite(seconds) || seconds <= 0) return 15_000;
  return Math.floor(seconds * 1000);
}

export async function GET() {
  await db();

  const cached = g.__tradeInsightsCache;
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload);
  }

  const [historyRows, mintRows, walletRows, tradeUsersMaker, tradeUsersTaker, redemptionUsers, active] =
    await Promise.all([
      TradeOffer.find({ status: "DONE" }).sort({ updatedAt: -1 }).limit(100).lean(),
      Mint.find({})
        .select({ twitchUserId: 1, wallet: 1, stickerId: 1 })
        .lean(),
      UserWallet.find({}).select({ twitchUserId: 1, wallet: 1 }).lean(),
      TradeOffer.distinct("makerTwitchUserId", {}),
      TradeOffer.distinct("takerTwitchUserId", { takerTwitchUserId: { $ne: null } }),
      Redemption.distinct("twitchUserId", {}),
      Collection.findOne({ isActive: true }).lean(),
    ]);

  const userIds = new Set<string>();
  for (const v of tradeUsersMaker ?? []) {
    const id = String(v ?? "").trim();
    if (id) userIds.add(id);
  }
  for (const v of tradeUsersTaker ?? []) {
    const id = String(v ?? "").trim();
    if (id) userIds.add(id);
  }
  for (const v of redemptionUsers ?? []) {
    const id = String(v ?? "").trim();
    if (id) userIds.add(id);
  }

  const walletByUser = new Map<string, Set<string>>();
  const mintedStickerByUser = new Map<string, Set<string>>();
  const mintedTotalByUser = new Map<string, number>();
  for (const row of walletRows as Array<{ twitchUserId?: string; wallet?: string }>) {
    const userId = String(row.twitchUserId ?? "").trim();
    if (!userId) continue;
    userIds.add(userId);
    const wallet = String(row.wallet ?? "").trim();
    if (!wallet) continue;
    const ws = walletByUser.get(userId) ?? new Set<string>();
    ws.add(wallet);
    walletByUser.set(userId, ws);
  }
  for (const row of mintRows as Array<{ twitchUserId?: string; wallet?: string; stickerId?: string }>) {
    const userId = String(row.twitchUserId ?? "").trim();
    if (!userId) continue;
    userIds.add(userId);

    const wallet = String(row.wallet ?? "").trim();
    if (wallet) {
      const ws = walletByUser.get(userId) ?? new Set<string>();
      ws.add(wallet);
      walletByUser.set(userId, ws);
    }

    const stickerId = String(row.stickerId ?? "").trim();
    if (stickerId) {
      const ss = mintedStickerByUser.get(userId) ?? new Set<string>();
      ss.add(stickerId);
      mintedStickerByUser.set(userId, ss);
    }
    mintedTotalByUser.set(userId, (mintedTotalByUser.get(userId) ?? 0) + 1);
  }

  const knownUserIds = [...userIds];
  const displayNameById = await fetchTwitchDisplayNames(knownUserIds);

  const collectionPubkey = String(
    (active?.coreCollectionPubkey as string | undefined) ??
      process.env.CORE_COLLECTION_PUBKEY ??
      ""
  ).trim();
  const rpcUrl = String(process.env.HELIUS_RPC_URL ?? "").trim();
  const canUseOnchain = Boolean(collectionPubkey && rpcUrl);

  const leaderboard: LeaderboardEntry[] = [];

  if (canUseOnchain) {
    for (const userId of knownUserIds) {
      const wallets = [...(walletByUser.get(userId) ?? new Set<string>())];
      if (!wallets.length) {
        leaderboard.push({
          twitchUserId: userId,
          displayName: displayNameById.get(userId) ?? userId,
          totalCards: 0,
          uniqueCards: 0,
          completionPct: 0,
        });
        continue;
      }

      try {
        const assetsPerWallet = await Promise.all(
          wallets.map((walletPubkey) =>
            fetchOwnerCollectionAssets({ rpcUrl, walletPubkey, collectionPubkey })
          )
        );

        const allAssets = assetsPerWallet.flat();
        const uniqueAssets = new Set<string>();
        const uniqueStickers = new Set<string>();
        for (const asset of allAssets) {
          uniqueAssets.add(String(asset.assetId));
          uniqueStickers.add(String(asset.stickerId));
        }

        const uniqueCount = uniqueStickers.size;
        leaderboard.push({
          twitchUserId: userId,
          displayName: displayNameById.get(userId) ?? userId,
          totalCards: uniqueAssets.size,
          uniqueCards: uniqueCount,
          completionPct: completionPct(uniqueCount),
        });
      } catch {
        const fallbackUnique = mintedStickerByUser.get(userId)?.size ?? 0;
        const fallbackTotal = mintedTotalByUser.get(userId) ?? 0;
        leaderboard.push({
          twitchUserId: userId,
          displayName: displayNameById.get(userId) ?? userId,
          totalCards: fallbackTotal,
          uniqueCards: fallbackUnique,
          completionPct: completionPct(fallbackUnique),
        });
      }
    }
  } else {
    for (const userId of knownUserIds) {
      const fallbackUnique = mintedStickerByUser.get(userId)?.size ?? 0;
      const fallbackTotal = mintedTotalByUser.get(userId) ?? 0;
      leaderboard.push({
        twitchUserId: userId,
        displayName: displayNameById.get(userId) ?? userId,
        totalCards: fallbackTotal,
        uniqueCards: fallbackUnique,
        completionPct: completionPct(fallbackUnique),
      });
    }
  }

  leaderboard.sort((a, b) => {
    if (b.uniqueCards !== a.uniqueCards) return b.uniqueCards - a.uniqueCards;
    if (b.totalCards !== a.totalCards) return b.totalCards - a.totalCards;
    return a.displayName.localeCompare(b.displayName, "fr");
  });

  const history = (historyRows as Array<{
    offerId?: string;
    makerStickerId?: string;
    takerStickerId?: string | null;
    wantedStickerIds?: string[];
    makerTwitchUserId?: string;
    takerTwitchUserId?: string | null;
    settlementTxSig?: string | null;
    updatedAt?: Date | string;
    createdAt?: Date | string;
  }>).map((row) => ({
    offerId: String(row.offerId ?? ""),
    makerStickerId: String(row.makerStickerId ?? ""),
    takerStickerId: row.takerStickerId ? String(row.takerStickerId) : null,
    wantedStickerIds: sanitizeStickerIds(
      row.wantedStickerIds && row.wantedStickerIds.length
        ? row.wantedStickerIds
        : wantedStickerIdsFromOffer(row)
    ),
    makerTwitchUserId: String(row.makerTwitchUserId ?? ""),
    makerDisplayName: displayNameById.get(String(row.makerTwitchUserId ?? "").trim()) ?? String(row.makerTwitchUserId ?? ""),
    takerTwitchUserId: row.takerTwitchUserId ? String(row.takerTwitchUserId) : null,
    takerDisplayName: row.takerTwitchUserId
      ? displayNameById.get(String(row.takerTwitchUserId).trim()) ?? String(row.takerTwitchUserId)
      : null,
    settlementTxSig: row.settlementTxSig ? String(row.settlementTxSig) : null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  }));

  const payload: InsightsPayload = {
    totalStickers: Number(STICKERS_TOTAL) || 44,
    history,
    leaderboard: leaderboard.slice(0, 100),
  };

  g.__tradeInsightsCache = {
    expiresAt: Date.now() + insightsCacheTtlMs(),
    payload,
  };

  return NextResponse.json(payload);
}
