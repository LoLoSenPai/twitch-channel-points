"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Me = {
  user: { id: string; displayName: string };
  tickets: number;
  totalStickers: number;
  mints: Array<{ stickerId: string; mintTx: string; createdAt: string }>;
};

type Options = {
  intervalMs?: number; // ex: 5_000 -> every 5s
  enabled?: boolean;
};

export function useMe(opts: Options = {}) {
  const { intervalMs = 3_000, enabled = true } = opts;

  const [me, setMe] = useState<Me | null>(null);
  const [refreshing, setRefreshing] = useState(false); // uniquement pour refresh "loud"

  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMe = useCallback(async (): Promise<Me | null> => {
    const r = await fetch("/api/me", { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as Me;
  }, []);

  const refreshSilent = useCallback(async () => {
    if (!enabled) return;
    if (inFlight.current) return;

    inFlight.current = true;
    try {
      const next = await fetchMe();
      if (next) setMe(next);
    } finally {
      inFlight.current = false;
    }
  }, [enabled, fetchMe]);

  const refreshLoud = useCallback(async () => {
    if (!enabled) return;
    if (inFlight.current) return;

    inFlight.current = true;
    setRefreshing(true);
    try {
      const next = await fetchMe();
      if (next) setMe(next);
    } finally {
      setRefreshing(false);
      inFlight.current = false;
    }
  }, [enabled, fetchMe]);

  useEffect(() => {
    if (!enabled) return;

    const start = () => {
      if (timer.current) return;
      timer.current = setInterval(() => {
        if (document.visibilityState === "visible") void refreshSilent();
      }, intervalMs);
    };

    const stop = () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refreshSilent();
        start();
      } else {
        stop();
      }
    };

    void refreshSilent();
    start();
    document.addEventListener("visibilitychange", onVis);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, intervalMs, refreshSilent]);

  return { me, refreshing, refreshSilent, refreshLoud, setMe };
}
