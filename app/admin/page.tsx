import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { Redemption, Mint, MintIntent, Collection } from "@/lib/models";
import { AdminDashboard } from "@/components/admin-dashboard";

export default async function AdminPage() {
    const session = await auth();
    const guard = await requireAdmin();

    if (!session?.user) {
        return (
            <main className="mx-auto max-w-5xl p-6">
                <h1 className="text-2xl font-semibold">Admin</h1>
                <Link className="mt-4 inline-block underline" href="/api/auth/signin">
                    Login Twitch
                </Link>
            </main>
        );
    }

    if (!guard.ok) {
        return (
            <main className="mx-auto max-w-5xl p-6">
                <h1 className="text-2xl font-semibold">Admin</h1>
                <p className="mt-2 opacity-70">Accès refusé.</p>
            </main>
        );
    }

    await db();

    const [
        ticketsPending,
        ticketsConsumed,
        mintsTotal,
        intentsPrepared,
        intentsFailed,
        collectionsCount,
        activeCollection,
        pendingTickets,
        preparedIntents,
        collections,
    ] = await Promise.all([
        Redemption.countDocuments({ status: "PENDING" }),
        Redemption.countDocuments({ status: "CONSUMED" }),
        Mint.countDocuments({}),
        MintIntent.countDocuments({ status: "PREPARED" }),
        MintIntent.countDocuments({ status: "FAILED" }),
        Collection.countDocuments({}),
        Collection.findOne({ isActive: true }).lean(),
        Redemption.find({ status: "PENDING" }).sort({ createdAt: -1 }).limit(30).lean(),
        MintIntent.find({ status: "PREPARED" }).sort({ createdAt: -1 }).limit(30).lean(),
        Collection.find({}).sort({ createdAt: -1 }).lean(),
    ]);

    const initialData = {
        stats: {
            ticketsPending,
            ticketsConsumed,
            mintsTotal,
            intentsPrepared,
            intentsFailed,
            collections: collectionsCount,
            activeCollection: activeCollection
                ? {
                    name: activeCollection.name,
                    coreCollectionPubkey: activeCollection.coreCollectionPubkey ?? null,
                    merkleTreePubkey: activeCollection.merkleTreePubkey,
                }
                : null,
        },
        pendingTickets,
        preparedIntents,
        collections,
        supply: null,
    };

    return (
        <main className="mx-auto max-w-5xl space-y-6 p-6">
            <div className="flex items-baseline justify-between gap-4">
                <h1 className="text-2xl font-semibold">Admin</h1>
                <div className="text-sm opacity-70">
                    Connecté: <span className="font-medium">{(session.user as { displayName?: string })?.displayName ?? "admin"}</span>
                </div>
            </div>

            <AdminDashboard initialData={initialData} />
        </main>
    );
}
