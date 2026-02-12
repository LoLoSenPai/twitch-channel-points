import { AlbumGrid } from "@/components/album-grid";
import Link from "next/link";
import PageShell from "@/components/page-shell";
import { Bebas_Neue, Special_Elite } from "next/font/google";

const albumTitle = Bebas_Neue({
    subsets: ["latin"],
    weight: "400",
    variable: "--font-album-title",
});

const albumBody = Special_Elite({
    subsets: ["latin"],
    weight: "400",
    variable: "--font-album-body",
});

export default function AlbumPage() {
    return (
        <PageShell>
            <main
                className={`${albumTitle.variable} ${albumBody.variable} mx-auto max-w-7xl p-4 sm:p-6 lg:p-10 space-y-6`}
            >
                <h1 className="text-3xl sm:text-4xl font-semibold text-amber-100 tracking-wide">
                    Album Panini
                </h1>
                <AlbumGrid />
                <Link className="underline opacity-80 hover:opacity-100" href="/">
                    {"<- Retour"}
                </Link>
            </main>
        </PageShell>
    );
}
