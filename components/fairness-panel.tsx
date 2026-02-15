"use client";

import { useMemo, useState } from "react";

type FairnessPanelProps = {
    hasProof: boolean;
    stickerId?: string | null;
    mintTx?: string | null;
    queuePubkey?: string | null;
    randomnessAccount?: string | null;
    drawIndex?: number | null;
    availableCount?: number | null;
    proofPath?: string | null;
    mintUrl?: string | null;
    commitUrl?: string | null;
    revealUrl?: string | null;
    closeUrl?: string | null;
};

function short(v?: string | null, head = 6, tail = 6) {
    const value = String(v ?? "").trim();
    if (!value) return "";
    if (value.length <= head + tail + 1) return value;
    return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export function FairnessPanel({
    hasProof,
    stickerId,
    mintTx,
    queuePubkey,
    randomnessAccount,
    drawIndex,
    availableCount,
    proofPath,
    mintUrl,
    commitUrl,
    revealUrl,
    closeUrl,
}: FairnessPanelProps) {
    const [copyState, setCopyState] = useState<"idle" | "ok" | "error">("idle");

    const proofUrl = useMemo(() => {
        const path = String(proofPath ?? "").trim();
        if (!path) return "";
        if (path.startsWith("http://") || path.startsWith("https://")) return path;
        if (typeof window === "undefined") return path;
        const normalized = path.startsWith("/") ? path : `/${path}`;
        return `${window.location.origin}${normalized}`;
    }, [proofPath]);

    async function copyProofUrl() {
        if (!proofUrl) return;
        try {
            await navigator.clipboard.writeText(proofUrl);
            setCopyState("ok");
        } catch {
            setCopyState("error");
        }
        setTimeout(() => setCopyState("idle"), 1800);
    }

    return (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="mb-3 flex items-center gap-2">
                <span
                    className={
                        hasProof
                            ? "rounded-full border border-emerald-300/40 bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-200"
                            : "rounded-full border border-white/20 bg-white/5 px-2.5 py-1 text-xs text-white/75"
                    }
                >
                    {hasProof ? "Preuve active" : "Pas encore de preuve"}
                </span>
            </div>

            {hasProof ? (
                <div className="space-y-3">
                    <div className="text-sm text-white/80">
                        Dernier mint prouve: sticker #{String(stickerId ?? "?")} ({short(mintTx)})
                    </div>
                    <div className="text-xs text-white/65">
                        Queue: {short(queuePubkey, 8, 8)} | Randomness account:{" "}
                        {short(randomnessAccount, 8, 8)} | Index:{" "}
                        {typeof drawIndex === "number" ? drawIndex : "?"} /{" "}
                        {typeof availableCount === "number" ? availableCount : "?"}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {proofPath ? (
                            <a
                                className="rounded-xl border border-white/20 px-3 py-2 text-sm transition hover:bg-white/10"
                                href={proofPath}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Voir preuve JSON
                            </a>
                        ) : null}
                        <button
                            type="button"
                            className="rounded-xl border border-white/20 px-3 py-2 text-sm transition enabled:cursor-pointer enabled:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={copyProofUrl}
                            disabled={!proofUrl}
                        >
                            {copyState === "ok"
                                ? "Lien copie"
                                : copyState === "error"
                                  ? "Erreur copie"
                                  : "Copier lien preuve"}
                        </button>
                        {mintUrl ? (
                            <a
                                className="rounded-xl border border-white/20 px-3 py-2 text-sm transition hover:bg-white/10"
                                href={mintUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Mint tx
                            </a>
                        ) : null}
                        {commitUrl ? (
                            <a
                                className="rounded-xl border border-white/20 px-3 py-2 text-sm transition hover:bg-white/10"
                                href={commitUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Commit tx
                            </a>
                        ) : null}
                        {revealUrl ? (
                            <a
                                className="rounded-xl border border-white/20 px-3 py-2 text-sm transition hover:bg-white/10"
                                href={revealUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Reveal tx
                            </a>
                        ) : null}
                        {closeUrl ? (
                            <a
                                className="rounded-xl border border-white/20 px-3 py-2 text-sm transition hover:bg-white/10"
                                href={closeUrl}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Close tx
                            </a>
                        ) : null}
                    </div>
                </div>
            ) : (
                <div className="text-sm text-white/70">
                    Aucune preuve affichee pour le moment. Elle apparaitra apres un mint realise
                    avec le nouveau flow fairness.
                </div>
            )}
        </div>
    );
}
