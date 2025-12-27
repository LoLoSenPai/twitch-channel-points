import { AlbumGrid } from "@/components/album-grid";
import Link from "next/link";

export default function AlbumPage() {
    return (
        <main className="mx-auto max-w-4xl p-6 space-y-6">
            <h1 className="text-2xl font-semibold">Album Panini</h1>
            <AlbumGrid />
            <Link className="underline opacity-80" href="/">← Retour</Link>
        </main>
    );
}
