"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import { useTickets } from "@/lib/hooks/use-tickets";
import { BoosterScene } from "@/components/booster-model";
import Link from "next/link";
import stickers from "@/stickers/stickers.json";
import { normalizeRarity } from "@/lib/stickers";

type Reveal = {
    id: string;
    name: string;
    image: string;
    tx: string;
};

type PullPhase = "idle" | "charging" | "flash" | "cardBack" | "cardFront";

type Rarity =
    | "common"
    | "uncommon"
    | "rare"
    | "legendary"
    | "mythic"
    | "R"
    | "SR"
    | "SSR";

type StickerJson = {
    items: Array<{ id: string; rarity?: string }>;
};

const stickerRarityMap = new Map(
    (stickers as StickerJson).items.map((item) => [String(item.id), item.rarity])
);

const SOLSCAN_CLUSTER = process.env.NEXT_PUBLIC_SOLSCAN_CLUSTER?.trim() ?? "devnet";
const BOOSTER_ASSET_VERSION = process.env.NEXT_PUBLIC_BOOSTER_ASSET_VERSION?.trim() ?? "1";

function solscanTxUrl(signature: string) {
    const sig = String(signature ?? "").trim();
    if (!sig) return "#";
    const suffix = SOLSCAN_CLUSTER ? `?cluster=${encodeURIComponent(SOLSCAN_CLUSTER)}` : "";
    return `https://solscan.io/tx/${sig}${suffix}`;
}

function rarityFromStickerId(id: string): Rarity {
    const configured = normalizeRarity(stickerRarityMap.get(String(id)));
    if (configured) return configured;
    if (id === "3") return "SSR"; // le plus rare (10%)
    if (id === "2") return "SR";  // moyen (30%)
    return "R";                   // commun (60%)
}

function rarityColor(r: Rarity) {
    if (r === "mythic") return "#ef4444";
    if (r === "legendary") return "#f59e0b";
    if (r === "rare") return "#3b82f6";
    if (r === "uncommon") return "#22c55e";
    if (r === "common") return "#94a3b8";
    if (r === "SSR") return "#f59e0b"; // or
    if (r === "SR") return "#a855f7";  // violet
    return "#60a5fa";                  // bleu
}

function rarityBoostMultiplier(r: Rarity | null) {
    if (r === "mythic") return 0.4;
    if (r === "legendary" || r === "SSR") return 0.35;
    if (r === "rare" || r === "SR") return 0.25;
    if (r === "uncommon") return 0.2;
    return 0.18;
}


