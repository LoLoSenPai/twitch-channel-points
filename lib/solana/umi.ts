import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { keypairIdentity } from "@metaplex-foundation/umi";
import { mplBubblegum } from "@metaplex-foundation/mpl-bubblegum";
import { mplCore } from "@metaplex-foundation/mpl-core";

export function umiServer() {
  const umi = createUmi(process.env.HELIUS_RPC_URL!)
    .use(mplBubblegum())
    .use(mplCore());

  const secret = Uint8Array.from(JSON.parse(process.env.SOLANA_AUTHORITY_SECRET!));
  const kp = umi.eddsa.createKeypairFromSecretKey(secret);
  return umi.use(keypairIdentity(kp));
}
