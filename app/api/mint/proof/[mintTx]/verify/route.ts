import { NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { db } from "@/lib/db";
import { Mint } from "@/lib/models";
import { uniformIndexFromHex } from "@/lib/stickers";

type MintProofRow = {
  mintTx?: string;
  stickerId?: string;
  randomnessProvider?: string | null;
  randomnessCommitTx?: string | null;
  randomnessRevealTx?: string | null;
  randomnessCloseTx?: string | null;
  randomnessValueHex?: string | null;
  drawAvailableStickerIds?: string[];
  drawIndex?: number | null;
};

type TxCheck = {
  label: "mint" | "commit" | "reveal" | "close";
  signature: string | null;
  present: boolean;
  found: boolean;
  ok: boolean;
  confirmationStatus: string | null;
  slot: number | null;
  err: string | null;
  solscanUrl: string | null;
};

function toSolscanUrl(signature?: string | null) {
  const sig = String(signature ?? "").trim();
  if (!sig) return null;
  const cluster = process.env.NEXT_PUBLIC_SOLSCAN_CLUSTER?.trim() ?? "devnet";
  const suffix = cluster ? `?cluster=${encodeURIComponent(cluster)}` : "";
  return `https://solscan.io/tx/${sig}${suffix}`;
}

async function checkTx(
  connection: Connection,
  label: TxCheck["label"],
  signature: string | null | undefined,
): Promise<TxCheck> {
  const sig = String(signature ?? "").trim();
  if (!sig) {
    return {
      label,
      signature: null,
      present: false,
      found: false,
      ok: false,
      confirmationStatus: null,
      slot: null,
      err: null,
      solscanUrl: null,
    };
  }

  const statuses = await connection.getSignatureStatuses([sig], {
    searchTransactionHistory: true,
  });
  const status = statuses.value[0] ?? null;
  const err = status?.err ? JSON.stringify(status.err) : null;

  return {
    label,
    signature: sig,
    present: true,
    found: Boolean(status),
    ok: Boolean(status && !status.err),
    confirmationStatus: status?.confirmationStatus ?? null,
    slot: typeof status?.slot === "number" ? status.slot : null,
    err,
    solscanUrl: toSolscanUrl(sig),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mintTx: string }> },
) {
  const { mintTx } = await params;
  const sig = decodeURIComponent(mintTx ?? "").trim();
  if (!sig) return new NextResponse("Missing mintTx", { status: 400 });

  await db();

  const mint = (await Mint.findOne({ mintTx: sig }).lean()) as MintProofRow | null;
  if (!mint) return new NextResponse("Mint not found", { status: 404 });

  const randomHex = String(mint.randomnessValueHex ?? "").trim();
  const provider = String(mint.randomnessProvider ?? "").trim().toLowerCase();
  const isSwitchboard = provider === "switchboard";
  const availableStickerIds = Array.isArray(mint.drawAvailableStickerIds)
    ? mint.drawAvailableStickerIds.map(String)
    : [];
  const storedStickerId = String(mint.stickerId ?? "").trim();
  const storedDrawIndex =
    typeof mint.drawIndex === "number" && Number.isFinite(mint.drawIndex)
      ? mint.drawIndex
      : null;

  let computedIndex: number | null = null;
  let expectedStickerId: string | null = null;
  let algorithmError: string | null = null;

  try {
    if (!randomHex) throw new Error("randomHex manquant");
    if (!availableStickerIds.length) throw new Error("availableStickerIds vide");
    computedIndex = uniformIndexFromHex(randomHex, availableStickerIds.length);
    expectedStickerId = String(availableStickerIds[computedIndex] ?? "");
  } catch (e) {
    algorithmError = e instanceof Error ? e.message : "Erreur calcul";
  }

  const indexMatches =
    computedIndex !== null &&
    storedDrawIndex !== null &&
    computedIndex === storedDrawIndex;
  const stickerMatches =
    expectedStickerId !== null && Boolean(storedStickerId) && expectedStickerId === storedStickerId;
  const algorithmMatches = indexMatches && stickerMatches;

  const rpcUrl = process.env.HELIUS_RPC_URL || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  const [mintCheck, commitCheck, revealCheck, closeCheck] = await Promise.all([
    checkTx(connection, "mint", mint.mintTx ?? sig),
    checkTx(connection, "commit", mint.randomnessCommitTx ?? null),
    checkTx(connection, "reveal", mint.randomnessRevealTx ?? null),
    checkTx(connection, "close", mint.randomnessCloseTx ?? null),
  ]);

  const requiredTxOk = isSwitchboard
    ? mintCheck.ok && commitCheck.ok && revealCheck.ok
    : mintCheck.ok;
  const randomPresent = Boolean(randomHex);
  const overall = randomPresent && algorithmMatches && requiredTxOk;

  return NextResponse.json({
    mintTx: mint.mintTx ?? sig,
    stickerId: storedStickerId,
    provider: provider || null,
    checks: {
      randomPresent,
      algorithmMatches,
      requiredTxOk,
      overall,
      requiredTxRule: isSwitchboard
        ? "mint + commit + reveal must be confirmed"
        : "mint must be confirmed",
    },
    algorithm: {
      randomHex: randomHex || null,
      availableCount: availableStickerIds.length,
      availableStickerIds,
      storedDrawIndex,
      computedIndex,
      storedStickerId: storedStickerId || null,
      expectedStickerId,
      indexMatches,
      stickerMatches,
      error: algorithmError,
      formula: "index = BigInt(randomHex) % availableStickerIds.length",
    },
    transactions: {
      mint: mintCheck,
      commit: commitCheck,
      reveal: revealCheck,
      close: closeCheck,
    },
  });
}
