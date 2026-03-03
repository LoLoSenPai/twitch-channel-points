"use client";

import { useEffect, useState } from "react";
import {
    getStoredSiteTheme,
    SITE_THEME_EVENT,
    SITE_THEME_STORAGE_KEY,
    type SiteTheme,
} from "@/lib/site-theme";

export default function ClientOnlyBackground() {
    const [theme, setTheme] = useState<SiteTheme>(() => getStoredSiteTheme());
    const backgroundImageUrl = theme === "light" ? "/bg-light.webp" : "/bg-dark.webp";

    useEffect(() => {
        const onStorage = (event: StorageEvent) => {
            if (!event.key || event.key === SITE_THEME_STORAGE_KEY) {
                setTheme(getStoredSiteTheme());
            }
        };
        const onThemeChange = (event: Event) => {
            const nextTheme = (event as CustomEvent<SiteTheme>)?.detail;
            setTheme(nextTheme === "light" ? "light" : "dark");
        };

        window.addEventListener("storage", onStorage);
        window.addEventListener(SITE_THEME_EVENT, onThemeChange);
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener(SITE_THEME_EVENT, onThemeChange);
        };
    }, []);

    return (
        <div className="pointer-events-none absolute inset-0 opacity-90">
            <div
                className={
                    theme === "light"
                        ? "absolute inset-0 bg-[linear-gradient(180deg,#f8fbff_0%,#e8f0f8_100%)]"
                        : "absolute inset-0 bg-[linear-gradient(180deg,#030712_0%,#020617_100%)]"
                }
            />
            <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-70"
                style={{ backgroundImage: `url("${backgroundImageUrl}")` }}
            />
            <div
                className={
                    theme === "light"
                        ? "absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(56,189,248,.16),transparent_48%),radial-gradient(circle_at_85%_15%,rgba(34,197,94,.18),transparent_45%),linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,.07))]"
                        : "absolute inset-0 bg-[radial-gradient(circle_at_12%_10%,rgba(120,80,255,.30),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(46,220,89,.20),transparent_45%),linear-gradient(180deg,rgba(2,6,23,.42),rgba(2,6,23,.55))]"
                }
            />
        </div>
    );
}
