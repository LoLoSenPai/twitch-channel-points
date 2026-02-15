import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorUtils, Queue, Randomness, asV0Tx } from "@switchboard-xyz/on-demand";

export type RandomnessProof = {
  provider: "switchboard";
  queuePubkey: string;
  randomnessAccount: string;
  commitTx: string;
  revealTx: string;
  closeTx: string | null;
  randomHex: string;
  seedSlot: number | null;
  revealSlot: number | null;
};

function parseSecretFromEnv(name: string): Uint8Array {
  const raw = process.env[name];
  if (!raw) throw new Error(`Missing ${name}`);
  return Uint8Array.from(JSON.parse(raw));
}

function parseOptionalPubkey(raw?: string | null): PublicKey | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  return new PublicKey(value);
}

function toNumberLike(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value === "object") {
    const maybeBN = value as { toNumber?: () => number };
    if (typeof maybeBN.toNumber === "function") {
      const n = maybeBN.toNumber();
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function toBytes(value: unknown): Uint8Array | null {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return new Uint8Array(value);
  }
  return null;
}

function bytesToHex(value: Uint8Array): string {
  return Buffer.from(value).toString("hex");
}

function isAllZero(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] !== 0) return false;
  }
  return true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "unknown error";
  }
}

function isRevealNotReadyError(error: unknown): boolean {
  const msg = asErrorMessage(error).toLowerCase();
  return (
    msg.includes("status code 404") ||
    msg.includes("status code 429") ||
    msg.includes("status code 500") ||
    msg.includes("status code 502") ||
    msg.includes("status code 503") ||
    msg.includes("status code 504") ||
    msg.includes("timeout")
  );
}

