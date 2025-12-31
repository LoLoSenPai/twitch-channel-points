import { auth } from "@/lib/auth";
import { MintPanel } from "@/components/mint-panel";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { PageShell } from "@/components/page-shell";
import Image from "next/image";

interface ExtendedUser {
    name?: string | null;
    displayName?: string | null;
}

export default async function HomePage() {
    const session = await auth();

    if (!session?.user) {
        return (
            <PageShell>
                <main className="relative z-10 mx-auto flex min-h-[72vh] max-w-3xl items-center px-6">
                    <div className="w-full rounded-3xl border border-white/10 bg-black/30 p-10 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_30px_120px_rgba(0,0,0,0.65)] backdrop-blur-xl">
                        <div className="flex items-start gap-5">
                            <div className="">
                                {/* petit carré “logo” sobre */}
                                <Image src="/nyls-pfp.jpg" alt="Panini Mint Logo" width={48} height={48} className="rounded-full w-24 h-auto" />
                            </div>

                            <div className="min-w-0 flex-1">
                                <h1 className="text-4xl font-semibold tracking-tight text-white">
                                    Panini Mint
                                </h1>

                                <p className="mt-3 max-w-2xl text-lg leading-relaxed text-white/70">
                                    Connecte-toi avec Twitch, récupère des tickets, puis ouvre des boosters sur Solana.
                                </p>

                                <div className="mt-7 space-y-3 text-sm text-white/70">
                                    <div className="flex gap-3">
                                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/35" />
                                        <p>
                                            1 ticket = 1 booster. Les tickets viennent des rewards Twitch.
                                        </p>
                                    </div>
                                    <div className="flex gap-3">
                                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/35" />
                                        <p>
                                            Tu signes une transaction Solana pour valider l’ouverture.
                                        </p>
                                    </div>
                                    <div className="flex gap-3">
                                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white/35" />
                                        <p>
                                            La rareté n’est révélée qu’après validation de la transaction.
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-9 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <Link
                                        href="/api/auth/signin/twitch?callbackUrl=%2F"
                                        className="group inline-flex items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-white shadow-[0_10px_40px_rgba(0,0,0,0.35)] backdrop-blur transition hover:border-white/25 hover:bg-white/10"
                                    >
                                        <span className="inline-block h-2 w-2 rounded-full bg-fuchsia-400/90" />
                                        Se connecter avec Twitch
                                        <span className="ml-1 translate-x-0 text-white/60 transition group-hover:translate-x-0.5">
                                            →
                                        </span>
                                    </Link>

                                    <div className="text-xs text-white/55">
                                        Wallet Solana demandé après connexion.
                                    </div>
                                </div>
                            </div>
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
                        Connecté en tant que{" "}
                        {(session.user as ExtendedUser).displayName ?? session.user.name}
                    </div>
                    <LogoutButton />
                </div>

                <MintPanel />
            </main>
        </PageShell>
    );
}
