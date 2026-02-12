import { Connection, VersionedTransaction } from "@solana/web3.js";
import {
  AssetWithProof,
  delegate,
  getAssetWithProof,
  transfer,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  createNoopSigner,
  publicKey,
  transactionBuilder,
} from "@metaplex-foundation/umi";
import { umiTradeDelegate } from "@/lib/solana/umi";

function rpcConnection() {
  return new Connection(process.env.HELIUS_RPC_URL!, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });
}

function pk(v: string) {
  return publicKey(v.trim());
}

function normalizedPublicKey(input: unknown): string {
  if (typeof input === "string") {
    const value = input.trim();
    if (value) return value;
  }

  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    if ("assetId" in record) {
      return normalizedPublicKey(record.assetId);
    }
    if ("id" in record) {
      return normalizedPublicKey(record.id);
    }
  }

  const coerced = String(input ?? "").trim();
  if (coerced && coerced !== "[object Object]") {
    return coerced;
  }

  throw new Error("Invalid public key input");
}

async function heliusCall(method: string, params: unknown) {
  const rpc = process.env.HELIUS_RPC_URL;
  if (!rpc) throw new Error("Missing HELIUS_RPC_URL");

  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `${method}-${Date.now()}`,
      method,
      params,
    }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`RPC ${method} failed (${response.status})`);
  const json = (await response.json()) as {
    result?: unknown;
    error?: { message?: string };
  };
  if (json.error) {
    throw new Error(json.error.message ?? `${method} error`);
  }
  return json.result;
}

function dasRpc() {
  return {
    getAsset: async (input: unknown) => {
      const assetId = normalizedPublicKey(input);
      const displayOptions =
        input && typeof input === "object" && "displayOptions" in input
          ? (input as { displayOptions?: unknown }).displayOptions
          : undefined;

      return (await heliusCall("getAsset", {
        id: assetId,
        ...(displayOptions && typeof displayOptions === "object"
          ? { options: displayOptions }
          : {}),
      })) as unknown;
    },
    getAssetProof: async (input: unknown) =>
      (await heliusCall("getAssetProof", {
        id: normalizedPublicKey(input),
      })) as unknown,
  };
}

function parseStickerId(asset: AssetWithProof): string | null {
  const attrs = ((asset.rpcAsset as { content?: { metadata?: { attributes?: Array<{ trait_type?: string; value?: string | number }> } } })?.content?.metadata?.attributes ??
    []) as Array<{ trait_type?: string; value?: string | number }>;

  const stickerAttr = attrs.find(
    (attr) => String(attr.trait_type ?? "").toLowerCase() === "sticker_id"
  );

  if (!stickerAttr) return null;
  return String(stickerAttr.value ?? "").trim() || null;
}

function publicKeyEquals(a: unknown, b: string) {
  return String(a) === String(pk(b));
}

export async function getAssetWithTradeProof(assetId: string) {
  const umi = umiTradeDelegate();
  const asset = await getAssetWithProof({ rpc: dasRpc() } as never, pk(assetId), {
    truncateCanopy: true,
  });

  return {
    umi,
    asset,
    stickerId: parseStickerId(asset),
  };
}

export async function prepareDelegateTxForAsset(params: {
  assetId: string;
  ownerWallet: string;
  newDelegateWallet: string;
}) {
  const { umi, asset, stickerId } = await getAssetWithTradeProof(params.assetId);
  const ownerPk = pk(params.ownerWallet);
  const ownerSigner = createNoopSigner(ownerPk);

  if (!publicKeyEquals(asset.leafOwner, params.ownerWallet)) {
    throw new Error("Asset owner mismatch");
  }

  const builder = delegate(umi, {
    ...asset,
    leafOwner: ownerSigner,
    previousLeafDelegate: asset.leafDelegate,
    newLeafDelegate: pk(params.newDelegateWallet),
  });

  const built = await (
    await builder.setFeePayer(ownerSigner).setLatestBlockhash(umi)
  ).buildAndSign(umi);

  const bytes = umi.transactions.serialize(built);
  return {
    txB64: Buffer.from(bytes).toString("base64"),
    stickerId,
    assetLeafDelegate: String(asset.leafDelegate),
  };
}

export function assertSignedTxMatchesPrepared(
  signedTxB64: string,
  preparedTxB64: string
) {
  const signed = VersionedTransaction.deserialize(
    Buffer.from(signedTxB64, "base64")
  );
  const prepared = VersionedTransaction.deserialize(
    Buffer.from(preparedTxB64, "base64")
  );

  const signedMsg = Buffer.from(signed.message.serialize());
  const preparedMsg = Buffer.from(prepared.message.serialize());
  if (!signedMsg.equals(preparedMsg)) {
    throw new Error("Signed transaction does not match prepared transaction");
  }
}

export async function sendSignedTxB64(signedTxB64: string) {
  const raw = Buffer.from(signedTxB64, "base64");
  const connection = rpcConnection();

  const sig = await connection.sendRawTransaction(raw, {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: "processed",
  });

  const conf = await connection.confirmTransaction(sig, "confirmed");
  if (conf.value.err) {
    throw new Error(`Tx failed: ${JSON.stringify(conf.value.err)}`);
  }

  return sig;
}

export async function executeDelegatedSwap(params: {
  makerAssetId: string;
  makerWallet: string;
  takerAssetId: string;
  takerWallet: string;
  delegateWallet: string;
}) {
  const umi = umiTradeDelegate();
  const delegateSigner = umi.identity;

  if (!publicKeyEquals(delegateSigner.publicKey, params.delegateWallet)) {
    throw new Error("Delegate key mismatch");
  }

  const [makerAsset, takerAsset] = await Promise.all([
    getAssetWithProof({ rpc: dasRpc() } as never, pk(params.makerAssetId), {
      truncateCanopy: true,
    }),
    getAssetWithProof({ rpc: dasRpc() } as never, pk(params.takerAssetId), {
      truncateCanopy: true,
    }),
  ]);

  if (!publicKeyEquals(makerAsset.leafOwner, params.makerWallet)) {
    throw new Error("Maker no longer owns the offered asset");
  }
  if (!publicKeyEquals(takerAsset.leafOwner, params.takerWallet)) {
    throw new Error("Taker no longer owns the offered asset");
  }
  if (!publicKeyEquals(makerAsset.leafDelegate, params.delegateWallet)) {
    throw new Error("Maker asset is not delegated to trade authority");
  }
  if (!publicKeyEquals(takerAsset.leafDelegate, params.delegateWallet)) {
    throw new Error("Taker asset is not delegated to trade authority");
  }

  const builder = transactionBuilder()
    .add(
      transfer(umi, {
        ...makerAsset,
        leafOwner: pk(params.makerWallet),
        leafDelegate: delegateSigner,
        newLeafOwner: pk(params.takerWallet),
      })
    )
    .add(
      transfer(umi, {
        ...takerAsset,
        leafOwner: pk(params.takerWallet),
        leafDelegate: delegateSigner,
        newLeafOwner: pk(params.makerWallet),
      })
    );

  const built = await (
    await builder.setFeePayer(delegateSigner).setLatestBlockhash(umi)
  ).buildAndSign(umi);

  const raw = Buffer.from(umi.transactions.serialize(built));
  const connection = rpcConnection();
  const sig = await connection.sendRawTransaction(raw, {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: "processed",
  });
  const conf = await connection.confirmTransaction(sig, "confirmed");
  if (conf.value.err) {
    throw new Error(`Settlement failed: ${JSON.stringify(conf.value.err)}`);
  }

  return sig;
}
