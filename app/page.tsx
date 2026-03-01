import Link from "next/link";
import { auth } from "@/lib/auth";
import { MintPanel } from "@/components/mint-panel";
import PageShell from "@/components/page-shell";

interface ExtendedUser {
    name?: string | null;
    displayName?: string | null;
}

export default async function HomePage() {
    const session = await auth();
    const randomnessMode = String(process.env.MINT_RANDOMNESS_MODE ?? "local")
        .trim()
        .toLowerCase();
    const showFairness = randomnessMode === "switchboard";

    if (!session?.user) {
        return (
            <PageShell>
                <main className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6 lg:p-10">
                    <section className="grid gap-6 rounded-3xl border border-white/10 bg-black/30 p-6 shadow-[0_20px_80px_rgba(0,0,0,.35)] backdrop-blur md:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
                        <div className="space-y-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-white/60">Collection Twitch</p>
                            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Mint tes cartes et complète ton album</h1>
                            <p className="max-w-xl text-sm text-white/75 sm:text-base">
                                Gagne des tickets via les points de chaine Twitch, connecte ton compte,
                                ouvre des boosters et collectionne les 44 cartes.
                            </p>

                            <div className="pt-1">
                                <Link
                                    className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white px-5 py-3 text-sm font-medium text-zinc-900 transition hover:bg-white/90"
                                    href="/api/auth/signin/twitch?callbackUrl=%2F"
                                >
                                    Se connecter avec Twitch
                                </Link>
                            </div>
                        </div>

                        <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                            <p className="text-xs uppercase tracking-[0.16em] text-white/60">Comment démarrer</p>
                            <ol className="mt-4 space-y-3 text-sm text-white/80">
                                <li>1. Récupère un ticket via les rewards Twitch.</li>
                                <li>2. Connecte ton compte et ton wallet Solana.</li>
                                <li>3. Ouvre un booster pour minter une carte.</li>
                                <li>4. Complète ton album et échange tes doublons.</li>
                            </ol>
                        </aside>
                    </section>

                    <section className="grid gap-3 sm:grid-cols-3">
                        <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-2xl font-semibold">44</p>
                            <p className="text-sm text-white/70">cartes à collectionner</p>
                        </article>
                        <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-2xl font-semibold">1 ticket</p>
                            <p className="text-sm text-white/70">par mint de booster</p>
                        </article>
                        <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-2xl font-semibold">Échanges</p>
                            <p className="text-sm text-white/70">dans la marketplace communautaire</p>
                        </article>
                    </section>
                </main>
            </PageShell>
        );
    }

    const user = session.user as ExtendedUser;

    return (
        <PageShell>
            <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-10">
                <section className="rounded-3xl border border-white/10 bg-black/30 p-6 shadow-[0_20px_80px_rgba(0,0,0,.35)] backdrop-blur md:p-8">
                    <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.2em] text-white/60">Paninyls</p>
                        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Bienvenue, {user.displayName ?? user.name}</h1>
                        <p className="text-sm text-white/75 sm:text-base">
                            Ouvre des boosters, récupère des cartes et avance dans ton album.
                        </p>
                    </div>
                </section>

                <MintPanel showProofLinks={showFairness} />
            </main>
        </PageShell>
    );
}
