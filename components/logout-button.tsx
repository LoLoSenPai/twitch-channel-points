"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      className="rounded-xl border border-[color:var(--site-btn-border)] bg-[color:var(--site-btn-bg)] px-3 py-2 text-sm text-[color:var(--site-btn-text)] transition hover:bg-[color:var(--site-btn-hover-bg)]"
      onClick={() => signOut({ callbackUrl: "/" })}
    >
      Se déconnecter
    </button>
  );
}

