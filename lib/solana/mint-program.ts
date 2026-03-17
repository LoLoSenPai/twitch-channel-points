import { PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY, TransactionInstruction } from "@solana/web3.js";

export const MINT_PROGRAM_FLOW_VERSION = "program-v1";
export const MINT_BACKEND_FLOW_VERSION = "backend-v1";
export const MINT_PROGRAM_ID_PLACEHOLDER = "a1FFwJRLMKb8JwNSKoGMu9DDuzaA5VTuJBVuU3XRLdz";
export const MINT_PROGRAM_CONFIG_SEED = "config";
export const MINT_PROGRAM_CLAIM_SEED = "claim";
export const MINT_PROGRAM_CLAIM_DOMAIN = "paninyls-mint-claim-v1";
export const MINT_PROGRAM_SYMBOL = "PANINI";
export const MINT_PROGRAM_INITIALIZE_CONFIG_DISCRIMINATOR = Uint8Array.from([208, 127, 21, 1, 194, 190, 196, 70]);
export const MINT_PROGRAM_UPDATE_CONFIG_DISCRIMINATOR = Uint8Array.from([29, 158, 252, 191, 10, 83, 219, 99]);
export const MINT_PROGRAM_CLAIM_MINT_DISCRIMINATOR = Uint8Array.from([49, 111, 110, 128, 99, 195, 144, 164]);
export const MPL_BUBBLEGUM_PROGRAM_ID = new PublicKey("BGUMAp9Gq7iTEuizy4pqaxsTyUCBK68MDfK752saRPUY");
export const MPL_NOOP_PROGRAM_ID = new PublicKey("mnoopTCrg4p8ry25e4bcWA9XZjbNjMTfgYVGGEdRsf3");
export const MPL_ACCOUNT_COMPRESSION_PROGRAM_ID = new PublicKey("mcmt6YrQEMKw8Mw43FmpRLmf7BqRnFMKmAcbxE3xkAW");
export const MPL_CORE_PROGRAM_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
export const MPL_CORE_CPI_SIGNER_ID = new PublicKey("CbNY3JiXdXNE9tPNEk1aRZVEkWdj2v7kfJLNQwZZgpXk");

export type MintProgramClaimPermitFields = {
  programId: string | PublicKey;
  wallet: string | PublicKey;
  intentId: string;
  redemptionId: string;
  stickerId: string;
  name: string;
  uri: string;
  expiresAtUnix: number | bigint;
};

export type MintProgramClaimInstructionArgs = {
  intentId: string;
  redemptionId: string;
  stickerId: string;
  name: string;
  uri: string;
  expiresAtUnix: number | bigint;
  claimHash: Uint8Array | Buffer;
};

export type InitializeMintProgramConfigArgs = {
  permitSignerPubkey: string | PublicKey;
  merkleTree: string | PublicKey;
  coreCollection: string | PublicKey;
  metadataBaseUri: string;
};

export type UpdateMintProgramConfigArgs = {
  newAdmin?: string | PublicKey | null;
  permitSignerPubkey?: string | PublicKey | null;
  merkleTree?: string | PublicKey | null;
  coreCollection?: string | PublicKey | null;
  metadataBaseUri?: string | null;
};

export type BuildClaimMintInstructionInput = {
  programId: string | PublicKey;
  payer: string | PublicKey;
  configPda: string | PublicKey;
  claimReceiptPda: string | PublicKey;
  merkleTree: string | PublicKey;
  coreCollection: string | PublicKey;
  args: MintProgramClaimInstructionArgs;
};

export type BuildInitializeMintProgramConfigInstructionInput = {
  programId: string | PublicKey;
  admin: string | PublicKey;
  configPda?: string | PublicKey;
  args: InitializeMintProgramConfigArgs;
};

export type BuildUpdateMintProgramConfigInstructionInput = {
  programId: string | PublicKey;
  admin: string | PublicKey;
  configPda?: string | PublicKey;
  args: UpdateMintProgramConfigArgs;
};

function toPublicKey(value: string | PublicKey) {
  return value instanceof PublicKey ? value : new PublicKey(value);
}

function encodeU32(value: number) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value, 0);
  return buf;
}

function encodeI64(value: number | bigint) {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(value), 0);
  return buf;
}

function encodeOption<T>(
  value: T | null | undefined,
  encoder: (inner: T) => Buffer,
) {
  if (value === null || value === undefined) return Buffer.from([0]);
  return Buffer.concat([Buffer.from([1]), encoder(value)]);
}

function encodeString(value: string) {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([encodeU32(bytes.length), bytes]);
}

function encodePubkey(value: string | PublicKey) {
  return toPublicKey(value).toBuffer();
}

export function buildMintProgramClaimBodyBytes(fields: MintProgramClaimPermitFields) {
  return Buffer.concat([
    encodeString(MINT_PROGRAM_CLAIM_DOMAIN),
    encodePubkey(fields.programId),
    encodePubkey(fields.wallet),
    encodeString(fields.intentId),
    encodeString(fields.redemptionId),
    encodeString(fields.stickerId),
    encodeString(fields.name),
    encodeString(fields.uri),
    encodeI64(fields.expiresAtUnix),
  ]);
}

