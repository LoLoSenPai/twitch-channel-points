const DEFAULT_MARKET_FEE_BPS = 700;

export function getMarketFeeBps() {
  const raw = String(process.env.MARKET_FEE_BPS ?? "").trim();
  if (!raw) return DEFAULT_MARKET_FEE_BPS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error("Invalid MARKET_FEE_BPS");
  }

  const feeBps = Math.floor(parsed);
  if (feeBps < 0 || feeBps > 10_000) {
    throw new Error("MARKET_FEE_BPS must be between 0 and 10000");
  }
  return feeBps;
}

export function getMarketFeeWallet(fallbackWallet: string) {
  const configured = String(process.env.MARKET_FEE_WALLET ?? "").trim();
  const value = configured || String(fallbackWallet ?? "").trim();
  if (!value) throw new Error("Missing MARKET_FEE_WALLET");
  return value;
}

export function splitSaleAmount(priceLamports: number, feeBps: number) {
  if (!Number.isFinite(priceLamports) || priceLamports <= 0) {
    throw new Error("Invalid sale price");
  }
  if (!Number.isFinite(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error("Invalid market fee bps");
  }

  const totalLamports = Math.floor(priceLamports);
  const feeLamports = Math.floor((totalLamports * Math.floor(feeBps)) / 10_000);
  const sellerLamports = totalLamports - feeLamports;
  if (sellerLamports <= 0) {
    throw new Error("Sale price is too low for configured market fee");
  }

  return {
    totalLamports,
    feeLamports,
    sellerLamports,
  };
}
