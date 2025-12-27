import Twitch from "next-auth/providers/twitch";
import type { NextAuthOptions, Account } from "next-auth";

type TwitchProfile = {
  preferred_username?: string;
  display_name?: string;
};

type TwitchAccount = Account & { expires_at?: number };

export const authOptions: NextAuthOptions = {
  providers: [
    Twitch({
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "user:read:email",
            "channel:read:redemptions",
            "channel:manage:redemptions",
          ].join(" "),
        },
      },
    }),
  ],

  session: { strategy: "jwt" },

  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === "twitch") {
        const a = account as TwitchAccount;

        token.twitchUserId = a.providerAccountId;
        token.twitchAccessToken = a.access_token;
        token.twitchRefreshToken = a.refresh_token;

        const expiresAtMs =
          typeof a.expires_at === "number"
            ? a.expires_at * 1000
            : Date.now() +
              (typeof a.expires_in === "number" ? a.expires_in * 1000 : 0);

        token.twitchExpiresAt = expiresAtMs;
      }

      const p = (profile ?? {}) as TwitchProfile;
      token.twitchDisplayName =
        p.preferred_username ?? p.display_name ?? token.name ?? "viewer";

      return token;
    },

    async session({ session, token }) {
      session.user.id = token.twitchUserId ?? "";
      session.user.displayName =
        token.twitchDisplayName ?? session.user.name ?? "viewer";

      session.twitchAccessToken = token.twitchAccessToken ?? null;
      session.twitchExpiresAt = token.twitchExpiresAt ?? null;

      return session;
    },
  },
};
