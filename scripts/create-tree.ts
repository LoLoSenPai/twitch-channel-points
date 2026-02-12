import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { generateSigner } from "@metaplex-foundation/umi";
import { umiServer } from "../lib/solana/umi";
import { createTreeV2 } from "@metaplex-foundation/mpl-bubblegum";

(async () => {
  const umi = umiServer();
  const merkleTree = generateSigner(umi);

  const builder = await createTreeV2(umi, {
    merkleTree,
    maxDepth: 14,
    maxBufferSize: 64,
    public: false,
  });

  await builder.sendAndConfirm(umi);

  console.log("MERKLE_TREE_PUBKEY=", merkleTree.publicKey.toString());
})();
