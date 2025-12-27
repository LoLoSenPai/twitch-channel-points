import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Redemption, MintIntent, Mint } from "@/lib/models";
import { Connection } from "@solana/web3.js";

export async function POST(req: Request) {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const intentId = body?.intentId as string | undefined;
  const signedTxB64 = body?.signedTxB64 as string | undefined;

  if (!intentId || !signedTxB64) {
    return new NextResponse("Missing params", { status: 400 });
  }

  await db();

  const intent = await MintIntent.findOne({ intentId, twitchUserId }).lean();
  if (!intent || intent.status !== "PREPARED") {
    return new NextResponse("Bad intent", { status: 409 });
  }

  type IntentType = {
    wallet: string;
    stickerId: string | number;
    redemptionId: string;
    status: string;
  };

  const rpcUrl = process.env.HELIUS_RPC_URL!;
  const connection = new Connection(rpcUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });

  try {
    const raw = Buffer.from(signedTxB64, "base64");

    // 1) envoi
    const sig = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: "processed",
    });

    // 2) confirmation (attend la finalization)
    const conf = await connection.confirmTransaction(sig, "confirmed");
    if (conf.value.err) {
      throw new Error(`Tx failed: ${JSON.stringify(conf.value.err)}`);
    }

    // 3) DB uniquement après succès
    await Mint.create({
      twitchUserId,
      wallet: (intent as IntentType).wallet,
      stickerId: String((intent as IntentType).stickerId),
      mintTx: sig,
    });

    await Redemption.updateOne(
      { redemptionId: (intent as IntentType).redemptionId },
      { $set: { status: "CONSUMED", consumedAt: new Date(), mintTx: sig } }
    );

    await MintIntent.updateOne(
      { intentId },
      { $set: { status: "DONE", mintTx: sig } }
    );

    return NextResponse.json({ ok: true, tx: sig });
  } catch (e) {
    console.error("mint/submit failed", e);

    // statut intent + unlock ticket pour retry
    await MintIntent.updateOne(
      { intentId },
      { $set: { status: "FAILED", error: (e as Error)?.message ?? "unknown" } }
    );

    await Redemption.updateOne(
      { redemptionId: (intent as IntentType).redemptionId },
      { $set: { lockedByIntentId: null } }
    );

    return new NextResponse("Mint failed", { status: 500 });
  }
}
