"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { SiteNavLinks } from "@/components/site-nav-links";
import {
  applySiteTheme,
  getStoredSiteTheme,
  setSiteTheme,
  SITE_THEME_EVENT,
  SITE_THEME_STORAGE_KEY,
  type SiteTheme,
} from "@/lib/site-theme";

type SiteNavbarControlsProps = {
  isAuthenticated: boolean;
  displayName: string;
  showFairness: boolean;
  showLeaderboard: boolean;
};

function ThemeToggleIcon({ theme }: { theme: SiteTheme }) {
  if (theme === "light") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 17.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11Zm0 2.5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm0-19a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V2a1 1 0 0 1 1-1Zm10 10a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2h1ZM4 12a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2h1Zm14.364 6.95a1 1 0 0 1 1.414 1.414l-.707.707a1 1 0 0 1-1.414-1.414l.707-.707ZM6.343 6.929a1 1 0 1 1 1.414 1.414l-.707.707A1 1 0 0 1 5.636 7.636l.707-.707Zm12.728 0 .707.707a1 1 0 1 1-1.414 1.414l-.707-.707a1 1 0 1 1 1.414-1.414ZM6.343 17.071l.707.707a1 1 0 0 1-1.414 1.414l-.707-.707a1 1 0 0 1 1.414-1.414Z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M20.742 14.045a1 1 0 0 0-1.146-.164 7.5 7.5 0 0 1-10.354-9.477 1 1 0 0 0-1.31-1.257A10 10 0 1 0 21.02 15.31a1 1 0 0 0-.278-1.265Z"
      />
    </svg>
  );
}

export function SiteNavbarControls({
  isAuthenticated,
  displayName,
  showFairness,
  showLeaderboard,
}: SiteNavbarControlsProps) {
  const pathname = usePathname() ?? "";
  const [openedForPath, setOpenedForPath] = useState<string | null>(null);
  const [siteTheme, setSiteThemeState] = useState<SiteTheme>(() => getStoredSiteTheme());
  const menuOpen = openedForPath === pathname;

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === SITE_THEME_STORAGE_KEY) {
        const next = getStoredSiteTheme();
        setSiteThemeState(next);
        applySiteTheme(next);
      }
    };
    const onThemeChange = (event: Event) => {
      const nextTheme = (event as CustomEvent<SiteTheme>)?.detail;
      const next = nextTheme === "light" ? "light" : "dark";
      setSiteThemeState(next);
      applySiteTheme(next);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(SITE_THEME_EVENT, onThemeChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SITE_THEME_EVENT, onThemeChange);
    };
  }, []);

  function toggleTheme() {
    const next: SiteTheme = siteTheme === "light" ? "dark" : "light";
    setSiteThemeState(next);
    setSiteTheme(next);
  }

  return (
    <>
      <div className="hidden min-w-0 flex-1 items-center justify-between gap-4 md:flex">
        <SiteNavLinks showFairness={showFairness} showLeaderboard={showLeaderboard} />

        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--site-btn-border)] bg-[color:var(--site-btn-bg)] px-3 py-2 text-[color:var(--site-btn-text)] transition hover:bg-[color:var(--site-btn-hover-bg)]"
            title={siteTheme === "light" ? "Passer en thème sombre" : "Passer en thème clair"}
          >
            <ThemeToggleIcon theme={siteTheme} />
            <span>{siteTheme === "light" ? "Light" : "Dark"}</span>
          </button>
          {isAuthenticated ? (
            <>
              <span className="hidden text-[color:var(--site-muted-text)] lg:inline">
                Connecté :{" "}
                <span className="font-medium text-[color:var(--site-shell-text)]">{displayName}</span>
              </span>
              <LogoutButton />
            </>
          ) : (
            <Link
              href="/api/auth/signin/twitch?callbackUrl=%2F"
              className="inline-flex items-center justify-center rounded-xl border border-[color:var(--site-btn-border)] bg-[color:var(--site-cta-bg)] px-3 py-2 text-[color:var(--site-cta-text)] transition hover:opacity-90"
            >
              Se connecter
            </Link>
          )}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setOpenedForPath((prev) => (prev === pathname ? null : pathname))}
          className="inline-flex items-center justify-center rounded-xl border border-[color:var(--site-btn-border)] bg-[color:var(--site-btn-bg)] px-3 py-2 text-sm text-[color:var(--site-btn-text)] transition hover:bg-[color:var(--site-btn-hover-bg)]"
          aria-expanded={menuOpen}
          aria-controls="mobile-site-menu"
        >
          {menuOpen ? "Fermer" : "Menu"}
        </button>
      </div>

      {menuOpen ? (
        <div id="mobile-site-menu" className="w-full md:hidden">
          <div className="space-y-3 rounded-2xl border border-[color:var(--site-menu-border)] bg-[color:var(--site-menu-bg)] p-3 backdrop-blur-sm">
            <SiteNavLinks
              orientation="vertical"
              onNavigate={() => setOpenedForPath(null)}
              showFairness={showFairness}
              showLeaderboard={showLeaderboard}
            />

            <div className="border-t border-[color:var(--site-nav-border)] pt-3 text-sm">
              <button
                type="button"
                onClick={toggleTheme}
                className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[color:var(--site-btn-border)] bg-[color:var(--site-btn-bg)] px-3 py-2 text-[color:var(--site-btn-text)] transition hover:bg-[color:var(--site-btn-hover-bg)]"
                title={siteTheme === "light" ? "Passer en thème sombre" : "Passer en thème clair"}
              >
                <ThemeToggleIcon theme={siteTheme} />
                <span>{siteTheme === "light" ? "Thème light" : "Thème dark"}</span>
              </button>
              {isAuthenticated ? (
                <div className="space-y-2">
                  <div className="text-[color:var(--site-muted-text)]">
                    Connecté :{" "}
                    <span className="font-medium text-[color:var(--site-shell-text)]">{displayName}</span>
                  </div>
                  <LogoutButton />
                </div>
              ) : (
                <Link
                  href="/api/auth/signin/twitch?callbackUrl=%2F"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-[color:var(--site-btn-border)] bg-[color:var(--site-cta-bg)] px-3 py-2 text-[color:var(--site-cta-text)] transition hover:opacity-90"
                  onClick={() => setOpenedForPath(null)}
                >
                  Se connecter
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
