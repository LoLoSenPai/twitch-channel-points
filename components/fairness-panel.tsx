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

type VerifyResponse = {
  provider?: string | null;
  checks: {
    randomPresent: boolean;
    algorithmMatches: boolean;
    requiredTxOk: boolean;
    overall: boolean;
    requiredTxRule?: string;
  };
  algorithm: {
    randomHex: string | null;
    availableCount: number;
    storedDrawIndex: number | null;
    computedIndex: number | null;
    storedStickerId: string | null;
    expectedStickerId: string | null;
    formula: string;
    error: string | null;
  };
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
  const [verifyState, setVerifyState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [verifyError, setVerifyError] = useState<string>("");
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);

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

  const verifyPath = useMemo(() => {
    const path = String(proofPath ?? "").trim();
    if (!path) return "";
    const normalized = path.endsWith("/") ? path.slice(0, -1) : path;
    return `${normalized}/verify`;
  }, [proofPath]);

  async function runAutoVerify() {
    if (!verifyPath) return;
    setVerifyState("loading");
    setVerifyError("");
    try {
      const res = await fetch(verifyPath, { cache: "no-store" });
      if (!res.ok) {
        setVerifyResult(null);
        setVerifyError(await res.text());
        setVerifyState("error");
        return;
      }
      const json = (await res.json()) as VerifyResponse;
      setVerifyResult(json);
      setVerifyState("ok");
    } catch (e) {
      setVerifyResult(null);
      setVerifyError((e as Error)?.message ?? "Erreur vérification");
      setVerifyState("error");
    }
  }

  return (
    <div className="site-surface mt-4 rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={
            hasProof
              ? "rounded-full border border-emerald-300/40 bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-200"
              : "rounded-full border border-[color:var(--site-surface-border)] bg-[color:var(--site-surface-soft-bg)] px-2.5 py-1 text-xs site-muted"
          }
        >
          {hasProof ? "Preuve active" : "Pas encore de preuve"}
        </span>
      </div>

      {hasProof ? (
        <div className="space-y-3">
          <div className="text-sm">
            Dernier mint prouvé: sticker #{String(stickerId ?? "?")} ({short(mintTx)})
          </div>
          <div className="site-muted text-xs">
            Queue: {short(queuePubkey, 8, 8)} | Randomness account: {short(randomnessAccount, 8, 8)}
            {" | "}Index: {typeof drawIndex === "number" ? drawIndex : "?"} /{" "}
            {typeof availableCount === "number" ? availableCount : "?"}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl border border-emerald-300/35 bg-emerald-500/10 px-3 py-2 text-sm transition enabled:cursor-pointer enabled:hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={runAutoVerify}
              disabled={!verifyPath || verifyState === "loading"}
            >
              {verifyState === "loading" ? "Vérification..." : "Vérifier automatiquement"}
            </button>
            {proofPath ? (
              <a className="site-btn rounded-xl px-3 py-2 text-sm" href={proofPath} target="_blank" rel="noreferrer">
                Voir preuve JSON
              </a>
            ) : null}
            <button
              type="button"
              className="site-btn rounded-xl px-3 py-2 text-sm enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              onClick={copyProofUrl}
              disabled={!proofUrl}
            >
              {copyState === "ok"
                ? "Lien copié"
                : copyState === "error"
                  ? "Erreur copie"
                  : "Copier lien preuve"}
            </button>
            {mintUrl ? (
              <a className="site-btn rounded-xl px-3 py-2 text-sm" href={mintUrl} target="_blank" rel="noreferrer">
                Mint tx
              </a>
            ) : null}
            {commitUrl ? (
              <a className="site-btn rounded-xl px-3 py-2 text-sm" href={commitUrl} target="_blank" rel="noreferrer">
                Commit tx
              </a>
            ) : null}
            {revealUrl ? (
              <a className="site-btn rounded-xl px-3 py-2 text-sm" href={revealUrl} target="_blank" rel="noreferrer">
                Reveal tx
              </a>
            ) : null}
            {closeUrl ? (
              <a className="site-btn rounded-xl px-3 py-2 text-sm" href={closeUrl} target="_blank" rel="noreferrer">
                Close tx
              </a>
            ) : null}
          </div>

          {verifyState === "error" ? (
            <div className="rounded-xl border border-red-300/35 bg-red-500/10 p-3 text-sm text-red-100">
              Vérification impossible: {verifyError || "Erreur inconnue"}
            </div>
          ) : null}

          {verifyResult ? (
            <div className="site-surface-soft space-y-3 rounded-xl p-3">
              <div className="text-sm font-medium">Résultat vérification (1 clic)</div>
              <ul className="space-y-1 text-sm">
                <li>{verifyResult.checks.randomPresent ? "OK" : "KO"} - Random présente</li>
                <li>{verifyResult.checks.algorithmMatches ? "OK" : "KO"} - Calcul cohérent</li>
                <li>{verifyResult.checks.requiredTxOk ? "OK" : "KO"} - Tx requises confirmées</li>
              </ul>
              {verifyResult.checks.requiredTxRule ? (
                <div className="site-muted text-xs">Règle tx: {verifyResult.checks.requiredTxRule}</div>
              ) : null}
              <div
                className={
                  verifyResult.checks.overall
                    ? "rounded-lg border border-emerald-300/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"
                    : "rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
                }
              >
                {verifyResult.checks.overall
                  ? "Preuve valide: ce mint est cohérent avec la random et les tx on-chain."
                  : "Attention: au moins un check a échoué. Ouvre les détails techniques."}
              </div>
              <details className="site-surface rounded-lg px-3 py-2 text-xs">
                <summary className="cursor-pointer select-none">Détails techniques</summary>
                <div className="mt-2 space-y-1 site-muted">
                  <div>Formule: {verifyResult.algorithm.formula}</div>
                  <div>Index stocké: {String(verifyResult.algorithm.storedDrawIndex ?? "null")}</div>
                  <div>Index recalculé: {String(verifyResult.algorithm.computedIndex ?? "null")}</div>
                  <div>Sticker stocké: {String(verifyResult.algorithm.storedStickerId ?? "null")}</div>
                  <div>Sticker attendu: {String(verifyResult.algorithm.expectedStickerId ?? "null")}</div>
                  {verifyResult.algorithm.error ? (
                    <div>Erreur calcul: {verifyResult.algorithm.error}</div>
                  ) : null}
                </div>
              </details>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="site-muted text-sm">
          Aucune preuve affichée pour le moment. Elle apparaîtra après un mint réalisé
          avec le flow fairness.
        </div>
      )}
    </div>
  );
}

