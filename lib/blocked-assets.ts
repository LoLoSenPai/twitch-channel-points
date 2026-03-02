function parseBlockedAssetIds(raw: string | undefined | null) {
  const text = String(raw ?? "").trim();
  if (!text) return new Set<string>();
  return new Set(
    text
      .split(",")
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean)
  );
}

export function getBlockedAssetIds() {
  return parseBlockedAssetIds(process.env.BLOCKED_ASSET_IDS);
}

export function isAssetIdBlocked(assetId: string) {
  const id = String(assetId ?? "").trim();
  if (!id) return false;
  return getBlockedAssetIds().has(id);
}

