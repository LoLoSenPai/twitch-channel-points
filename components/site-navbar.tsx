import Link from "next/link";
import { auth } from "@/lib/auth";
import Image from "next/image";
import { SiteNavbarControls } from "@/components/site-navbar-controls";

type SessionUser = {
  name?: string | null;
  displayName?: string | null;
};

export default async function SiteNavbar() {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  const displayName = user?.displayName ?? user?.name ?? "viewer";
  const isAuthenticated = Boolean(session?.user);

  return (
    <header className="border-b border-white/10 bg-black/25 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center">
          <Link href="/" className="text-sm font-semibold tracking-wide text-white/95">
            <Image src="/nyls-pfp.jpg" alt="Nyls PFP" width={40} height={40} className="inline-block rounded-full" />
          </Link>
        </div>

        <SiteNavbarControls isAuthenticated={isAuthenticated} displayName={displayName} />
      </div>
    </header>
  );
}
