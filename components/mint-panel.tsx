"use client";

import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import { useMe } from "@/lib/hooks/use-me";

type Reveal = {
    id: string;
    name: string;
    image: string;
    tx: string;
};

export function MintPanel() {
    const wallet = useWallet();
    const [loading, setLoading] = useState(false);
    const [reveal, setReveal] = useState<Reveal | null>(null);

    // ✅ polling auto, mais on le coupe pendant un mint pour éviter double refresh
    const { me, refreshing, refresh } = useMe({ enabled: !loading, intervalMs: 10_000 });

    const tickets = me?.tickets;

    const canMint = useMemo(
        () => !!wallet.publicKey && (tickets ?? 0) > 0,
        [wallet.publicKey, tickets]
    );

    async function onMint() {
        if (!wallet.publicKey || !wallet.signTransaction) return;

        let intentId: string | null = null;

        setLoading(true);
        try {
            const prep = await fetch("/api/mint/prepare", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ walletPubkey: wallet.publicKey.toBase58() }),
            });
            if (!prep.ok) throw new Error(await prep.text());

            const prepJson = (await prep.json()) as {
                intentId: string;
                txB64: string;
                stickerId: string;
            };

            intentId = prepJson.intentId;

            const txBytes = Uint8Array.from(Buffer.from(prepJson.txB64, "base64"));
            const vtx = VersionedTransaction.deserialize(txBytes);

            const signed = await wallet.signTransaction(vtx);
            const signedTxB64 = Buffer.from(signed.serialize()).toString("base64");

            const sub = await fetch("/api/mint/submit", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ intentId, signedTxB64 }),
            });
            if (!sub.ok) throw new Error(await sub.text());

            const { tx } = (await sub.json()) as { ok: true; tx: string };

            const metaBase = process.env.NEXT_PUBLIC_METADATA_BASE_URI;
            const metaUrl = metaBase ? `${metaBase}/${prepJson.stickerId}.json` : null;

            const metaRes = metaUrl ? await fetch(metaUrl, { cache: "no-store" }) : null;
            const meta = metaRes?.ok ? await metaRes.json() : null;

            setReveal({
                id: String(prepJson.stickerId),
                name: meta?.name ?? `Sticker #${prepJson.stickerId}`,
                image: meta?.image ?? "",
                tx,
            });

            await refresh(); // ✅ refresh compteur + état
        } catch (e) {
            if (intentId) {
                await fetch("/api/mint/cancel", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ intentId, reason: "USER_CANCELLED" }),
                });
                await refresh();
            }
            throw e;
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="rounded-2xl border p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <div className="text-lg font-semibold">Mint Panini (V0)</div>
                    <div className="text-sm opacity-70">
                        Tickets:{" "}
                        <span className="font-medium">{tickets === undefined ? "…" : tickets}</span>
                        {refreshing ? <span className="ml-2 opacity-60">(sync)</span> : null}
                    </div>
                </div>
                <WalletMultiButton />
            </div>

            <button
                className="w-full rounded-xl border px-4 py-3 disabled:opacity-50 cursor-pointer"
                disabled={!canMint || loading}
                onClick={onMint}
            >
                {loading
                    ? "Mint..."
                    : canMint
                        ? "Mint (random)"
                        : tickets === undefined
                            ? "Chargement…"
                            : "Connect wallet + avoir un ticket"}
            </button>

            {reveal ? (
                <div className="rounded-2xl border p-4 space-y-3">
                    <div className="text-sm opacity-70">🎉 Nouveau sticker !</div>

                    {reveal.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={reveal.image}
                            alt={reveal.name}
                            className="w-full max-w-80 mx-auto rounded-xl border object-cover"
                        />
                    ) : null}

                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="font-semibold">{reveal.name}</div>
                            <div className="text-xs opacity-70">ID: #{reveal.id}</div>
                        </div>
                        <button
                            className="rounded-xl border px-3 py-2 text-sm cursor-pointer"
                            onClick={() => setReveal(null)}
                        >
                            Fermer
                        </button>
                    </div>

                    <div className="flex gap-2">
                        <a className="rounded-xl border px-3 py-2 text-sm cursor-pointer" href="/album">
                            Voir dans l’album →
                        </a>
                        <a
                            className="rounded-xl border px-3 py-2 text-sm opacity-80 cursor-pointer"
                            href={`https://solscan.io/tx/${reveal.tx}?cluster=devnet`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Voir la tx
                        </a>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
