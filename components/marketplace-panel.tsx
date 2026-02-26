"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { normalizeRarity } from "@/lib/stickers";
import stickers from "@/stickers/stickers.json";

type TradeAsset = {
  assetId: string;
  stickerId: string;
  name: string | null;
  image: string | null;
  owner: string;
  delegate: string | null;
};

type OpenOffer = {
  offerId: string;
  makerStickerId: string;
  makerTwitchUserId: string;
  makerDisplayName: string;
  wantedStickerIds: string[];
  status: string;
  expiresAt: string | null;
  createdAt: string;
};

type MyOffer = {
  offerId: string;
  makerStickerId: string;
  wantedStickerIds: string[];
  makerAssetId: string;
  takerAssetId: string | null;
  status: string;
  error: string | null;
  expiresAt: string | null;
  makerDelegationTxSig: string | null;
  takerDelegationTxSig: string | null;
  settlementTxSig: string | null;
};

type OffersResponse = {
  delegateWallet: string;
  open: OpenOffer[];
  mine: MyOffer[];
};

type TradeHistoryItem = {
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
};

type LeaderboardEntry = {
  twitchUserId: string;
  displayName: string;
  totalCards: number;
  uniqueCards: number;
  completionPct: number;
};

type InsightsResponse = {
  totalStickers: number;
  history: TradeHistoryItem[];
  leaderboard: LeaderboardEntry[];
};

type OpenListing = {
  listingId: string;
  sellerStickerId: string;
  priceLamports: number;
  status: string;
  expiresAt: string | null;
  createdAt: string;
};

type MyListing = {
  listingId: string;
  sellerStickerId: string;
  sellerAssetId: string;
  priceLamports: number;
  status: string;
  error: string | null;
  buyerWallet: string | null;
  expiresAt?: string | null;
  sellerDelegationTxSig: string | null;
  buyTxSig: string | null;
};

type ListingsResponse = {
  delegateWallet: string;
  marketFeeBps?: number;
  marketFeeWallet?: string;
  open: OpenListing[];
  mine: MyListing[];
};

type AssetsResponse = {
  wallet: string;
  count: number;
  items: TradeAsset[];
};

type TransferPrepareResponse = {
  intentId: string;
  txB64: string;
  stickerId: string | null;
  assetId: string;
  recipientWallet: string;
};

type StickerItem = {
  id: string;
  name?: string;
  image?: string;
  rarity?: string;
};

type StickerJson = {
  items: StickerItem[];
};

type OwnedStickerGroup = {
  stickerId: string;
  name: string;
  imageSrc: string | null;
  count: number;
  availableCount: number;
  lockedCount: number;
  primaryAssetId: string;
  assetIds: string[];
};

const ST = stickers as StickerJson;
const IMAGE_BASE =
  process.env.NEXT_PUBLIC_STICKERS_IMAGE_BASE?.trim() || "/stickers/";
const SOLSCAN_CLUSTER = process.env.NEXT_PUBLIC_SOLSCAN_CLUSTER?.trim() ?? "";
const SALES_UI_ENABLED =
  (process.env.NEXT_PUBLIC_MARKET_ENABLE_SALES?.trim().toLowerCase() ?? "") === "1";
const TRADE_OFFER_TTL_HOURS_UI = Number(
  process.env.NEXT_PUBLIC_TRADE_OFFER_TTL_HOURS ?? 168
);
const MARKET_LISTING_TTL_HOURS_UI = Number(
  process.env.NEXT_PUBLIC_MARKET_LISTING_TTL_HOURS ?? 24
);
const BOARD_GRID_STORAGE_KEY = "market.board.grid.cols";
const MARKET_ACTIVE_TAB_STORAGE_KEY = "market.active.tab";
const ACTIVE_LOCK_STATUSES = new Set(["DRAFT", "OPEN", "LOCKED"]);

function short(v: string, head = 5, tail = 5) {
  if (!v) return "";
  if (v.length <= head + tail + 1) return v;
  return `${v.slice(0, head)}...${v.slice(-tail)}`;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "OPEN":
      return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
    case "LOCKED":
      return "border-amber-400/40 bg-amber-500/10 text-amber-200";
    case "DONE":
    case "SOLD":
      return "border-sky-400/40 bg-sky-500/10 text-sky-200";
    case "DRAFT":
      return "border-zinc-400/40 bg-zinc-500/10 text-zinc-200";
    default:
      return "border-zinc-400/40 bg-zinc-500/10 text-zinc-200";
  }
}

function rarityBadgeMeta(value?: string | null) {
  const rarity = normalizeRarity(value);
  switch (rarity) {
    case "mythic":
      return {
        label: "Mythic",
        chipClass: "border-rose-300/35 bg-black/45 text-rose-100/90",
      };
    case "legendary":
    case "SSR":
      return {
        label: "Legendary",
        chipClass: "border-amber-300/35 bg-black/45 text-amber-100/90",
      };
    case "rare":
    case "SR":
      return {
        label: "Rare",
        chipClass: "border-sky-300/35 bg-black/45 text-sky-100/90",
      };
    case "uncommon":
      return {
        label: "Uncommon",
        chipClass: "border-emerald-300/35 bg-black/45 text-emerald-100/90",
      };
    case "common":
    case "R":
      return {
        label: "Common",
        chipClass: "border-zinc-300/30 bg-black/45 text-zinc-100/85",
      };
    default:
      return null;
  }
}

function resolveStickerImageSrc(image?: string | null) {
  const value = (image ?? "").trim();
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return value;
  const base = IMAGE_BASE.endsWith("/") ? IMAGE_BASE : `${IMAGE_BASE}/`;
  return `${base}${value}`;
}

