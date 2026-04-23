"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type LeaderboardEntry = {
  twitchUserId: string;
  displayName: string;
  totalCards: number;
  uniqueCards: number;
  completionPct: number;
  hasMythic?: boolean;
  mythicCount?: number;
};

type InsightsResponse = {
  totalStickers: number;
  leaderboard: LeaderboardEntry[];
};

const LEADERBOARD_CACHE_TTL_MS = 20_000;
let leaderboardSnapshot:
  | { timestampMs: number; totalStickers: number; items: LeaderboardEntry[] }
  | null = null;

function short(v: string, head = 5, tail = 5) {
  if (!v) return "";
  if (v.length <= head + tail + 1) return v;
  return `${v.slice(0, head)}...${v.slice(-tail)}`;
}

function mythicRowStyle(enabled: boolean) {
  if (!enabled) return undefined;
  return {
    background:
      "linear-gradient(90deg, color-mix(in oklab, var(--site-surface-soft-bg), #7f1d1d 22%), color-mix(in oklab, var(--site-surface-bg), #4c0519 10%))",
    boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--site-surface-border), #b91c1c 28%)",
  } as const;
}

export function LeaderboardPanel() {
  const [items, setItems] = useState<LeaderboardEntry[]>([]);
  const [totalStickers, setTotalStickers] = useState<number>(44);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async (options?: { preferCache?: boolean }) => {
    if (options?.preferCache && leaderboardSnapshot) {
      const ageMs = Date.now() - leaderboardSnapshot.timestampMs;
      if (ageMs <= LEADERBOARD_CACHE_TTL_MS) {
        setItems(leaderboardSnapshot.items);
        setTotalStickers(leaderboardSnapshot.totalStickers);
        setError("");
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/trades/insights", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as InsightsResponse;
      const nextItems = json.leaderboard ?? [];
      const nextTotalStickers = Number(json.totalStickers || 44);
      setItems(nextItems);
      setTotalStickers(nextTotalStickers);
      leaderboardSnapshot = {
        timestampMs: Date.now(),
        totalStickers: nextTotalStickers,
        items: nextItems,
      };
    } catch (e) {
      setError((e as Error)?.message ?? "Erreur de chargement");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh({ preferCache: true });
  }, [refresh]);

  return (
    <section className="site-surface rounded-3xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Leaderboard collection</h1>
          <p className="site-muted text-sm">
            Classement public par cartes uniques, puis total de cartes.
          </p>
        </div>
        <button
          type="button"
          className="site-btn rounded-xl px-3 py-2 text-sm transition-all duration-150 enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "Actualisation..." : "Actualiser"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-300/35 bg-red-500/10 p-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <div className="rounded-xl border border-[color:var(--site-surface-border)] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[color:var(--site-menu-bg)] sticky top-0 backdrop-blur-sm">
            <tr className="border-b border-[color:var(--site-surface-border)]">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Joueur</th>
              <th className="px-3 py-2 font-medium">Uniques</th>
              <th className="px-3 py-2 font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Progression</th>
            </tr>
          </thead>
          <tbody>
            {!loading && !items.filter((e) => e.totalCards > 0).length ? (
              <tr>
                <td colSpan={5} className="site-muted px-3 py-4 text-center text-sm">
                  Aucun joueur classé pour le moment.
                </td>
              </tr>
            ) : (
              items.filter((e) => e.totalCards > 0).slice(0, 100).map((entry, index) => (
                <tr
                  key={`leader-${entry.twitchUserId}`}
                  className={`border-b border-[color:var(--site-surface-border)] last:border-b-0 ${
                    entry.hasMythic ? "relative" : ""
                  }`}
                  style={mythicRowStyle(Boolean(entry.hasMythic))}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span>{index + 1}</span>
                      {entry.hasMythic ? (
                        <span className="rounded-full border border-red-300/35 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-100">
                          M
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/album/${encodeURIComponent(entry.displayName.toLowerCase())}`}
                        className="hover:underline"
                      >
                        {entry.displayName || short(entry.twitchUserId, 4, 4)}
                      </Link>
                      {entry.hasMythic ? (
                        <span className="rounded-full border border-red-300/40 bg-red-500/12 px-2 py-0.5 text-[11px] font-medium tracking-wide text-red-50">
                          Mythic{(entry.mythicCount ?? 0) > 1 ? ` x${entry.mythicCount}` : ""}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2">{entry.uniqueCards}</td>
                  <td className="px-3 py-2">{entry.totalCards}</td>
                  <td className="px-3 py-2">
                    {entry.completionPct}% ({entry.uniqueCards}/{totalStickers})
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
