"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useTickets({
  enabled = true,
  intervalMs = 3000,
}: { enabled?: boolean; intervalMs?: number } = {}) {
  const [tickets, setTickets] = useState<number | undefined>(undefined);
  const [refreshingUi, setRefreshingUi] = useState(false);

  const timer = useRef<number | null>(null);
  const uiTimer = useRef<number | null>(null);
  const failCount = useRef(0);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (inFlight.current) return; // ✅ anti overlap
    inFlight.current = true;

    if (uiTimer.current) window.clearTimeout(uiTimer.current);
    uiTimer.current = window.setTimeout(() => setRefreshingUi(true), 400);

    try {
      const r = await fetch("/api/me/tickets", { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as { tickets: number };
        setTickets(j.tickets);
        failCount.current = 0;
      } else {
        failCount.current += 1;
      }
    } catch {
      failCount.current += 1;
    } finally {
      inFlight.current = false;
      if (uiTimer.current) window.clearTimeout(uiTimer.current);
      setRefreshingUi(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const tick = async () => {
      if (document.visibilityState !== "visible") return;

      await refresh();

      const backoff = Math.min(
        30_000,
        intervalMs * Math.max(1, failCount.current + 1)
      );
      timer.current = window.setTimeout(tick, backoff);
    };

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

  return { tickets, refreshingUi, refresh };
}
