import { NextResponse } from "next/server";
import bs58 from "bs58";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Collection, Redemption, MintIntent, Mint } from "@/lib/models";
import { getSticker, type StickerRarity } from "@/lib/stickers";
import {
  MINT_BACKEND_FLOW_VERSION,
  MINT_PROGRAM_CLAIM_MINT_DISCRIMINATOR,
  MINT_PROGRAM_FLOW_VERSION,
  findMintProgramClaimReceiptPda,
  getMintProgramIdFromEnv,
} from "@/lib/solana/mint-program";
import { umiServer } from "@/lib/solana/umi";
import { mintV2 } from "@metaplex-foundation/mpl-bubblegum";
import { none, publicKey, some } from "@metaplex-foundation/umi";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  ParsedInstruction,
  PartiallyDecodedInstruction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

type SessionUser = {
  id?: string;
  name?: string;
  displayName?: string;
};

type ExtendedSessionUser = SessionUser & {
  displayName?: string;
};

type IntentDoc = {
  wallet: string;
  stickerId: string | number;
  redemptionId: string;
  status: "PREPARED" | "SUBMITTED" | "DONE" | "FAILED";
  flowVersion?: string | null;
  preparedTxB64?: string | null;
  claimHash?: string | null;
  permitExpiresAt?: Date | string | null;
  submittedTxSig?: string | null;
  mintTx?: string | null;
  randomnessProvider?: string | null;
  randomnessQueuePubkey?: string | null;
  randomnessAccount?: string | null;
  randomnessCommitTx?: string | null;
  randomnessRevealTx?: string | null;
  randomnessCloseTx?: string | null;
  randomnessValueHex?: string | null;
  randomnessSeedSlot?: number | null;
  randomnessRevealSlot?: number | null;
  drawAvailableStickerIds?: string[];
  drawIndex?: number | null;
};

type NotifyPayload = {
  displayName: string;
  stickerName: string;
  stickerId: string;
  rarity: StickerRarity;
  tx: string;
};

function safePublicKey(input?: string | null) {
  const v = (input ?? "").trim();
  if (!v) return null;
  try {
    return publicKey(v);
  } catch {
    return null;
  }
}

