import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Mint } from "@/lib/models";
import { MintPanel } from "@/components/mint-panel";
import { FairnessPanel } from "@/components/fairness-panel";
import PageShell from "@/components/page-shell";

interface ExtendedUser {
    id?: string | null;
    name?: string | null;
    displayName?: string | null;
}

type LatestMintProof = {
    stickerId?: string;
    mintTx?: string;
    createdAt?: string | Date;
    randomnessProvider?: string | null;
    randomnessQueuePubkey?: string | null;
    randomnessAccount?: string | null;
    randomnessCommitTx?: string | null;
    randomnessRevealTx?: string | null;
    randomnessCloseTx?: string | null;
    randomnessValueHex?: string | null;
    drawIndex?: number | null;
    drawAvailableStickerIds?: string[];
} | null;

function solscanTxUrl(signature?: string | null) {
    const sig = String(signature ?? "").trim();
    if (!sig) return null;
    const cluster = process.env.NEXT_PUBLIC_SOLSCAN_CLUSTER?.trim() ?? "devnet";
    const suffix = cluster ? `?cluster=${encodeURIComponent(cluster)}` : "";
    return `https://solscan.io/tx/${sig}${suffix}`;
}

export default async function HomePage() {
    const session = await auth();

    if (!session?.user) {
        return (
            <PageShell>
                <main className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6 lg:p-10">
                    <section className="grid gap-6 rounded-3xl border border-white/10 bg-black/30 p-6 shadow-[0_20px_80px_rgba(0,0,0,.35)] backdrop-blur md:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10">
                        <div className="space-y-4">
                            <p className="text-xs uppercase tracking-[0.2em] text-white/60">Collection Twitch</p>
                            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Mint tes cartes et complete ton album</h1>
                            <p className="max-w-xl text-sm text-white/75 sm:text-base">
                                Gagne des tickets via les points de chaine Twitch, connecte ton compte,
                                ouvre des boosters et collectionne les 44 cartes.
                            </p>

                            <div className="pt-1">
                                <Link
                                    className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white px-5 py-3 text-sm font-medium text-zinc-900 transition hover:bg-white/90"
                                    href="/api/auth/signin/twitch?callbackUrl=%2F"
                                >
                                    Se connecter avec Twitch
                                </Link>
                            </div>
                        </div>

                        <aside className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                            <p className="text-xs uppercase tracking-[0.16em] text-white/60">Comment demarrer</p>
                            <ol className="mt-4 space-y-3 text-sm text-white/80">
                                <li>1. Recupere un ticket via les rewards Twitch.</li>
                                <li>2. Connecte ton compte et ton wallet Solana.</li>
                                <li>3. Ouvre un booster pour minter une carte.</li>
                                <li>4. Complete ton album et echange tes doublons.</li>
                            </ol>
                        </aside>
                    </section>

                    <section className="grid gap-3 sm:grid-cols-3">
                        <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-2xl font-semibold">44</p>
                            <p className="text-sm text-white/70">cartes a collectionner</p>
                        </article>
                        <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-2xl font-semibold">1 ticket</p>
                            <p className="text-sm text-white/70">par mint de booster</p>
                        </article>
                        <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-2xl font-semibold">Echanges</p>
                            <p className="text-sm text-white/70">dans la marketplace communautaire</p>
                        </article>
                    </section>
                </main>
            </PageShell>
        );
    }

    const user = session.user as ExtendedUser;
    const twitchUserId = String(user.id ?? "").trim();
    let latestMintProof: LatestMintProof = null;

    if (twitchUserId) {
        try {
            await db();
            latestMintProof = (await Mint.findOne({ twitchUserId })
                .sort({ createdAt: -1 })
                .select({
                    stickerId: 1,
                    mintTx: 1,
                    createdAt: 1,
                    randomnessProvider: 1,
                    randomnessQueuePubkey: 1,
                    randomnessAccount: 1,
                    randomnessCommitTx: 1,
                    randomnessRevealTx: 1,
                    randomnessCloseTx: 1,
                    randomnessValueHex: 1,
                    drawIndex: 1,
                    drawAvailableStickerIds: 1,
                })
                .lean()) as LatestMintProof;
        } catch (error) {
            console.error("home fairness block failed", error);
        }
    }

    const latestMintTx = String(latestMintProof?.mintTx ?? "").trim();
    const hasProof = Boolean(
        latestMintProof?.randomnessProvider &&
        latestMintProof?.randomnessValueHex &&
        latestMintTx,
    );

    const commitUrl = solscanTxUrl(latestMintProof?.randomnessCommitTx);
    const revealUrl = solscanTxUrl(latestMintProof?.randomnessRevealTx);
    const closeUrl = solscanTxUrl(latestMintProof?.randomnessCloseTx);
    const mintUrl = solscanTxUrl(latestMintTx);
    const proofPath = hasProof ? `/api/mint/proof/${latestMintTx}` : null;

    return (
        <PageShell>
            <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-10">
                <section className="rounded-3xl border border-white/10 bg-black/30 p-6 shadow-[0_20px_80px_rgba(0,0,0,.35)] backdrop-blur md:p-8">
                    <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.2em] text-white/60">Panini Mint</p>
                        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Bienvenue, {user.displayName ?? user.name}</h1>
                        <p className="text-sm text-white/75 sm:text-base">
                            Ouvre des boosters, recupere des cartes rares et avance dans ton album.
                        </p>
                    </div>
                </section>

                <section className="rounded-3xl border border-emerald-300/20 bg-emerald-950/20 p-5 backdrop-blur md:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">Fair mint</p>
                            <h2 className="text-xl font-semibold">Random verifiable (Switchboard)</h2>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Link
                                className="rounded-xl border border-white/20 px-3 py-2 text-sm transition hover:bg-white/10"
                                href="/fairness"
                            >
                                Page fairness
                            </Link>
                            <a
                                className="rounded-xl border border-white/20 px-3 py-2 text-sm transition hover:bg-white/10"
                                href="https://docs.switchboard.xyz/docs-by-chain/solana-svm/randomness/randomness-tutorial"
                                target="_blank"
                                rel="noreferrer"
                            >
                                Doc Switchboard
                            </a>
                        </div>
                    </div>

                    <p className="mt-3 text-sm text-white/80">
                        Le tirage utilise une random on-chain verifiable. La carte est choisie de facon uniforme
                        parmi les IDs encore mintables, puis stockee avec sa preuve.
                    </p>

                    <FairnessPanel
                        hasProof={hasProof}
                        stickerId={latestMintProof?.stickerId ?? null}
                        mintTx={latestMintTx}
                        queuePubkey={latestMintProof?.randomnessQueuePubkey ?? null}
                        randomnessAccount={latestMintProof?.randomnessAccount ?? null}
                        drawIndex={latestMintProof?.drawIndex ?? null}
                        availableCount={
                            Array.isArray(latestMintProof?.drawAvailableStickerIds)
                                ? latestMintProof.drawAvailableStickerIds.length
                                : null
                        }
                        proofPath={proofPath}
                        mintUrl={mintUrl}
                        commitUrl={commitUrl}
                        revealUrl={revealUrl}
                        closeUrl={closeUrl}
                    />
                </section>

                <MintPanel />
            </main>
        </PageShell>
    );
}
