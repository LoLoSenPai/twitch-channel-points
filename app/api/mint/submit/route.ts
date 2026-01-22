import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Redemption, MintIntent, Mint } from "@/lib/models";
import { Connection, VersionedTransaction } from "@solana/web3.js";

type SessionUser = {
  id?: string;
  name?: string;
  displayName?: string;
};

type ExtendedSessionUser = SessionUser & {
  displayName?: string;
};

type IntentDoc = {
  wallet: string;
  stickerId: string | number;
  redemptionId: string;
  status: "PREPARED" | "DONE" | "FAILED";
  preparedTxB64: string;
};

type NotifyPayload = {
  displayName: string;
  stickerName: string;
  stickerId: string;
  rarity: "R" | "SR" | "SSR";
  tx: string;
};

async function notifyTwitchBot(payload: NotifyPayload) {
  const url = process.env.TWITCH_BOT_NOTIFY_URL; // ex: https://...plesk.page/notify

  // ✅ debug minimal (visible dans les logs Vercel)
  if (!url) {
    console.log("[notify] TWITCH_BOT_NOTIFY_URL missing");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    console.log("[notify] POST", url);

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      // pas de cache, au cas où
      cache: "no-store",
    });

    console.log("[notify] status", res.status);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.log("[notify] body", text.slice(0, 300));
    }
  } catch (e) {
    // ✅ log pour voir l’erreur dans Vercel (DNS, TLS, timeout, etc.)
    console.log("[notify] error", (e as Error)?.message ?? e);
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const twitchUserId = (session?.user as SessionUser)?.id;
  if (!twitchUserId) return new NextResponse("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  const intentId = body?.intentId as string | undefined;
  const signedTxB64 = body?.signedTxB64 as string | undefined;

  if (!intentId || !signedTxB64) {
    return new NextResponse("Missing params", { status: 400 });
  }

  await db();

  const intent = (await MintIntent.findOne({
    intentId,
    twitchUserId,
  }).lean()) as (IntentDoc & { _id?: unknown }) | null;

  if (!intent || intent.status !== "PREPARED") {
    return new NextResponse("Bad intent", { status: 409 });
  }

  const rpcUrl = process.env.HELIUS_RPC_URL!;
  const connection = new Connection(rpcUrl, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });

  try {
    const raw = Buffer.from(signedTxB64, "base64");

    // ✅ Anti-triche: vérifie que la tx signée correspond à la tx préparée (message identique)
    const signedVtx = VersionedTransaction.deserialize(raw);
    const preparedVtx = VersionedTransaction.deserialize(
      Buffer.from(intent.preparedTxB64, "base64"),
    );

    const signedMsg = Buffer.from(signedVtx.message.serialize());
    const preparedMsg = Buffer.from(preparedVtx.message.serialize());

    if (!signedMsg.equals(preparedMsg)) {
      throw new Error("Signed transaction does not match prepared transaction");
    }

    // 1) envoi
    const sig = await connection.sendRawTransaction(raw, {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: "processed",
    });

    // 2) confirmation
    const conf = await connection.confirmTransaction(sig, "confirmed");
    if (conf.value.err) {
      throw new Error(`Tx failed: ${JSON.stringify(conf.value.err)}`);
    }

    // 3) DB uniquement après succès
    await Mint.create({
      twitchUserId,
      wallet: intent.wallet,
      stickerId: String(intent.stickerId),
      mintTx: sig,
    });

    await Redemption.updateOne(
      { redemptionId: intent.redemptionId },
      { $set: { status: "CONSUMED", consumedAt: new Date(), mintTx: sig } },
    );

    await MintIntent.updateOne(
      { intentId },
      { $set: { status: "DONE", mintTx: sig } },
    );

    // 4) notification Twitch bot
    let stickerName = `Panini #${String(intent.stickerId)}`;

    try {
      const base = process.env.METADATA_BASE_URI; // ✅ tu l'as déjà
      if (base) {
        const metaUrl = `${base}/${String(intent.stickerId)}.json`;
        const metaRes = await fetch(metaUrl, { cache: "no-store" });
        if (metaRes.ok) {
          const meta = (await metaRes.json()) as { name?: string };
          if (meta?.name) stickerName = meta.name;
        }
      }
    } catch {}

    const payload: NotifyPayload = {
      displayName:
        (session?.user as ExtendedSessionUser)?.displayName ??
        (session?.user as ExtendedSessionUser)?.name ??
        "Quelqu'un",
      stickerName, // ✅ ex: "Gardien du Bitcoin Déchu"
      stickerId: String(intent.stickerId),
      rarity:
        String(intent.stickerId) === "3"
          ? "SSR"
          : String(intent.stickerId) === "2"
            ? "SR"
            : "R",
      tx: sig,
    };

    // 🚀 fire-and-forget (ne bloque jamais la réponse API)
    // void notifyTwitchBot(payload);
    await notifyTwitchBot(payload);

    return NextResponse.json({
      ok: true,
      tx: sig,
      stickerId: String(intent.stickerId),
    });
  } catch (e) {
    console.error("mint/submit failed", e);

    await MintIntent.updateOne(
      { intentId },
      { $set: { status: "FAILED", error: (e as Error)?.message ?? "unknown" } },
    );

    await Redemption.updateOne(
      { redemptionId: intent.redemptionId },
      { $set: { lockedByIntentId: null } },
    );

    return new NextResponse("Mint failed", { status: 500 });
  }
}