function authorityKeypairFromEnv() {
  const raw = String(process.env.SOLANA_AUTHORITY_SECRET ?? "").trim();
  if (!raw) throw new Error("Missing SOLANA_AUTHORITY_SECRET");

  let secret: Uint8Array;
  try {
    const parsed = JSON.parse(raw) as number[];
    secret = Uint8Array.from(parsed);
  } catch {
    throw new Error("Invalid SOLANA_AUTHORITY_SECRET format");
  }

  return Keypair.fromSecretKey(secret);
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type CanonicalIx = {
  programId: string;
  keys: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  dataB64: string;
};

const BUBBLEGUM_PROGRAM_ID = "BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY";

const ALLOWED_WALLET_EXTRA_PROGRAMS = new Set<string>([
  ComputeBudgetProgram.programId.toBase58(),
  // SPL Memo program.
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
  // Phantom wallet safety/guard wrapper program (seen in signed tx on some clients).
  "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95",
  BUBBLEGUM_PROGRAM_ID,
]);

function normalizeMessageForComparison(message: VersionedTransaction["message"]) {
  const asAny = message as unknown as Record<string, unknown>;

  // V0-like message (compiled instructions + static keys + LUTs)
  if (
    Array.isArray(asAny.staticAccountKeys) &&
    Array.isArray(asAny.compiledInstructions)
  ) {
    return {
      kind: "v0",
      header: asAny.header as Json,
      staticAccountKeys: (asAny.staticAccountKeys as Array<{ toBase58?: () => string }>).map(
        (k) => (typeof k?.toBase58 === "function" ? k.toBase58() : String(k))
      ),
      compiledInstructions: (asAny.compiledInstructions as Array<Record<string, unknown>>).map(
        (ix) => ({
          programIdIndex: Number(ix.programIdIndex ?? -1),
          accountKeyIndexes: Array.isArray(ix.accountKeyIndexes)
            ? (ix.accountKeyIndexes as unknown[]).map((n) => Number(n))
            : [],
          data: Buffer.from((ix.data as Uint8Array) ?? new Uint8Array()).toString("base64"),
        })
      ),
      addressTableLookups: Array.isArray(asAny.addressTableLookups)
        ? (asAny.addressTableLookups as Array<Record<string, unknown>>).map((lut) => ({
            accountKey:
              typeof (lut.accountKey as { toBase58?: () => string })?.toBase58 === "function"
                ? (lut.accountKey as { toBase58: () => string }).toBase58()
                : String(lut.accountKey ?? ""),
            writableIndexes: Array.isArray(lut.writableIndexes)
              ? (lut.writableIndexes as unknown[]).map((n) => Number(n))
              : [],
            readonlyIndexes: Array.isArray(lut.readonlyIndexes)
              ? (lut.readonlyIndexes as unknown[]).map((n) => Number(n))
              : [],
          }))
        : [],
    };
  }

  // Legacy-like message (instructions + account keys)
  return {
    kind: "legacy",
    header: asAny.header as Json,
    accountKeys: Array.isArray(asAny.accountKeys)
      ? (asAny.accountKeys as Array<{ toBase58?: () => string }>).map((k) =>
          typeof k?.toBase58 === "function" ? k.toBase58() : String(k)
        )
      : [],
    instructions: Array.isArray(asAny.instructions)
      ? (asAny.instructions as Array<Record<string, unknown>>).map((ix) => ({
          programIdIndex: Number(ix.programIdIndex ?? -1),
          accounts: Array.isArray(ix.accounts)
            ? (ix.accounts as unknown[]).map((n) => Number(n))
            : [],
          data: String(ix.data ?? ""),
        }))
      : [],
  };
}

function canonicalizeInstruction(ix: TransactionInstruction): CanonicalIx {
  return {
    programId: ix.programId.toBase58(),
    keys: ix.keys.map((k) => ({
      pubkey: k.pubkey.toBase58(),
      isSigner: Boolean(k.isSigner),
      isWritable: Boolean(k.isWritable),
    })),
    dataB64: Buffer.from(ix.data).toString("base64"),
  };
}

function canonicalizeMessageForSemanticCompare(
  message: VersionedTransaction["message"],
) {
  const decompiled = TransactionMessage.decompile(message, {
    addressLookupTableAccounts: [],
  });

  return {
    payer: decompiled.payerKey.toBase58(),
    ixs: decompiled.instructions.map(canonicalizeInstruction),
  };
}

function semanticMatchAllowingWalletExtras(
  signed: VersionedTransaction["message"],
  prepared: VersionedTransaction["message"],
) {
  const signedCanon = canonicalizeMessageForSemanticCompare(signed);
  const preparedCanon = canonicalizeMessageForSemanticCompare(prepared);

  if (signedCanon.payer !== preparedCanon.payer) return false;
  const signerPubkeys = new Set<string>();
  for (const ix of signedCanon.ixs) {
    for (const key of ix.keys) {
      if (key.isSigner) signerPubkeys.add(key.pubkey);
    }
  }

  // Keep exactly one non-wallet signer: the user payer.
  // This blocks malicious extras requiring backend authority signature.
  if (signerPubkeys.size !== 1 || !signerPubkeys.has(signedCanon.payer)) {
    return false;
  }

  // Subsequence match: prepared instructions must appear in order and unchanged.
  let p = 0;
  for (let s = 0; s < signedCanon.ixs.length; s += 1) {
    if (p < preparedCanon.ixs.length) {
      const signedIx = signedCanon.ixs[s];
      const preparedIx = preparedCanon.ixs[p];
      if (JSON.stringify(signedIx) === JSON.stringify(preparedIx)) {
        p += 1;
        continue;
      }
    }

    // Any non-matching signed instruction is an "extra" and must be explicitly whitelisted.
    const extraIx = signedCanon.ixs[s];
    if (!ALLOWED_WALLET_EXTRA_PROGRAMS.has(extraIx.programId)) {
      return false;
    }
  }

  return p === preparedCanon.ixs.length;
}

function safeProgramList(message: VersionedTransaction["message"]) {
  try {
    return canonicalizeMessageForSemanticCompare(message).ixs.map((ix) => ix.programId);
  } catch {
    return [];
  }
}

function safePayer(message: VersionedTransaction["message"]) {
  try {
    return canonicalizeMessageForSemanticCompare(message).payer;
  } catch {
    return null;
  }
}

function messagesMatchStrictOrIgnoringBlockhash(
  signed: VersionedTransaction["message"],
  prepared: VersionedTransaction["message"]
) {
  const signedBytes = Buffer.from(signed.serialize());
  const preparedBytes = Buffer.from(prepared.serialize());
  if (signedBytes.equals(preparedBytes)) return true;

  const signedNorm = normalizeMessageForComparison(signed);
  const preparedNorm = normalizeMessageForComparison(prepared);
  if (JSON.stringify(signedNorm) === JSON.stringify(preparedNorm)) return true;

  // Some wallets may recompile message keys and inject safe extras.
  // Accept only semantic equivalence with strict whitelist for extras.
  try {
    return semanticMatchAllowingWalletExtras(signed, prepared);
  } catch {
    return false;
  }
}

async function notifyTwitchBot(payload: NotifyPayload) {
  const url = process.env.TWITCH_BOT_NOTIFY_URL; // ex: https://...plesk.page/notify

  // ✅ debug minimal (visible dans les logs Vercel)
  if (!url) {
    console.log("[notify] TWITCH_BOT_NOTIFY_URL missing");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    console.log("[notify] POST", url);

    const res = await fetch(url, {
      method: "POST",
      headers: {
  "content-type": "application/json",
  "x-bot-token": process.env.TWITCH_BOT_TOKEN ?? "",
},
      body: JSON.stringify(payload),
      signal: controller.signal,
      // pas de cache, au cas où
      cache: "no-store",
    });

    console.log("[notify] status", res.status);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log("[notify] body", text.slice(0, 300));
    }
  } catch (e) {
    // ✅ log pour voir l’erreur dans Vercel (DNS, TLS, timeout, etc.)
    console.log("[notify] error", (e as Error)?.message ?? e);
  } finally {
    clearTimeout(timeout);
  }
}

