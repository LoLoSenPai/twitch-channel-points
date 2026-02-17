import Link from "next/link";
import { auth } from "@/lib/auth";
import { LogoutButton } from "@/components/logout-button";
import { SiteNavLinks } from "@/components/site-nav-links";
import Image from "next/image";

type SessionUser = {
  name?: string | null;
  displayName?: string | null;
};

export default async function SiteNavbar() {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  const displayName = user?.displayName ?? user?.name ?? "viewer";

  return (
    <header className="border-b border-white/10 bg-black/25 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm font-semibold tracking-wide text-white/95">
            <Image src="/nyls-pfp.png" alt="Nyls PFP" width={24} height={24} className="inline-block mr-2" />
          </Link>
          <SiteNavLinks />
        </div>

        <div className="flex items-center gap-2 text-sm">
          {session?.user ? (
            <>
              <span className="hidden text-white/70 sm:inline">
                Connecté : <span className="font-medium text-white">{displayName}</span>
              </span>
              <LogoutButton />
            </>
          ) : (
            <Link
              href="/api/auth/signin/twitch?callbackUrl=%2F"
              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/90 px-3 py-2 text-zinc-900 transition hover:bg-white"
            >
              Se connecter
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
