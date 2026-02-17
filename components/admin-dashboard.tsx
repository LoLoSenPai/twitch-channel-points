"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
    supply: SupplyData | null;
};

type SupplySummary = {
    mintedTotal: number;
    reservedTotal: number;
    cappedMaxTotal: number;
    cappedRemainingTotal: number;
    soldOutCount: number;
    totalConfigured: number;
    cappedCount: number;
};

type SupplyItem = {
    id: string;
    name: string;
    rarity:
    | "common"
    | "uncommon"
    | "rare"
    | "legendary"
    | "mythic"
    | "R"
    | "SR"
    | "SSR"
    | null;
    maxSupply: number | null;
    minted: number;
    reserved: number;
    remaining: number | null;
    soldOut: boolean;
};

type SupplyData = {
    summary: SupplySummary;
    items: SupplyItem[];
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
        // juste informatif: l'endpoint public webhook
        // (c'est /api/twitch/eventsub dans ton projet)
        if (typeof window === "undefined") return "/api/twitch/eventsub";
        return `${window.location.origin}/api/twitch/eventsub`;
    }, []);

    const panelClass = "rounded-2xl border border-white/20 bg-black/30 p-4 space-y-3 backdrop-blur-sm";
    const itemClass = "rounded-xl border border-white/15 bg-black/25 p-3";
    const buttonClass =
        "rounded-xl border border-white/25 bg-black/35 px-3 py-2 text-sm text-zinc-100 transition hover:border-white/40 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50";
    const inputClass =
        "rounded-xl border border-white/25 bg-black/35 px-3 py-2 text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40";
    const selectClass =
        "w-full rounded-xl border border-white/25 bg-black/35 px-3 py-2 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-400/40";

    const refresh = useCallback(async () => {
        const [s, t, i, c, supply] = await Promise.all([
            fetch("/api/admin/stats").then((r) => r.json()),
            fetch("/api/admin/redemptions?status=PENDING&limit=30").then((r) => r.json()),
            fetch("/api/admin/intents?status=PREPARED&limit=30").then((r) => r.json()),
            fetch("/api/admin/collections").then((r) => r.json()),
            fetch("/api/admin/supply").then((r) => r.json()),
        ]);

        setData({
            stats: s,
            pendingTickets: t.items ?? [],
            preparedIntents: i.items ?? [],
            collections: c.items ?? [],
            supply,
        });
    }, []);

    useEffect(() => {
        if (!data.supply) {
            void refresh();
        }
    }, [data.supply, refresh]);

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

            setTwitchMsg("OK: Subscription créée.");
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
            setTwitchMsg("Subscription supprimée.");
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
            setTwitchMsg("Copié.");
        } catch {
            setTwitchMsg("Copie impossible (permissions navigateur).");
        }
    }

    return (
        <div className="space-y-6 text-zinc-100">
            <button className={buttonClass} onClick={refresh}>
                Refresh
            </button>

            <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <Card title="Tickets PENDING" value={data.stats?.ticketsPending ?? "-"} />
                <Card title="Tickets CONSUMED" value={data.stats?.ticketsConsumed ?? "-"} />
                <Card title="Mints total" value={data.stats?.mintsTotal ?? "-"} />
                <Card title="Intents PREPARED" value={data.stats?.intentsPrepared ?? "-"} />
                <Card title="Intents FAILED" value={data.stats?.intentsFailed ?? "-"} />
                <Card title="Collections" value={data.stats?.collections ?? "-"} />
            </section>

            <section className={panelClass}>
                <div className="font-semibold">Supply collection</div>
                <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                    <div className="rounded-xl border border-white/15 bg-black/25 p-2">
                        Mints: <span className="font-semibold">{data.supply?.summary.mintedTotal ?? "..."}</span>
                    </div>
                    <div className="rounded-xl border border-white/15 bg-black/25 p-2">
                        Reserves: <span className="font-semibold">{data.supply?.summary.reservedTotal ?? "..."}</span>
                    </div>
                    <div className="rounded-xl border border-white/15 bg-black/25 p-2">
                        Restants (caps): <span className="font-semibold">{data.supply?.summary.cappedRemainingTotal ?? "..."}</span>
                    </div>
                    <div className="rounded-xl border border-white/15 bg-black/25 p-2">
                        Sold out: <span className="font-semibold">{data.supply?.summary.soldOutCount ?? "..."}</span>
                    </div>
                </div>

                <div className="max-h-80 space-y-2 overflow-auto pr-1">
                    {(data.supply?.items ?? []).map((item) => (
                        <div key={item.id} className={`${itemClass} flex items-start justify-between gap-3 text-xs`}>
                            <div className="min-w-0">
                                <div className="truncate text-sm font-medium">
                                    #{item.id} {item.name}
                                </div>
                                <div className="opacity-70">
                                    rareté: {item.rarity ?? "-"} | max: {item.maxSupply ?? "infini"}
                                </div>
                            </div>
                            <div className="shrink-0 text-right">
                                <div>mints: {item.minted}</div>
                                <div>reserves: {item.reserved}</div>
                                <div>restants: {item.remaining ?? "infini"}</div>
                                <div className={item.soldOut ? "text-red-400" : "opacity-70"}>{item.soldOut ? "SOLD OUT" : "mintable"}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className={panelClass}>
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
                                <span className="opacity-70">Core:</span> {data.stats.activeCollection.coreCollectionPubkey ?? "-"}
                            </div>
                        </>
                    ) : (
                        <span className="opacity-70">Aucune (fallback sur .env si présent)</span>
                    )}
                </div>
            </section>

            <section className={panelClass}>
                <div className="font-semibold">Twitch (Rewards + EventSub)</div>

                <div className="break-all text-xs opacity-70">
                    Webhook callback attendu: <span className="font-mono">{webhookCallback}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button className={buttonClass} onClick={fetchRewards} disabled={twitchBusy !== null}>
                        {twitchBusy === "rewards" ? "Chargement rewards..." : "Lister rewards"}
                    </button>

                    <button className={buttonClass} onClick={fetchSubscriptions} disabled={twitchBusy !== null}>
                        {twitchBusy === "subs" ? "Chargement subs..." : "Lister subscriptions"}
                    </button>

                    <button className={buttonClass} onClick={subscribeEventSub} disabled={twitchBusy !== null || !selectedRewardId}>
                        {twitchBusy === "subscribe" ? "Subscribe..." : "Créer subscription EventSub"}
                    </button>
                </div>

                {twitchMsg ? (
                    <div
                        className={`break-words rounded-xl border border-white/20 bg-black/35 px-3 py-2 text-sm ${isHttpErrorText(twitchMsg) ? "opacity-90" : "opacity-80"
                            }`}
                    >
                        {twitchMsg}
                    </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-2">
                    <div className={`${itemClass} space-y-2`}>
                        <div className="text-sm font-medium">Rewards</div>

                        {rewards.length ? (
                            <>
                                <select className={selectClass} value={selectedRewardId} onChange={(e) => setSelectedRewardId(e.target.value)}>
                                    {rewards.map((rw) => (
                                        <option key={rw.id} value={rw.id}>
                                            {rw.title} - {rw.cost} pts {rw.is_enabled ? "" : "(disabled)"}
                                        </option>
                                    ))}
                                </select>

                                <div className="break-all text-xs opacity-70">
                                    rewardId: <span className="font-mono">{selectedRewardId}</span>
                                </div>

                                <div className="flex gap-2">
                                    <button className={buttonClass} onClick={() => copyToClipboard(selectedRewardId)} disabled={twitchBusy !== null}>
                                        Copier l&apos;ID
                                    </button>
                                </div>

                                <div className="text-xs opacity-70">
                                    Ensuite tu mets cet ID dans <span className="font-mono">TWITCH_REWARD_ID</span> (Vercel env).
                                </div>
                            </>
                        ) : (
                            <div className="text-xs opacity-70">Clique &quot;Lister rewards&quot; (tu dois être loggé admin + scopes OK).</div>
                        )}
                    </div>

                    <div className={`${itemClass} space-y-2`}>
                        <div className="text-sm font-medium">Subscriptions</div>

                        {subs.length ? (
                            <div className="space-y-2">
                                {subs.map((s) => (
                                    <div key={s.id} className="flex items-start justify-between gap-3 rounded-xl border border-white/15 bg-black/25 p-2 text-xs">
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
                                            className={`${buttonClass} px-3 py-2 text-xs`}
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
                            <div className="text-xs opacity-70">Clique &quot;Lister subscriptions&quot;.</div>
                        )}
                    </div>
                </div>
            </section>

            <section className={panelClass}>
                <div className="font-semibold">Seed tickets (test)</div>
                <div className="grid gap-2 md:grid-cols-3">
                    <input
                        className={inputClass}
                        placeholder="twitchUserId (viewer)"
                        value={seedUserId}
                        onChange={(e) => setSeedUserId(e.target.value)}
                    />
                    <input className={inputClass} type="number" value={seedCount} onChange={(e) => setSeedCount(Number(e.target.value))} />
                    <button className={buttonClass} onClick={seedTickets}>
                        Ajouter
                    </button>
                </div>
                <div className="text-xs opacity-70">Astuce: récupère ton twitchUserId via /api/me (en étant loggé).</div>
            </section>

            <section className={panelClass}>
                <div className="font-semibold">Collections</div>
                <div className={`${itemClass} text-xs opacity-80`}>
                    <div>
                        <span className="font-medium">Créer + activer</span> ajoute une collection en base et la passe active immediatement.
                    </div>
                    <div className="mt-1">Conséquence: les prochains mints utiliseront ce Merkle Tree/Core Collection (priorité sur la config `.env`).</div>
                    <div className="mt-1 opacity-70">Les mints déjà créés ne changent pas.</div>
                </div>
                <div className="grid gap-2 md:grid-cols-4">
                    <input className={inputClass} placeholder="Nom" value={newColName} onChange={(e) => setNewColName(e.target.value)} />
                    <input className={inputClass} placeholder="Merkle Tree pubkey" value={newTree} onChange={(e) => setNewTree(e.target.value)} />
                    <input
                        className={inputClass}
                        placeholder="Core Collection pubkey (optionnel)"
                        value={newCore}
                        onChange={(e) => setNewCore(e.target.value)}
                    />
                    <button className={buttonClass} onClick={createCollection}>
                        Créer + activer
                    </button>
                </div>

                <div className="space-y-2">
                    {data.collections.map((c) => (
                        <div key={c._id} className={`${itemClass} flex flex-col gap-2 md:flex-row md:items-center md:justify-between`}>
                            <div className="text-sm">
                                <div className="font-medium">
                                    {c.name} {c.isActive ? <span className="opacity-70">(active)</span> : null}
                                </div>
                                <div className="break-all opacity-70">Tree: {c.merkleTreePubkey}</div>
                                <div className="break-all opacity-70">Core: {c.coreCollectionPubkey ?? "-"}</div>
                            </div>
                            <div className="flex gap-2">
                                {!c.isActive ? (
                                    <button className={buttonClass} onClick={() => setActive(c._id)}>
                                        Set active
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className={panelClass}>
                <div className="font-semibold">Tickets PENDING (30 derniers)</div>
                <div className="space-y-2">
                    {data.pendingTickets.map((t) => (
                        <div key={t.redemptionId} className={`${itemClass} flex items-center justify-between gap-3`}>
                            <div className="break-all text-xs">
                                <div>
                                    <span className="opacity-70">user:</span> {t.twitchUserId}
                                </div>
                                <div>
                                    <span className="opacity-70">redemption:</span> {t.redemptionId}
                                </div>
                                <div>
                                    <span className="opacity-70">locked:</span> {t.lockedByIntentId ?? "-"}
                                </div>
                            </div>
                            <button className={buttonClass} onClick={() => forceUnlockTicket(t.redemptionId)}>
                                Unlock
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            <section className={panelClass}>
                <div className="font-semibold">Intents PREPARED (30 derniers)</div>
                <div className="space-y-2">
                    {data.preparedIntents.map((i) => (
                        <div key={i.intentId} className={`${itemClass} flex items-center justify-between gap-3`}>
                            <div className="break-all text-xs">
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
                            <button className={buttonClass} onClick={() => unlockIntent(i.intentId)}>
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
        <div className="rounded-2xl border border-white/20 bg-black/30 p-4 backdrop-blur-sm">
            <div className="text-sm opacity-70">{title}</div>
            <div className="text-2xl font-semibold">{value}</div>
        </div>
    );
}