async function finalizeMintSuccess(params: {
  intentId: string;
  twitchUserId: string;
  intent: IntentDoc;
  txSig: string;
  displayName: string;
}) {
  const { intentId, twitchUserId, intent, txSig, displayName } = params;

  const existingMint = await Mint.findOne({ mintTx: txSig }).lean();
  if (!existingMint) {
    await Mint.create({
      twitchUserId,
      wallet: intent.wallet,
      stickerId: String(intent.stickerId),
      mintTx: txSig,
      randomnessProvider: intent.randomnessProvider ?? null,
      randomnessQueuePubkey: intent.randomnessQueuePubkey ?? null,
      randomnessAccount: intent.randomnessAccount ?? null,
      randomnessCommitTx: intent.randomnessCommitTx ?? null,
      randomnessRevealTx: intent.randomnessRevealTx ?? null,
      randomnessCloseTx: intent.randomnessCloseTx ?? null,
      randomnessValueHex: intent.randomnessValueHex ?? null,
      randomnessSeedSlot:
        typeof intent.randomnessSeedSlot === "number"
          ? intent.randomnessSeedSlot
          : null,
      randomnessRevealSlot:
        typeof intent.randomnessRevealSlot === "number"
          ? intent.randomnessRevealSlot
          : null,
      drawAvailableStickerIds: Array.isArray(intent.drawAvailableStickerIds)
        ? intent.drawAvailableStickerIds.map(String)
        : [],
      drawIndex: typeof intent.drawIndex === "number" ? intent.drawIndex : null,
    });
  }

  await Redemption.updateOne(
    { redemptionId: intent.redemptionId },
    { $set: { status: "CONSUMED", consumedAt: new Date(), mintTx: txSig } },
  );

  await MintIntent.updateOne(
    { intentId },
    { $set: { status: "DONE", mintTx: txSig, submittedTxSig: txSig, error: null } },
  );

  let stickerName = `Panini #${String(intent.stickerId)}`;
  try {
    const base = process.env.METADATA_BASE_URI;
    if (base) {
      const metaUrl = `${base}/${String(intent.stickerId)}.json`;
      const metaRes = await fetch(metaUrl, { cache: "no-store" });
      if (metaRes.ok) {
        const meta = (await metaRes.json()) as { name?: string };
        if (meta?.name) stickerName = meta.name;
      }
    }
  } catch {}

  const payload: NotifyPayload = {
    displayName,
    stickerName,
    stickerId: String(intent.stickerId),
    rarity:
      getSticker(String(intent.stickerId))?.rarity ??
      (String(intent.stickerId) === "3"
        ? "SSR"
        : String(intent.stickerId) === "2"
          ? "SR"
          : "R"),
    tx: txSig,
  };

  await notifyTwitchBot(payload);
}

