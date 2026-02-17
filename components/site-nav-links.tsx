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
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Accueil" },
  { href: "/album", label: "Album" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/fairness", label: "Fairness" },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNavLinks({ orientation = "horizontal", onNavigate }: SiteNavLinksProps = {}) {
  const pathname = usePathname() ?? "/";
  const isVertical = orientation === "vertical";

  return (
    <nav className={cn("text-sm", isVertical ? "flex flex-col gap-2" : "flex w-max items-center gap-2")}>
      {NAV_ITEMS.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 transition",
              isVertical && "w-full text-left",
              active
                ? "border-white/30 bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.12)]"
                : "border-transparent text-white/80 hover:border-white/15 hover:bg-white/10 hover:text-white"
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
