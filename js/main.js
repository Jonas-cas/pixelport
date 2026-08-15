/**
 * main.js
 *
 * Logik für die PixelPort-Startseite: rendert die Kategorie-Kacheln
 * aus GAME_CATEGORIES (siehe games-data.js) in das Grid #categories-grid.
 */

(function () {
  "use strict";

  function createCategoryCard(category) {
    const link = document.createElement("a");
    link.className = "tile category-tile";
    link.href = `category.html?id=${encodeURIComponent(category.id)}`;

    const icon = document.createElement("span");
    icon.className = "tile-icon";
    icon.textContent = category.icon;

    const title = document.createElement("h2");
    title.className = "tile-title";
    title.textContent = category.name;

    const desc = document.createElement("p");
    desc.className = "tile-desc";
    desc.textContent = category.description;

    const count = document.createElement("span");
    count.className = "tile-count";
    count.textContent = `${category.games.length} Spiel${category.games.length === 1 ? "" : "e"}`;

    link.append(icon, title, desc, count);
    return link;
  }

  function renderCategories() {
    const grid = document.getElementById("categories-grid");
    if (!grid) return;

    if (GAME_CATEGORIES.length === 0) {
      grid.innerHTML = '<p class="empty-state">Noch keine Kategorien vorhanden.</p>';
      return;
    }

    grid.innerHTML = "";
    GAME_CATEGORIES.forEach((category) => {
      grid.appendChild(createCategoryCard(category));
    });
  }

  document.addEventListener("DOMContentLoaded", renderCategories);
})();
