"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";

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

type AssetsResponse = {
  wallet: string;
  count: number;
  items: TradeAsset[];
};

function statusBadgeClass(status: string) {
  switch (status) {
    case "OPEN":
      return "border-emerald-400/40 bg-emerald-500/10 text-emerald-200";
    case "LOCKED":
      return "border-amber-400/40 bg-amber-500/10 text-amber-200";
    case "DONE":
      return "border-sky-400/40 bg-sky-500/10 text-sky-200";
    case "DRAFT":
      return "border-zinc-400/40 bg-zinc-500/10 text-zinc-200";
    default:
      return "border-zinc-400/40 bg-zinc-500/10 text-zinc-200";
  }
}

function short(v: string, head = 5, tail = 5) {
  if (!v) return "";
  if (v.length <= head + tail + 1) return v;
  return `${v.slice(0, head)}...${v.slice(-tail)}`;
}

export function MarketplacePanel() {
  const wallet = useWallet();
  const [offers, setOffers] = useState<OffersResponse | null>(null);
  const [assets, setAssets] = useState<TradeAsset[]>([]);
  const [makerAssetId, setMakerAssetId] = useState("");
  const [wantedStickerId, setWantedStickerId] = useState("");
  const [acceptAssetByOffer, setAcceptAssetByOffer] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string>("");
  const selectOptionStyle = { color: "#111827", backgroundColor: "#f8fafc" };
  const refreshTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const walletPk = wallet.publicKey?.toBase58() ?? "";

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

  const refresh = useCallback(async (options?: { clearNotice?: boolean }) => {
    setLoading(true);
    if (options?.clearNotice !== false) {
      setNotice("");
    }
    try {
      const offersRes = await fetch("/api/trades/offers", { cache: "no-store" });
      if (!offersRes.ok) throw new Error(await offersRes.text());
      const offersJson = (await offersRes.json()) as OffersResponse;
      setOffers(offersJson);

      if (walletPk) {
        const assetsRes = await fetch(
          `/api/trades/assets?walletPubkey=${encodeURIComponent(walletPk)}`,
          { cache: "no-store" }
        );
        if (!assetsRes.ok) throw new Error(await assetsRes.text());
        const assetsJson = (await assetsRes.json()) as AssetsResponse;
        setAssets(assetsJson.items ?? []);
        if (assetsJson.items.length) {
          setMakerAssetId((prev) => prev || assetsJson.items[0].assetId);
        }
      } else {
        setAssets([]);
      }
    } catch (e) {
      setNotice((e as Error)?.message ?? "Erreur refresh");
    } finally {
      setLoading(false);
    }
  }, [walletPk]);

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
      for (const timer of refreshTimersRef.current) {
        clearTimeout(timer);
      }
      refreshTimersRef.current = [];
    };
  }, [refresh]);

  async function signPreparedTx(txB64: string) {
    if (!wallet.signTransaction || !wallet.publicKey) {
      throw new Error("Wallet non connecte");
    }
    const txBytes = Uint8Array.from(Buffer.from(txB64, "base64"));
    const vtx = VersionedTransaction.deserialize(txBytes);
    const signed = await wallet.signTransaction(vtx);
    return Buffer.from(signed.serialize()).toString("base64");
  }

  async function createOffer() {
    if (!walletPk) {
      setNotice("Connecte ton wallet");
      return;
    }
    if (!makerAssetId || !wantedStickerId.trim()) {
      setNotice("Choisis une carte et un sticker cible");
      return;
    }
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
          ? `Offre creee\nDelegation tx: ${subJson.tx}`
          : "Offre creee"
      );
      await refresh({ clearNotice: false });
      scheduleFollowupRefreshes();
    } catch (e) {
      setNotice((e as Error)?.message ?? "Erreur creation offre");
    } finally {
      setLoading(false);
    }
  }

  async function cancelOffer(offerId: string) {
    setLoading(true);
    setNotice("");
    try {
      const res = await fetch(`/api/trades/offers/${offerId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      setNotice("Offre annulee");
      await refresh({ clearNotice: false });
    } catch (e) {
      setNotice((e as Error)?.message ?? "Erreur annulation");
    } finally {
      setLoading(false);
    }
  }

  async function acceptOffer(offer: OpenOffer) {
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

    setLoading(true);
    setNotice("");
    try {
      const prep = await fetch(`/api/trades/offers/${offer.offerId}/accept/prepare`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletPubkey: walletPk,
          takerAssetId,
        }),
      });
      if (!prep.ok) throw new Error(await prep.text());
      const prepJson = (await prep.json()) as { txB64: string };

      const signedTxB64 = await signPreparedTx(prepJson.txB64);

      const sub = await fetch(`/api/trades/offers/${offer.offerId}/accept/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          walletPubkey: walletPk,
          signedTxB64,
        }),
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
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm opacity-70">
          Delegate trade wallet:{" "}
          <span className="font-mono">{short(offers?.delegateWallet ?? "")}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-xl border px-3 py-2 text-sm" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </button>
          <WalletMultiButton />
        </div>
      </div>

      {notice ? <div className="rounded-xl border p-3 text-sm whitespace-pre-line">{notice}</div> : null}

      <section className="rounded-2xl border p-4 space-y-3">
        <div className="font-semibold">Creer une offre (1 carte contre 1 carte)</div>
        <div className="grid md:grid-cols-3 gap-2">
          <select
            className="rounded-xl border px-3 py-2 bg-transparent"
            value={makerAssetId}
            onChange={(e) => setMakerAssetId(e.target.value)}
          >
            <option value="" style={selectOptionStyle}>Choisis une de tes cartes</option>
            {assets.map((asset) => (
              <option key={asset.assetId} value={asset.assetId} style={selectOptionStyle}>
                #{asset.stickerId} - {asset.name ?? short(asset.assetId)}
              </option>
            ))}
          </select>
          <input
            className="rounded-xl border px-3 py-2 bg-transparent"
            placeholder="Sticker souhaite (id)"
            value={wantedStickerId}
            onChange={(e) => setWantedStickerId(e.target.value)}
          />
          <button className="rounded-xl border px-3 py-2" disabled={loading} onClick={() => void createOffer()}>
            Creer et deleguer
          </button>
        </div>
      </section>

      <section className="rounded-2xl border p-4 space-y-3">
        <div className="font-semibold">Offres ouvertes</div>
        <div className="space-y-2">
          {(offers?.open ?? []).length ? (
            offers!.open.map((offer) => {
              const compatible = assetsBySticker.get(String(offer.wantedStickerId)) ?? [];
              return (
                <div key={offer.offerId} className="rounded-xl border p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      Offre: donne <strong>#{offer.makerStickerId}</strong> contre{" "}
                      <strong>#{offer.wantedStickerId}</strong>
                    </div>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(
                        offer.status
                      )}`}
                    >
                      {offer.status}
                    </span>
                  </div>
                  <div className="grid md:grid-cols-[1fr_auto] gap-2">
                    <select
                      className="rounded-xl border px-3 py-2 bg-transparent"
                      value={acceptAssetByOffer[offer.offerId] ?? ""}
                      onChange={(e) =>
                        setAcceptAssetByOffer((prev) => ({
                          ...prev,
                          [offer.offerId]: e.target.value,
                        }))
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
                      className="rounded-xl border px-3 py-2"
                      disabled={loading || !compatible.length}
                      onClick={() => void acceptOffer(offer)}
                    >
                      Accepter
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-sm opacity-70">Aucune offre ouverte.</div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border p-4 space-y-3">
        <div className="font-semibold">Mes offres</div>
        <div className="space-y-2">
          {(offers?.mine ?? []).length ? (
            offers!.mine.map((offer) => (
              <div key={offer.offerId} className="rounded-xl border p-3 text-sm space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    #{offer.makerStickerId} contre #{offer.wantedStickerId}
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(
                      offer.status
                    )}`}
                  >
                    {offer.status}
                  </span>
                </div>
                {offer.error ? <div className="opacity-70">erreur: {offer.error}</div> : null}
                {offer.makerDelegationTxSig ? (
                  <div className="opacity-70">delegation: {short(offer.makerDelegationTxSig, 8, 8)}</div>
                ) : null}
                {offer.takerDelegationTxSig ? (
                  <div className="opacity-70">taker delegation: {short(offer.takerDelegationTxSig, 8, 8)}</div>
                ) : null}
                {offer.settlementTxSig ? (
                  <div className="opacity-70">settlement: {short(offer.settlementTxSig, 8, 8)}</div>
                ) : null}
                {(offer.status === "DRAFT" || offer.status === "OPEN") ? (
                  <button
                    className="mt-2 rounded-xl border px-3 py-2 text-sm"
                    disabled={loading}
                    onClick={() => void cancelOffer(offer.offerId)}
                  >
                    Annuler
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <div className="text-sm opacity-70">Aucune offre.</div>
          )}
        </div>
      </section>
    </div>
  );
}
