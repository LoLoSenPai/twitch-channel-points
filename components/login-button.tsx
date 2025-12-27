"use client";

import { signIn } from "next-auth/react";

export function LoginButton() {
    return (
        <button
            className="mt-4 rounded-xl border px-4 py-2"
            onClick={() => signIn("twitch", { callbackUrl: "/" })}
        >
            Se connecter avec Twitch
        </button>
    );
}
