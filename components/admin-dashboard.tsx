"use client";

import { useCallback, useMemo, useState } from "react";

type Stats = {
    ticketsPending: number;
    ticketsConsumed: number;
    mintsTotal: number;
    intentsPrepared: number;
    intentsFailed: number;
    collections: number;
    activeCollection: null | {
        name: string;
        coreCollectionPubkey: string | null;
        merkleTreePubkey: string;
    };
};

type PendingTicket = {
    redemptionId: string;
    twitchUserId: string;
    lockedByIntentId: string | null;
};

type PreparedIntent = {
    intentId: string;
    twitchUserId: string;
    wallet: string;
    redemptionId: string;
};

type Collection = {
    _id: string;
    name: string;
    merkleTreePubkey: string;
    coreCollectionPubkey: string | null;
    isActive: boolean;
};

type AdminData = {
    stats: Stats | null;
    pendingTickets: PendingTicket[];
    preparedIntents: PreparedIntent[];
    collections: Collection[];
};

type TwitchReward = {
    id: string;
    title: string;
    cost: number;
    is_enabled: boolean;
};

type TwitchSub = {
    id: string;
    status: string;
    type: string;
    version?: string;
    created_at?: string;
    condition?: Record<string, unknown>;
    transport?: Record<string, unknown>;
};

function isHttpErrorText(t: string) {
    return t.includes("Missing Twitch user token") || t.includes("Forbidden") || t.includes("Unauthorized");
}

