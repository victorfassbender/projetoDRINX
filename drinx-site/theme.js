const THEME_STORAGE_KEY = "drinx-theme";
const DARK_THEME = "dark";
const LIGHT_THEME = "light";

const root = document.documentElement;
const toggleButton = document.querySelector("[data-theme-toggle]");

const readStoredTheme = () => {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === DARK_THEME || value === LIGHT_THEME ? value : "";
  } catch {
    return "";
  }
};

const saveTheme = (theme) => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore write errors
  }
};

const getInitialTheme = () => {
  const storedTheme = readStoredTheme();
  if (storedTheme) {
    return storedTheme;
  }

  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? DARK_THEME
    : LIGHT_THEME;
};

const applyTheme = (theme) => {
  root.dataset.theme = theme;

  if (!toggleButton) {
    return;
  }

  const isDark = theme === DARK_THEME;
  toggleButton.setAttribute("aria-pressed", String(isDark));
  toggleButton.title = isDark ? "Ativar tema claro" : "Ativar tema escuro";
  toggleButton.textContent = isDark ? "☀" : "☾";
};

const initThemeToggle = () => {
  const currentTheme = getInitialTheme();
  applyTheme(currentTheme);

  if (!toggleButton) {
    return;
  }

  toggleButton.addEventListener("click", () => {
    const nextTheme = root.dataset.theme === DARK_THEME ? LIGHT_THEME : DARK_THEME;
    applyTheme(nextTheme);
    saveTheme(nextTheme);
  });
};

initThemeToggle();
