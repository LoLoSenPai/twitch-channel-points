import Link from "next/link";
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
  const cluster = process.env.NEXT_PUBLIC_SOLSCAN_CLUSTER?.trim() ?? "devnet";
  const suffix = cluster ? `?cluster=${encodeURIComponent(cluster)}` : "";
  return `https://solscan.io/tx/${sig}${suffix}`;
}

export default async function FairnessPage() {
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
    latestMintProof?.randomnessProvider &&
      latestMintProof?.randomnessValueHex &&
      latestMintTx,
  );
  const proofPath = hasProof ? `/api/mint/proof/${latestMintTx}` : null;

  return (
    <PageShell>
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-10">
        <section className="rounded-3xl border border-white/10 bg-black/30 p-6 shadow-[0_20px_80px_rgba(0,0,0,.35)] backdrop-blur md:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-200/70">
            Fairness
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Verifier le tirage de mint
          </h1>
          <p className="mt-3 text-sm text-white/80 sm:text-base">
            Les mints utilisent une random verifiable (Switchboard). Le sticker
            est ensuite choisi uniformement parmi les IDs encore mintables. Il
            n y a plus de poids de rarete.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              className="rounded-xl border border-white/20 px-3 py-2 text-sm transition hover:bg-white/10"
              href="https://docs.switchboard.xyz/docs-by-chain/solana-svm/randomness/randomness-tutorial"
              target="_blank"
              rel="noreferrer"
            >
              Doc Switchboard
            </a>
            <Link
              className="rounded-xl border border-white/20 px-3 py-2 text-sm transition hover:bg-white/10"
              href="/"
            >
              Retour accueil
            </Link>
          </div>
        </section>

        {!session?.user ? (
          <section className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm text-white/80">
            Connecte toi pour voir la preuve de ton dernier mint.
          </section>
        ) : null}

        <section className="rounded-3xl border border-white/10 bg-black/25 p-5 md:p-6">
          <h2 className="text-xl font-semibold">Derniere preuve</h2>
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

        <section className="rounded-3xl border border-white/10 bg-black/20 p-5 md:p-6">
          <h2 className="text-xl font-semibold">Comment verifier</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-white/80">
            <li>Ouvre la preuve JSON.</li>
            <li>Recupere `randomHex` et la liste `availableStickerIds`.</li>
            <li>
              Applique la regle: `index = BigInt(randomHex) %
              availableStickerIds.length`.
            </li>
            <li>Verifie que `availableStickerIds[index]` correspond au sticker mint.</li>
            <li>Controle les tx `commit` et `reveal` sur Solscan.</li>
          </ol>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-xs text-white/75">
            GET /api/mint/proof/{`{mintTx}`}
          </div>
        </section>
      </main>
    </PageShell>
  );
}
