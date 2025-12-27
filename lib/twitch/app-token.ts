type AppTokenCache = { token: string; expiresAt: number };

const g = globalThis as unknown as { _twitchAppToken?: AppTokenCache };

export async function getTwitchAppAccessToken(): Promise<string> {
  const cached = g._twitchAppToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const clientId = process.env.TWITCH_CLIENT_ID!;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET!;

  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");

  const r = await fetch(url.toString(), { method: "POST" });
  const j = (await r.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
  } | null;

  if (!r.ok || !j?.access_token) {
    throw new Error(`Twitch app token failed: ${JSON.stringify(j)}`);
  }

  g._twitchAppToken = {
    token: j.access_token,
    expiresAt: Date.now() + Number(j.expires_in ?? 0) * 1000,
  };

  return g._twitchAppToken.token;
}