export function getMintProgramIdFromEnv() {
  const raw = process.env.MINT_PROGRAM_ID?.trim();
  return new PublicKey(raw && raw.length ? raw : MINT_PROGRAM_ID_PLACEHOLDER);
}

export function findMintProgramConfigPda(programId: string | PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(MINT_PROGRAM_CONFIG_SEED, "utf8")],
    toPublicKey(programId),
  );
}

export function findMintProgramClaimReceiptPda(
  programId: string | PublicKey,
  claimHash: Uint8Array | Buffer,
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(MINT_PROGRAM_CLAIM_SEED, "utf8"), Buffer.from(claimHash)],
    toPublicKey(programId),
  );
}

export function findBubblegumTreeConfigPda(merkleTree: string | PublicKey) {
  return PublicKey.findProgramAddressSync(
    [toPublicKey(merkleTree).toBuffer()],
    MPL_BUBBLEGUM_PROGRAM_ID,
  );
}

export function serializeClaimMintArgs(args: MintProgramClaimInstructionArgs) {
  const claimHash = Buffer.from(args.claimHash);
  if (claimHash.length !== 32) {
    throw new Error("serializeClaimMintArgs: claimHash must be 32 bytes");
  }

  return Buffer.concat([
    Buffer.from(MINT_PROGRAM_CLAIM_MINT_DISCRIMINATOR),
    encodeString(args.intentId),
    encodeString(args.redemptionId),
    encodeString(args.stickerId),
    encodeString(args.name),
    encodeString(args.uri),
    encodeI64(args.expiresAtUnix),
    claimHash,
  ]);
}

export function serializeInitializeMintProgramConfigArgs(
  args: InitializeMintProgramConfigArgs,
) {
  return Buffer.concat([
    Buffer.from(MINT_PROGRAM_INITIALIZE_CONFIG_DISCRIMINATOR),
    encodePubkey(args.permitSignerPubkey),
    encodePubkey(args.merkleTree),
    encodePubkey(args.coreCollection),
    encodeString(args.metadataBaseUri),
  ]);
}

export function serializeUpdateMintProgramConfigArgs(args: UpdateMintProgramConfigArgs) {
  return Buffer.concat([
    Buffer.from(MINT_PROGRAM_UPDATE_CONFIG_DISCRIMINATOR),
    encodeOption(args.newAdmin ?? null, encodePubkey),
    encodeOption(args.permitSignerPubkey ?? null, encodePubkey),
    encodeOption(args.merkleTree ?? null, encodePubkey),
    encodeOption(args.coreCollection ?? null, encodePubkey),
    encodeOption(args.metadataBaseUri ?? null, encodeString),
  ]);
}

export function buildClaimMintInstruction(input: BuildClaimMintInstructionInput) {
  const payer = toPublicKey(input.payer);
  const programId = toPublicKey(input.programId);
  const configPda = toPublicKey(input.configPda);
  const claimReceiptPda = toPublicKey(input.claimReceiptPda);
  const merkleTree = toPublicKey(input.merkleTree);
  const coreCollection = toPublicKey(input.coreCollection);
  const [treeConfigPda] = findBubblegumTreeConfigPda(merkleTree);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: false },
      { pubkey: claimReceiptPda, isSigner: false, isWritable: true },
      { pubkey: treeConfigPda, isSigner: false, isWritable: true },
      { pubkey: merkleTree, isSigner: false, isWritable: true },
      { pubkey: coreCollection, isSigner: false, isWritable: true },
      { pubkey: MPL_BUBBLEGUM_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: MPL_CORE_CPI_SIGNER_ID, isSigner: false, isWritable: false },
      { pubkey: MPL_NOOP_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: MPL_ACCOUNT_COMPRESSION_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: MPL_CORE_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: serializeClaimMintArgs(input.args),
  });
}

export function buildInitializeMintProgramConfigInstruction(
  input: BuildInitializeMintProgramConfigInstructionInput,
) {
  const admin = toPublicKey(input.admin);
  const programId = toPublicKey(input.programId);
  const configPda =
    input.configPda instanceof PublicKey || typeof input.configPda === "string"
      ? toPublicKey(input.configPda)
      : findMintProgramConfigPda(programId)[0];

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: serializeInitializeMintProgramConfigArgs(input.args),
  });
}

export function buildUpdateMintProgramConfigInstruction(
  input: BuildUpdateMintProgramConfigInstructionInput,
) {
  const admin = toPublicKey(input.admin);
  const programId = toPublicKey(input.programId);
  const configPda =
    input.configPda instanceof PublicKey || typeof input.configPda === "string"
      ? toPublicKey(input.configPda)
      : findMintProgramConfigPda(programId)[0];

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: configPda, isSigner: false, isWritable: true },
    ],
    data: serializeUpdateMintProgramConfigArgs(input.args),
  });
}
