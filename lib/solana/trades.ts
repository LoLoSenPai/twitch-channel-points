import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  AssetWithProof,
  TokenProgramVersion,
  TokenStandard,
  delegateV2,
  transferV2,
} from "@metaplex-foundation/mpl-bubblegum";
import {
  AccountMeta,
  Instruction,
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

const canopyDepthCache = new Map<string, number>();

function computeConcurrentMerkleTreeSerializedSize(
  maxDepth: number,
  maxBufferSize: number
) {
  // sequenceNumber(u64) + activeIndex(u64) + bufferSize(u64)
  const headerSize = 24;
  // root(32) + pathNodes(maxDepth * 32) + index(8)
  const changeLogSize = 40 + 32 * maxDepth;
  // proof(maxDepth * 32) + leaf(32) + index(u32) + padding(u32)
  const pathSize = 40 + 32 * maxDepth;
  return headerSize + maxBufferSize * changeLogSize + pathSize;
}

async function getCanopyDepthForTree(treeId: string): Promise<number> {
  const cached = canopyDepthCache.get(treeId);
  if (typeof cached === "number") return cached;

  const connection = rpcConnection();
  const info = await connection.getAccountInfo(new PublicKey(treeId), "confirmed");
  if (!info?.data || info.data.length < 56) {
    canopyDepthCache.set(treeId, 0);
    return 0;
  }

  // ConcurrentMerkleTree account layout:
  // [0] discriminator(u8), [1] version enum(u8), [2..5] maxBufferSize(u32 LE), [6..9] maxDepth(u32 LE)
  const maxBufferSize = info.data.readUInt32LE(2);
  const maxDepth = info.data.readUInt32LE(6);
  if (!Number.isFinite(maxBufferSize) || !Number.isFinite(maxDepth)) {
    canopyDepthCache.set(treeId, 0);
    return 0;
  }

  const treeBytes = computeConcurrentMerkleTreeSerializedSize(maxDepth, maxBufferSize);
  const canopyStartOffset = 56 + treeBytes;
  const canopyBytes = Math.max(0, info.data.length - canopyStartOffset);
  if (canopyBytes <= 0 || canopyBytes % 32 !== 0) {
    canopyDepthCache.set(treeId, 0);
    return 0;
  }

  const canopyNodes = canopyBytes / 32;
  const canopyDepth = Math.max(
    0,
    Math.floor(Math.log2(canopyNodes + 2) - 1)
  );
  canopyDepthCache.set(treeId, canopyDepth);
  return canopyDepth;
}

function pk(v: string) {
  return publicKey(v.trim());
}

function tradeDelegateWeb3Keypair() {
  const source =
    process.env.TRADE_DELEGATE_SECRET ?? process.env.SOLANA_AUTHORITY_SECRET;
  if (!source) throw new Error("Missing TRADE_DELEGATE_SECRET");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(source)));
}

