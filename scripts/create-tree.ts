import dotenv from "dotenv";
dotenv.config({ path: ".env" });

import { generateSigner } from "@metaplex-foundation/umi";
import { umiServer } from "../lib/solana/umi";
import { createTreeV2 } from "@metaplex-foundation/mpl-bubblegum";

(async () => {
  const umi = umiServer();
  const merkleTree = generateSigner(umi);
  const canopyDepth = Number(process.env.MERKLE_CANOPY_DEPTH ?? 8);
  const safeCanopyDepth =
    Number.isFinite(canopyDepth) && canopyDepth >= 0 ? Math.floor(canopyDepth) : 8;

  const builder = await createTreeV2(umi, {
    merkleTree,
    maxDepth: 14,
    maxBufferSize: 64,
    canopyDepth: safeCanopyDepth,
    public: false,
  });

  await builder.sendAndConfirm(umi);

  console.log("MERKLE_TREE_PUBKEY=", merkleTree.publicKey.toString());
  console.log("MERKLE_CANOPY_DEPTH=", safeCanopyDepth);
})();