function lamportsToSol(lamports: number) {
  const sol = Number(lamports || 0) / 1_000_000_000;
  return sol.toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function solToLamports(value: string) {
  const n = Number(value.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  const lamports = Math.floor(n * 1_000_000_000);
  if (lamports <= 0) return null;
  return lamports;
}

function splitMarketSaleAmount(priceLamports: number, marketFeeBps: number) {
  const totalLamports = Math.max(0, Math.floor(Number(priceLamports) || 0));
  const feeLamports = Math.floor((totalLamports * Math.max(0, Math.floor(Number(marketFeeBps) || 0))) / 10_000);
  const sellerLamports = Math.max(0, totalLamports - feeLamports);
  return { totalLamports, feeLamports, sellerLamports };
}

function normalizeStickerFilter(value: string) {
  return value.trim().replace(/^#/, "");
}

function normalizeStickerId(value: string) {
  return value.trim().replace(/^#/, "");
}

function normalizeStickerIds(values: string[]) {
  const unique = new Set<string>();
  for (const value of values) {
    const id = normalizeStickerId(value);
    if (!id) continue;
    unique.add(id);
  }
  return [...unique];
}

function compareStickerIds(a: string, b: string) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, "fr");
}

function formatStickerList(ids: string[]) {
  if (!ids.length) return "";
  return ids.map((id) => `#${id}`).join(", ");
}

function formatStickerListPreview(ids: string[], max = 4) {
  if (!ids.length) return "";
  const values = ids.slice(0, max).map((id) => `#${id}`);
  const remaining = ids.length - values.length;
  return remaining > 0 ? `${values.join(", ")} +${remaining}` : values.join(", ");
}

function toTimestamp(input: string) {
  const t = Date.parse(input);
  return Number.isFinite(t) ? t : 0;
}

function formatDateTime(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "-";
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return "-";
  return new Date(ts).toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTtlLabel(hoursRaw: number) {
  const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? Math.floor(hoursRaw) : 0;
  if (hours <= 0) return "-";
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (days > 0 && remHours === 0) return `${days} jour${days > 1 ? "s" : ""}`;
  if (days > 0) {
    return `${days}j ${remHours}h`;
  }
  return `${hours}h`;
}

function remainingMsUntil(value: string | null | undefined, nowMs: number) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const ts = Date.parse(raw);
  if (!Number.isFinite(ts)) return null;
  return ts - nowMs;
}

function formatCountdown(value: number | null) {
  if (value === null) return "Durée inconnue";
  if (value <= 0) return "Expirée";
  const totalSec = Math.max(0, Math.floor(value / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `${days}j ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function boardGridClass(cols: "2" | "3" | "4") {
  if (cols === "2") {
    return "grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-2";
  }
  if (cols === "4") {
    return "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  }
  return "grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3";
}

function GridColsIcon({ cols }: { cols: 2 | 3 | 4 }) {
  const width = 24;
  const height = 16;
  const gap = 1.5;
  const colWidth = (width - gap * (cols + 1)) / cols;
  const topY = 1.5;
  const rowHeight = 5;
  const bottomY = 9.5;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-4 w-6" aria-hidden="true">
      {Array.from({ length: cols }).map((_, index) => {
        const x = gap + index * (colWidth + gap);
        return (
          <g key={`${cols}-${index}`}>
            <rect x={x} y={topY} width={colWidth} height={rowHeight} rx="1" fill="currentColor" />
            <rect x={x} y={bottomY} width={colWidth} height={rowHeight} rx="1" fill="currentColor" />
          </g>
        );
      })}
    </svg>
  );
}

function solscanTxUrl(signature: string) {
  const suffix = SOLSCAN_CLUSTER
    ? `?cluster=${encodeURIComponent(SOLSCAN_CLUSTER)}`
    : "";
  return `https://solscan.io/tx/${signature}${suffix}`;
}

async function copyText(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  throw new Error("Clipboard API indisponible");
}

function normalizeWallet(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    return new PublicKey(raw).toBase58();
  } catch {
    return null;
  }
}

export function MarketplacePanel() {
  const wallet = useWallet();

  const [offers, setOffers] = useState<OffersResponse | null>(null);
  const [listings, setListings] = useState<ListingsResponse | null>(null);
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [assets, setAssets] = useState<TradeAsset[]>([]);

  const [makerAssetId, setMakerAssetId] = useState("");
  const [makerAssetSearch, setMakerAssetSearch] = useState("");
  const [makerOnlyDuplicates, setMakerOnlyDuplicates] = useState(false);
  const [wantedStickerSearch, setWantedStickerSearch] = useState("");
  const [wantedStickerIds, setWantedStickerIds] = useState<string[]>([]);
  const [saleAssetId, setSaleAssetId] = useState("");
  const [salePriceSol, setSalePriceSol] = useState("0.05");

  const [acceptAssetByOffer, setAcceptAssetByOffer] = useState<Record<string, string>>({});

  const [marketMode, setMarketMode] = useState<"all" | "trade" | "sale">(
    SALES_UI_ENABLED ? "all" : "trade"
  );
  const [boardSort, setBoardSort] = useState<"recent" | "priceAsc" | "priceDesc">("recent");
  const [boardCols, setBoardCols] = useState<"2" | "3" | "4">("3");
  const [stickerFilter, setStickerFilter] = useState("");
  const [activeTab, setActiveTab] = useState<
    "marketplace" | "history" | "create" | "send" | "mine"
  >("marketplace");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [sendRecipientWallet, setSendRecipientWallet] = useState("");
  const [sendSelectedAssetIds, setSendSelectedAssetIds] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const walletPk = wallet.publicKey?.toBase58() ?? "";
  const refreshTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const selectOptionStyle = { color: "#e5e7eb", backgroundColor: "#0b1020" };
  const selectClass =
    "rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-sm text-white outline-none transition-all duration-150 cursor-pointer focus:border-emerald-300/45 focus:ring-2 focus:ring-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-60";
  const buttonClass =
    "rounded-xl border px-3 py-2 text-sm transition-all duration-150 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:bg-white/10 enabled:hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]";
  const buttonPrimaryClass =
    "rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100 transition-all duration-150 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:bg-emerald-500/20 enabled:hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]";
  const buttonWideClass =
    "w-full rounded-xl border px-3 py-2 text-sm transition-all duration-150 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:bg-white/10 enabled:hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]";
  const buttonPrimaryWideClass =
    "w-full rounded-xl border border-emerald-300/40 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100 transition-all duration-150 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:bg-emerald-500/20 enabled:hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]";
  const buttonSmallClass =
    "rounded-md border px-2 py-0.5 text-xs transition-all duration-150 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:bg-white/10 active:scale-[0.98]";

  const stickerById = useMemo(() => {
    const map = new Map<string, StickerItem>();
    for (const item of ST.items ?? []) {
      map.set(String(item.id), item);
    }
    return map;
  }, []);

  const assetsBySticker = useMemo(() => {
    const map = new Map<string, TradeAsset[]>();
    for (const asset of assets) {
      const key = String(asset.stickerId);
      const list = map.get(key) ?? [];
      list.push(asset);
      map.set(key, list);
    }
    return map;
  }, [assets]);

  const lockedAssetReasonById = useMemo(() => {
    const map = new Map<string, string>();

    for (const offer of offers?.mine ?? []) {
      const status = String(offer.status ?? "").trim().toUpperCase();
      const assetId = String(offer.makerAssetId ?? "").trim();
      if (!assetId || !ACTIVE_LOCK_STATUSES.has(status)) continue;
      map.set(assetId, "Offre active");
    }

    for (const listing of listings?.mine ?? []) {
      const status = String(listing.status ?? "").trim().toUpperCase();
      const assetId = String(listing.sellerAssetId ?? "").trim();
      if (!assetId || !ACTIVE_LOCK_STATUSES.has(status)) continue;
      const previous = map.get(assetId);
      map.set(assetId, previous ? "Offre + vente active" : "Vente active");
    }

    return map;
  }, [offers?.mine, listings?.mine]);

  const lockedAssetIds = useMemo(() => {
    return new Set<string>([...lockedAssetReasonById.keys()]);
  }, [lockedAssetReasonById]);

  const ownedStickerGroups = useMemo<OwnedStickerGroup[]>(() => {
    const grouped = new Map<string, TradeAsset[]>();
    for (const asset of assets) {
      const key = String(asset.stickerId);
      const list = grouped.get(key) ?? [];
      list.push(asset);
      grouped.set(key, list);
    }

    return [...grouped.entries()]
      .map(([stickerId, list]) => {
        const sticker = stickerById.get(stickerId);
        const availableAssets = list.filter(
          (asset) => !lockedAssetIds.has(String(asset.assetId))
        );
        const imageSrc =
          resolveStickerImageSrc(list[0]?.image ?? null) ??
          resolveStickerImageSrc(sticker?.image);
        return {
          stickerId,
          name: String(sticker?.name ?? list[0]?.name ?? `Sticker #${stickerId}`),
          imageSrc,
          count: list.length,
          availableCount: availableAssets.length,
          lockedCount: Math.max(0, list.length - availableAssets.length),
          primaryAssetId: availableAssets[0]?.assetId ?? "",
          assetIds: list.map((asset) => asset.assetId),
        };
      })
      .sort((a, b) => compareStickerIds(a.stickerId, b.stickerId));
  }, [assets, lockedAssetIds, stickerById]);

  const makerAssetOptions = useMemo(() => {
    const needle = makerAssetSearch.trim().toLowerCase();
    const scoped = makerOnlyDuplicates
      ? ownedStickerGroups.filter((group) => group.availableCount > 1)
      : ownedStickerGroups;
    if (!needle) return scoped;
    return scoped.filter((group) => {
      return group.stickerId.toLowerCase().includes(needle);
    });
  }, [ownedStickerGroups, makerAssetSearch, makerOnlyDuplicates]);

  const sendAssetOptions = useMemo(() => {
    return [...assets].sort((a, b) => {
      const aLocked = lockedAssetIds.has(String(a.assetId)) ? 1 : 0;
      const bLocked = lockedAssetIds.has(String(b.assetId)) ? 1 : 0;
      if (aLocked !== bLocked) return aLocked - bLocked;
      const bySticker = compareStickerIds(String(a.stickerId), String(b.stickerId));
      if (bySticker !== 0) return bySticker;
      return String(a.assetId).localeCompare(String(b.assetId), "fr");
    });
  }, [assets, lockedAssetIds]);

  const selectedSendAssets = useMemo(() => {
    const selected = new Set(sendSelectedAssetIds);
    return sendAssetOptions.filter(
      (asset) =>
        selected.has(asset.assetId) && !lockedAssetIds.has(String(asset.assetId))
    );
  }, [lockedAssetIds, sendAssetOptions, sendSelectedAssetIds]);

  const makerSelectedStickerId = useMemo(() => {
    if (!makerAssetId) return "";
    return String(assets.find((asset) => asset.assetId === makerAssetId)?.stickerId ?? "");
  }, [assets, makerAssetId]);

  const makerSelectedGroup = useMemo(() => {
    if (!makerSelectedStickerId) return null;
    return (
      ownedStickerGroups.find((group) => group.stickerId === makerSelectedStickerId) ?? null
    );
  }, [ownedStickerGroups, makerSelectedStickerId]);

  const duplicateCopiesCount = useMemo(() => {
    return ownedStickerGroups.reduce((sum, group) => sum + Math.max(0, group.count - 1), 0);
  }, [ownedStickerGroups]);

  const ownedStickerIds = useMemo(() => {
    const unique = new Set<string>();
    for (const asset of assets) {
      unique.add(String(asset.stickerId));
    }
    return unique;
  }, [assets]);

  const missingStickerIds = useMemo(() => {
    return (ST.items ?? [])
      .map((item) => String(item.id))
      .filter((id) => !ownedStickerIds.has(id));
  }, [ownedStickerIds]);

  const wantedStickerOptions = useMemo(() => {
    const needle = wantedStickerSearch.trim().toLowerCase();
    const selected = new Set(normalizeStickerIds(wantedStickerIds));
    return [...(ST.items ?? [])]
      .map((item) => ({
        id: String(item.id),
      }))
      .filter((item) => {
        if (!needle) return true;
        return item.id.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        const aSelected = selected.has(a.id);
        const bSelected = selected.has(b.id);
        if (aSelected !== bSelected) return aSelected ? -1 : 1;
        return Number(a.id) - Number(b.id);
      });
  }, [wantedStickerSearch, wantedStickerIds]);

  const refresh = useCallback(
    async (options?: { clearNotice?: boolean }) => {
      setLoading(true);
      if (options?.clearNotice !== false) setNotice("");

      try {
        const requests = [
          fetch("/api/trades/offers", { cache: "no-store" }),
          fetch("/api/market/listings", { cache: "no-store" }),
          fetch("/api/trades/insights", { cache: "no-store" }),
        ];

        if (walletPk) {
          requests.push(
            fetch(`/api/trades/assets?walletPubkey=${encodeURIComponent(walletPk)}`, {
              cache: "no-store",
            })
          );
        }

        const responses = await Promise.all(requests);
        const offersRes = responses[0];
        const listingsRes = responses[1];
        const insightsRes = responses[2];
        const assetsRes = walletPk ? responses[3] : null;

        if (!offersRes.ok) throw new Error(await offersRes.text());
        if (!listingsRes.ok) throw new Error(await listingsRes.text());
        if (!insightsRes.ok) throw new Error(await insightsRes.text());

        const offersJson = (await offersRes.json()) as OffersResponse;
        const listingsJson = (await listingsRes.json()) as ListingsResponse;
        const insightsJson = (await insightsRes.json()) as InsightsResponse;
        setOffers(offersJson);
        setListings(listingsJson);
        setInsights(insightsJson);

        if (walletPk && assetsRes) {
          if (!assetsRes.ok) throw new Error(await assetsRes.text());
          const assetsJson = (await assetsRes.json()) as AssetsResponse;
          setAssets(assetsJson.items ?? []);

          if (assetsJson.items.length) {
            setMakerAssetId((prev) => prev || assetsJson.items[0].assetId);
            setSaleAssetId((prev) => prev || assetsJson.items[0].assetId);
          }
        } else {
          setAssets([]);
        }
      } catch (e) {
        setNotice((e as Error)?.message ?? "Erreur refresh");
      } finally {
        setLoading(false);
      }
    },
    [walletPk]
  );

  const scheduleFollowupRefreshes = useCallback(() => {
    const t1 = setTimeout(() => {
      void refresh({ clearNotice: false });
    }, 1500);
    const t2 = setTimeout(() => {
      void refresh({ clearNotice: false });
    }, 4000);
    refreshTimersRef.current.push(t1, t2);
  }, [refresh]);

  useEffect(() => {
    void refresh();
    return () => {
      for (const timer of refreshTimersRef.current) clearTimeout(timer);
      refreshTimersRef.current = [];
    };
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!ownedStickerGroups.length) {
      setMakerAssetId("");
      setSaleAssetId("");
      setSendSelectedAssetIds([]);
      return;
    }

    const hasMaker = makerAssetId
      ? assets.some(
          (asset) =>
            asset.assetId === makerAssetId &&
            !lockedAssetIds.has(String(asset.assetId))
        )
      : false;
    if (!hasMaker) {
      const fallbackGroup = ownedStickerGroups.find((group) => group.primaryAssetId);
      setMakerAssetId(fallbackGroup?.primaryAssetId ?? "");
    }

    const hasSale = saleAssetId
      ? assets.some(
          (asset) =>
            asset.assetId === saleAssetId &&
            !lockedAssetIds.has(String(asset.assetId))
        )
      : false;
    if (!hasSale) {
      const fallbackGroup = ownedStickerGroups.find((group) => group.primaryAssetId);
      setSaleAssetId(fallbackGroup?.primaryAssetId ?? "");
    }

    setSendSelectedAssetIds((prev) =>
      prev.filter(
        (assetId) =>
          assets.some((asset) => asset.assetId === assetId) &&
          !lockedAssetIds.has(String(assetId))
      )
    );
  }, [assets, lockedAssetIds, makerAssetId, ownedStickerGroups, saleAssetId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(BOARD_GRID_STORAGE_KEY);
    if (saved === "2" || saved === "3" || saved === "4") {
      setBoardCols(saved);
    }

    const savedTab = window.localStorage.getItem(MARKET_ACTIVE_TAB_STORAGE_KEY);
    if (
      savedTab === "marketplace" ||
      savedTab === "history" ||
      savedTab === "create" ||
      savedTab === "send" ||
      savedTab === "mine"
    ) {
      setActiveTab(savedTab);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MARKET_ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  const delegateWallet =
    offers?.delegateWallet ?? listings?.delegateWallet ?? "";
  const marketFeeBps = Math.max(0, Number(listings?.marketFeeBps ?? 0));
  const marketFeeWallet = listings?.marketFeeWallet ?? delegateWallet;

  const salePricePreview = useMemo(() => {
    const totalLamports = solToLamports(salePriceSol);
    if (!totalLamports) return null;
    return splitMarketSaleAmount(totalLamports, marketFeeBps);
  }, [salePriceSol, marketFeeBps]);

  const stickerNeedle = normalizeStickerFilter(stickerFilter);
  const openTrades = useMemo(() => {
    const src = offers?.open ?? [];
    const filtered = src.filter((offer) => {
      if (!stickerNeedle) return true;
      const wanted = offer.wantedStickerIds ?? [];
      return (
        String(offer.makerStickerId) === stickerNeedle ||
        wanted.some((id) => String(id) === stickerNeedle)
      );
    });
    return [...filtered].sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
  }, [offers?.open, stickerNeedle]);

  const openSales = useMemo(() => {
    const src = listings?.open ?? [];
    const filtered = src.filter((listing) => {
      if (!stickerNeedle) return true;
      return String(listing.sellerStickerId) === stickerNeedle;
    });
    const sorted = [...filtered];
    if (boardSort === "priceAsc") {
      sorted.sort((a, b) => {
        const byPrice = Number(a.priceLamports) - Number(b.priceLamports);
        if (byPrice !== 0) return byPrice;
        return toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
      });
      return sorted;
    }
    if (boardSort === "priceDesc") {
      sorted.sort((a, b) => {
        const byPrice = Number(b.priceLamports) - Number(a.priceLamports);
        if (byPrice !== 0) return byPrice;
        return toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
      });
      return sorted;
    }
    sorted.sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
    return sorted;
  }, [listings?.open, stickerNeedle, boardSort]);

  const tradeHistory = useMemo(() => {
    const source = insights?.history ?? [];
    return source;
  }, [insights?.history]);

  const showTrades = !SALES_UI_ENABLED || marketMode === "all" || marketMode === "trade";
  const showSales = SALES_UI_ENABLED && (marketMode === "all" || marketMode === "sale");
  const marketGridClass = boardGridClass(boardCols);
  const visibleOpenCount =
    (showTrades ? openTrades.length : 0) +
    (showSales ? openSales.length : 0);

  async function signPreparedTx(txB64: string) {
    if (!wallet.signTransaction || !wallet.publicKey) {
      throw new Error("Wallet non connecte");
    }
    const txBytes = Uint8Array.from(Buffer.from(txB64, "base64"));
    const vtx = VersionedTransaction.deserialize(txBytes);
    const signed = await wallet.signTransaction(vtx);
    return Buffer.from(signed.serialize()).toString("base64");
  }

  async function copyTx(signature: string, label: string) {
    try {
      await copyText(signature);
      setNotice(`${label} copie`);
    } catch {
      setNotice("Impossible de copier automatiquement");
    }
  }

  async function handleRefreshClick() {
    if (loading) return;
    setBusyAction("refresh");
    try {
      await refresh();
    } finally {
      setBusyAction((prev) => (prev === "refresh" ? null : prev));
    }
  }

  function removeWantedStickerId(idRaw: string) {
    const id = normalizeStickerId(idRaw);
    setWantedStickerIds((prev) => prev.filter((entry) => normalizeStickerId(entry) !== id));
  }

  function toggleWantedStickerId(idRaw: string) {
    const id = normalizeStickerId(idRaw);
    if (!id) return;
    setWantedStickerIds((prev) => {
      const normalized = normalizeStickerIds(prev);
      if (normalized.includes(id)) {
        return normalized.filter((entry) => entry !== id);
      }
      return [...normalized, id];
    });
  }

  function toggleSendAssetId(assetId: string) {
    const lockReason = lockedAssetReasonById.get(String(assetId));
    if (lockReason) {
      setNotice(`Carte verrouillée: ${lockReason.toLowerCase()}.`);
      return;
    }
    setSendSelectedAssetIds((prev) => {
      if (prev.includes(assetId)) return prev.filter((entry) => entry !== assetId);
      return [...prev, assetId];
    });
  }

  async function sendAssets() {
    if (loading) return;
    if (!walletPk) {
      setNotice("Connecte ton wallet");
      return;
    }
    const recipientWallet = normalizeWallet(sendRecipientWallet);
    if (!recipientWallet) {
      setNotice("Adresse de destination invalide");
      return;
    }
    if (recipientWallet === walletPk) {
      setNotice("Tu ne peux pas t'envoyer les cartes à toi-même");
      return;
    }
    if (!selectedSendAssets.length) {
      setNotice("Sélectionne au moins une carte à envoyer");
      return;
    }

    const actionKey = "send-assets";
    setBusyAction(actionKey);
    setLoading(true);
    setNotice("");

    try {
      const txSigs: string[] = [];
      for (const asset of selectedSendAssets) {
        const prep = await fetch("/api/trades/send/prepare", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            walletPubkey: walletPk,
            recipientWallet,
            assetId: asset.assetId,
          }),
        });
        if (!prep.ok) throw new Error(await prep.text());
        const prepJson = (await prep.json()) as TransferPrepareResponse;

        const signedTxB64 = await signPreparedTx(prepJson.txB64);

        const sub = await fetch("/api/trades/send/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            intentId: prepJson.intentId,
            walletPubkey: walletPk,
            signedTxB64,
          }),
        });
        if (!sub.ok) throw new Error(await sub.text());
        const subJson = (await sub.json()) as { tx?: string };
        if (subJson.tx) txSigs.push(subJson.tx);
      }

      const lines = [
        `${selectedSendAssets.length} carte${selectedSendAssets.length > 1 ? "s" : ""} envoyée${selectedSendAssets.length > 1 ? "s" : ""}`,
      ];
      if (txSigs[0]) lines.push(`Tx: ${txSigs[0]}`);
      if (txSigs.length > 1) lines.push(`+${txSigs.length - 1} autre(s) transaction(s)`);
      setNotice(lines.join("\n"));
      setSendSelectedAssetIds([]);
      await refresh({ clearNotice: false });
      scheduleFollowupRefreshes();
    } catch (e) {
      setNotice((e as Error)?.message ?? "Erreur envoi cartes");
    } finally {
      setBusyAction((prev) => (prev === actionKey ? null : prev));
      setLoading(false);
    }
  }

  async function createOffer() {
    if (loading) return;
    if (!walletPk) {
      setNotice("Connecte ton wallet");
      return;
    }
    if (!makerAssetId || !wantedStickerIds.length) {
      setNotice("Choisis une carte et au moins un sticker cible");
      return;
    }
    const lockReason = lockedAssetReasonById.get(String(makerAssetId));
    if (lockReason) {
      setNotice(`Cette carte est verrouillée (${lockReason.toLowerCase()}).`);
      return;
    }

    const actionKey = "create-offer";
    setBusyAction(actionKey);
    setLoading(true);
    setNotice("");
    try {
      const prep = await fetch("/api/trades/offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletPubkey: walletPk,
          makerAssetId,
          wantedStickerIds,
        }),
      });
      if (!prep.ok) throw new Error(await prep.text());

      const prepJson = (await prep.json()) as { offerId: string; txB64: string };
      const signedTxB64 = await signPreparedTx(prepJson.txB64);

      const sub = await fetch("/api/trades/offers/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          offerId: prepJson.offerId,
          walletPubkey: walletPk,
          signedTxB64,
        }),
      });
      if (!sub.ok) throw new Error(await sub.text());

      const subJson = (await sub.json()) as { tx?: string };
      setNotice(
        subJson?.tx
          ? `Offre créée\nDelegation tx: ${subJson.tx}`
          : "Offre créée"
      );
      setWantedStickerSearch("");
      setWantedStickerIds([]);
      await refresh({ clearNotice: false });
      scheduleFollowupRefreshes();
    } catch (e) {
      setNotice((e as Error)?.message ?? "Erreur création offre");
    } finally {
      setBusyAction((prev) => (prev === actionKey ? null : prev));
      setLoading(false);
    }
  }

  async function createListing() {
    if (loading) return;
    if (!walletPk) {
      setNotice("Connecte ton wallet");
      return;
    }
    const lamports = solToLamports(salePriceSol);
    if (!saleAssetId || !lamports) {
      setNotice("Choisis une carte et un prix valide");
      return;
    }
    const lockReason = lockedAssetReasonById.get(String(saleAssetId));
    if (lockReason) {
      setNotice(`Cette carte est verrouillée (${lockReason.toLowerCase()}).`);
      return;
    }

    const actionKey = "create-listing";
    setBusyAction(actionKey);
    setLoading(true);
    setNotice("");
    try {
      const prep = await fetch("/api/market/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletPubkey: walletPk,
          sellerAssetId: saleAssetId,
          priceLamports: lamports,
        }),
      });
      if (!prep.ok) throw new Error(await prep.text());

      const prepJson = (await prep.json()) as { listingId: string; txB64: string };
      const signedTxB64 = await signPreparedTx(prepJson.txB64);

      const sub = await fetch("/api/market/listings/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listingId: prepJson.listingId,
          walletPubkey: walletPk,
          signedTxB64,
        }),
      });
      if (!sub.ok) throw new Error(await sub.text());

      const subJson = (await sub.json()) as { tx?: string };
      setNotice(
        subJson?.tx
          ? `Vente créée\nDelegation tx: ${subJson.tx}`
          : "Vente créée"
      );
      await refresh({ clearNotice: false });
      scheduleFollowupRefreshes();
    } catch (e) {
      setNotice((e as Error)?.message ?? "Erreur création vente");
    } finally {
      setBusyAction((prev) => (prev === actionKey ? null : prev));
      setLoading(false);
    }
  }

  async function acceptOffer(offer: OpenOffer) {
    if (loading) return;
    if (!walletPk) {
      setNotice("Connecte ton wallet");
      return;
    }

    const selected = acceptAssetByOffer[offer.offerId];
    const compatibleAssets = normalizeStickerIds(offer.wantedStickerIds ?? [])
      .flatMap((stickerId) => assetsBySticker.get(String(stickerId)) ?? []);
    const fallback = compatibleAssets[0]?.assetId;
    const takerAssetId = selected || fallback;
    if (!takerAssetId) {
      setNotice("Tu n'as aucune des cartes demandées");
      return;
    }

    const actionKey = `accept-${offer.offerId}`;
    setBusyAction(actionKey);
    setLoading(true);
    setNotice("");
    try {
      const prep = await fetch(`/api/trades/offers/${offer.offerId}/accept/prepare`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletPubkey: walletPk, takerAssetId }),
      });
      if (!prep.ok) throw new Error(await prep.text());
      const prepJson = (await prep.json()) as { txB64: string };

      const signedTxB64 = await signPreparedTx(prepJson.txB64);

      const sub = await fetch(`/api/trades/offers/${offer.offerId}/accept/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletPubkey: walletPk, signedTxB64 }),
      });
      if (!sub.ok) throw new Error(await sub.text());

      const subJson = (await sub.json()) as {
        takerDelegationTxSig?: string;
        settlementTxSig?: string;
      };

      const lines = ["Echange execute"];
      if (subJson?.takerDelegationTxSig) {
        lines.push(`Delegation tx: ${subJson.takerDelegationTxSig}`);
      }
      if (subJson?.settlementTxSig) {
        lines.push(`Settlement tx: ${subJson.settlementTxSig}`);
      }
      setNotice(lines.join("\n"));
      await refresh({ clearNotice: false });
      scheduleFollowupRefreshes();
    } catch (e) {
      // Best-effort unlock when taker flow is interrupted (wallet reject, submit error, etc.).
      try {
        await fetch(`/api/trades/offers/${offer.offerId}/release`, { method: "POST" });
      } catch {
        // ignore
      }
      setNotice((e as Error)?.message ?? "Erreur acceptation offre");
    } finally {
      setBusyAction((prev) => (prev === actionKey ? null : prev));
      setLoading(false);
    }
  }

  async function buyListing(listing: OpenListing) {
    if (loading) return;
    if (!walletPk) {
      setNotice("Connecte ton wallet");
      return;
    }

    const actionKey = `buy-${listing.listingId}`;
    setBusyAction(actionKey);
    setLoading(true);
    setNotice("");
    try {
      const prep = await fetch(`/api/market/listings/${listing.listingId}/buy/prepare`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletPubkey: walletPk }),
      });
      if (!prep.ok) throw new Error(await prep.text());
      const prepJson = (await prep.json()) as { txB64: string };

      const signedTxB64 = await signPreparedTx(prepJson.txB64);

      const sub = await fetch(`/api/market/listings/${listing.listingId}/buy/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ walletPubkey: walletPk, signedTxB64 }),
      });
      if (!sub.ok) throw new Error(await sub.text());

      const subJson = (await sub.json()) as { buyTxSig?: string };
      setNotice(
        subJson?.buyTxSig
          ? `Achat execute\nBuy tx: ${subJson.buyTxSig}`
          : "Achat execute"
      );
      await refresh({ clearNotice: false });
      scheduleFollowupRefreshes();
    } catch (e) {
      setNotice((e as Error)?.message ?? "Erreur achat");
    } finally {
      setBusyAction((prev) => (prev === actionKey ? null : prev));
      setLoading(false);
    }
  }

  async function cancelOffer(offerId: string) {
    if (loading) return;
    const actionKey = `cancel-offer-${offerId}`;
    setBusyAction(actionKey);
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch(`/api/trades/offers/${offerId}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setNotice("Offre annulée");
      await refresh({ clearNotice: false });
    } catch (e) {
      setNotice((e as Error)?.message ?? "Erreur annulation offre");
    } finally {
      setBusyAction((prev) => (prev === actionKey ? null : prev));
      setLoading(false);
    }
  }

  async function releaseOfferLock(offerId: string) {
    if (loading) return;
    const actionKey = `release-offer-${offerId}`;
    setBusyAction(actionKey);
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch(`/api/trades/offers/${offerId}/release`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      setNotice("Offre déverrouillée");
      await refresh({ clearNotice: false });
    } catch (e) {
      setNotice((e as Error)?.message ?? "Erreur déverrouillage offre");
    } finally {
      setBusyAction((prev) => (prev === actionKey ? null : prev));
      setLoading(false);
    }
  }

  async function cancelListing(listingId: string) {
    if (loading) return;
    const actionKey = `cancel-listing-${listingId}`;
    setBusyAction(actionKey);
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch(`/api/market/listings/${listingId}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      setNotice("Vente annulée");
      await refresh({ clearNotice: false });
    } catch (e) {
      setNotice((e as Error)?.message ?? "Erreur annulation vente");
    } finally {
      setBusyAction((prev) => (prev === actionKey ? null : prev));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm opacity-70 space-y-1">
          <div>
            Wallet service du marketplace: <span className="font-mono">{short(delegateWallet)}</span>
          </div>
          {SALES_UI_ENABLED && marketFeeBps > 0 ? (
            <div>
              Frais market: {(marketFeeBps / 100).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%
              {" · "}wallet fee: <span className="font-mono">{short(marketFeeWallet)}</span>
            </div>
          ) : SALES_UI_ENABLED ? (
            <div>Frais market: 0%</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button className={buttonClass} onClick={() => void handleRefreshClick()} disabled={loading}>
            {busyAction === "refresh" ? "Actualisation..." : "Actualiser"}
          </button>
          <WalletMultiButton />
        </div>
      </div>

      {notice ? (
        <div className="rounded-xl border border-emerald-300/35 bg-emerald-500/10 p-3 text-sm whitespace-pre-line">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 break-words">{notice}</div>
            <button
              type="button"
              className="rounded-md border border-emerald-200/35 px-2 py-0.5 text-xs opacity-90 transition hover:bg-emerald-500/20"
              onClick={() => setNotice("")}
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl border border-white/20 bg-black/20 p-1 text-sm">
          <button
            type="button"
            className={`rounded-lg px-3 py-1 transition-all duration-150 cursor-pointer active:scale-[0.98] ${activeTab === "marketplace" ? "bg-emerald-500/20 text-emerald-100" : "opacity-70 hover:bg-white/10"}`}
            onClick={() => setActiveTab("marketplace")}
          >
            Marketplace
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1 transition-all duration-150 cursor-pointer active:scale-[0.98] ${activeTab === "history" ? "bg-emerald-500/20 text-emerald-100" : "opacity-70 hover:bg-white/10"}`}
            onClick={() => setActiveTab("history")}
          >
            Historique
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1 transition-all duration-150 cursor-pointer active:scale-[0.98] ${activeTab === "create" ? "bg-emerald-500/20 text-emerald-100" : "opacity-70 hover:bg-white/10"}`}
            onClick={() => setActiveTab("create")}
          >
            Créer
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1 transition-all duration-150 cursor-pointer active:scale-[0.98] ${activeTab === "send" ? "bg-emerald-500/20 text-emerald-100" : "opacity-70 hover:bg-white/10"}`}
            onClick={() => setActiveTab("send")}
          >
            Envoyer
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1 transition-all duration-150 cursor-pointer active:scale-[0.98] ${activeTab === "mine" ? "bg-emerald-500/20 text-emerald-100" : "opacity-70 hover:bg-white/10"}`}
            onClick={() => setActiveTab("mine")}
          >
            Mes offres
          </button>
        </div>

        {activeTab !== "create" ? (
          <button
            type="button"
            className={buttonPrimaryClass}
            onClick={() => {
              setActiveTab("create");
            }}
            disabled={loading}
          >
            Nouvel échange
          </button>
        ) : null}
      </div>

      {activeTab === "create" ? (
        <section className={SALES_UI_ENABLED ? "grid gap-4 lg:grid-cols-[1.25fr_0.75fr]" : "grid gap-4"}>
          <div className="rounded-2xl border border-white/20 bg-black/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.06)] space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Proposer un échange</div>
                <div className="text-xs opacity-70">
                  Choisis 1 carte à offrir, puis les cartes que tu acceptes en retour.
                </div>
                <div className="text-xs opacity-60 mt-1">
                  Durée des offres: {formatTtlLabel(TRADE_OFFER_TTL_HOURS_UI)} (fixe côté serveur).
                  {SALES_UI_ENABLED
                    ? ` Durée des ventes: ${formatTtlLabel(MARKET_LISTING_TTL_HOURS_UI)}.`
                    : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1">
                  Total: {assets.length}
                </span>
                <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1">
                  Distinctes: {ownedStickerGroups.length}
                </span>
                <span className="rounded-full border border-white/20 bg-white/5 px-2.5 py-1">
                  Doublons: {duplicateCopiesCount}
                </span>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.14em] opacity-60">Ta carte proposée</div>
                <input
                  className="rounded-xl border border-white/20 px-3 py-2 bg-black/25 text-sm"
                  placeholder="Filtrer ta carte (#14)"
                  value={makerAssetSearch}
                  onChange={(e) => setMakerAssetSearch(e.target.value)}
                />
                <label className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/20 bg-black/20 px-3 py-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-400"
                    checked={makerOnlyDuplicates}
                    onChange={(e) => setMakerOnlyDuplicates(e.target.checked)}
                  />
                  Doublons uniquement
                </label>
                <div className="text-[11px] opacity-65">
                  Les cartes verrouillées (offre/vente active) sont masquées des actions.
                </div>
                <div className="max-h-64 overflow-y-auto rounded-xl border border-white/20 bg-black/20 p-2">
                  {makerAssetOptions.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {makerAssetOptions.map((group) => {
                        const selected = makerSelectedStickerId === group.stickerId;
                        const isDisabled = !group.primaryAssetId;
                        return (
                          <button
                            key={`maker-group-${group.stickerId}`}
                            type="button"
                            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all duration-150 cursor-pointer ${
                              isDisabled
                                ? "border-white/10 bg-black/10 opacity-45 cursor-not-allowed"
                                : selected
                                ? "bg-emerald-500/15 border-emerald-300/60 shadow-[0_0_0_1px_rgba(52,211,153,.15)]"
                                : "border-white/15 bg-black/20 hover:bg-white/10"
                            }`}
                            onClick={() => {
                              if (!isDisabled) setMakerAssetId(group.primaryAssetId);
                            }}
                            disabled={isDisabled}
                            title={
                              isDisabled
                                ? `#${group.stickerId} indisponible (tout verrouillé)`
                                : `Sélectionner #${group.stickerId}`
                            }
                          >
                            <div className="h-10 w-8 shrink-0 overflow-hidden rounded border border-white/15 bg-black/30">
                              {group.imageSrc ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={group.imageSrc}
                                  alt={`Sticker #${group.stickerId}`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="grid h-full w-full place-items-center text-[10px] opacity-60">
                                  #{group.stickerId}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm">#{group.stickerId}</div>
                              <div className="text-[11px] opacity-70">
                                dispo x{group.availableCount}
                                {group.lockedCount > 0 ? ` · verrouillé x${group.lockedCount}` : ""}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs opacity-70">Aucune carte trouvée.</div>
                  )}
                </div>
                {makerSelectedGroup ? (
                  <div className="rounded-lg border border-emerald-300/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs">
                    Carte proposée: <span className="font-medium">#{makerSelectedGroup.stickerId}</span>
                    {" · "}dispo x{makerSelectedGroup.availableCount}
                    {makerSelectedGroup.lockedCount > 0
                      ? ` · verrouillé x${makerSelectedGroup.lockedCount}`
                      : ""}
                  </div>
                ) : (
                  <div className="text-xs opacity-70">Choisis une carte à proposer.</div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs uppercase tracking-[0.14em] opacity-60">Cartes acceptées en retour</div>
                <input
                  className="rounded-xl border border-white/20 px-3 py-2 bg-black/25 text-sm"
                  placeholder="Rechercher une carte (#14)"
                  value={wantedStickerSearch}
                  onChange={(e) => setWantedStickerSearch(e.target.value)}
                />
                <div className="max-h-64 overflow-y-auto rounded-xl border border-white/20 bg-black/20 p-2">
                  {wantedStickerOptions.length ? (
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {wantedStickerOptions.map((item) => {
                        const checked = wantedStickerIds.includes(item.id);
                        return (
                          <label
                            key={`wanted-option-${item.id}`}
                            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs cursor-pointer transition-all duration-150 ${
                              checked
                                ? "border-cyan-300/60 bg-cyan-500/10"
                                : "border-white/15 bg-black/20 hover:bg-white/10"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleWantedStickerId(item.id)}
                              className="h-3.5 w-3.5 accent-cyan-300"
                            />
                            <span className="truncate">#{item.id}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs opacity-70">Aucune carte trouvée.</div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    className={buttonSmallClass}
                    disabled={loading || !assets.length}
                    onClick={() => setWantedStickerIds(normalizeStickerIds(missingStickerIds))}
                  >
                    Mes manquantes ({missingStickerIds.length})
                  </button>
                  <button
                    type="button"
                    className={buttonSmallClass}
                    disabled={loading || !wantedStickerIds.length}
                    onClick={() => setWantedStickerIds([])}
                  >
                    Vider
                  </button>
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5">
                    {wantedStickerIds.length} cible(s)
                  </span>
                </div>

                {wantedStickerIds.length ? (
                  <div className="rounded-lg border border-white/15 bg-black/20 p-2">
                    <div className="mb-1 text-[11px] uppercase tracking-[0.12em] opacity-60">
                      Sélection actuelle
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {wantedStickerIds.map((id) => (
                        <button
                          key={`wanted-${id}`}
                          type="button"
                          className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-2 py-0.5 text-xs transition-all duration-150 enabled:cursor-pointer hover:bg-cyan-500/20"
                          onClick={() => removeWantedStickerId(id)}
                          title={`Retirer #${id}`}
                          disabled={loading}
                        >
                          #{id} ×
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs opacity-70">Ajoute une ou plusieurs cartes acceptées.</div>
                )}
              </div>
            </div>

            <button
              className={buttonPrimaryWideClass}
              disabled={loading}
              onClick={() => void createOffer()}
            >
              {busyAction === "create-offer" ? "Création..." : "Créer l'offre"}
            </button>
          </div>

          {SALES_UI_ENABLED ? (
            <div className="rounded-2xl border border-white/20 bg-black/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.06)] space-y-3">
              <div className="font-semibold">Mettre une carte en vente</div>
              <div className="grid gap-2">
                <select
                  className={selectClass}
                  value={saleAssetId}
                  onChange={(e) => setSaleAssetId(e.target.value)}
                >
                  <option value="" style={selectOptionStyle}>Choisis ta carte à vendre</option>
                  {ownedStickerGroups.map((group) => (
                    <option
                      key={`sale-group-${group.stickerId}`}
                      value={group.primaryAssetId}
                      disabled={!group.primaryAssetId}
                      style={selectOptionStyle}
                    >
                      #{group.stickerId} · dispo x{group.availableCount}
                      {group.lockedCount > 0 ? ` · verrouillé x${group.lockedCount}` : ""}
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-xl border border-white/20 px-3 py-2 bg-black/25"
                  placeholder="Prix en SOL (ex: 0.05)"
                  value={salePriceSol}
                  onChange={(e) => setSalePriceSol(e.target.value)}
                />
                {salePricePreview ? (
                  <div className="rounded-lg border border-white/15 bg-black/20 p-2 text-xs opacity-80">
                    Total acheteur: {lamportsToSol(salePricePreview.totalLamports)} SOL
                    {" · "}Tu reçois: {lamportsToSol(salePricePreview.sellerLamports)} SOL
                    {" · "}Frais: {lamportsToSol(salePricePreview.feeLamports)} SOL
                  </div>
                ) : null}
                <button className={buttonClass} disabled={loading} onClick={() => void createListing()}>
                  {busyAction === "create-listing" ? "Publication..." : "Mettre en vente"}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === "marketplace" ? (
        <section className="rounded-2xl border border-white/20 bg-black/25 p-4 space-y-3 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-semibold">Marketplace</div>
          <div className="flex flex-wrap items-center gap-2">
            {SALES_UI_ENABLED ? (
              <div className="inline-flex rounded-xl border p-1 text-sm">
                <button
                  className={`rounded-lg px-3 py-1 transition-all duration-150 cursor-pointer active:scale-[0.98] ${marketMode === "all" ? "bg-white/20" : "opacity-70 hover:bg-white/10"}`}
                  onClick={() => setMarketMode("all")}
                  type="button"
                >
                  Tout
                </button>
                <button
                  className={`rounded-lg px-3 py-1 transition-all duration-150 cursor-pointer active:scale-[0.98] ${marketMode === "trade" ? "bg-white/20" : "opacity-70 hover:bg-white/10"}`}
                  onClick={() => setMarketMode("trade")}
                  type="button"
                >
                  Echanges
                </button>
                <button
                  className={`rounded-lg px-3 py-1 transition-all duration-150 cursor-pointer active:scale-[0.98] ${marketMode === "sale" ? "bg-white/20" : "opacity-70 hover:bg-white/10"}`}
                  onClick={() => setMarketMode("sale")}
                  type="button"
                >
                  Ventes
                </button>
              </div>
            ) : (
              <div className="inline-flex rounded-xl border px-3 py-2 text-sm opacity-80">
                Echanges
              </div>
            )}
            <div className="inline-flex rounded-xl border p-1 text-sm">
              <button
                className={`rounded-lg px-2 py-1 transition-all duration-150 cursor-pointer active:scale-[0.98] ${boardCols === "2" ? "bg-white/20" : "opacity-70 hover:bg-white/10"}`}
                onClick={() => {
                  setBoardCols("2");
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(BOARD_GRID_STORAGE_KEY, "2");
                  }
                }}
                type="button"
                aria-label="Afficher 2 cartes par ligne"
                title="2 cartes"
              >
                <GridColsIcon cols={2} />
              </button>
              <button
                className={`rounded-lg px-2 py-1 transition-all duration-150 cursor-pointer active:scale-[0.98] ${boardCols === "3" ? "bg-white/20" : "opacity-70 hover:bg-white/10"}`}
                onClick={() => {
                  setBoardCols("3");
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(BOARD_GRID_STORAGE_KEY, "3");
                  }
                }}
                type="button"
                aria-label="Afficher 3 cartes par ligne"
                title="3 cartes"
              >
                <GridColsIcon cols={3} />
              </button>
              <button
                className={`rounded-lg px-2 py-1 transition-all duration-150 cursor-pointer active:scale-[0.98] ${boardCols === "4" ? "bg-white/20" : "opacity-70 hover:bg-white/10"}`}
                onClick={() => {
                  setBoardCols("4");
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem(BOARD_GRID_STORAGE_KEY, "4");
                  }
                }}
                type="button"
                aria-label="Afficher 4 cartes par ligne"
                title="4 cartes"
              >
                <GridColsIcon cols={4} />
              </button>
            </div>
            <input
              className="rounded-xl border px-3 py-2 text-sm bg-transparent"
              placeholder="Filtre sticker (#14)"
              value={stickerFilter}
              onChange={(e) => setStickerFilter(e.target.value)}
            />
            <select
              className={selectClass}
              value={boardSort}
              onChange={(e) =>
                setBoardSort(e.target.value as "recent" | "priceAsc" | "priceDesc")
              }
            >
              <option value="recent" style={selectOptionStyle}>Tri: Plus récent</option>
              <option value="priceAsc" style={selectOptionStyle}>Tri: Prix croissant</option>
              <option value="priceDesc" style={selectOptionStyle}>Tri: Prix décroissant</option>
            </select>
          </div>
        </div>

        <div className={marketGridClass}>
          {showTrades &&
            openTrades.map((offer) => {
              const sticker = stickerById.get(String(offer.makerStickerId));
              const rarity = rarityBadgeMeta(sticker?.rarity);
              const imageSrc = resolveStickerImageSrc(sticker?.image);
              const makerName =
                String(offer.makerDisplayName ?? "").trim() ||
                short(String(offer.makerTwitchUserId ?? ""), 4, 4);
              const remaining = remainingMsUntil(offer.expiresAt, nowMs);
              const countdownLabel = formatCountdown(remaining);
              const wantedIds = normalizeStickerIds(offer.wantedStickerIds ?? []);
              const wantedCount = wantedIds.length;
              const wantedListFull = formatStickerList(wantedIds);
              const wantedListPreview = formatStickerListPreview(wantedIds, 4);
              const compatible = wantedIds
                .flatMap((wantedId) => assetsBySticker.get(String(wantedId)) ?? [])
                .filter(
                  (asset, index, array) =>
                    array.findIndex((entry) => entry.assetId === asset.assetId) ===
                      index && !lockedAssetIds.has(String(asset.assetId))
                );
              const groupedCompatible = new Map<string, TradeAsset[]>();
              for (const asset of compatible) {
                const key = String(asset.stickerId);
                const list = groupedCompatible.get(key) ?? [];
                list.push(asset);
                groupedCompatible.set(key, list);
              }
              const compatibleGroups = [...groupedCompatible.entries()]
                .map(([stickerId, list]) => ({
                  stickerId,
                  count: list.length,
                  primaryAssetId: list[0]?.assetId ?? "",
                  name: stickerById.get(stickerId)?.name ?? list[0]?.name ?? `Sticker #${stickerId}`,
                }))
                .filter((group) => Boolean(group.primaryAssetId))
                .sort((a, b) => compareStickerIds(a.stickerId, b.stickerId));
              return (
                <article key={`trade-${offer.offerId}`} className="rounded-2xl border border-white/20 p-3 space-y-3 bg-black/30 backdrop-blur-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-cyan-300/35">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-200">
                      Échange
                    </span>
                    <span className="ml-auto rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[11px] opacity-80">
                      Expire dans: {countdownLabel}
                    </span>
                  </div>

                  <div className="relative rounded-xl border border-white/15 overflow-hidden bg-black/30 aspect-[3/4]">
                    {imageSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageSrc} alt={sticker?.name ?? `Sticker #${offer.makerStickerId}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-sm opacity-60">
                        Sticker #{offer.makerStickerId}
                      </div>
                    )}
                    {rarity ? (
                      <div className="pointer-events-none absolute bottom-2 left-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide backdrop-blur-[1px] ${rarity.chipClass}`}>
                          {rarity.label}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="text-sm">
                    <div className="font-semibold">
                      #{offer.makerStickerId} contre{" "}
                      {wantedCount <= 1 ? wantedListPreview : `${wantedCount} cartes`}
                    </div>
                    <div className="opacity-70 text-xs">Par: {makerName}</div>
                    <div className="opacity-70 text-xs">
                      Cartes demandées: {wantedListPreview || "Aucune"}
                    </div>
                    <div className="opacity-70 text-xs">
                      Expire le: {formatDateTime(offer.expiresAt)}
                    </div>
                    {wantedCount > 4 ? (
                      <details className="mt-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs">
                        <summary className="cursor-pointer select-none opacity-80">
                          Voir la liste complète ({wantedCount})
                        </summary>
                        <div className="mt-1 break-words opacity-80">{wantedListFull}</div>
                      </details>
                    ) : null}
                  </div>

                  <div className="grid gap-2">
                    {compatibleGroups.length ? (
                      <select
                        className={selectClass}
                        value={acceptAssetByOffer[offer.offerId] ?? ""}
                        onChange={(e) =>
                          setAcceptAssetByOffer((prev) => ({ ...prev, [offer.offerId]: e.target.value }))
                        }
                      >
                        <option value="" style={selectOptionStyle}>
                          Choisir ta carte ({compatibleGroups.length} option{compatibleGroups.length > 1 ? "s" : ""})
                        </option>
                      {compatibleGroups.map((group) => (
                        <option key={`${offer.offerId}-${group.stickerId}`} value={group.primaryAssetId} style={selectOptionStyle}>
                          #{group.stickerId} - {group.name} (x{group.count})
                        </option>
                      ))}
                    </select>
                    ) : (
                      <div className="rounded-xl border border-white/20 bg-black/25 px-3 py-2 text-sm opacity-70">
                        Aucune carte compatible dans ton wallet.
                      </div>
                    )}
                    <button
                      className={buttonClass}
                      disabled={loading || !compatibleGroups.length}
                      onClick={() => void acceptOffer(offer)}
                    >
                      {busyAction === `accept-${offer.offerId}` ? "Validation..." : "Accepter l'échange"}
                    </button>
                  </div>
                </article>
              );
            })}

          {showSales &&
            openSales.map((listing) => {
              const sticker = stickerById.get(String(listing.sellerStickerId));
              const rarity = rarityBadgeMeta(sticker?.rarity);
              const imageSrc = resolveStickerImageSrc(sticker?.image);
              const remaining = remainingMsUntil(listing.expiresAt, nowMs);
              const countdownLabel = formatCountdown(remaining);
              const split = splitMarketSaleAmount(listing.priceLamports, marketFeeBps);
              return (
                <article key={`sale-${listing.listingId}`} className="rounded-2xl border border-white/20 p-3 space-y-3 bg-black/30 backdrop-blur-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-fuchsia-300/35">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-2 py-0.5 text-xs text-fuchsia-200">
                      Vente
                    </span>
                    <span className="ml-auto rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[11px] opacity-80">
                      Expire dans: {countdownLabel}
                    </span>
                  </div>

                  <div className="relative rounded-xl border border-white/15 overflow-hidden bg-black/30 aspect-[3/4]">
                    {imageSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageSrc} alt={sticker?.name ?? `Sticker #${listing.sellerStickerId}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-sm opacity-60">
                        Sticker #{listing.sellerStickerId}
                      </div>
                    )}
                    {rarity ? (
                      <div className="pointer-events-none absolute bottom-2 left-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide backdrop-blur-[1px] ${rarity.chipClass}`}>
                          {rarity.label}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="text-sm">
                    <div className="font-semibold">#{listing.sellerStickerId} - {sticker?.name ?? "Sticker"}</div>
                    <div className="text-base font-semibold text-amber-200">{lamportsToSol(split.totalLamports)} SOL</div>
                    <div className="opacity-70 text-xs">
                      Expire le: {formatDateTime(listing.expiresAt)}
                    </div>
                    {marketFeeBps > 0 ? (
                      <div className="opacity-70 text-xs">
                        Vendeur reçoit: {lamportsToSol(split.sellerLamports)} SOL
                        {" · "}Frais market: {lamportsToSol(split.feeLamports)} SOL
                      </div>
                    ) : null}
                  </div>

                  <button
                    className={buttonWideClass}
                    disabled={loading}
                    onClick={() => void buyListing(listing)}
                  >
                    {busyAction === `buy-${listing.listingId}` ? "Achat..." : "Acheter"}
                  </button>
                </article>
              );
            })}
        </div>

        {!visibleOpenCount ? (
          <div className="text-sm opacity-70">Aucune annonce correspondante.</div>
        ) : null}

        </section>
      ) : null}

      {activeTab === "history" ? (
        <section className="rounded-2xl border border-white/20 bg-black/25 p-4 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Historique des échanges</h2>
              <p className="text-xs opacity-70">
                {tradeHistory.length} item{tradeHistory.length > 1 ? "s" : ""} (max 100)
              </p>
            </div>
          </div>
          {tradeHistory.length ? (
            <div className="space-y-2">
              {tradeHistory.slice(0, 100).map((entry) => {
                const makerSticker = stickerById.get(String(entry.makerStickerId));
                const takerSticker = entry.takerStickerId
                  ? stickerById.get(String(entry.takerStickerId))
                  : null;
                return (
                  <div
                    key={`history-${entry.offerId}`}
                    className="rounded-xl border border-white/15 bg-black/25 p-3 text-sm"
                  >
                    <div className="font-medium">
                      #{entry.makerStickerId}
                      {makerSticker?.name ? ` - ${makerSticker.name}` : ""}
                      {"  <->  "}
                      {entry.takerStickerId ? `#${entry.takerStickerId}` : "?"}
                      {takerSticker?.name ? ` - ${takerSticker.name}` : ""}
                    </div>
                    <div className="mt-1 text-xs opacity-75">
                      {entry.makerDisplayName || short(entry.makerTwitchUserId, 4, 4)}
                      {"  ->  "}
                      {entry.takerDisplayName ||
                        (entry.takerTwitchUserId ? short(entry.takerTwitchUserId, 4, 4) : "?")}
                      {" · "}
                      {formatDateTime(entry.updatedAt ?? entry.createdAt)}
                    </div>
                    {entry.settlementTxSig ? (
                      <a
                        className="mt-2 inline-block text-xs underline opacity-80 hover:opacity-100"
                        href={solscanTxUrl(entry.settlementTxSig)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Settlement tx
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm opacity-70">Aucun échange terminé pour le moment.</div>
          )}
        </section>
      ) : null}

      {activeTab === "send" ? (
        <section className="rounded-2xl border border-white/20 bg-black/25 p-4 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
          <div>
            <h2 className="text-lg font-semibold">Envoyer des cartes</h2>
            <p className="text-xs opacity-70">
              Sélectionne une ou plusieurs cartes, puis envoie-les vers un autre wallet.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
            <input
              className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-sm outline-none transition-all duration-150 focus:border-emerald-300/45 focus:ring-2 focus:ring-emerald-400/20"
              placeholder="Wallet destination (adresse Solana)"
              value={sendRecipientWallet}
              onChange={(e) => setSendRecipientWallet(e.target.value)}
            />
            <button
              type="button"
              className={buttonClass}
              disabled={loading || !sendSelectedAssetIds.length}
              onClick={() => setSendSelectedAssetIds([])}
            >
              Vider sélection
            </button>
            <button
              type="button"
              className={buttonPrimaryClass}
              disabled={loading || !selectedSendAssets.length}
              onClick={() => void sendAssets()}
            >
              {busyAction === "send-assets"
                ? "Envoi..."
                : `Envoyer ${selectedSendAssets.length} carte${selectedSendAssets.length > 1 ? "s" : ""}`}
            </button>
          </div>

          <div className="rounded-xl border border-white/15 bg-black/20 p-2">
            {sendAssetOptions.length ? (
              <div className="grid max-h-96 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {sendAssetOptions.map((asset) => {
                  const stickerId = String(asset.stickerId);
                  const sticker = stickerById.get(stickerId);
                  const selected = sendSelectedAssetIds.includes(asset.assetId);
                  const lockReason =
                    lockedAssetReasonById.get(String(asset.assetId)) ?? null;
                  const isLocked = Boolean(lockReason);
                  const rarity = rarityBadgeMeta(sticker?.rarity);
                  return (
                    <label
                      key={`send-asset-${asset.assetId}`}
                      className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-sm transition ${
                        isLocked
                          ? "border-amber-300/30 bg-amber-500/10 opacity-70"
                          : selected
                          ? "border-emerald-300/45 bg-emerald-500/10"
                          : "border-white/15 bg-black/25 hover:bg-white/5"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-emerald-400"
                        checked={selected && !isLocked}
                        disabled={isLocked}
                        onChange={() => toggleSendAssetId(asset.assetId)}
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          #{stickerId} - {sticker?.name ?? asset.name ?? "Sticker"}
                        </div>
                        <div className="truncate text-xs opacity-70">
                          Asset: {short(asset.assetId, 7, 7)}
                        </div>
                        {isLocked ? (
                          <div className="truncate text-xs text-amber-200/90">
                            Verrouillée: {lockReason}
                          </div>
                        ) : null}
                      </div>
                      {rarity ? (
                        <span
                          className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${rarity.chipClass}`}
                        >
                          {rarity.label}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="px-2 py-3 text-sm opacity-70">Aucune carte dans ce wallet.</div>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "mine" ? (
        <section className={SALES_UI_ENABLED ? "grid gap-4 lg:grid-cols-2" : "grid gap-4"}>
        <div className="rounded-2xl border border-white/20 bg-black/25 p-4 space-y-3 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
          <div className="font-semibold">Mes offres d’échange</div>
          {(offers?.mine ?? []).length ? (
            <div className="space-y-2">
              {offers!.mine.map((offer) => {
                const wantedIds = normalizeStickerIds(offer.wantedStickerIds ?? []);
                const wantedCount = wantedIds.length;
                const wantedListFull = formatStickerList(wantedIds);
                const wantedListPreview = formatStickerListPreview(wantedIds, 4);
                const remaining = remainingMsUntil(offer.expiresAt, nowMs);
                const countdownLabel = formatCountdown(remaining);
                return (
                  <div key={offer.offerId} className="rounded-xl border border-white/15 bg-black/25 p-3 text-sm space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        #{offer.makerStickerId} contre{" "}
                        {wantedCount <= 1 ? wantedListPreview : `${wantedCount} cartes`}
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadgeClass(offer.status)}`}>
                        {offer.status}
                      </span>
                    </div>
                    <div className="opacity-70 text-xs">Demandées: {wantedListPreview || "Aucune"}</div>
                    <div className="opacity-70 text-xs">
                      Expire dans: {countdownLabel} · {formatDateTime(offer.expiresAt)}
                    </div>
                    {wantedCount > 4 ? (
                      <details className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs">
                        <summary className="cursor-pointer select-none opacity-80">
                          Voir la liste complète ({wantedCount})
                        </summary>
                        <div className="mt-1 break-words opacity-80">{wantedListFull}</div>
                      </details>
                    ) : null}
                  {offer.error ? <div className="opacity-70">erreur: {offer.error}</div> : null}
                  {offer.makerDelegationTxSig ? (
                    <div className="opacity-70 flex items-center gap-2 flex-wrap">
                      délégation:{" "}
                      <a
                        className="underline hover:opacity-90"
                        href={solscanTxUrl(offer.makerDelegationTxSig)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {short(offer.makerDelegationTxSig, 8, 8)}
                      </a>
                      <button
                        type="button"
                        className={buttonSmallClass}
                        disabled={loading}
                        onClick={() => void copyTx(offer.makerDelegationTxSig!, "Tx delegation")}
                      >
                        Copier
                      </button>
                    </div>
                  ) : null}
                  {offer.takerDelegationTxSig ? (
                    <div className="opacity-70 flex items-center gap-2 flex-wrap">
                      délégation taker:{" "}
                      <a
                        className="underline hover:opacity-90"
                        href={solscanTxUrl(offer.takerDelegationTxSig)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {short(offer.takerDelegationTxSig, 8, 8)}
                      </a>
                      <button
                        type="button"
                        className={buttonSmallClass}
                        disabled={loading}
                        onClick={() => void copyTx(offer.takerDelegationTxSig!, "Tx taker delegation")}
                      >
                        Copier
                      </button>
                    </div>
                  ) : null}
                  {offer.settlementTxSig ? (
                    <div className="opacity-70 flex items-center gap-2 flex-wrap">
                      settlement:{" "}
                      <a
                        className="underline hover:opacity-90"
                        href={solscanTxUrl(offer.settlementTxSig)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {short(offer.settlementTxSig, 8, 8)}
                      </a>
                      <button
                        type="button"
                        className={buttonSmallClass}
                        disabled={loading}
                        onClick={() => void copyTx(offer.settlementTxSig!, "Tx settlement")}
                      >
                        Copier
                      </button>
                    </div>
                  ) : null}
                  {(offer.status === "DRAFT" || offer.status === "OPEN") ? (
                    <button
                      className={`${buttonClass} mt-2`}
                      disabled={loading}
                      onClick={() => void cancelOffer(offer.offerId)}
                    >
                      {busyAction === `cancel-offer-${offer.offerId}` ? "Annulation..." : "Annuler"}
                    </button>
                  ) : null}
                  {offer.status === "LOCKED" ? (
                    <button
                      className={`${buttonClass} mt-2`}
                      disabled={loading}
                      onClick={() => void releaseOfferLock(offer.offerId)}
                    >
                      {busyAction === `release-offer-${offer.offerId}` ? "Déverrouillage..." : "Débloquer"}
                    </button>
                  ) : null}
                </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm opacity-70">Aucun echange.</div>
          )}
        </div>

        {SALES_UI_ENABLED ? (
          <div className="rounded-2xl border border-white/20 bg-black/25 p-4 space-y-3 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
            <div className="font-semibold">Mes ventes</div>
            {(listings?.mine ?? []).length ? (
              <div className="space-y-2">
                {listings!.mine.map((listing) => {
                  const split = splitMarketSaleAmount(listing.priceLamports, marketFeeBps);
                  const remaining = remainingMsUntil(listing.expiresAt, nowMs);
                  const countdownLabel = formatCountdown(remaining);
                  return (
                    <div key={listing.listingId} className="rounded-xl border border-white/15 bg-black/25 p-3 text-sm space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div>#{listing.sellerStickerId} - {lamportsToSol(split.totalLamports)} SOL</div>
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadgeClass(listing.status)}`}>
                          {listing.status}
                        </span>
                      </div>
                      <div className="opacity-70 text-xs">
                        Expire dans: {countdownLabel} · {formatDateTime(listing.expiresAt)}
                      </div>
                      {marketFeeBps > 0 ? (
                        <div className="opacity-70 text-xs">
                          Net vendeur: {lamportsToSol(split.sellerLamports)} SOL
                          {" · "}Frais: {lamportsToSol(split.feeLamports)} SOL
                        </div>
                      ) : null}
                      {listing.error ? <div className="opacity-70">erreur: {listing.error}</div> : null}
                      {listing.sellerDelegationTxSig ? (
                        <div className="opacity-70 flex items-center gap-2 flex-wrap">
                          delegation:{" "}
                          <a
                            className="underline hover:opacity-90"
                            href={solscanTxUrl(listing.sellerDelegationTxSig)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {short(listing.sellerDelegationTxSig, 8, 8)}
                          </a>
                          <button
                            type="button"
                            className={buttonSmallClass}
                            disabled={loading}
                            onClick={() => void copyTx(listing.sellerDelegationTxSig!, "Tx delegation vente")}
                          >
                            Copier
                          </button>
                        </div>
                      ) : null}
                      {listing.buyTxSig ? (
                        <div className="opacity-70 flex items-center gap-2 flex-wrap">
                          vente tx:{" "}
                          <a
                            className="underline hover:opacity-90"
                            href={solscanTxUrl(listing.buyTxSig)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {short(listing.buyTxSig, 8, 8)}
                          </a>
                          <button
                            type="button"
                            className={buttonSmallClass}
                            disabled={loading}
                            onClick={() => void copyTx(listing.buyTxSig!, "Tx vente")}
                          >
                            Copier
                          </button>
                        </div>
                      ) : null}
                      {(listing.status === "DRAFT" || listing.status === "OPEN") ? (
                        <button
                          className={`${buttonClass} mt-2`}
                          disabled={loading}
                          onClick={() => void cancelListing(listing.listingId)}
                        >
                          {busyAction === `cancel-listing-${listing.listingId}` ? "Annulation..." : "Annuler"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm opacity-70">Aucune vente.</div>
            )}
          </div>
        ) : null}
        </section>
      ) : null}
    </div>
  );
}
