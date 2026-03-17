import { createHash } from "crypto";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  buildMintProgramClaimBodyBytes,
  type MintProgramClaimPermitFields,
} from "@/lib/solana/mint-program";

function parseSecretFromEnv(name: string) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) throw new Error(`Missing ${name}`);

  try {
    return Uint8Array.from(JSON.parse(raw) as number[]);
  } catch {
    throw new Error(`Invalid ${name} format`);
  }
}

export function sha256Bytes(data: Uint8Array | Buffer) {
  return createHash("sha256").update(Buffer.from(data)).digest();
}

export function buildMintProgramClaimPayload(fields: MintProgramClaimPermitFields) {
  const bodyBytes = buildMintProgramClaimBodyBytes(fields);
  const claimHash = sha256Bytes(bodyBytes);
  const payloadBytes = Buffer.concat([bodyBytes, claimHash]);
  return { bodyBytes, claimHash, payloadBytes };
}

export function permitSignerFromEnv() {
  const umi = createUmi(process.env.HELIUS_RPC_URL!);
  const secret = parseSecretFromEnv("MINT_PERMIT_SIGNER_SECRET");
  return umi.eddsa.createKeypairFromSecretKey(secret);
}

export function signMintProgramPayload(payloadBytes: Uint8Array | Buffer) {
  const umi = createUmi(process.env.HELIUS_RPC_URL!);
  const signer = permitSignerFromEnv();
  const signature = umi.eddsa.sign(Buffer.from(payloadBytes), signer);

  return {
    signature,
    publicKey: signer.publicKey,
  };
}
