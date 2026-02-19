"use client";

import { useCallback, useEffect, useState } from "react";

type LeaderboardEntry = {
  twitchUserId: string;
  displayName: string;
  totalCards: number;
  uniqueCards: number;
  completionPct: number;
};

type InsightsResponse = {
  totalStickers: number;
  leaderboard: LeaderboardEntry[];
};

function short(v: string, head = 5, tail = 5) {
  if (!v) return "";
  if (v.length <= head + tail + 1) return v;
  return `${v.slice(0, head)}...${v.slice(-tail)}`;
}

export function LeaderboardPanel() {
  const [items, setItems] = useState<LeaderboardEntry[]>([]);
  const [totalStickers, setTotalStickers] = useState<number>(44);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/trades/insights", { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as InsightsResponse;
      setItems(json.leaderboard ?? []);
      setTotalStickers(Number(json.totalStickers || 44));
    } catch (e) {
      setError((e as Error)?.message ?? "Erreur de chargement");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="rounded-3xl border border-white/20 bg-black/25 p-4 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,.06)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Leaderboard collection</h1>
          <p className="text-sm opacity-70">
            Classement public par cartes uniques, puis total de cartes.
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border px-3 py-2 text-sm transition-all duration-150 enabled:cursor-pointer enabled:hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
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

      <div className="overflow-auto rounded-xl border border-white/15">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-black/70 backdrop-blur-sm">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Joueur</th>
              <th className="px-3 py-2 font-medium">Uniques</th>
              <th className="px-3 py-2 font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Progression</th>
            </tr>
          </thead>
          <tbody>
            {!loading && !items.length ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-sm opacity-70">
                  Aucun joueur classé pour le moment.
                </td>
              </tr>
            ) : (
              items.slice(0, 100).map((entry, index) => (
                <tr
                  key={`leader-${entry.twitchUserId}`}
                  className="border-b border-white/10 last:border-b-0"
                >
                  <td className="px-3 py-2">{index + 1}</td>
                  <td className="px-3 py-2">{entry.displayName || short(entry.twitchUserId, 4, 4)}</td>
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