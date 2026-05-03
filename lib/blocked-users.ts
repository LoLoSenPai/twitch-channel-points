function parseBlockedUserIds(raw: string | undefined | null) {
  const text = String(raw ?? "").trim();
  if (!text) return new Set<string>();
  return new Set(
    text
      .split(",")
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean)
  );
}

export function getBlockedMintTwitchUserIds() {
  return parseBlockedUserIds(process.env.BLOCKED_MINT_TWITCH_USER_IDS);
}

export function isMintBlockedForTwitchUser(twitchUserId: string) {
  const id = String(twitchUserId ?? "").trim();
  if (!id) return false;
  return getBlockedMintTwitchUserIds().has(id);
}
