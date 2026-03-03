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
          <section className="site-surface grid gap-6 rounded-3xl p-6 md:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
            <div className="space-y-4">
              <p className="site-muted text-xs uppercase tracking-[0.2em]">Collection Twitch</p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Mint tes cartes et complète ton album
              </h1>
              <p className="site-muted max-w-xl text-sm sm:text-base">
                Gagne des tickets via les points de chaîne Twitch, connecte ton compte,
                ouvre des boosters et collectionne les 44 cartes.
              </p>

              <div className="pt-1">
                <Link
                  className="site-btn-cta inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-medium transition hover:opacity-90"
                  href="/api/auth/signin/twitch?callbackUrl=%2F"
                >
                  Se connecter avec Twitch
                </Link>
              </div>
            </div>

            <aside className="site-surface-soft rounded-2xl p-4 sm:p-5">
              <p className="site-muted text-xs uppercase tracking-[0.16em]">Comment démarrer</p>
              <ol className="site-muted mt-4 space-y-3 text-sm">
                <li>1. Récupère un ticket via les rewards Twitch.</li>
                <li>2. Connecte ton compte et ton wallet Solana.</li>
                <li>3. Ouvre un booster pour minter une carte.</li>
                <li>4. Complète ton album et échange tes doublons.</li>
              </ol>
            </aside>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            <article className="site-surface-soft rounded-2xl p-4">
              <p className="text-2xl font-semibold">44</p>
              <p className="site-muted text-sm">cartes à collectionner</p>
            </article>
            <article className="site-surface-soft rounded-2xl p-4">
              <p className="text-2xl font-semibold">1 ticket</p>
              <p className="site-muted text-sm">par mint de booster</p>
            </article>
            <article className="site-surface-soft rounded-2xl p-4">
              <p className="text-2xl font-semibold">Échanges</p>
              <p className="site-muted text-sm">dans la marketplace communautaire</p>
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
        <section className="site-surface rounded-3xl p-6 md:p-8">
          <div className="space-y-2">
            <p className="site-muted text-xs uppercase tracking-[0.2em]">Paninyls</p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Bienvenue, {user.displayName ?? user.name}
            </h1>
            <p className="site-muted text-sm sm:text-base">
              Ouvre des boosters, récupère des cartes et avance dans ton album.
            </p>
          </div>
        </section>

        <MintPanel showProofLinks={showFairness} />
      </main>
    </PageShell>
  );
}

