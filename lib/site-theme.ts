export const SITE_THEME_STORAGE_KEY = "site.theme";
export const SITE_THEME_EVENT = "site-theme-change";

export type SiteTheme = "dark" | "light";

export function normalizeSiteTheme(value: string | null | undefined): SiteTheme {
  return value === "light" ? "light" : "dark";
}

export function getStoredSiteTheme(): SiteTheme {
  if (typeof window === "undefined") return "dark";
  return normalizeSiteTheme(window.localStorage.getItem(SITE_THEME_STORAGE_KEY));
}

export function applySiteTheme(theme: SiteTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("site-theme-dark", "site-theme-light");
  root.classList.add(theme === "light" ? "site-theme-light" : "site-theme-dark");
  root.style.colorScheme = theme;
}

export function setSiteTheme(theme: SiteTheme) {
  if (typeof window === "undefined") return;
  const normalized = normalizeSiteTheme(theme);
  window.localStorage.setItem(SITE_THEME_STORAGE_KEY, normalized);
  applySiteTheme(normalized);
  window.dispatchEvent(
    new CustomEvent<SiteTheme>(SITE_THEME_EVENT, { detail: normalized })
  );
}

