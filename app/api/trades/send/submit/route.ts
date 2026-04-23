import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { TransferIntent } from "@/lib/models";
import {
  confirmTxSig,
  sendSignedTxB64,
  signedTxMatchesPrepared,
  waitForTradeAssetState,
} from "@/lib/solana/trades";
import { touchWalletForUser } from "@/lib/wallet-link";

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
  const txSig = String(body?.txSig ?? "").trim();
  const walletPubkey = normalizeWallet(body?.walletPubkey);

  if (!intentId || (!signedTxB64 && !txSig) || !walletPubkey) {
    return new NextResponse("Missing params", { status: 400 });
  }

  await db();

  const link = await touchWalletForUser(twitchUserId, walletPubkey);
  if (!link.ok) {
    return new NextResponse("This wallet is already linked to another Twitch account", {
      status: 409,
    });
  }

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
    let finalTxSig = txSig;
    if (signedTxB64) {
      const matchesPrepared = signedTxMatchesPrepared(
        signedTxB64,
        String(intent.preparedTxB64 ?? "")
      );
      if (!matchesPrepared) {
        console.warn("trades/send/submit: signed tx differs from prepared tx", {
          intentId,
        });
      }

      finalTxSig = await sendSignedTxB64(signedTxB64);
    } else {
      finalTxSig = await confirmTxSig(txSig);
    }

    await waitForTradeAssetState(
      String(intent.assetId),
      (state) => state.leafOwner === String(intent.recipientWallet),
      { description: "Transfer did not move asset to recipient" }
    );

    await TransferIntent.updateOne(
      { intentId, status: "PREPARED" },
      {
        $set: {
          status: "DONE",
          txSig: finalTxSig,
          error: null,
          preparedTxB64: null,
        },
      }
    );

    return NextResponse.json({ ok: true, intentId, tx: finalTxSig });
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
