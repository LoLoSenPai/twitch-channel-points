import Link from "next/link";
import { auth } from "@/lib/auth";
import PageShell from "@/components/page-shell";
import { MarketplacePanel } from "@/components/marketplace-panel";

export default async function MarketplacePage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <PageShell>
        <main className="mx-auto max-w-xl space-y-4 p-6">
          <h1 className="text-2xl font-semibold">Marketplace</h1>
          <p className="site-muted">Connecte-toi avec Twitch pour accéder aux échanges.</p>
          <Link
            className="site-btn-cta inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-medium hover:opacity-90"
            href="/api/auth/signin/twitch?callbackUrl=%2Fmarketplace"
          >
            Se connecter avec Twitch →
          </Link>
        </main>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold">Marketplace</h1>
        <MarketplacePanel />
      </main>
    </PageShell>
  );
}