async function sendAndConfirmV0Tx(
  connection: Connection,
  tx: Awaited<ReturnType<typeof asV0Tx>>,
): Promise<string> {
  const sig = await connection.sendTransaction(tx, {
    preflightCommitment: "processed",
    maxRetries: 3,
  });
  const confirmed = await connection.confirmTransaction(sig, "confirmed");
  if (confirmed.value.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(confirmed.value.err)}`);
  }
  return sig;
}

async function closeRandomnessAccount(params: {
  connection: Connection;
  randomnessAccount: Randomness;
  payer: Keypair;
  computeUnitPrice: number;
}): Promise<string | null> {
  const { connection, randomnessAccount, payer, computeUnitPrice } = params;
  try {
    const closeIx = await randomnessAccount.closeIx();
    const closeTx = await asV0Tx({
      connection,
      ixs: [closeIx],
      signers: [payer],
      computeUnitPrice,
      computeUnitLimitMultiple: 1.2,
    });
    return await sendAndConfirmV0Tx(connection, closeTx);
  } catch (error) {
    console.warn("switchboard randomness close failed", error);
    return null;
  }
}

export async function drawSwitchboardRandomness(): Promise<RandomnessProof> {
  const rpcUrl = process.env.HELIUS_RPC_URL;
  if (!rpcUrl) throw new Error("Missing HELIUS_RPC_URL");

  const connection = new Connection(rpcUrl, "confirmed");
  const program = await AnchorUtils.loadProgramFromConnection(connection);
  const payer = Keypair.fromSecretKey(parseSecretFromEnv("SOLANA_AUTHORITY_SECRET"));

  const configuredQueue = parseOptionalPubkey(process.env.SWITCHBOARD_QUEUE_PUBKEY);
  const queue = configuredQueue
    ? new Queue(program, configuredQueue)
    : await Queue.loadDefault(program);
  const computeUnitPrice = Number(
    process.env.SWITCHBOARD_COMPUTE_UNIT_PRICE_MICROLAMPORTS ?? 75_000,
  );
  const revealWaitMs = Number(process.env.SWITCHBOARD_REVEAL_WAIT_MS ?? 2_500);
  const maxRevealAttempts = Number(process.env.SWITCHBOARD_MAX_REVEAL_ATTEMPTS ?? 10);
  const revealRetryMs = Number(process.env.SWITCHBOARD_REVEAL_RETRY_MS ?? 1_500);
  const maxOracleAttempts = Number(process.env.SWITCHBOARD_MAX_ORACLE_ATTEMPTS ?? 2);

  const queueData = await queue.loadData();
  const oracleKeys = (queueData.oracleKeys ?? []).map((k) => new PublicKey(k));
  const oracleCandidates = [null, ...oracleKeys]
    .filter((k, idx, arr) => {
      if (k === null) return idx === 0;
      const key = k.toBase58();
      return arr.findIndex((v) => v !== null && v.toBase58() === key) === idx;
    })
    .slice(0, Math.max(1, maxOracleAttempts));

  let lastError: unknown = null;

  for (const oraclePk of oracleCandidates) {
    const randomnessKeypair = Keypair.generate();
    const [randomnessAccount, createIx] = await Randomness.create(
      program,
      randomnessKeypair,
      queue.pubkey,
      payer.publicKey,
    );

    const commitIx = await randomnessAccount.commitIx(
      queue.pubkey,
      payer.publicKey,
      oraclePk ?? undefined,
    );
    const commitTx = await asV0Tx({
      connection,
      ixs: [createIx, commitIx],
      signers: [payer, randomnessKeypair],
      computeUnitPrice,
      computeUnitLimitMultiple: 1.3,
    });
    const commitSig = await sendAndConfirmV0Tx(connection, commitTx);

    await sleep(Math.max(0, revealWaitMs));

    let revealSig = "";
    let revealError: unknown = null;

    for (let attempt = 1; attempt <= Math.max(1, maxRevealAttempts); attempt += 1) {
      try {
        const revealIx = await randomnessAccount.revealIx(payer.publicKey);
        const revealTx = await asV0Tx({
          connection,
          ixs: [revealIx],
          signers: [payer],
          computeUnitPrice,
          computeUnitLimitMultiple: 1.4,
        });
        revealSig = await sendAndConfirmV0Tx(connection, revealTx);
        break;
      } catch (error) {
        revealError = error;
        lastError = error;
        if (attempt >= maxRevealAttempts) break;
        const waitMs = Math.max(300, revealRetryMs * attempt);
        await sleep(waitMs);
      }
    }

    if (!revealSig) {
      await closeRandomnessAccount({
        connection,
        randomnessAccount,
        payer,
        computeUnitPrice,
      });

      // If the error looks transient (gateway not ready), try next oracle candidate.
      if (isRevealNotReadyError(revealError)) {
        continue;
      }

      throw new Error(`Switchboard reveal failed: ${asErrorMessage(revealError)}`);
    }

    const data = (await randomnessAccount.loadData()) as {
      value?: unknown;
      seedSlot?: unknown;
      revealSlot?: unknown;
    };

    const valueBytes = toBytes(data.value);
    if (!valueBytes || valueBytes.length === 0 || isAllZero(valueBytes)) {
      await closeRandomnessAccount({
        connection,
        randomnessAccount,
        payer,
        computeUnitPrice,
      });
      throw new Error("Switchboard randomness value is empty");
    }

    const closeSig = await closeRandomnessAccount({
      connection,
      randomnessAccount,
      payer,
      computeUnitPrice,
    });

    return {
      provider: "switchboard",
      queuePubkey: queue.pubkey.toBase58(),
      randomnessAccount: randomnessAccount.pubkey.toBase58(),
      commitTx: commitSig,
      revealTx: revealSig,
      closeTx: closeSig,
      randomHex: bytesToHex(valueBytes),
      seedSlot: toNumberLike(data.seedSlot),
      revealSlot: toNumberLike(data.revealSlot),
    };
  }

  throw new Error(
    `Switchboard reveal failed after oracle fallback (${oracleCandidates.length} attempts): ${asErrorMessage(lastError)}`,
  );
}