function hasMintProgramClaimMintInstruction(
  instructions: Array<ParsedInstruction | PartiallyDecodedInstruction>,
  mintProgramId: string,
) {
  return instructions.some((ix) => {
    if (ix.programId.toBase58() !== mintProgramId) return false;
    if (!("data" in ix) || typeof ix.data !== "string") return false;

    try {
      const data = Buffer.from(bs58.decode(ix.data));
      return data.subarray(0, 8).equals(
        Buffer.from(MINT_PROGRAM_CLAIM_MINT_DISCRIMINATOR),
      );
    } catch {
      return false;
    }
  });
}

export async function POST(req: Request) {
  const session = await auth();
  const twitchUserId = (session?.user as SessionUser)?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const intentId =
    typeof body?.intentId === "string" ? body.intentId.trim() : undefined;
  const signedTxB64 =
    typeof body?.signedTxB64 === "string" ? body.signedTxB64 : undefined;
  const txSig = typeof body?.txSig === "string" ? body.txSig.trim() : undefined;

  if (!intentId) {
    return new NextResponse("Missing params", { status: 400 });
  }

  await db();

  const intent = (await MintIntent.findOne({
    intentId,
    twitchUserId,
    status: { $in: ["PREPARED", "SUBMITTED", "DONE"] },
  }).lean()) as (IntentDoc & { _id?: unknown }) | null;

  if (!intent) {
    return new NextResponse("Bad intent", { status: 409 });
  }

  const rpcUrl = process.env.HELIUS_RPC_URL!;
  const connection = new Connection(rpcUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });
  const displayName =
    (session?.user as ExtendedSessionUser)?.displayName ??
    (session?.user as ExtendedSessionUser)?.name ??
    "Quelqu'un";
  let backendSubmittedTxSig: string | null = null;

  try {
    if (intent.status === "DONE" && intent.mintTx) {
      return NextResponse.json({
        ok: true,
        tx: String(intent.mintTx),
        stickerId: String(intent.stickerId),
        proof: {
          provider: intent.randomnessProvider ?? null,
          queuePubkey: intent.randomnessQueuePubkey ?? null,
          randomnessAccount: intent.randomnessAccount ?? null,
          commitTx: intent.randomnessCommitTx ?? null,
          revealTx: intent.randomnessRevealTx ?? null,
          closeTx: intent.randomnessCloseTx ?? null,
          randomHex: intent.randomnessValueHex ?? null,
          drawIndex: typeof intent.drawIndex === "number" ? intent.drawIndex : null,
          availableCount: Array.isArray(intent.drawAvailableStickerIds)
            ? intent.drawAvailableStickerIds.length
            : null,
        },
      });
    }

    if ((intent.flowVersion ?? "legacy") === MINT_BACKEND_FLOW_VERSION) {
      if (intent.status === "PREPARED") {
        await MintIntent.updateOne(
          { intentId, status: "PREPARED" },
          { $set: { status: "SUBMITTED", error: null } },
        );
      }

      const active = await Collection.findOne({ isActive: true }).lean();
      const merkleTreePk =
        (active?.merkleTreePubkey as string | undefined) ??
        process.env.MERKLE_TREE_PUBKEY;
      const coreCollectionStr =
        (active?.coreCollectionPubkey as string | undefined) ??
        process.env.CORE_COLLECTION_PUBKEY;

      const merkleTree = safePublicKey(merkleTreePk);
      const coreCollectionPk = safePublicKey(coreCollectionStr);
      if (!merkleTree) {
        throw new Error("Missing MERKLE_TREE_PUBKEY");
      }
      if (!coreCollectionPk) {
        throw new Error("Missing CORE_COLLECTION_PUBKEY");
      }

      const metaBase = process.env.METADATA_BASE_URI;
      if (!metaBase) {
        throw new Error("Missing METADATA_BASE_URI");
      }

      const umi = umiServer();
      const stickerId = String(intent.stickerId);
      const sticker = getSticker(stickerId);
      const onchainName = sticker?.name ?? `Panini #${stickerId}`;
      const uri = `${metaBase}/${stickerId}.json`;

      const builder = await mintV2(umi, {
        merkleTree,
        leafOwner: publicKey(intent.wallet),
        payer: umi.identity,
        treeCreatorOrDelegate: umi.identity,
        ...(coreCollectionPk
          ? {
              coreCollection: coreCollectionPk,
              collectionAuthority: umi.identity,
              metadata: {
                name: onchainName,
                uri,
                sellerFeeBasisPoints: 0,
                collection: some(coreCollectionPk),
                creators: [],
              },
            }
          : {
              metadata: {
                name: onchainName,
                uri,
                sellerFeeBasisPoints: 0,
                collection: none(),
                creators: [],
              },
            }),
      });

      const result = await builder.sendAndConfirm(umi);
      const submittedTxSig = result.signature.toString();
      backendSubmittedTxSig = submittedTxSig;

      await MintIntent.updateOne(
        { intentId },
        {
          $set: {
            submittedTxSig,
            status: "SUBMITTED",
            error: null,
          },
        },
      );

      await finalizeMintSuccess({
        intentId,
        twitchUserId,
        intent,
        txSig: submittedTxSig,
        displayName,
      });

      return NextResponse.json({
        ok: true,
        tx: submittedTxSig,
        stickerId,
        proof: {
          provider: intent.randomnessProvider ?? null,
          queuePubkey: intent.randomnessQueuePubkey ?? null,
          randomnessAccount: intent.randomnessAccount ?? null,
          commitTx: intent.randomnessCommitTx ?? null,
          revealTx: intent.randomnessRevealTx ?? null,
          closeTx: intent.randomnessCloseTx ?? null,
          randomHex: intent.randomnessValueHex ?? null,
          drawIndex: typeof intent.drawIndex === "number" ? intent.drawIndex : null,
          availableCount: Array.isArray(intent.drawAvailableStickerIds)
            ? intent.drawAvailableStickerIds.length
            : null,
        },
      });
    }

    if ((intent.flowVersion ?? "legacy") === MINT_PROGRAM_FLOW_VERSION) {
      const submittedTxSig = txSig || String(intent.submittedTxSig ?? "").trim();
      if (!submittedTxSig) {
        return new NextResponse("Missing txSig", { status: 400 });
      }
      if (!intent.claimHash) {
        throw new Error("Mint intent missing claimHash");
      }

      if (intent.status === "PREPARED") {
        await MintIntent.updateOne(
          { intentId, status: "PREPARED" },
          {
            $set: {
              status: "SUBMITTED",
              submittedTxSig,
              error: null,
            },
          },
        );
      } else if (
        intent.submittedTxSig &&
        String(intent.submittedTxSig).trim() &&
        String(intent.submittedTxSig).trim() !== submittedTxSig
      ) {
        throw new Error("Intent already submitted with a different transaction");
      } else if (String(intent.submittedTxSig ?? "").trim() !== submittedTxSig) {
        await MintIntent.updateOne(
          { intentId },
          { $set: { submittedTxSig, error: null } },
        );
      }

      const conf = await connection.confirmTransaction(submittedTxSig, "confirmed");
      if (conf.value.err) {
        throw new Error(`Tx failed: ${JSON.stringify(conf.value.err)}`);
      }

      const parsedTx = await connection.getParsedTransaction(submittedTxSig, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!parsedTx) {
        throw new Error("Submitted transaction not found on chain");
      }
      if (parsedTx.meta?.err) {
        throw new Error(
          `Submitted transaction failed: ${JSON.stringify(parsedTx.meta.err)}`,
        );
      }

      const signerKeys = parsedTx.transaction.message.accountKeys
        .filter((key) => key.signer)
        .map((key) => key.pubkey.toBase58());
      if (!signerKeys.includes(String(intent.wallet))) {
        throw new Error("Wallet signer missing from submitted transaction");
      }

      const mintProgramId = getMintProgramIdFromEnv();
      if (
        !hasMintProgramClaimMintInstruction(
          parsedTx.transaction.message.instructions,
          mintProgramId.toBase58(),
        )
      ) {
        throw new Error(
          "Mint claim_mint instruction missing from submitted transaction",
        );
      }

      const [claimReceiptPda] = findMintProgramClaimReceiptPda(
        mintProgramId,
        Buffer.from(intent.claimHash, "hex"),
      );
      const claimReceiptInfo = await connection.getAccountInfo(claimReceiptPda, {
        commitment: "confirmed",
      });
      if (!claimReceiptInfo) {
        throw new Error("Claim receipt missing after confirmed mint transaction");
      }

      await finalizeMintSuccess({
        intentId,
        twitchUserId,
        intent,
        txSig: submittedTxSig,
        displayName,
      });

      return NextResponse.json({
        ok: true,
        tx: submittedTxSig,
        stickerId: String(intent.stickerId),
        proof: {
          provider: intent.randomnessProvider ?? null,
          queuePubkey: intent.randomnessQueuePubkey ?? null,
          randomnessAccount: intent.randomnessAccount ?? null,
          commitTx: intent.randomnessCommitTx ?? null,
          revealTx: intent.randomnessRevealTx ?? null,
          closeTx: intent.randomnessCloseTx ?? null,
          randomHex: intent.randomnessValueHex ?? null,
          drawIndex: typeof intent.drawIndex === "number" ? intent.drawIndex : null,
          availableCount: Array.isArray(intent.drawAvailableStickerIds)
            ? intent.drawAvailableStickerIds.length
            : null,
        },
      });
    }

    if (!signedTxB64) {
      return new NextResponse("Missing signedTxB64", { status: 400 });
    }
    if (!intent.preparedTxB64) {
      throw new Error("Mint intent missing prepared transaction");
    }

    const raw = Buffer.from(signedTxB64, "base64");
    const signedVtx = VersionedTransaction.deserialize(raw);
    const preparedVtx = VersionedTransaction.deserialize(
      Buffer.from(intent.preparedTxB64, "base64"),
    );

    if (!messagesMatchStrictOrIgnoringBlockhash(signedVtx.message, preparedVtx.message)) {
      const signedPrograms = safeProgramList(signedVtx.message);
      const preparedPrograms = safeProgramList(preparedVtx.message);
      const signedPayer = safePayer(signedVtx.message);

      const hasOnlyAllowedPrograms = signedPrograms.every((p) =>
        ALLOWED_WALLET_EXTRA_PROGRAMS.has(p),
      );
      const hasBubblegum = signedPrograms.includes(BUBBLEGUM_PROGRAM_ID);
      const preparedIsMintShape =
        preparedPrograms.length === 1 && preparedPrograms[0] === BUBBLEGUM_PROGRAM_ID;
      const payerMatchesIntent = signedPayer === String(intent.wallet ?? "");

      if (!(hasOnlyAllowedPrograms && hasBubblegum && preparedIsMintShape && payerMatchesIntent)) {
        console.warn("mint/submit mismatch details", {
          intentId,
          signedPrograms,
          preparedPrograms,
          signedPayer,
          intentWallet: String(intent.wallet ?? ""),
        });
        throw new Error("Signed transaction does not match prepared transaction");
      }

      console.warn("mint/submit mismatch accepted via wallet-wrapper compatibility", {
        intentId,
        signedPrograms,
      });
    }

    const authority = authorityKeypairFromEnv();
    signedVtx.sign([authority]);
    const signedAndCosignedRaw = Buffer.from(signedVtx.serialize());

    const sig = await connection.sendRawTransaction(signedAndCosignedRaw, {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: "processed",
    });

    const conf = await connection.confirmTransaction(sig, "confirmed");
    if (conf.value.err) {
      throw new Error(`Tx failed: ${JSON.stringify(conf.value.err)}`);
    }

    await finalizeMintSuccess({
      intentId,
      twitchUserId,
      intent,
      txSig: sig,
      displayName,
    });

    return NextResponse.json({
      ok: true,
      tx: sig,
      stickerId: String(intent.stickerId),
      proof: {
        provider: intent.randomnessProvider ?? null,
        queuePubkey: intent.randomnessQueuePubkey ?? null,
        randomnessAccount: intent.randomnessAccount ?? null,
        commitTx: intent.randomnessCommitTx ?? null,
        revealTx: intent.randomnessRevealTx ?? null,
        closeTx: intent.randomnessCloseTx ?? null,
        randomHex: intent.randomnessValueHex ?? null,
        drawIndex: typeof intent.drawIndex === "number" ? intent.drawIndex : null,
        availableCount: Array.isArray(intent.drawAvailableStickerIds)
          ? intent.drawAvailableStickerIds.length
          : null,
      },
    });
  } catch (e) {
    console.error("mint/submit failed", e);

    const errorMessage = (e as Error)?.message ?? "unknown";
    if ((intent.flowVersion ?? "legacy") === MINT_BACKEND_FLOW_VERSION) {
      const submittedTxSig =
        backendSubmittedTxSig || String(intent.submittedTxSig ?? "").trim();
      await MintIntent.updateOne(
        { intentId },
        {
          $set: {
            status: submittedTxSig ? "SUBMITTED" : "FAILED",
            submittedTxSig: submittedTxSig || null,
            error: errorMessage,
          },
        },
      );
      if (!submittedTxSig) {
        await Redemption.updateOne(
          { redemptionId: intent.redemptionId },
          { $set: { lockedByIntentId: null } },
        );
      }
    } else if ((intent.flowVersion ?? "legacy") === MINT_PROGRAM_FLOW_VERSION) {
      const submittedTxSig = txSig || String(intent.submittedTxSig ?? "").trim();
      await MintIntent.updateOne(
        { intentId },
        {
          $set: {
            status: submittedTxSig ? "SUBMITTED" : "FAILED",
            submittedTxSig: submittedTxSig || null,
            error: errorMessage,
          },
        },
      );
      if (!submittedTxSig) {
        await Redemption.updateOne(
          { redemptionId: intent.redemptionId },
          { $set: { lockedByIntentId: null } },
        );
      }
    } else {
      await MintIntent.updateOne(
        { intentId },
        { $set: { status: "FAILED", error: errorMessage } },
      );

      await Redemption.updateOne(
        { redemptionId: intent.redemptionId },
        { $set: { lockedByIntentId: null } },
      );
    }

    return new NextResponse("Mint failed", { status: 500 });
  }
}
