import { Connection, VersionedTransaction } from "@solana/web3.js";
import {
  AssetWithProof,
  TokenProgramVersion,
  TokenStandard,
  delegate,
  transfer,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  createNoopSigner,
  none,
  publicKey,
  publicKeyBytes,
  some,
  transactionBuilder,
  wrapNullable,
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

type DasAssetForProof = {
  content?: {
    metadata?: {
      name?: string;
      symbol?: string;
      attributes?: Array<{ trait_type?: string; value?: string | number }>;
    };
    json_uri?: string;
  };
  royalty?: {
    basis_points?: number;
    primary_sale_happened?: boolean;
  };
  mutable?: boolean;
  supply?: { edition_nonce?: number | null };
  grouping?: Array<{ group_key?: string; group_value?: string }>;
  creators?: Array<{
    address: string;
    share: number;
    verified: boolean;
  }>;
  compression: {
    data_hash: string;
    creator_hash: string;
    collection_hash?: string;
    asset_data_hash?: string;
    flags?: number;
    leaf_id: number;
  };
  ownership: {
    owner: string;
    delegate?: string | null;
  };
};

type DasAssetProofForProof = {
  root: string;
  proof: string[];
  node_index: number;
  tree_id: string;
};

async function loadAssetWithProof(
  umi: ReturnType<typeof umiTradeDelegate>,
  assetId: string
): Promise<AssetWithProof> {
  const rpc = umi.rpc as unknown as {
    getAsset: (input: unknown) => Promise<DasAssetForProof>;
    getAssetProof: (assetId: unknown) => Promise<DasAssetProofForProof>;
  };

  if (typeof rpc.getAsset !== "function" || typeof rpc.getAssetProof !== "function") {
    throw new Error("RPC missing DAS methods (getAsset/getAssetProof)");
  }

  const assetPk = pk(assetId);
  const [rpcAsset, rpcAssetProof] = await Promise.all([
    rpc.getAsset({
      assetId: assetPk,
      displayOptions: { showUnverifiedCollections: true },
    }),
    rpc.getAssetProof(assetPk),
  ]);

  const collectionString = (rpcAsset.grouping ?? []).find(
    (group) => String(group.group_key ?? "") === "collection"
  )?.group_value;
  const editionNonce =
    typeof rpcAsset.supply?.edition_nonce === "number"
      ? rpcAsset.supply.edition_nonce
      : null;

  const metadata: AssetWithProof["metadata"] = {
    name: rpcAsset.content?.metadata?.name ?? "",
    symbol: rpcAsset.content?.metadata?.symbol ?? "",
    uri: rpcAsset.content?.json_uri ?? "",
    sellerFeeBasisPoints: rpcAsset.royalty?.basis_points ?? 0,
    primarySaleHappened: rpcAsset.royalty?.primary_sale_happened ?? false,
    isMutable: rpcAsset.mutable ?? true,
    editionNonce: wrapNullable(editionNonce),
    tokenStandard: some(TokenStandard.NonFungible),
    collection: collectionString
      ? (some({ key: pk(collectionString), verified: true }) as never)
      : none(),
    uses: none(),
    tokenProgramVersion: TokenProgramVersion.Original,
    creators: (rpcAsset.creators ?? []).map((creator) => ({
      ...creator,
      address: pk(creator.address),
    })),
  };

  const proof = Array.isArray(rpcAssetProof.proof) ? rpcAssetProof.proof : [];
  return {
    leafOwner: pk(rpcAsset.ownership.owner),
    leafDelegate: pk(rpcAsset.ownership.delegate ?? rpcAsset.ownership.owner),
    merkleTree: pk(rpcAssetProof.tree_id),
    root: publicKeyBytes(pk(rpcAssetProof.root)),
    dataHash: publicKeyBytes(pk(rpcAsset.compression.data_hash)),
    creatorHash: publicKeyBytes(pk(rpcAsset.compression.creator_hash)),
    collection_hash: rpcAsset.compression.collection_hash
      ? publicKeyBytes(pk(rpcAsset.compression.collection_hash))
      : undefined,
    asset_data_hash: rpcAsset.compression.asset_data_hash
      ? publicKeyBytes(pk(rpcAsset.compression.asset_data_hash))
      : undefined,
    flags: rpcAsset.compression.flags,
    nonce: rpcAsset.compression.leaf_id,
    index: rpcAssetProof.node_index - 2 ** proof.length,
    proof: proof.map((node) => pk(node)),
    metadata,
    rpcAsset: rpcAsset as never,
    rpcAssetProof: rpcAssetProof as never,
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

function assertAssetInConfiguredCollection(asset: AssetWithProof) {
  const expected = String(process.env.CORE_COLLECTION_PUBKEY ?? "").trim();
  if (!expected) return;

  const groups = (
    (asset.rpcAsset as {
      grouping?: Array<{ group_key?: string; group_value?: string }>;
    })?.grouping ?? []
  ) as Array<{ group_key?: string; group_value?: string }>;

  const ok = groups.some(
    (group) =>
      String(group.group_key ?? "").toLowerCase() === "collection" &&
      String(group.group_value ?? "").trim() === expected
  );

  if (!ok) {
    throw new Error("Asset is not in configured collection");
  }
}

function publicKeyEquals(a: unknown, b: string) {
  return String(a) === String(pk(b));
}

export async function getAssetWithTradeProof(assetId: string) {
  const umi = umiTradeDelegate();
  const asset = await loadAssetWithProof(umi, assetId);
  assertAssetInConfiguredCollection(asset);

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
  if (!signedTxMatchesPrepared(signedTxB64, preparedTxB64)) {
    throw new Error("Signed transaction does not match prepared transaction");
  }
}

export function signedTxMatchesPrepared(
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
  return signedMsg.equals(preparedMsg);
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
    loadAssetWithProof(umi, params.makerAssetId),
    loadAssetWithProof(umi, params.takerAssetId),
  ]);
  assertAssetInConfiguredCollection(makerAsset);
  assertAssetInConfiguredCollection(takerAsset);

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
