import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { TradeOffer } from "@/lib/models";
import {
  assertSignedTxMatchesPrepared,
  executeDelegatedSwap,
  sendSignedTxB64,
} from "@/lib/solana/trades";
import { tradeDelegatePublicKeyBase58 } from "@/lib/solana/umi";

type Params = { id: string };

export async function POST(
  req: Request,
  { params }: { params: Params | Promise<Params> }
) {
  const session = await auth();
  const twitchUserId = (session?.user as { id?: string })?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await Promise.resolve(params);
  const offerId = String(id ?? "").trim();
  if (!offerId) return new NextResponse("Missing offer id", { status: 400 });

  const body = await req.json().catch(() => null);
  const signedTxB64 = String(body?.signedTxB64 ?? "").trim();
  const walletPubkey = String(body?.walletPubkey ?? "").trim();
  if (!signedTxB64 || !walletPubkey) {
    return new NextResponse("Missing params", { status: 400 });
  }

  await db();

  const offer = await TradeOffer.findOne({
    offerId,
    status: "LOCKED",
    takerTwitchUserId: twitchUserId,
  }).lean();

  if (!offer) return new NextResponse("Offer is not ready for taker submit", { status: 409 });
  if (!offer.takerPreparedDelegationTxB64 || !offer.takerAssetId || !offer.takerWallet) {
    return new NextResponse("Missing taker prepared state", { status: 409 });
  }
  if (String(offer.takerWallet) !== walletPubkey) {
    return new NextResponse("Wallet mismatch", { status: 409 });
  }

  let takerDelegationTxSig: string | null = null;
  try {
    assertSignedTxMatchesPrepared(signedTxB64, offer.takerPreparedDelegationTxB64);
    takerDelegationTxSig = await sendSignedTxB64(signedTxB64);

    const settlementTxSig = await executeDelegatedSwap({
      makerAssetId: String(offer.makerAssetId),
      makerWallet: String(offer.makerWallet),
      takerAssetId: String(offer.takerAssetId),
      takerWallet: String(offer.takerWallet),
      delegateWallet: tradeDelegatePublicKeyBase58(),
    });

    await TradeOffer.updateOne(
      { offerId, status: "LOCKED" },
      {
        $set: {
          status: "DONE",
          takerDelegationTxSig,
          settlementTxSig,
          takerPreparedDelegationTxB64: null,
          error: null,
        },
      }
    );

    return NextResponse.json({
      ok: true,
      offerId,
      takerDelegationTxSig,
      settlementTxSig,
    });
  } catch (e) {
    await TradeOffer.updateOne(
      { offerId },
      {
        $set: {
          status: "FAILED",
          takerDelegationTxSig,
          error: (e as Error)?.message ?? "Accept submit failed",
        },
      }
    );

    return new NextResponse("Accept submit failed", { status: 500 });
  }
}
