import Link from "next/link";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { Redemption, Mint, MintIntent, Collection, TradeOffer } from "@/lib/models";
import { AdminDashboard } from "@/components/admin-dashboard";
import PageShell from "@/components/page-shell";

type PendingTicketRow = {
    redemptionId?: string;
    twitchUserId?: string;
    lockedByIntentId?: string | null;
};

type PreparedIntentRow = {
    intentId?: string;
    twitchUserId?: string;
    wallet?: string;
    redemptionId?: string;
};

type CollectionRow = {
    _id?: unknown;
    name?: string;
    merkleTreePubkey?: string;
    coreCollectionPubkey?: string | null;
    isActive?: boolean;
};

type LockedOfferRow = {
    offerId?: string;
    makerTwitchUserId?: string;
    makerStickerId?: string;
    wantedStickerIds?: string[];
    status?: string;
    takerTwitchUserId?: string | null;
    takerWallet?: string | null;
    takerAssetId?: string | null;
    updatedAt?: string | Date;
};

export default async function AdminPage() {
    const session = await auth();
    const guard = await requireAdmin();

    if (!session?.user) {
        return (
            <PageShell>
                <main className="mx-auto max-w-5xl p-6 text-zinc-100">
                    <h1 className="text-2xl font-semibold">Admin</h1>
                    <Link className="mt-4 inline-block underline" href="/api/auth/signin">
                        Login Twitch
                    </Link>
                </main>
            </PageShell>
        );
    }

    if (!guard.ok) {
        return (
            <PageShell>
                <main className="mx-auto max-w-5xl p-6 text-zinc-100">
                    <h1 className="text-2xl font-semibold">Admin</h1>
                    <p className="mt-2 opacity-70">Accès refusé.</p>
                </main>
            </PageShell>
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
        lockedOffers,
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
        TradeOffer.find({ status: "LOCKED" }).sort({ updatedAt: -1 }).limit(30).lean(),
    ]);

    const pendingTicketsSafe = (pendingTickets as PendingTicketRow[]).map((row) => ({
        redemptionId: String(row.redemptionId ?? ""),
        twitchUserId: String(row.twitchUserId ?? ""),
        lockedByIntentId: row.lockedByIntentId ? String(row.lockedByIntentId) : null,
    }));

    const preparedIntentsSafe = (preparedIntents as PreparedIntentRow[]).map((row) => ({
        intentId: String(row.intentId ?? ""),
        twitchUserId: String(row.twitchUserId ?? ""),
        wallet: String(row.wallet ?? ""),
        redemptionId: String(row.redemptionId ?? ""),
    }));

    const collectionsSafe = (collections as CollectionRow[]).map((row) => ({
        _id: String(row._id ?? ""),
        name: String(row.name ?? ""),
        merkleTreePubkey: String(row.merkleTreePubkey ?? ""),
        coreCollectionPubkey: row.coreCollectionPubkey ? String(row.coreCollectionPubkey) : null,
        isActive: Boolean(row.isActive),
    }));

    const lockedOffersSafe = (lockedOffers as LockedOfferRow[]).map((row) => ({
        offerId: String(row.offerId ?? ""),
        makerTwitchUserId: String(row.makerTwitchUserId ?? ""),
        makerStickerId: String(row.makerStickerId ?? ""),
        wantedStickerIds: Array.isArray(row.wantedStickerIds)
            ? row.wantedStickerIds.map((id) => String(id ?? "")).filter(Boolean)
            : [],
        status: String(row.status ?? ""),
        takerTwitchUserId: row.takerTwitchUserId ? String(row.takerTwitchUserId) : null,
        takerWallet: row.takerWallet ? String(row.takerWallet) : null,
        takerAssetId: row.takerAssetId ? String(row.takerAssetId) : null,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));

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
        pendingTickets: pendingTicketsSafe,
        preparedIntents: preparedIntentsSafe,
        collections: collectionsSafe,
        lockedOffers: lockedOffersSafe,
        supply: null,
    };

    return (
        <PageShell>
            <main className="mx-auto max-w-5xl space-y-6 p-6 text-zinc-100">
                <div className="flex items-baseline justify-between gap-4">
                    <h1 className="text-2xl font-semibold">Admin</h1>
                    <div className="text-sm opacity-70">
                        Connecté : <span className="font-medium">{(session.user as { displayName?: string })?.displayName ?? "admin"}</span>
                    </div>
                </div>

                <AdminDashboard initialData={initialData} />
            </main>
        </PageShell>
    );
}
