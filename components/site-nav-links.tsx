"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
};

type SiteNavLinksProps = {
  orientation?: "horizontal" | "vertical";
  onNavigate?: () => void;
  showFairness?: boolean;
  showLeaderboard?: boolean;
};

const BASE_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Accueil" },
  { href: "/album", label: "Album" },
  { href: "/marketplace", label: "Marketplace" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNavLinks({
  orientation = "horizontal",
  onNavigate,
  showFairness = true,
  showLeaderboard = true,
}: SiteNavLinksProps = {}) {
  const pathname = usePathname() ?? "/";
  const isVertical = orientation === "vertical";
  const navItems = [
    ...BASE_NAV_ITEMS,
    ...(showLeaderboard ? [{ href: "/leaderboard", label: "Leaderboard" }] : []),
    ...(showFairness ? [{ href: "/fairness", label: "Fairness" }] : []),
  ];

  return (
    <nav className={cn("text-sm", isVertical ? "flex flex-col gap-2" : "flex w-max items-center gap-2")}>
      {navItems.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 transition",
              isVertical && "w-full text-left",
              active
                ? "border-[color:var(--site-link-active-border)] bg-[color:var(--site-link-active-bg)] text-[color:var(--site-shell-text)] shadow-[inset_0_1px_0_rgba(255,255,255,.12)]"
                : "border-transparent text-[color:var(--site-link-text)] hover:border-[color:var(--site-nav-border)] hover:bg-[color:var(--site-link-hover-bg)] hover:text-[color:var(--site-shell-text)]"
            )}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
