// Light/dark theme. The preference lives in localStorage ("light", "dark" or
// absent = follow the system), and the "dark" class on <html> applies it.

export type ThemePreference = "light" | "dark" | "system";

const KEY = "theme";

// Runs inline in <head> before the first paint, so a dark page never flashes
// white. Kept as a string because it can't import anything.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export function getThemePreference(): ThemePreference {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(pref: ThemePreference) {
  const dark =
    pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // Private mode / blocked storage: the choice just won't be remembered.
  }
  applyTheme(pref);
}
