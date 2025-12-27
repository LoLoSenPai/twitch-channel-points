import { auth } from "@/lib/auth";
import { MintPanel } from "@/components/mint-panel";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";

interface ExtendedUser {
    name?: string | null;
    displayName?: string | null;
}

export default async function HomePage() {
    const session = await auth();

    if (!session?.user) {
        return (
            <main className="mx-auto max-w-xl p-6 space-y-4">
                <h1 className="text-2xl font-semibold">Panini Mint</h1>
                <p className="opacity-70">Connecte-toi avec Twitch pour minter.</p>

                {/* IMPORTANT: pas de next/link ici */}
                <Link
                    className="inline-block rounded-xl border px-4 py-2"
                    href="/api/auth/signin/twitch?callbackUrl=%2F"
                >
                    Se connecter avec Twitch
                </Link>
            </main>
        );
    }

    return (
        <main className="mx-auto max-w-xl p-6 space-y-6">
            <h1 className="text-2xl font-semibold">Panini Mint</h1>
            <div className="flex items-center justify-between">
                <div className="text-sm opacity-70">
                    Connecté en tant que {(session.user as ExtendedUser).displayName ?? session.user.name}
                </div>
                <LogoutButton />
            </div>

            <MintPanel />

            <Link className="underline opacity-80" href="/album">
                Voir l’album →
            </Link>
        </main>
    );
}
