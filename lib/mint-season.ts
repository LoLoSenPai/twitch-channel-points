export function isMintSeasonEnded() {
  const value = String(process.env.MINT_SEASON_ENDED ?? "")
    .trim()
    .toLowerCase();

  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export const MINT_SEASON_ENDED_MESSAGE =
  "Le mint de la saison 1 est terminé. Les cartes restent visibles, les échanges restent disponibles, et la suite sera annoncée sur la chaîne Twitch.";
