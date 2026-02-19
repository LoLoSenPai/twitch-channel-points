import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { TransferIntent, UserWallet } from "@/lib/models";
import {
  sendSignedTxB64,
  signedTxMatchesPrepared,
} from "@/lib/solana/trades";

function normalizeWallet(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  try {
    return new PublicKey(raw).toBase58();
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const intentId = String(body?.intentId ?? "").trim();
  const signedTxB64 = String(body?.signedTxB64 ?? "").trim();
  const walletPubkey = normalizeWallet(body?.walletPubkey);

  if (!intentId || !signedTxB64 || !walletPubkey) {
    return new NextResponse("Missing params", { status: 400 });
  }

  await db();

  await UserWallet.updateOne(
    { twitchUserId, wallet: walletPubkey },
    { $set: { lastSeenAt: new Date() } },
    { upsert: true }
  );

  const intent = await TransferIntent.findOne({
    intentId,
    twitchUserId,
    status: "PREPARED",
  }).lean();

  if (!intent) return new NextResponse("Transfer intent not found", { status: 404 });
  if (String(intent.wallet ?? "") !== walletPubkey) {
    return new NextResponse("Wallet mismatch", { status: 409 });
  }

  try {
    const matchesPrepared = signedTxMatchesPrepared(
      signedTxB64,
      String(intent.preparedTxB64 ?? "")
    );
    if (!matchesPrepared) {
      console.warn("trades/send/submit: signed tx differs from prepared tx", {
        intentId,
      });
    }

    const txSig = await sendSignedTxB64(signedTxB64);

    await TransferIntent.updateOne(
      { intentId, status: "PREPARED" },
      {
        $set: {
          status: "DONE",
          txSig,
          error: null,
          preparedTxB64: null,
        },
      }
    );

    return NextResponse.json({ ok: true, intentId, tx: txSig });
  } catch (e) {
    const message = (e as Error)?.message ?? "Transfer submit failed";
    await TransferIntent.updateOne(
      { intentId },
      {
        $set: {
          status: "FAILED",
          error: message,
        },
      }
    );

    return new NextResponse(`Transfer submit failed: ${message}`, { status: 500 });
  }
}