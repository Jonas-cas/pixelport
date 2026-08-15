/**
 * settings.js
 *
 * Logik für die Einstellungsseite: Umschalten von Dark/Bright Mode und
 * Farbthema ("Design"). Nutzt PixelPortTheme (aus theme.js) zum Lesen,
 * Speichern und Anwenden der Einstellungen in localStorage.
 */

(function () {
  "use strict";

  function renderModeButtons(settings) {
    document.querySelectorAll("[data-mode-option]").forEach((btn) => {
      const value = btn.getAttribute("data-mode-option");
      const isActive = value === settings.mode;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
  }

  function renderThemeOptions(settings) {
    const container = document.getElementById("theme-options");
    if (!container) return;

    container.innerHTML = "";
    PixelPortTheme.THEMES.forEach((theme) => {
      const isActive = theme.id === settings.theme;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-swatch" + (isActive ? " is-active" : "");
      btn.setAttribute("data-theme-option", theme.id);
      btn.setAttribute("aria-pressed", String(isActive));
      btn.style.setProperty("--swatch-a", theme.swatch[0]);
      btn.style.setProperty("--swatch-b", theme.swatch[1]);

      const preview = document.createElement("span");
      preview.className = "theme-swatch-preview";
      preview.setAttribute("aria-hidden", "true");

      const label = document.createElement("span");
      label.className = "theme-swatch-label";
      label.textContent = theme.label;

      btn.append(preview, label);
      container.appendChild(btn);
    });
  }

  function updateSettings(patch) {
    const settings = { ...PixelPortTheme.loadSettings(), ...patch };
    PixelPortTheme.saveSettings(settings);
    PixelPortTheme.applySettings(settings);
    renderModeButtons(settings);
    renderThemeOptions(settings);
  }

  function init() {
    const settings = PixelPortTheme.loadSettings();
    renderModeButtons(settings);
    renderThemeOptions(settings);

    document.querySelectorAll("[data-mode-option]").forEach((btn) => {
      btn.addEventListener("click", () => {
        updateSettings({ mode: btn.getAttribute("data-mode-option") });
      });
    });

    document.getElementById("theme-options").addEventListener("click", (event) => {
      const btn = event.target.closest("[data-theme-option]");
      if (!btn) return;
      updateSettings({ theme: btn.getAttribute("data-theme-option") });
    });

    const resetBtn = document.getElementById("reset-settings");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        updateSettings({ ...PixelPortTheme.DEFAULT_SETTINGS });
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
