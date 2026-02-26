# Panini Mint (Twitch Channel Points + Solana cNFT)

Web app for a Twitch community:
- viewers earn tickets via Twitch rewards,
- they mint cards (cNFTs) on Solana,
- they fill a 44-card album,
- they can trade duplicates in the marketplace.

Main stack: `Next.js (App Router)`, `TypeScript`, `MongoDB`, `Solana`, `Metaplex Bubblegum`, `Switchboard`.

## Features

- Twitch login + ticket management.
- cNFT minting with per-card supply control (`maxSupply`).
- Interactive album (pages, slots, card zoom, rarity visual effects).
- Trading marketplace (create, accept, cancel, delegate).
- Fairness page to verify random draws.
- Admin dashboard for Twitch rewards/subscriptions and monitoring.

## Quick start

Prerequisites:
- Node.js 20+
- npm or pnpm
- MongoDB
- Solana wallet for authority (and trade delegate if enabled)

1. Install dependencies:
```bash
npm install
```

2. Copy and fill environment files:
```bash
cp .env.EXAMPLE .env
cp bot/.env.EXAMPLE bot/.env
```

3. Start the app:
```bash
npm run dev
```

4. Open:
- App: `http://localhost:3000`

## Important env variables (.env)

The full template is in `.env.EXAMPLE`. Most important values:
- `MONGODB_URI`
- `NEXTAUTH_URL`, `NEXTAUTH_SECRET`
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_BROADCASTER_ID`
- `HELIUS_RPC_URL`
- `NEXT_PUBLIC_SOLANA_RPC_URL` (wallet adapter endpoint; set mainnet URL in production)
- `NEXT_PUBLIC_SOLSCAN_CLUSTER` (e.g. `devnet` in dev; empty on mainnet)
- `SOLANA_AUTHORITY_SECRET`
- `MERKLE_TREE_PUBKEY`, `CORE_COLLECTION_PUBKEY`, `COLLECTION_METADATA_URI`
- `TRADE_DELEGATE_SECRET` (if trades are enabled)
- `TRADE_LOCK_TTL_MINUTES` (auto-release timeout for locked trade offers)
- `TRADE_INSIGHTS_CACHE_SECONDS` (cache TTL for marketplace history/leaderboard)
- `SWITCHBOARD_QUEUE_PUBKEY` + `SWITCHBOARD_*` variables (fair randomness)
- `MINT_RANDOMNESS_MODE` (`local` or `switchboard`)
- `NEXT_PUBLIC_MARKET_ENABLE_SALES` (keep `false` for trade-only mode)

## Useful scripts

- `npm run dev`: start local dev server
- `npm run build`: production build
- `npm run lint`: run ESLint
- `npm run test:core`: quick unit checks on core logic
- `npm run test:quick`: `test:core` + TypeScript typecheck
- `npm run tree:create`: create a Merkle tree
- `npm run authority:print`: print authority public key
- `npm run db:reset -- --yes-reset`: wipe runtime DB data
- `npm run db:reset -- --yes-reset --with-collections`: wipe runtime data + collections

## Tests

The `tests/` folder contains lightweight and fast checks.

### `tests/core-randomness.test.ts`
Verifies critical behavior:
- deterministic modulo (`uniformIndexFromHex`)
- sold-out filtering (minted + reserved >= `maxSupply`)
- stable uniform pick over available IDs

Run:
```bash
npm run test:core
```

Quick global validation:
```bash
npm run test:quick
```

## Structure (summary)

- `app/`: Next.js pages + API routes
- `components/`: UI (mint panel, album, marketplace, navbar, etc.)
- `lib/`: business logic (stickers, random, solana, db, trades)
- `stickers/`: collection config + metadata
- `scripts/`: ops/dev scripts (tree, authority, metadata, seed)
- `tests/`: quick tests
- `bot/`: Twitch bot (rewards/tickets)

## Fairness notes

Minting uses a verifiable randomness flow (Switchboard + stored traces), exposed in:
- `/fairness` page
- API verification routes

Goal: let the community verify draws with no opaque backend behavior.

## Portfolio notes

This repo is a good portfolio project to showcase:
- Twitch + Solana integration
- cNFT logic with supply constraints
- collection-first UX with trading
- admin tooling and basic observability
- tests around critical business logic
