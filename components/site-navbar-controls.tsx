"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { SiteNavLinks } from "@/components/site-nav-links";

type SiteNavbarControlsProps = {
  isAuthenticated: boolean;
  displayName: string;
};

export function SiteNavbarControls({ isAuthenticated, displayName }: SiteNavbarControlsProps) {
  const pathname = usePathname() ?? "";
  const [openedForPath, setOpenedForPath] = useState<string | null>(null);
  const menuOpen = openedForPath === pathname;

  return (
    <>
      <div className="ml-auto hidden items-center gap-4 md:flex">
        <SiteNavLinks />

        <div className="flex items-center gap-2 text-sm">
          {isAuthenticated ? (
            <>
              <span className="hidden text-white/70 lg:inline">
                Connecté : <span className="font-medium text-white">{displayName}</span>
              </span>
              <LogoutButton />
            </>
          ) : (
            <Link
              href="/api/auth/signin/twitch?callbackUrl=%2F"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/90 px-3 py-2 text-zinc-900 transition hover:bg-white"
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
          className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-sm text-white transition hover:bg-white/10"
          aria-expanded={menuOpen}
          aria-controls="mobile-site-menu"
        >
          {menuOpen ? "Fermer" : "Menu"}
        </button>
      </div>

      {menuOpen ? (
        <div id="mobile-site-menu" className="w-full md:hidden">
          <div className="space-y-3 rounded-2xl border border-white/20 bg-black/40 p-3 backdrop-blur-sm">
            <SiteNavLinks orientation="vertical" onNavigate={() => setOpenedForPath(null)} />

            <div className="border-t border-white/10 pt-3 text-sm">
              {isAuthenticated ? (
                <div className="space-y-2">
                  <div className="text-white/70">
                    Connecté : <span className="font-medium text-white">{displayName}</span>
                  </div>
                  <LogoutButton />
                </div>
              ) : (
                <Link
                  href="/api/auth/signin/twitch?callbackUrl=%2F"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-white/20 bg-white/90 px-3 py-2 text-zinc-900 transition hover:bg-white"
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
