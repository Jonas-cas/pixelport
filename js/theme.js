/**
 * theme.js
 *
 * Verwaltet die Anzeige-Einstellungen (Dark/Bright Mode + Farbthema) von PixelPort
 * und speichert sie in localStorage, damit sie beim nächsten Besuch erhalten bleiben.
 *
 * WICHTIG: Diese Datei wird auf JEDER Seite als erstes Skript im <head> geladen
 * (vor den Stylesheets). So werden die gespeicherten Einstellungen sofort auf
 * <html> gesetzt, bevor irgendetwas gerendert wird – das verhindert ein kurzes
 * "Aufblitzen" im falschen Theme beim Laden der Seite.
 */

(function () {
  "use strict";

  const STORAGE_KEY = "pixelport-settings";

  const DEFAULT_SETTINGS = {
    mode: "dark", // "dark" | "light"
    theme: "neon", // siehe THEMES weiter unten
  };

  // Verfügbare Farbthemen ("Design"). Die id landet als data-theme auf <html>.
  // Neues Thema hinzufügen: einfach hier ein Objekt ergänzen, den Rest
  // (Buttons auf der Settings-Seite, CSS-Variablen) siehe css/themes.css.
  const THEMES = [
    { id: "neon", label: "Retro Neon", swatch: ["#a855f7", "#22d3ee"] },
    { id: "ocean", label: "Ocean", swatch: ["#2563eb", "#06b6d4"] },
    { id: "sunset", label: "Sunset", swatch: ["#f97316", "#ec4899"] },
    { id: "forest", label: "Forest", swatch: ["#22c55e", "#84cc16"] },
  ];

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };

      const parsed = JSON.parse(raw);
      return {
        mode: parsed.mode === "light" ? "light" : "dark",
        theme: THEMES.some((t) => t.id === parsed.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
      };
    } catch (err) {
      console.warn("PixelPort: Einstellungen konnten nicht gelesen werden, nutze Standard.", err);
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function applySettings(settings) {
    const root = document.documentElement;
    root.setAttribute("data-mode", settings.mode);
    root.setAttribute("data-theme", settings.theme);
  }

  // Sofort beim Laden der Seite anwenden.
  applySettings(loadSettings());

  // Global verfügbar machen, damit settings.js (und bei Bedarf andere Seiten)
  // darauf zugreifen können, ohne die Logik zu duplizieren.
  window.PixelPortTheme = {
    DEFAULT_SETTINGS,
    THEMES,
    loadSettings,
    saveSettings,
    applySettings,
  };
})();
