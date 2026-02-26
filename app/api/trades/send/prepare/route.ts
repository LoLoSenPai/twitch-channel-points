import crypto from "crypto";
import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { TransferIntent } from "@/lib/models";
import { prepareOwnerTransferTxForAsset } from "@/lib/solana/trades";
import { touchWalletForUser } from "@/lib/wallet-link";

function rid() {
  return crypto.randomBytes(16).toString("hex");
}

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
  const walletPubkey = normalizeWallet(body?.walletPubkey);
  const recipientWallet = normalizeWallet(body?.recipientWallet);
  const assetId = String(body?.assetId ?? "").trim();

  if (!walletPubkey || !recipientWallet || !assetId) {
    return new NextResponse("Missing params", { status: 400 });
  }
  if (walletPubkey === recipientWallet) {
    return new NextResponse("Recipient must be different from sender", { status: 400 });
  }

  await db();

  const link = await touchWalletForUser(twitchUserId, walletPubkey);
  if (!link.ok) {
    return new NextResponse("This wallet is already linked to another Twitch account", {
      status: 409,
    });
  }

  const { txB64, stickerId } = await prepareOwnerTransferTxForAsset({
    assetId,
    ownerWallet: walletPubkey,
    recipientWallet,
  });

  const intentId = rid();
  await TransferIntent.create({
    intentId,
    twitchUserId,
    wallet: walletPubkey,
    assetId,
    stickerId,
    recipientWallet,
    preparedTxB64: txB64,
    status: "PREPARED",
  });

  return NextResponse.json({ intentId, txB64, stickerId, assetId, recipientWallet });
}
