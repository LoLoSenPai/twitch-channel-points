import { UserWallet } from "@/lib/models";

export type WalletLinkResult =
  | { ok: true }
  | { ok: false; ownerTwitchUserId: string };

export async function touchWalletForUser(
  twitchUserId: string,
  wallet: string
): Promise<WalletLinkResult> {
  const existing = (await UserWallet.findOne({ wallet })
    .select({ twitchUserId: 1 })
    .lean()) as { twitchUserId?: string } | null;

  const owner = String(existing?.twitchUserId ?? "").trim();
  if (owner && owner !== twitchUserId) {
    return { ok: false, ownerTwitchUserId: owner };
  }

  await UserWallet.updateOne(
    { twitchUserId, wallet },
    { $set: { lastSeenAt: new Date() } },
    { upsert: true }
  );

  return { ok: true };
}

