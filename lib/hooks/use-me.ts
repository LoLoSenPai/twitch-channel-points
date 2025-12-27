"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Me = {
  user: { id: string; displayName: string };
  tickets: number;
  totalStickers: number;
  mints: Array<{ stickerId: string; mintTx: string; createdAt: string }>;
};

type Options = {
  enabled?: boolean;
  intervalMs?: number; // ex: 3000, 5000
  endpoint?: string; // ex: "/api/me" ou "/api/me/tickets"
};

export function useMe({
  enabled = true,
  intervalMs = 3000,
  endpoint = "/api/me",
}: Options = {}) {
  const [me, setMe] = useState<Me | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingUi, setRefreshingUi] = useState(false); // évite le spam visuel
  const failCount = useRef(0);
  const timer = useRef<number | null>(null);
  const uiTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;

    setRefreshing(true);

    // n’affiche l’indicateur qu’au-delà de 400ms
    if (uiTimer.current) window.clearTimeout(uiTimer.current);
    uiTimer.current = window.setTimeout(() => setRefreshingUi(true), 400);

    try {
      const r = await fetch(endpoint, { cache: "no-store" });
      if (r.ok) {
        setMe(await r.json());
        failCount.current = 0;
      } else {
        failCount.current += 1;
      }
    } catch {
      failCount.current += 1;
    } finally {
      setRefreshing(false);
      if (uiTimer.current) window.clearTimeout(uiTimer.current);
      setRefreshingUi(false);
    }
  }, [enabled, endpoint]);

  useEffect(() => {
    if (!enabled) return;

    const tick = async () => {
      // pause si onglet caché
      if (document.visibilityState !== "visible") return;

      await refresh();

      // backoff simple si erreurs (max 30s)
      const backoff = Math.min(
        30_000,
        intervalMs * Math.max(1, failCount.current + 1)
      );
      timer.current = window.setTimeout(tick, backoff);
    };

    // premier fetch immédiat
    void refresh();
    timer.current = window.setTimeout(tick, intervalMs);

    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (uiTimer.current) window.clearTimeout(uiTimer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, intervalMs, refresh]);

  return { me, refreshing, refreshingUi, refresh };
}
