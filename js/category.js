/**
 * category.js
 *
 * Logik für die Kategorie-Seite: liest die Kategorie-ID aus der URL
 * (?id=...), sucht sie in GAME_CATEGORIES und rendert die zugehörigen
 * Spiele als Kacheln in #games-grid. Spiele ohne url/available gelten
 * als Platzhalter ("Bald verfügbar").
 */

(function () {
  "use strict";

  function getCategoryIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
  }

  function createGameTile(game) {
    const isAvailable = Boolean(game.available && game.url);
    const el = document.createElement(isAvailable ? "a" : "div");
    el.className = "tile game-tile" + (isAvailable ? "" : " game-tile--soon");
    if (isAvailable) {
      el.href = game.url;
    }

    const icon = document.createElement("span");
    icon.className = "tile-icon";
    icon.textContent = game.icon;

    const title = document.createElement("h3");
    title.className = "tile-title";
    title.textContent = game.name;

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = isAvailable ? "Spielen" : "Bald verfügbar";

    el.append(icon, title, badge);
    return el;
  }

  function renderCategory() {
    const categoryId = getCategoryIdFromUrl();
    const category = categoryId ? getCategoryById(categoryId) : null;

    const titleEl = document.getElementById("category-title");
    const descEl = document.getElementById("category-desc");
    const grid = document.getElementById("games-grid");

    if (!category) {
      titleEl.textContent = "Kategorie nicht gefunden";
      descEl.textContent = "Diese Kategorie existiert nicht (mehr). Bitte zurück zur Startseite.";
      grid.innerHTML = "";
      return;
    }

    document.title = `${category.name} – PixelPort`;
    titleEl.textContent = `${category.icon} ${category.name}`;
    descEl.textContent = category.description;

    grid.innerHTML = "";
    if (category.games.length === 0) {
      grid.innerHTML = '<p class="empty-state">Für diese Kategorie sind noch keine Spiele hinterlegt.</p>';
      return;
    }

    category.games.forEach((game) => {
      grid.appendChild(createGameTile(game));
    });
  }

  document.addEventListener("DOMContentLoaded", renderCategory);
})();
