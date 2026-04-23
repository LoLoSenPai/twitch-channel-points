import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { TradeOffer } from "@/lib/models";
import {
  confirmTxSig,
  signedTxMatchesPrepared,
  sendSignedTxB64,
  waitForTradeAssetState,
} from "@/lib/solana/trades";
import { tradeDelegatePublicKeyBase58 } from "@/lib/solana/umi";

export async function POST(req: Request) {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const offerId = String(body?.offerId ?? "").trim();
  const signedTxB64 = String(body?.signedTxB64 ?? "").trim();
  const txSig = String(body?.txSig ?? "").trim();
  const walletPubkey = String(body?.walletPubkey ?? "").trim();
  if (!offerId || (!signedTxB64 && !txSig) || !walletPubkey) {
    return new NextResponse("Missing params", { status: 400 });
  }

  await db();

  const offer = await TradeOffer.findOne({
    offerId,
    makerTwitchUserId: twitchUserId,
  }).lean();

  if (!offer) return new NextResponse("Offer not found", { status: 404 });
  if (offer.status !== "DRAFT") {
    return new NextResponse("Offer is not in DRAFT state", { status: 409 });
  }
  if (offer.expiresAt && new Date(offer.expiresAt) < new Date()) {
    await TradeOffer.updateOne(
      { offerId },
      { $set: { status: "EXPIRED", error: "OFFER_EXPIRED" } }
    );
    return new NextResponse("Offer expired", { status: 409 });
  }
  if (String(offer.makerWallet) !== walletPubkey) {
    return new NextResponse("Wallet mismatch", { status: 409 });
  }
  if (!offer.preparedDelegationTxB64) {
    return new NextResponse("Missing prepared delegation tx", { status: 409 });
  }

  try {
    let sig = txSig;
    if (signedTxB64) {
      const matchesPrepared = signedTxMatchesPrepared(
        signedTxB64,
        offer.preparedDelegationTxB64
      );
      if (!matchesPrepared) {
        console.warn("trades/offers/submit: signed tx differs from prepared tx", {
          offerId,
        });
      }

      sig = await sendSignedTxB64(signedTxB64);
    } else {
      sig = await confirmTxSig(txSig);
    }

    await waitForTradeAssetState(
      String(offer.makerAssetId),
      (state) =>
        state.leafOwner === String(offer.makerWallet) &&
        state.leafDelegate === tradeDelegatePublicKeyBase58(),
      { description: "Asset is not delegated to trade authority" }
    );

    await TradeOffer.updateOne(
      { offerId },
      {
        $set: {
          status: "OPEN",
          makerDelegationTxSig: sig,
          preparedDelegationTxB64: null,
          error: null,
        },
      }
    );

    return NextResponse.json({ ok: true, offerId, tx: sig });
  } catch (e) {
    const message = (e as Error)?.message ?? "Delegation failed";
    await TradeOffer.updateOne(
      { offerId },
      {
        $set: {
          status: "FAILED",
          error: message,
        },
      }
    );

    return new NextResponse(`Offer submit failed: ${message}`, { status: 500 });
  }
}
