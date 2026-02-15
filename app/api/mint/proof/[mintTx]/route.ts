import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Mint } from "@/lib/models";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ mintTx: string }> },
) {
  const { mintTx } = await params;
  const sig = decodeURIComponent(mintTx ?? "").trim();
  if (!sig) return new NextResponse("Missing mintTx", { status: 400 });

  await db();

  const mint = (await Mint.findOne({ mintTx: sig }).lean()) as
    | {
        mintTx?: string;
        stickerId?: string;
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
      }
    | null;

  if (!mint) return new NextResponse("Mint not found", { status: 404 });

  if (!mint.randomnessProvider || !mint.randomnessValueHex) {
    return new NextResponse("Proof not available for this mint", { status: 404 });
  }

  return NextResponse.json({
    mintTx: mint.mintTx ?? sig,
    stickerId: String(mint.stickerId ?? ""),
    proof: {
      provider: mint.randomnessProvider,
      queuePubkey: mint.randomnessQueuePubkey ?? null,
      randomnessAccount: mint.randomnessAccount ?? null,
      commitTx: mint.randomnessCommitTx ?? null,
      revealTx: mint.randomnessRevealTx ?? null,
      closeTx: mint.randomnessCloseTx ?? null,
      randomHex: mint.randomnessValueHex ?? null,
      seedSlot:
        typeof mint.randomnessSeedSlot === "number" ? mint.randomnessSeedSlot : null,
      revealSlot:
        typeof mint.randomnessRevealSlot === "number"
          ? mint.randomnessRevealSlot
          : null,
      drawIndex: typeof mint.drawIndex === "number" ? mint.drawIndex : null,
      availableStickerIds: Array.isArray(mint.drawAvailableStickerIds)
        ? mint.drawAvailableStickerIds.map(String)
        : [],
      algorithm:
        "availableIds sorted ascending; index = BigInt(randomHex) % availableIds.length",
    },
  });
}
