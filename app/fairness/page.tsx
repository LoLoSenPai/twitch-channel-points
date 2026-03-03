import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Mint } from "@/lib/models";
import PageShell from "@/components/page-shell";
import { FairnessPanel } from "@/components/fairness-panel";

type ExtendedUser = {
  id?: string | null;
  name?: string | null;
  displayName?: string | null;
};

type LatestMintProof = {
  stickerId?: string;
  mintTx?: string;
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
  const cluster = process.env.NEXT_PUBLIC_SOLSCAN_CLUSTER?.trim() ?? "";
  const suffix = cluster ? `?cluster=${encodeURIComponent(cluster)}` : "";
  return `https://solscan.io/tx/${sig}${suffix}`;
}

export default async function FairnessPage() {
  const randomnessMode = String(process.env.MINT_RANDOMNESS_MODE ?? "local")
    .trim()
    .toLowerCase();
  if (randomnessMode !== "switchboard") {
    notFound();
  }

  const session = await auth();
  const user = session?.user as ExtendedUser | undefined;

  const twitchUserId = String(user?.id ?? "").trim();
  let latestMintProof: LatestMintProof = null;

  if (twitchUserId) {
    await db();
    latestMintProof = (await Mint.findOne({ twitchUserId })
      .sort({ createdAt: -1 })
      .select({
        stickerId: 1,
        mintTx: 1,
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
  }

  const latestMintTx = String(latestMintProof?.mintTx ?? "").trim();
  const hasProof = Boolean(
    latestMintProof?.randomnessProvider && latestMintProof?.randomnessValueHex && latestMintTx
  );
  const proofPath = hasProof ? `/api/mint/proof/${latestMintTx}` : null;

  return (
    <PageShell>
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-10">
        <section className="site-surface rounded-3xl p-6 md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">Fairness</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Vérifier le tirage de mint
          </h1>
          <p className="site-muted mt-3 text-sm sm:text-base">
            Le mint est tiré avec une random vérifiable (Switchboard), puis le NFT est choisi
            uniformément parmi les IDs encore mintables.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              className="site-btn rounded-xl px-3 py-2 text-sm"
              href="https://docs.switchboard.xyz/docs-by-chain/solana-svm/randomness/randomness-tutorial"
              target="_blank"
              rel="noreferrer"
            >
              Doc Switchboard
            </a>
          </div>
        </section>

        {!session?.user ? (
          <section className="site-surface-soft rounded-2xl p-5 text-sm">
            Connecte-toi pour voir la preuve de ton dernier mint.
          </section>
        ) : null}

        <section className="site-surface rounded-3xl p-5 md:p-6">
          <h2 className="text-xl font-semibold">Dernière preuve</h2>
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
            mintUrl={solscanTxUrl(latestMintTx)}
            commitUrl={solscanTxUrl(latestMintProof?.randomnessCommitTx)}
            revealUrl={solscanTxUrl(latestMintProof?.randomnessRevealTx)}
            closeUrl={solscanTxUrl(latestMintProof?.randomnessCloseTx)}
          />
        </section>

        <section className="site-surface-soft rounded-3xl p-5 md:p-6">
          <h2 className="text-xl font-semibold">Comment vérifier</h2>
          <ol className="site-muted mt-3 list-decimal space-y-2 pl-5 text-sm">
            <li>Clique d&apos;abord sur Vérifier automatiquement dans Dernière preuve.</li>
            <li>Si les checks sont &quot;OK&quot;, le mint est cohérent (random + calcul + tx).</li>
            <li>Tu peux ensuite ouvrir Mint tx / Commit tx / Reveal tx pour un audit manuel.</li>
            <li>
              L&apos;algorithme détaillé reste visible dans les &quot;détails techniques&quot; et le JSON de preuve.
            </li>
          </ol>
          <div className="site-surface mt-4 rounded-xl p-3 font-mono text-xs">
            GET /api/mint/proof/{`{mintTx}`}
          </div>
        </section>
      </main>
    </PageShell>
  );
}
