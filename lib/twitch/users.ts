import { getTwitchAppAccessToken } from "@/lib/twitch/app-token";

export type ResolvedTwitchUser = {
  twitchUserId: string;
  login: string;
  displayName: string;
};

type TwitchUserCacheEntry = ResolvedTwitchUser & {
  expiresAt: number;
};

const gc = globalThis as typeof globalThis & {
  __twitchUsersByIdCache?: Map<string, TwitchUserCacheEntry>;
};

function getUserCache() {
  if (!gc.__twitchUsersByIdCache) {
    gc.__twitchUsersByIdCache = new Map<string, TwitchUserCacheEntry>();
  }
  return gc.__twitchUsersByIdCache;
}

function cacheTtlMs() {
  const seconds = Number(process.env.TWITCH_USERS_CACHE_SECONDS ?? 300);
  if (!Number.isFinite(seconds) || seconds <= 0) return 300_000;
  return Math.floor(seconds * 1000);
}

export async function resolveTwitchUserIdOrLogin(
  value: string
): Promise<ResolvedTwitchUser | null> {
  const input = String(value ?? "").trim();
  if (!input) return null;

  const accessToken = await getTwitchAppAccessToken();
  const clientId = String(process.env.TWITCH_CLIENT_ID ?? "").trim();
  if (!clientId) {
    throw new Error("Missing TWITCH_CLIENT_ID");
  }

  const url = new URL("https://api.twitch.tv/helix/users");
  if (/^\d+$/.test(input)) {
    url.searchParams.set("id", input);
  } else {
    url.searchParams.set("login", input.toLowerCase());
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": clientId,
    },
    cache: "no-store",
  });

  const json = (await response.json().catch(() => null)) as
    | {
        data?: Array<{
          id?: string;
          login?: string;
          display_name?: string;
        }>;
      }
    | null;

  if (!response.ok) {
    throw new Error(
      `Twitch user lookup failed (${response.status}): ${JSON.stringify(json)}`
    );
  }

  const row = json?.data?.[0];
  const twitchUserId = String(row?.id ?? "").trim();
  if (!twitchUserId) return null;

  return {
    twitchUserId,
    login: String(row?.login ?? "").trim() || twitchUserId,
    displayName:
      String(row?.display_name ?? row?.login ?? "").trim() || twitchUserId,
  };
}

export async function fetchTwitchUsersByIds(
  twitchUserIds: string[]
): Promise<Map<string, ResolvedTwitchUser>> {
  const result = new Map<string, ResolvedTwitchUser>();
  const ids = [...new Set(twitchUserIds.map((v) => String(v).trim()).filter(Boolean))];
  if (!ids.length) return result;

  const cache = getUserCache();
  const now = Date.now();
  const missing: string[] = [];

  for (const id of ids) {
    const cached = cache.get(id);
    if (cached && cached.expiresAt > now) {
      result.set(id, {
        twitchUserId: cached.twitchUserId,
        login: cached.login,
        displayName: cached.displayName,
      });
      continue;
    }
    missing.push(id);
  }

  if (!missing.length) return result;

  const accessToken = await getTwitchAppAccessToken();
  const clientId = String(process.env.TWITCH_CLIENT_ID ?? "").trim();
  if (!clientId) {
    throw new Error("Missing TWITCH_CLIENT_ID");
  }

  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    const url = new URL("https://api.twitch.tv/helix/users");
    for (const id of chunk) {
      url.searchParams.append("id", id);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": clientId,
      },
      cache: "no-store",
    });

    const json = (await response.json().catch(() => null)) as
      | {
          data?: Array<{
            id?: string;
            login?: string;
            display_name?: string;
          }>;
        }
      | null;

    if (!response.ok) {
      throw new Error(
        `Twitch users lookup failed (${response.status}): ${JSON.stringify(json)}`
      );
    }

    for (const row of json?.data ?? []) {
      const twitchUserId = String(row?.id ?? "").trim();
      if (!twitchUserId) continue;
      const resolved = {
        twitchUserId,
        login: String(row?.login ?? "").trim() || twitchUserId,
        displayName:
          String(row?.display_name ?? row?.login ?? "").trim() || twitchUserId,
      };
      cache.set(twitchUserId, { ...resolved, expiresAt: now + cacheTtlMs() });
      result.set(twitchUserId, resolved);
    }
  }

  return result;
}
