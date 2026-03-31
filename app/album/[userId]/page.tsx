import { Bebas_Neue, Special_Elite } from "next/font/google";
import PageShell from "@/components/page-shell";
import { AlbumGrid } from "@/components/album-grid";

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

export default async function PublicAlbumPage({
    params,
}: {
    params: Promise<{ userId: string }>;
}) {
    const { userId } = await params;

    return (
        <PageShell>
            <main
                className={`${albumTitle.variable} ${albumBody.variable} mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-10`}
            >
                <AlbumGrid viewUserId={userId} />
            </main>
        </PageShell>
    );
}
