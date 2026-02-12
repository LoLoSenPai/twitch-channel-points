"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

  const refresh = useCallback(async () => {
    setLoading(true);
    setNotice("");
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

  useEffect(() => {
    void refresh();
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
    if (!walletPk) throw new Error("Connecte ton wallet");
    if (!makerAssetId || !wantedStickerId.trim()) {
      throw new Error("Choisis une carte et un sticker cible");
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

      setNotice("Offre creee");
      await refresh();
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
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  async function acceptOffer(offer: OpenOffer) {
    if (!walletPk) throw new Error("Connecte ton wallet");

    const selected = acceptAssetByOffer[offer.offerId];
    const fallback = assetsBySticker.get(String(offer.wantedStickerId))?.[0]?.assetId;
    const takerAssetId = selected || fallback;
    if (!takerAssetId) {
      throw new Error("Tu n'as pas la carte demandee");
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

      setNotice("Echange execute");
      await refresh();
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

      {notice ? <div className="rounded-xl border p-3 text-sm">{notice}</div> : null}

      <section className="rounded-2xl border p-4 space-y-3">
        <div className="font-semibold">Creer une offre (1 carte contre 1 carte)</div>
        <div className="grid md:grid-cols-3 gap-2">
          <select
            className="rounded-xl border px-3 py-2 bg-transparent"
            value={makerAssetId}
            onChange={(e) => setMakerAssetId(e.target.value)}
          >
            <option value="">Choisis une de tes cartes</option>
            {assets.map((asset) => (
              <option key={asset.assetId} value={asset.assetId}>
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
                  <div>
                    Offre: donne <strong>#{offer.makerStickerId}</strong> contre{" "}
                    <strong>#{offer.wantedStickerId}</strong>
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
                      <option value="">Choisir ta carte #{offer.wantedStickerId}</option>
                      {compatible.map((asset) => (
                        <option key={asset.assetId} value={asset.assetId}>
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
                <div>
                  #{offer.makerStickerId} contre #{offer.wantedStickerId}
                </div>
                <div className="opacity-70">
                  statut: {offer.status}
                  {offer.error ? ` | erreur: ${offer.error}` : ""}
                </div>
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
