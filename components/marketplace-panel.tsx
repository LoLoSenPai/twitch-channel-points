"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
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
  wantedStickerId: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
};

type MyOffer = {
  offerId: string;
  makerStickerId: string;
  wantedStickerId: string;
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
  sellerDelegationTxSig: string | null;
  buyTxSig: string | null;
};

type ListingsResponse = {
  delegateWallet: string;
  open: OpenListing[];
  mine: MyListing[];
};

type AssetsResponse = {
  wallet: string;
  count: number;
  items: TradeAsset[];
};

type StickerItem = {
  id: string;
  name?: string;
  image?: string;
};

type StickerJson = {
  items: StickerItem[];
};

const ST = stickers as StickerJson;
const IMAGE_BASE =
  process.env.NEXT_PUBLIC_STICKERS_IMAGE_BASE?.trim() || "/stickers/";
const SOLSCAN_CLUSTER = process.env.NEXT_PUBLIC_SOLSCAN_CLUSTER?.trim() ?? "";

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

function normalizeStickerFilter(value: string) {
  return value.trim().replace(/^#/, "");
}

function toTimestamp(input: string) {
  const t = Date.parse(input);
  return Number.isFinite(t) ? t : 0;
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

export function MarketplacePanel() {
  const wallet = useWallet();

  const [offers, setOffers] = useState<OffersResponse | null>(null);
  const [listings, setListings] = useState<ListingsResponse | null>(null);
  const [assets, setAssets] = useState<TradeAsset[]>([]);

  const [makerAssetId, setMakerAssetId] = useState("");
  const [wantedStickerId, setWantedStickerId] = useState("");
  const [saleAssetId, setSaleAssetId] = useState("");
  const [salePriceSol, setSalePriceSol] = useState("0.05");

  const [acceptAssetByOffer, setAcceptAssetByOffer] = useState<Record<string, string>>({});

  const [marketMode, setMarketMode] = useState<"all" | "trade" | "sale">("all");
  const [boardSort, setBoardSort] = useState<"recent" | "priceAsc" | "priceDesc">("recent");
  const [stickerFilter, setStickerFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const walletPk = wallet.publicKey?.toBase58() ?? "";
  const refreshTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const selectOptionStyle = { color: "#111827", backgroundColor: "#f8fafc" };
  const buttonClass =
    "rounded-xl border px-3 py-2 text-sm transition-all duration-150 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:bg-white/10 enabled:hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]";
  const buttonWideClass =
    "w-full rounded-xl border px-3 py-2 text-sm transition-all duration-150 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 enabled:hover:bg-white/10 enabled:hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]";
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

  const refresh = useCallback(
    async (options?: { clearNotice?: boolean }) => {
      setLoading(true);
      if (options?.clearNotice !== false) setNotice("");

      try {
        const requests = [
          fetch("/api/trades/offers", { cache: "no-store" }),
          fetch("/api/market/listings", { cache: "no-store" }),
        ];

        if (walletPk) {
          requests.push(
            fetch(`/api/trades/assets?walletPubkey=${encodeURIComponent(walletPk)}`, {
              cache: "no-store",
            })
          );
        }

        const [offersRes, listingsRes, assetsRes] = await Promise.all(requests);

        if (!offersRes.ok) throw new Error(await offersRes.text());
        if (!listingsRes.ok) throw new Error(await listingsRes.text());

        const offersJson = (await offersRes.json()) as OffersResponse;
        const listingsJson = (await listingsRes.json()) as ListingsResponse;
        setOffers(offersJson);
        setListings(listingsJson);

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

  const delegateWallet =
    offers?.delegateWallet ?? listings?.delegateWallet ?? "";

  const stickerNeedle = normalizeStickerFilter(stickerFilter);
  const openTrades = useMemo(() => {
    const src = offers?.open ?? [];
    const filtered = src.filter((offer) => {
      if (!stickerNeedle) return true;
      return (
        String(offer.makerStickerId) === stickerNeedle ||
        String(offer.wantedStickerId) === stickerNeedle
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

  const visibleOpenCount =
    (marketMode === "all" || marketMode === "trade" ? openTrades.length : 0) +
    (marketMode === "all" || marketMode === "sale" ? openSales.length : 0);

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

  async function createOffer() {
    if (loading) return;
    if (!walletPk) {
      setNotice("Connecte ton wallet");
      return;
    }
    if (!makerAssetId || !wantedStickerId.trim()) {
      setNotice("Choisis une carte et un sticker cible");
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
          wantedStickerId: wantedStickerId.trim(),
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
    const fallback = assetsBySticker.get(String(offer.wantedStickerId))?.[0]?.assetId;
    const takerAssetId = selected || fallback;
    if (!takerAssetId) {
      setNotice("Tu n'as pas la carte demandee");
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
        <div className="text-sm opacity-70">
          Wallet service du marketplace: <span className="font-mono">{short(delegateWallet)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className={buttonClass} onClick={() => void handleRefreshClick()} disabled={loading}>
            {busyAction === "refresh" ? "Actualisation..." : "Actualiser"}
          </button>
          <WalletMultiButton />
        </div>
      </div>

      {notice ? <div className="rounded-xl border p-3 text-sm whitespace-pre-line">{notice}</div> : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border p-4 space-y-3">
          <div className="font-semibold">Proposer un échange (1 carte contre 1)</div>
          <div className="grid gap-2">
            <select
              className="rounded-xl border px-3 py-2 bg-transparent"
              value={makerAssetId}
              onChange={(e) => setMakerAssetId(e.target.value)}
            >
              <option value="" style={selectOptionStyle}>Choisis ta carte à proposer</option>
              {assets.map((asset) => (
                <option key={asset.assetId} value={asset.assetId} style={selectOptionStyle}>
                  #{asset.stickerId} - {asset.name ?? short(asset.assetId)}
                </option>
              ))}
            </select>
            <input
              className="rounded-xl border px-3 py-2 bg-transparent"
              placeholder="Sticker souhaité (id)"
              value={wantedStickerId}
              onChange={(e) => setWantedStickerId(e.target.value)}
            />
            <button className={buttonClass} disabled={loading} onClick={() => void createOffer()}>
              {busyAction === "create-offer" ? "Création..." : "Créer l'offre"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border p-4 space-y-3">
          <div className="font-semibold">Mettre une carte en vente</div>
          <div className="grid gap-2">
            <select
              className="rounded-xl border px-3 py-2 bg-transparent"
              value={saleAssetId}
              onChange={(e) => setSaleAssetId(e.target.value)}
            >
              <option value="" style={selectOptionStyle}>Choisis ta carte à vendre</option>
              {assets.map((asset) => (
                <option key={asset.assetId} value={asset.assetId} style={selectOptionStyle}>
                  #{asset.stickerId} - {asset.name ?? short(asset.assetId)}
                </option>
              ))}
            </select>
            <input
              className="rounded-xl border px-3 py-2 bg-transparent"
              placeholder="Prix en SOL (ex: 0.05)"
              value={salePriceSol}
              onChange={(e) => setSalePriceSol(e.target.value)}
            />
            <button className={buttonClass} disabled={loading} onClick={() => void createListing()}>
              {busyAction === "create-listing" ? "Publication..." : "Mettre en vente"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-semibold">Market board</div>
          <div className="flex flex-wrap items-center gap-2">
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
            <input
              className="rounded-xl border px-3 py-2 text-sm bg-transparent"
              placeholder="Filtre sticker (#14)"
              value={stickerFilter}
              onChange={(e) => setStickerFilter(e.target.value)}
            />
            <select
              className="rounded-xl border px-3 py-2 text-sm bg-transparent"
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

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(marketMode === "all" || marketMode === "trade") &&
            openTrades.map((offer) => {
              const sticker = stickerById.get(String(offer.makerStickerId));
              const imageSrc = resolveStickerImageSrc(sticker?.image);
              const compatible = assetsBySticker.get(String(offer.wantedStickerId)) ?? [];
              return (
                <article key={`trade-${offer.offerId}`} className="rounded-2xl border p-3 space-y-3 bg-black/20">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-200">
                      Échange
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadgeClass(offer.status)}`}>
                      {offer.status}
                    </span>
                  </div>

                  <div className="rounded-xl border overflow-hidden bg-black/30 aspect-[3/4]">
                    {imageSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageSrc} alt={sticker?.name ?? `Sticker #${offer.makerStickerId}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-sm opacity-60">
                        Sticker #{offer.makerStickerId}
                      </div>
                    )}
                  </div>

                  <div className="text-sm">
                    <div className="font-semibold">#{offer.makerStickerId} contre #{offer.wantedStickerId}</div>
                    <div className="opacity-70">Tu dois donner la carte #{offer.wantedStickerId}</div>
                  </div>

                  <div className="grid gap-2">
                    <select
                      className="rounded-xl border px-3 py-2 bg-transparent text-sm"
                      value={acceptAssetByOffer[offer.offerId] ?? ""}
                      onChange={(e) =>
                        setAcceptAssetByOffer((prev) => ({ ...prev, [offer.offerId]: e.target.value }))
                      }
                    >
                      <option value="" style={selectOptionStyle}>Choisir ta carte #{offer.wantedStickerId}</option>
                      {compatible.map((asset) => (
                        <option key={asset.assetId} value={asset.assetId} style={selectOptionStyle}>
                          #{asset.stickerId} - {asset.name ?? short(asset.assetId)}
                        </option>
                      ))}
                    </select>
                    <button
                      className={buttonClass}
                      disabled={loading || !compatible.length}
                      onClick={() => void acceptOffer(offer)}
                    >
                      {busyAction === `accept-${offer.offerId}` ? "Validation..." : "Accepter l'échange"}
                    </button>
                  </div>
                </article>
              );
            })}

          {(marketMode === "all" || marketMode === "sale") &&
            openSales.map((listing) => {
              const sticker = stickerById.get(String(listing.sellerStickerId));
              const imageSrc = resolveStickerImageSrc(sticker?.image);
              return (
                <article key={`sale-${listing.listingId}`} className="rounded-2xl border p-3 space-y-3 bg-black/20">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full border border-fuchsia-400/40 bg-fuchsia-500/10 px-2 py-0.5 text-xs text-fuchsia-200">
                      Vente
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadgeClass(listing.status)}`}>
                      {listing.status}
                    </span>
                  </div>

                  <div className="rounded-xl border overflow-hidden bg-black/30 aspect-[3/4]">
                    {imageSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageSrc} alt={sticker?.name ?? `Sticker #${listing.sellerStickerId}`} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full grid place-items-center text-sm opacity-60">
                        Sticker #{listing.sellerStickerId}
                      </div>
                    )}
                  </div>

                  <div className="text-sm">
                    <div className="font-semibold">#{listing.sellerStickerId} - {sticker?.name ?? "Sticker"}</div>
                    <div className="text-base font-semibold text-amber-200">{lamportsToSol(listing.priceLamports)} SOL</div>
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

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border p-4 space-y-3">
          <div className="font-semibold">Mes échanges</div>
          {(offers?.mine ?? []).length ? (
            <div className="space-y-2">
              {offers!.mine.map((offer) => (
                <div key={offer.offerId} className="rounded-xl border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>#{offer.makerStickerId} contre #{offer.wantedStickerId}</div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadgeClass(offer.status)}`}>
                      {offer.status}
                    </span>
                  </div>
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
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm opacity-70">Aucun echange.</div>
          )}
        </div>

        <div className="rounded-2xl border p-4 space-y-3">
          <div className="font-semibold">Mes ventes</div>
          {(listings?.mine ?? []).length ? (
            <div className="space-y-2">
              {listings!.mine.map((listing) => (
                <div key={listing.listingId} className="rounded-xl border p-3 text-sm space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>#{listing.sellerStickerId} - {lamportsToSol(listing.priceLamports)} SOL</div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadgeClass(listing.status)}`}>
                      {listing.status}
                    </span>
                  </div>
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
              ))}
            </div>
          ) : (
            <div className="text-sm opacity-70">Aucune vente.</div>
          )}
        </div>
      </section>
    </div>
  );
}