export function MintPanel() {
    const wallet = useWallet();
    const [loading, setLoading] = useState(false);
    const [reveal, setReveal] = useState<Reveal | null>(null);
    const [phase, setPhase] = useState<PullPhase>("idle");
    const [glow, setGlow] = useState(0); // 0..1 pour booster + lumière
    const [pendingReveal, setPendingReveal] = useState<Reveal | null>(null);
    const [rarity, setRarity] = useState<Rarity | null>(null);
    const [resetOrbitKey, setResetOrbitKey] = useState(0);

    const { tickets, refreshingUi, refresh: refreshTickets } = useTickets({
        enabled: !loading,
        intervalMs: 3000,
    });

    const walletOk = !!wallet.publicKey;
    const ticketsKnown = tickets !== undefined;
    const ticketsOk = (tickets ?? 0) > 0;
    const ready = walletOk && ticketsOk && !loading && phase === "idle";

    const [hint, setHint] = useState<string | null>(null);

    async function mintOnce(): Promise<Reveal> {
        if (!wallet.publicKey || !wallet.signTransaction) {
            throw new Error("Wallet not ready");
        }

        let intentId: string | null = null;
        let mintSubmitted = false;

        try {
            // 1) prepare
            const prep = await fetch("/api/mint/prepare", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ walletPubkey: wallet.publicKey.toBase58() }),
            });
            if (!prep.ok) throw new Error(await prep.text());

            const prepJson = (await prep.json()) as { intentId: string; txB64: string };
            intentId = prepJson.intentId;

            // 2) sign
            const txBytes = Uint8Array.from(Buffer.from(prepJson.txB64, "base64"));
            const vtx = VersionedTransaction.deserialize(txBytes);
            const signed = await wallet.signTransaction(vtx);
            const signedTxB64 = Buffer.from(signed.serialize()).toString("base64");

            // 3) submit
            const sub = await fetch("/api/mint/submit", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ intentId, signedTxB64 }),
            });
            if (!sub.ok) throw new Error(await sub.text());

            mintSubmitted = true;

            const { tx, stickerId } = (await sub.json()) as { ok: true; tx: string; stickerId: string };

            const r = rarityFromStickerId(String(stickerId));
            setRarity(r);

            // 4) on prépare un reveal immédiat (ne bloque jamais l'animation)
            const baseReveal: Reveal = {
                id: String(stickerId),
                name: `Panini #${String(stickerId)}`,
                image: "",
                tx,
            };

            // refresh tickets en background (ne bloque pas)
            void refreshTickets().catch(() => { });

            // metadata en background (ne bloque pas)
            void (async () => {
                try {
                    const metaBase = process.env.NEXT_PUBLIC_METADATA_BASE_URI;
                    const metaUrl = metaBase ? `${metaBase}/${stickerId}.json` : null;
                    if (!metaUrl) return;

                    const metaRes = await fetch(metaUrl, { cache: "no-store" });
                    if (!metaRes.ok) return;

                    const meta = (await metaRes.json()) as { name?: string; image?: string };

                    const patch = {
                        name: meta?.name ?? baseReveal.name,
                        image: meta?.image ?? baseReveal.image,
                    };

                    setPendingReveal((prev) =>
                        prev && prev.id === baseReveal.id ? { ...prev, ...patch } : prev
                    );

                    setReveal((prev) =>
                        prev && prev.id === baseReveal.id ? { ...prev, ...patch } : prev
                    );
                } catch {
                    // silence
                }
            })();

            return baseReveal;
        } catch (e) {
            if (intentId && !mintSubmitted) {
                try {
                    await fetch("/api/mint/cancel", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ intentId, reason: "USER_CANCELLED" }),
                    });
                } catch { }
                try {
                    await refreshTickets();
                } catch { }
            }
            throw e;
        }
    }

    async function openBooster() {
        if (loading || phase !== "idle") return;

        if (!walletOk) {
            setHint("Connecte ton wallet Solana pour ouvrir un booster.");
            return;
        }
        if (!ticketsKnown) {
            setHint("Chargement des tickets...");
            return;
        }
        if (!ticketsOk) {
            setHint("Aucun ticket. Récupère-en via les rewards Twitch.");
            return;
        }

        setHint(null);

        setLoading(true);
        setReveal(null);
        setPendingReveal(null);
        setRarity(null);

        setPhase("charging");
        setGlow(0);

        const start = performance.now();
        const duration = 1100;

        const anim = new Promise<void>((resolve) => {
            const tick = () => {
                const t = Math.min(1, (performance.now() - start) / duration);
                const eased = 1 - Math.pow(1 - t, 3);
                setGlow(eased);
                if (t < 1) requestAnimationFrame(tick);
                else resolve();
            };
            requestAnimationFrame(tick);
        });

        try {
            const mintPromise = mintOnce();
            const [pre] = await Promise.all([mintPromise, anim]);

            setPendingReveal(pre);

            setPhase("flash");
            setTimeout(() => setPhase("cardBack"), 180);
        } catch {
            // reset clean
            setPhase("idle");
            setGlow(0);
            setPendingReveal(null);
            setRarity(null);
        } finally {
            setLoading(false);
        }
    }

    const glowColor = rarity ? rarityColor(rarity) : "#ffffff";

    const chargingIntensity =
        0.02 + glow * rarityBoostMultiplier(rarity);

    return (
        <div className="rounded-2xl border p-4 space-y-4 bg-linear-to-br from-zinc-900/70 via-black/60 to-zinc-900/70">
            <div className="flex flex-wrap items-start justify-between gap-3 sm:items-center">
                <div>
                    <div className="text-lg font-semibold">Collection #1 (devnet)</div>

                    <div className="text-sm opacity-70 flex items-center gap-2">
                        Tickets:{" "}
                        <span className="font-medium">
                            {tickets === undefined ? "..." : tickets}
                        </span>
                        {refreshingUi ? (
                            <span className="inline-block h-2 w-2 rounded-full bg-current opacity-50" />
                        ) : null}
                    </div>
                </div>

                <div className="shrink-0">
                    <WalletMultiButton className="!min-w-[170px] !justify-center !whitespace-nowrap" />
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                {/* LEFT */}
                <div className="rounded-2xl border p-4">
                    <BoosterScene
                        labelUrl={`/booster-front.png?v=${encodeURIComponent(BOOSTER_ASSET_VERSION)}`}
                        backLabelUrl={`/booster-back.png?v=${encodeURIComponent(BOOSTER_ASSET_VERSION)}`}
                        onOpen={openBooster}
                        canOpen={!loading && phase === "idle"} // pas de canMint ici
                        theme={{ body: { color: "#eef3fa", metalness: 0.88, roughness: 0.16, ...(phase === "charging" ? { emissive: glowColor, emissiveIntensity: chargingIntensity } : {}), }, }}
                        shake={phase === "charging" ? glow : 0}
                        resetOrbitKey={resetOrbitKey}
                        lockControls={phase !== "idle"}
                    />

                    <div className="mt-3 text-sm opacity-80">
                        {hint ? (
                            <div>{hint}</div>
                        ) : !wallet.publicKey ? (
                            <div>Connecte ton wallet Solana pour ouvrir un booster.</div>
                        ) : tickets === undefined ? (
                            <div>Chargement des tickets...</div>
                        ) : tickets <= 0 ? (
                            <div>Tu n&apos;as aucun ticket. Récupère-en via les rewards Twitch.</div>
                        ) : (
                            <div>Clique sur le booster pour mint (1 ticket consommé).</div>
                        )}
                    </div>

                </div>

                {/* RIGHT */}
                <div className="rounded-2xl border p-4">
                    <div className="flex flex-wrap gap-2 pt-1 pb-3">
                        <span className={`rounded-full border px-3 py-1 text-xs ${walletOk ? "opacity-90" : "opacity-60"}`}>
                            {walletOk ? "OK Wallet" : "Wallet"}
                        </span>

                        <span className={`rounded-full border px-3 py-1 text-xs ${ticketsKnown ? (ticketsOk ? "opacity-90" : "opacity-60") : "opacity-80"}`}>
                            {!ticketsKnown ? "Tickets..." : ticketsOk ? `OK Tickets (${tickets})` : "Tickets"}
                        </span>

                        <span className={`rounded-full border px-3 py-1 text-xs ${ready ? "opacity-90" : "opacity-60"}`}>
                            {ready ? "OK Ready" : "Ready"}
                        </span>
                    </div>
                    <div className="text-lg font-semibold">Comment ça marche ?</div>
                    <ol className="mt-3 space-y-2 text-sm opacity-80 list-decimal pl-5">
                        <li>Récupère un ticket via le reward Twitch.</li>
                        <li>Connecte ton wallet Solana.</li>
                        <li>Clique sur le booster, signe la transaction, puis révèle ta carte.</li>
                    </ol>
                    <p className="mt-3 text-xs opacity-75">
                        Tirage vérifiable: la preuve de ton dernier mint est visible directement dans
                        la preview, puis consultable via le bouton "Voir la preuve".
                    </p>

                    <div className="mt-5 space-y-3 text-sm">
                        <div className="rounded-xl border p-3">
                            <div className="font-medium">Où trouver mes tickets ?</div>
                            <div className="opacity-70 mt-1">
                                Les tickets viennent des rewards Twitch dispo sur
                                <Link href="https://www.twitch.tv/nylstv" target="_blank" rel="noopener noreferrer" className="text-fuchsia-400 font-bold"> ma chaine</Link>
                                .
                            </div>
                        </div>

                        <div className="rounded-xl border p-3">
                            <div className="font-medium">Ça coûte quoi ?</div>
                            <div className="opacity-70 mt-1">
                                1 ticket + les frais réseau Solana.
                            </div>
                        </div>

                        <div className="rounded-xl border p-3">
                            <div className="font-medium">Où je vois mes cartes ?</div>
                            <div className="opacity-70 mt-1">Dans l&apos;album, et tu peux aussi les échanger sur le marketplace.</div>
                        </div>
                    </div>
                </div>
            </div>

            {phase !== "idle" ? (
                <PullOverlay
                    phase={phase}
                    sticker={
                        pendingReveal
                            ? { id: pendingReveal.id, name: pendingReveal.name, image: pendingReveal.image }
                            : null
                    }
                    tx={pendingReveal?.tx ?? null}
                    accent={glowColor}
                    onSkip={() => {
                        if (pendingReveal) setReveal(pendingReveal);
                        setPhase("cardFront");
                    }}
                    onFlip={() => {
                        if (phase === "cardBack" && pendingReveal) {
                            setReveal(pendingReveal);
                            setPhase("cardFront");
                        }
                    }}
                    onClose={() => {
                        setPhase("idle");
                        setGlow(0);
                        setPendingReveal(null);
                        setResetOrbitKey((k) => k + 1);
                    }}
                />
            ) : null}

            {reveal ? (
                <div className="rounded-2xl border p-4 space-y-3">
                    <div className="text-sm opacity-70">Nouveau sticker !</div>

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

                    <div className="flex flex-wrap gap-2">
                        <a className="rounded-xl border px-3 py-2 text-sm cursor-pointer" href="/album">
                            Voir dans l&apos;album
                        </a>

                        <a
                            className="rounded-xl border px-3 py-2 text-sm opacity-80 cursor-pointer"
                            href={solscanTxUrl(reveal.tx)}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Voir la tx
                        </a>
                        <a
                            className="rounded-xl border px-3 py-2 text-sm opacity-80 cursor-pointer"
                            href={`/api/mint/proof/${reveal.tx}`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Voir la preuve
                        </a>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function PullOverlay({ phase, sticker, onFlip, onClose, onSkip, accent, tx }: {
    phase: "charging" | "flash" | "cardBack" | "cardFront";
    sticker: { id: string; name: string; image: string } | null;
    tx: string | null;
    onFlip: () => void;
    onClose: () => void;
    onSkip: () => void;
    accent: string;
}) {
    const showFlash = phase === "flash";
    const showCard = phase === "cardBack" || phase === "cardFront";
    const flipped = phase === "cardFront";
    const glow = accent === "#60a5fa" ? "0 0 25px #60a5fa33" : `0 0 90px ${accent}66`;

    return (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm">
            {/* bouton skip */}
            <button
                className="absolute right-4 top-4 rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-sm cursor-pointer"
                onClick={onSkip}
            >
                Passer
            </button>

            {/* flash blanc */}
            <div
                className={`absolute inset-0 transition-opacity duration-150 ${showFlash ? "opacity-100" : "opacity-0 pointer-events-none"
                    } bg-white`}
            />

            {/* overlay couleur accent */}
            <div
                className={`absolute inset-0 transition-opacity duration-200 ${showFlash ? "opacity-35" : "opacity-0 pointer-events-none"
                    }`}
                style={{ background: accent }}
            />

            {/* carte */}
            {showCard ? (
                <div className="relative mx-auto flex w-full max-w-[min(92vw,420px)] flex-col items-center">
                    <div className="[perspective:1200px]">
                        <button
                            className="relative h-[420px] w-[300px] cursor-pointer select-none rounded-2xl"
                            style={{ boxShadow: glow }}
                            onClick={onFlip}
                        >
                            <div
                                className={`absolute inset-0 transition-transform duration-700 transform-3d ${flipped ? "transform-[rotateY(180deg)]" : ""
                                    }`}
                            >
                                {/* BACK */}
                                <div className="absolute inset-0 rounded-2xl border border-white/20 bg-black shadow-xl [backface-visibility:hidden] overflow-hidden">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src="/card-back.png"
                                        alt="Dos de carte"
                                        className="h-full w-full object-cover"
                                    />
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-center text-sm text-white/90">
                                        Clique pour reveler
                                    </div>
                                </div>

                                {/* FRONT */}
                                <div className="absolute inset-0 rounded-2xl border border-white/20 bg-black shadow-xl transform-[rotateY(180deg)] backface-hidden overflow-hidden">
                                    {sticker?.image ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={sticker.image}
                                            alt={sticker.name}
                                            className="h-full w-full object-contain"
                                        />
                                    ) : null}
                                </div>
                            </div>
                        </button>
                    </div>

                    {/* fermer */}
                    <div className="mt-4 grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
                        <a
                            className="rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-center text-sm cursor-pointer"
                            href="/album"
                        >
                            Album
                        </a>

                        {tx ? (
                            <a
                                className="rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-center text-sm cursor-pointer"
                                href={solscanTxUrl(tx)}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Tx
                            </a>
                        ) : null}
                        {tx ? (
                            <a
                                className="rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-center text-sm cursor-pointer"
                                href={`/api/mint/proof/${tx}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Preuve
                            </a>
                        ) : null}
                        <button
                            className="rounded-xl border border-white/20 bg-black/40 px-3 py-2 text-center text-sm cursor-pointer"
                            onClick={onClose}
                        >
                            Fermer
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function Step({
    title,
    ok,
    pending,
    detail,
}: {
    title: string;
    ok: boolean;
    pending?: boolean;
    detail?: string;
}) {
    const icon = pending ? "ÃƒÂ¢Ã‚ÂÃ‚Â³" : ok ? "ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦" : "ÃƒÂ¢Ã‚Â¬Ã…â€œ";
    const text = pending ? "opacity-90" : ok ? "opacity-90" : "opacity-60";

    return (
        <div className="flex items-start gap-2">
            <div className="mt-[2px]">{icon}</div>
            <div className="min-w-0">
                <div className={`text-sm font-medium ${text}`}>{title}</div>
                {detail ? <div className="text-xs opacity-60 mt-0.5">{detail}</div> : null}
            </div>
        </div>
    );
}
