export const AVICHIAN_THEMES = ['default', 'football', 'magic', 'hero', 'glam'] as const;
export type AvichianTheme = (typeof AVICHIAN_THEMES)[number];

const STORAGE_KEY = 'avichian-theme';

export function normalizeTheme(value: string | null | undefined): AvichianTheme {
  return AVICHIAN_THEMES.includes(value as AvichianTheme) ? (value as AvichianTheme) : 'default';
}

/** Applies presentation only; no account or content data is ever changed. */
export function applyTheme(value: string | null | undefined) {
  const theme = normalizeTheme(value);
  document.documentElement.dataset.avTheme = theme;
  document.documentElement.classList.toggle('dark', theme === 'magic' || theme === 'hero');
  document.documentElement.style.colorScheme = theme === 'magic' || theme === 'hero' ? 'dark' : 'light';
  localStorage.setItem(STORAGE_KEY, theme);
  return theme;
}

export function getCachedTheme() {
  return normalizeTheme(localStorage.getItem(STORAGE_KEY));
}
