"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Me = {
  user: { id: string; displayName: string };
  tickets: number;
  totalStickers: number;
  mints: Array<{ stickerId: string; mintTx: string; createdAt: string }>;
};

type Options = {
  intervalMs?: number; // default 10s
  enabled?: boolean; // default true
};

export function useMe(opts: Options = {}) {
  const { intervalMs = 10_000, enabled = true } = opts;

  const [me, setMe] = useState<Me | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (inFlight.current) return;

    inFlight.current = true;
    setRefreshing(true);
    try {
      const r = await fetch("/api/me", { cache: "no-store" });
      if (r.ok) setMe((await r.json()) as Me);
    } finally {
      setRefreshing(false);
      inFlight.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const start = () => {
      if (timer.current) return;
      timer.current = setInterval(() => {
        if (document.visibilityState === "visible") void refresh();
      }, intervalMs);
    };

    const stop = () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    };

    void refresh();
    start();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, intervalMs, refresh]);

  return { me, refreshing, refresh, setMe };
}