function toWeb3Instruction(ix: Instruction): TransactionInstruction {
  const keys = ix.keys.map((key: AccountMeta) => ({
    pubkey: new PublicKey(String(key.pubkey)),
    isSigner: Boolean(key.isSigner),
    isWritable: Boolean(key.isWritable),
  }));

  return new TransactionInstruction({
    programId: new PublicKey(String(ix.programId)),
    keys,
    data: Buffer.from(ix.data),
  });
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

  const fullProof = Array.isArray(rpcAssetProof.proof) ? rpcAssetProof.proof : [];
  const canopyDepth = await getCanopyDepthForTree(String(rpcAssetProof.tree_id));
  const truncatedProof =
    canopyDepth > 0 && fullProof.length > canopyDepth
      ? fullProof.slice(0, -canopyDepth)
      : fullProof;

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
    index: rpcAssetProof.node_index - 2 ** fullProof.length,
    proof: truncatedProof.map((node) => pk(node)),
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

  const builder = delegateV2(umi, {
    merkleTree: asset.merkleTree,
    root: asset.root,
    dataHash: asset.dataHash,
    creatorHash: asset.creatorHash,
    collectionHash: asset.collection_hash ?? none(),
    assetDataHash: asset.asset_data_hash ?? none(),
    flags:
      typeof asset.flags === "number" ? some(asset.flags) : none(),
    nonce: asset.nonce,
    index: asset.index,
    proof: asset.proof,
    payer: ownerSigner,
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

export async function prepareOwnerTransferTxForAsset(params: {
  assetId: string;
  ownerWallet: string;
  recipientWallet: string;
}) {
  const { umi, asset, stickerId } = await getAssetWithTradeProof(params.assetId);
  const ownerPk = pk(params.ownerWallet);
  const ownerSigner = createNoopSigner(ownerPk);

  if (!publicKeyEquals(asset.leafOwner, params.ownerWallet)) {
    throw new Error("Asset owner mismatch");
  }

  const builder = transferV2(umi, {
    merkleTree: asset.merkleTree,
    root: asset.root,
    dataHash: asset.dataHash,
    creatorHash: asset.creatorHash,
    assetDataHash: asset.asset_data_hash ?? none(),
    flags: typeof asset.flags === "number" ? some(asset.flags) : none(),
    nonce: asset.nonce,
    index: asset.index,
    proof: asset.proof,
    payer: ownerSigner,
    authority: ownerSigner,
    leafOwner: ownerPk,
    leafDelegate: asset.leafDelegate,
    newLeafOwner: pk(params.recipientWallet),
  });

  const built = await (
    await builder.setFeePayer(ownerSigner).setLatestBlockhash(umi)
  ).buildAndSign(umi);

  const bytes = umi.transactions.serialize(built);
  return {
    txB64: Buffer.from(bytes).toString("base64"),
    stickerId,
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
      transferV2(umi, {
        merkleTree: makerAsset.merkleTree,
        root: makerAsset.root,
        dataHash: makerAsset.dataHash,
        creatorHash: makerAsset.creatorHash,
        assetDataHash: makerAsset.asset_data_hash ?? none(),
        flags:
          typeof makerAsset.flags === "number" ? some(makerAsset.flags) : none(),
        nonce: makerAsset.nonce,
        index: makerAsset.index,
        proof: makerAsset.proof,
        payer: delegateSigner,
        authority: delegateSigner,
        leafOwner: pk(params.makerWallet),
        leafDelegate: delegateSigner.publicKey,
        newLeafOwner: pk(params.takerWallet),
      })
    )
    .add(
      transferV2(umi, {
        merkleTree: takerAsset.merkleTree,
        root: takerAsset.root,
        dataHash: takerAsset.dataHash,
        creatorHash: takerAsset.creatorHash,
        assetDataHash: takerAsset.asset_data_hash ?? none(),
        flags:
          typeof takerAsset.flags === "number" ? some(takerAsset.flags) : none(),
        nonce: takerAsset.nonce,
        index: takerAsset.index,
        proof: takerAsset.proof,
        payer: delegateSigner,
        authority: delegateSigner,
        leafOwner: pk(params.takerWallet),
        leafDelegate: delegateSigner.publicKey,
        newLeafOwner: pk(params.makerWallet),
      })
    );

  const connection = rpcConnection();
  const built = await (
    await builder.setFeePayer(delegateSigner).setLatestBlockhash(umi)
  ).buildAndSign(umi);

  const raw = Buffer.from(umi.transactions.serialize(built));
  const sig = await connection.sendRawTransaction(raw, {
    skipPreflight: false,
    maxRetries: 3,
    preflightCommitment: "processed",
  });
  const conf = await connection.confirmTransaction(sig, "confirmed");
  if (conf.value.err) {
    const message = JSON.stringify(conf.value.err);
    if (/too large|VersionedTransaction too large|encoded\/raw/i.test(message)) {
      throw new Error(
        "Settlement transaction too large for atomic swap. Reduce proof size/tree depth or use a tree with canopy."
      );
    }
    throw new Error(`Settlement failed: ${message}`);
  }

  return sig;
}

export async function prepareDelegatedSalePurchaseTx(params: {
  sellerAssetId: string;
  sellerWallet: string;
  buyerWallet: string;
  priceLamports: number;
  delegateWallet: string;
  marketFeeBps: number;
  marketFeeWallet: string;
}) {
  if (!Number.isFinite(params.priceLamports) || params.priceLamports <= 0) {
    throw new Error("Invalid sale price");
  }
  if (!Number.isFinite(params.marketFeeBps) || params.marketFeeBps < 0 || params.marketFeeBps > 10_000) {
    throw new Error("Invalid market fee bps");
  }

  const umi = umiTradeDelegate();
  const delegateSigner = umi.identity;
  if (!publicKeyEquals(delegateSigner.publicKey, params.delegateWallet)) {
    throw new Error("Delegate key mismatch");
  }

  const sellerAsset = await loadAssetWithProof(umi, params.sellerAssetId);
  assertAssetInConfiguredCollection(sellerAsset);

  if (!publicKeyEquals(sellerAsset.leafOwner, params.sellerWallet)) {
    throw new Error("Seller no longer owns listed asset");
  }
  if (!publicKeyEquals(sellerAsset.leafDelegate, params.delegateWallet)) {
    throw new Error("Listed asset is not delegated to trade authority");
  }

  const buyerPk = pk(params.buyerWallet);
  const sellerPk = pk(params.sellerWallet);
  const buyerSigner = createNoopSigner(buyerPk);

  const bubblegumIx = transferV2(umi, {
    merkleTree: sellerAsset.merkleTree,
    root: sellerAsset.root,
    dataHash: sellerAsset.dataHash,
    creatorHash: sellerAsset.creatorHash,
    assetDataHash: sellerAsset.asset_data_hash ?? none(),
    flags: typeof sellerAsset.flags === "number" ? some(sellerAsset.flags) : none(),
    nonce: sellerAsset.nonce,
    index: sellerAsset.index,
    proof: sellerAsset.proof,
    payer: buyerSigner,
    authority: delegateSigner,
    leafOwner: sellerPk,
    leafDelegate: delegateSigner.publicKey,
    newLeafOwner: buyerPk,
  }).getInstructions()[0];

  const totalLamports = Math.floor(params.priceLamports);
  const feeBps = Math.floor(params.marketFeeBps);
  const feeLamports = Math.floor((totalLamports * feeBps) / 10_000);
  const sellerLamports = totalLamports - feeLamports;
  if (sellerLamports <= 0) {
    throw new Error("Sale price is too low for configured market fee");
  }

  const buyerWeb3Pk = new PublicKey(params.buyerWallet);
  const sellerWeb3Pk = new PublicKey(params.sellerWallet);
  const feeWalletWeb3Pk = new PublicKey(params.marketFeeWallet);
  const paymentInstructions: TransactionInstruction[] = [];

  paymentInstructions.push(
    SystemProgram.transfer({
      fromPubkey: buyerWeb3Pk,
      toPubkey: sellerWeb3Pk,
      lamports: sellerLamports,
    })
  );
  if (feeLamports > 0) {
    paymentInstructions.push(
      SystemProgram.transfer({
        fromPubkey: buyerWeb3Pk,
        toPubkey: feeWalletWeb3Pk,
        lamports: feeLamports,
      })
    );
  }

  const connection = rpcConnection();
  const latest = await connection.getLatestBlockhash("confirmed");

  const message = new TransactionMessage({
    payerKey: new PublicKey(params.buyerWallet),
    recentBlockhash: latest.blockhash,
    instructions: [...paymentInstructions, toWeb3Instruction(bubblegumIx)],
  }).compileToV0Message();

  const vtx = new VersionedTransaction(message);
  vtx.sign([tradeDelegateWeb3Keypair()]);

  return {
    txB64: Buffer.from(vtx.serialize()).toString("base64"),
    totalLamports,
    feeLamports,
    sellerLamports,
  };
}
