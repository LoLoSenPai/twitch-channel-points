"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
    return (
        <button
            className="rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-sm transition hover:bg-white/10"
            onClick={() => signOut({ callbackUrl: "/" })}
        >
            Se déconnecter
        </button>
    );
}