export function AdminDashboard({ initialData }: { initialData: AdminData }) {
    const [data, setData] = useState<AdminData>(initialData);

    const [seedUserId, setSeedUserId] = useState("");
    const [seedCount, setSeedCount] = useState(5);

    const [newColName, setNewColName] = useState("Panini V0");
    const [newTree, setNewTree] = useState("");
    const [newCore, setNewCore] = useState("");

    // --- TWITCH UI STATE ---
    const [rewards, setRewards] = useState<TwitchReward[]>([]);
    const [subs, setSubs] = useState<TwitchSub[]>([]);
    const [selectedRewardId, setSelectedRewardId] = useState<string>("");
    const [twitchBusy, setTwitchBusy] = useState<null | "rewards" | "subs" | "subscribe">(null);
    const [twitchMsg, setTwitchMsg] = useState<string>("");

    const webhookCallback = useMemo(() => {
        // juste informatif: l’endpoint public webhook
        // (c’est /api/twitch/eventsub dans ton projet)
        if (typeof window === "undefined") return "/api/twitch/eventsub";
        return `${window.location.origin}/api/twitch/eventsub`;
    }, []);

    const refresh = useCallback(async () => {
        const [s, t, i, c] = await Promise.all([
            fetch("/api/admin/stats").then((r) => r.json()),
            fetch("/api/admin/redemptions?status=PENDING&limit=30").then((r) => r.json()),
            fetch("/api/admin/intents?status=PREPARED&limit=30").then((r) => r.json()),
            fetch("/api/admin/collections").then((r) => r.json()),
        ]);

        setData({
            stats: s,
            pendingTickets: t.items ?? [],
            preparedIntents: i.items ?? [],
            collections: c.items ?? [],
        });
    }, []);

    async function seedTickets() {
        await fetch("/api/admin/seed", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ twitchUserId: seedUserId, count: seedCount }),
        });
        await refresh();
    }

    async function unlockIntent(intentId: string) {
        await fetch("/api/admin/intents", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ intentId, action: "unlock" }),
        });
        await refresh();
    }

    async function forceUnlockTicket(redemptionId: string) {
        await fetch("/api/admin/redemptions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ redemptionId, action: "forceUnlock" }),
        });
        await refresh();
    }

    async function createCollection() {
        await fetch("/api/admin/collections", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                name: newColName,
                merkleTreePubkey: newTree,
                coreCollectionPubkey: newCore || null,
                isActive: true,
            }),
        });
        await refresh();
    }

    async function setActive(id: string) {
        await fetch(`/api/admin/collections/${id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ isActive: true }),
        });
        await refresh();
    }

    // --- TWITCH ACTIONS ---
    async function fetchRewards() {
        setTwitchBusy("rewards");
        setTwitchMsg("");
        try {
            const r = await fetch("/api/admin/twitch/reward", { cache: "no-store" });
            const text = await r.text();

            if (!r.ok) {
                setTwitchMsg(text);
                return;
            }

            const j = JSON.parse(text) as { items: TwitchReward[] };
            setRewards(j.items ?? []);
            if (!selectedRewardId && (j.items?.[0]?.id ?? "")) setSelectedRewardId(j.items[0].id);
            setTwitchMsg(`OK: ${j.items?.length ?? 0} rewards`);
        } catch (e) {
            setTwitchMsg(`Erreur fetch rewards: ${(e as Error).message}`);
        } finally {
            setTwitchBusy(null);
        }
    }

    async function fetchSubscriptions() {
        setTwitchBusy("subs");
        setTwitchMsg("");
        try {
            const r = await fetch("/api/admin/twitch/eventsub", { cache: "no-store" });
            const text = await r.text();

            if (!r.ok) {
                setTwitchMsg(text);
                return;
            }

            const j = JSON.parse(text) as { data?: TwitchSub[] };
            setSubs(j.data ?? []);
            setTwitchMsg(`OK: ${(j.data ?? []).length} subscriptions`);
        } catch (e) {
            setTwitchMsg(`Erreur fetch subs: ${(e as Error).message}`);
        } finally {
            setTwitchBusy(null);
        }
    }

    async function subscribeEventSub() {
        setTwitchBusy("subscribe");
        setTwitchMsg("");
        try {
            const r = await fetch("/api/admin/twitch/eventsub", {
                method: "POST",
                cache: "no-store",
            });
            const text = await r.text();

            if (!r.ok) {
                setTwitchMsg(text);
                return;
            }

            setTwitchMsg("✅ Subscription créée.");
            await fetchSubscriptions();
        } catch (e) {
            setTwitchMsg(`Erreur subscribe: ${(e as Error).message}`);
        } finally {
            setTwitchBusy(null);
        }
    }

    async function deleteSub(id: string) {
        setTwitchBusy("subs");
        setTwitchMsg("");
        try {
            const r = await fetch(`/api/admin/twitch/eventsub?id=${encodeURIComponent(id)}`, {
                method: "DELETE",
                cache: "no-store",
            });
            const text = await r.text();
            if (!r.ok) {
                setTwitchMsg(text);
                return;
            }
            setTwitchMsg("🧹 Subscription supprimée.");
            await fetchSubscriptions();
        } catch (e) {
            setTwitchMsg(`Erreur delete: ${(e as Error).message}`);
        } finally {
            setTwitchBusy(null);
        }
    }

    async function copyToClipboard(v: string) {
        try {
            await navigator.clipboard.writeText(v);
            setTwitchMsg("Copié ✅");
        } catch {
            setTwitchMsg("Copie impossible (permissions navigateur).");
        }
    }

    return (
        <div className="space-y-6">
            {/* refresh */}
            <button className="rounded-xl border px-3 py-2" onClick={refresh}>
                Refresh
            </button>

            <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Card title="Tickets PENDING" value={data.stats?.ticketsPending ?? "—"} />
                <Card title="Tickets CONSUMED" value={data.stats?.ticketsConsumed ?? "—"} />
                <Card title="Mints total" value={data.stats?.mintsTotal ?? "—"} />
                <Card title="Intents PREPARED" value={data.stats?.intentsPrepared ?? "—"} />
                <Card title="Intents FAILED" value={data.stats?.intentsFailed ?? "—"} />
                <Card title="Collections" value={data.stats?.collections ?? "—"} />
            </section>

            <section className="rounded-2xl border p-4 space-y-2">
                <div className="font-semibold">Collection active</div>
                <div className="text-sm opacity-80">
                    {data.stats?.activeCollection ? (
                        <>
                            <div>
                                <span className="opacity-70">Nom:</span> {data.stats.activeCollection.name}
                            </div>
                            <div className="break-all">
                                <span className="opacity-70">Tree:</span> {data.stats.activeCollection.merkleTreePubkey}
                            </div>
                            <div className="break-all">
                                <span className="opacity-70">Core:</span> {data.stats.activeCollection.coreCollectionPubkey ?? "—"}
                            </div>
                        </>
                    ) : (
                        <span className="opacity-70">Aucune (fallback sur .env si présent)</span>
                    )}
                </div>
            </section>

            {/* --- TWITCH SECTION --- */}
            <section className="rounded-2xl border p-4 space-y-3">
                <div className="font-semibold">Twitch (Rewards + EventSub)</div>

                <div className="text-xs opacity-70 break-all">
                    Webhook callback attendu: <span className="font-mono">{webhookCallback}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        className="rounded-xl border px-3 py-2"
                        onClick={fetchRewards}
                        disabled={twitchBusy !== null}
                    >
                        {twitchBusy === "rewards" ? "Chargement rewards…" : "Lister rewards"}
                    </button>

                    <button
                        className="rounded-xl border px-3 py-2"
                        onClick={fetchSubscriptions}
                        disabled={twitchBusy !== null}
                    >
                        {twitchBusy === "subs" ? "Chargement subs…" : "Lister subscriptions"}
                    </button>

                    <button
                        className="rounded-xl border px-3 py-2"
                        onClick={subscribeEventSub}
                        disabled={twitchBusy !== null || !selectedRewardId}
                    >
                        {twitchBusy === "subscribe" ? "Subscribe…" : "Créer subscription EventSub"}
                    </button>
                </div>

                {twitchMsg ? (
                    <div
                        className={`rounded-xl border px-3 py-2 text-sm wrap-break-word ${isHttpErrorText(twitchMsg) ? "opacity-90" : "opacity-80"
                            }`}
                    >
                        {twitchMsg}
                    </div>
                ) : null}

                <div className="grid md:grid-cols-2 gap-3">
                    {/* rewards list */}
                    <div className="rounded-xl border p-3 space-y-2">
                        <div className="text-sm font-medium">Rewards</div>

                        {rewards.length ? (
                            <>
                                <select
                                    className="w-full rounded-xl border px-3 py-2 bg-transparent"
                                    value={selectedRewardId}
                                    onChange={(e) => setSelectedRewardId(e.target.value)}
                                >
                                    {rewards.map((rw) => (
                                        <option key={rw.id} value={rw.id}>
                                            {rw.title} — {rw.cost} pts {rw.is_enabled ? "" : "(disabled)"}
                                        </option>
                                    ))}
                                </select>

                                <div className="text-xs opacity-70 break-all">
                                    rewardId: <span className="font-mono">{selectedRewardId}</span>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        className="rounded-xl border px-3 py-2 text-sm"
                                        onClick={() => copyToClipboard(selectedRewardId)}
                                        disabled={twitchBusy !== null}
                                    >
                                        Copier l’ID
                                    </button>
                                </div>

                                <div className="text-xs opacity-70">
                                    Ensuite tu mets cet ID dans <span className="font-mono">TWITCH_REWARD_ID</span> (Vercel env).
                                </div>
                            </>
                        ) : (
                            <div className="text-xs opacity-70">
                                Clique “Lister rewards” (tu dois être loggé admin + scopes OK).
                            </div>
                        )}
                    </div>

                    {/* subscriptions list */}
                    <div className="rounded-xl border p-3 space-y-2">
                        <div className="text-sm font-medium">Subscriptions</div>

                        {subs.length ? (
                            <div className="space-y-2">
                                {subs.map((s) => (
                                    <div
                                        key={s.id}
                                        className="rounded-xl border p-2 text-xs flex items-start justify-between gap-3"
                                    >
                                        <div className="space-y-1">
                                            <div className="break-all">
                                                <span className="opacity-70">id:</span> {s.id}
                                            </div>
                                            <div>
                                                <span className="opacity-70">status:</span> {s.status}
                                            </div>
                                            <div className="break-all">
                                                <span className="opacity-70">type:</span> {s.type}
                                            </div>
                                        </div>

                                        <button
                                            className="rounded-xl border px-3 py-2 text-xs cursor-pointer"
                                            onClick={() => deleteSub(s.id)}
                                            disabled={twitchBusy !== null}
                                            title="Supprimer cette subscription"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-xs opacity-70">Clique “Lister subscriptions”.</div>
                        )}
                    </div>
                </div>
            </section>

            {/* seed */}
            <section className="rounded-2xl border p-4 space-y-3">
                <div className="font-semibold">Seed tickets (test)</div>
                <div className="grid md:grid-cols-3 gap-2">
                    <input
                        className="rounded-xl border px-3 py-2"
                        placeholder="twitchUserId (viewer)"
                        value={seedUserId}
                        onChange={(e) => setSeedUserId(e.target.value)}
                    />
                    <input
                        className="rounded-xl border px-3 py-2"
                        type="number"
                        value={seedCount}
                        onChange={(e) => setSeedCount(Number(e.target.value))}
                    />
                    <button className="rounded-xl border px-4 py-2" onClick={seedTickets}>
                        Ajouter
                    </button>
                </div>
                <div className="text-xs opacity-70">Astuce: récupère ton twitchUserId via /api/me (en étant loggé)</div>
            </section>

            {/* collections */}
            <section className="rounded-2xl border p-4 space-y-3">
                <div className="font-semibold">Collections</div>
                <div className="grid md:grid-cols-4 gap-2">
                    <input
                        className="rounded-xl border px-3 py-2"
                        placeholder="Nom"
                        value={newColName}
                        onChange={(e) => setNewColName(e.target.value)}
                    />
                    <input
                        className="rounded-xl border px-3 py-2"
                        placeholder="Merkle Tree pubkey"
                        value={newTree}
                        onChange={(e) => setNewTree(e.target.value)}
                    />
                    <input
                        className="rounded-xl border px-3 py-2"
                        placeholder="Core Collection pubkey (optionnel)"
                        value={newCore}
                        onChange={(e) => setNewCore(e.target.value)}
                    />
                    <button className="rounded-xl border px-4 py-2" onClick={createCollection}>
                        Créer + activer
                    </button>
                </div>

                <div className="space-y-2">
                    {data.collections.map((c) => (
                        <div
                            key={c._id}
                            className="rounded-xl border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                        >
                            <div className="text-sm">
                                <div className="font-medium">
                                    {c.name} {c.isActive ? <span className="opacity-70">(active)</span> : null}
                                </div>
                                <div className="opacity-70 break-all">Tree: {c.merkleTreePubkey}</div>
                                <div className="opacity-70 break-all">Core: {c.coreCollectionPubkey ?? "—"}</div>
                            </div>
                            <div className="flex gap-2">
                                {!c.isActive ? (
                                    <button className="rounded-xl border px-3 py-2" onClick={() => setActive(c._id)}>
                                        Set active
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* tickets pending */}
            <section className="rounded-2xl border p-4 space-y-3">
                <div className="font-semibold">Tickets PENDING (30 derniers)</div>
                <div className="space-y-2">
                    {data.pendingTickets.map((t) => (
                        <div key={t.redemptionId} className="rounded-xl border p-3 flex items-center justify-between gap-3">
                            <div className="text-xs break-all">
                                <div>
                                    <span className="opacity-70">user:</span> {t.twitchUserId}
                                </div>
                                <div>
                                    <span className="opacity-70">redemption:</span> {t.redemptionId}
                                </div>
                                <div>
                                    <span className="opacity-70">locked:</span> {t.lockedByIntentId ?? "—"}
                                </div>
                            </div>
                            <button className="rounded-xl border px-3 py-2" onClick={() => forceUnlockTicket(t.redemptionId)}>
                                Unlock
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            {/* intents prepared */}
            <section className="rounded-2xl border p-4 space-y-3">
                <div className="font-semibold">Intents PREPARED (30 derniers)</div>
                <div className="space-y-2">
                    {data.preparedIntents.map((i) => (
                        <div key={i.intentId} className="rounded-xl border p-3 flex items-center justify-between gap-3">
                            <div className="text-xs break-all">
                                <div>
                                    <span className="opacity-70">intent:</span> {i.intentId}
                                </div>
                                <div>
                                    <span className="opacity-70">user:</span> {i.twitchUserId}
                                </div>
                                <div>
                                    <span className="opacity-70">wallet:</span> {i.wallet}
                                </div>
                                <div>
                                    <span className="opacity-70">ticket:</span> {i.redemptionId}
                                </div>
                            </div>
                            <button className="rounded-xl border px-3 py-2" onClick={() => unlockIntent(i.intentId)}>
                                Unlock + fail
                            </button>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}

function Card({ title, value }: { title: string; value: string | number }) {
    return (
        <div className="rounded-2xl border p-4">
            <div className="text-sm opacity-70">{title}</div>
            <div className="text-2xl font-semibold">{value}</div>
        </div>
    );
}
