import { AlbumGrid } from "@/components/album-grid";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export default function AlbumPage() {
    return (
        <PageShell>
            <main className="relative z-10 mx-auto max-w-4xl p-6 space-y-6">
                <div className="flex items-end justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight text-white">
                            Album Panini
                        </h1>
                        <p className="mt-1 text-sm text-white/65">
                            Tes cartes mintées apparaissent ici.
                        </p>
                    </div>

                    <Link
                        className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
                        href="/"
                    >
                        ← Retour
                    </Link>
                </div>

                <div className="rounded-3xl border border-white/10 bg-black/25 p-4 backdrop-blur-xl">
                    <AlbumGrid />
                </div>
            </main>
        </PageShell>
    );
}
