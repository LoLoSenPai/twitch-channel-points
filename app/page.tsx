import { auth } from "@/lib/auth";
import { MintPanel } from "@/components/mint-panel";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import PageShell from "@/components/page-shell";

interface ExtendedUser {
    name?: string | null;
    displayName?: string | null;
}

export default async function HomePage() {
    const session = await auth();

    if (!session?.user) {
        return (
            <PageShell>
                <main className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-xl flex-col justify-center p-6">
                    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-[0_0_80px_rgba(99,21,193,.12)] backdrop-blur">
                        <h1 className="text-3xl font-semibold tracking-tight">Panini Mint</h1>
                        <p className="mt-2 text-base opacity-70">
                            Connecte-toi avec Twitch, récupère des tickets, puis ouvre tes boosters.
                        </p>

                        <div className="mt-6">
                            <Link
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white text-zinc-900 px-5 py-3 text-sm font-medium hover:opacity-90"
                                href="/api/auth/signin/twitch?callbackUrl=%2F"
                            >
                                Se connecter avec Twitch →
                            </Link>
                        </div>

                        <div className="mt-4 text-sm opacity-60">
                            Wallet Solana requis après connexion.
                        </div>
                    </div>
                </main>
            </PageShell>
        );
    }

    return (
        <PageShell>
            <main className="mx-auto max-w-5xl p-6 space-y-6">
                <h1 className="text-2xl font-semibold">Panini Mint</h1>
                <div className="flex items-center justify-between">
                    <div className="text-sm opacity-70">
                        Connecté en tant que {(session.user as ExtendedUser).displayName ?? session.user.name}
                    </div>
                    <LogoutButton />
                </div>
                <MintPanel />
            </main>
        </PageShell>
    );
}
