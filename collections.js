/* ============================================================
   ANKARA PALACE — COLLECTIONS PAGE CONTROLLER
   ============================================================ */

(function () {
  "use strict";

  const { $, clear, escapeHtml, productCard } = UI;

  function render() {
    const mount = $("#collections-list");
    if (!mount) return;
    clear(mount);

    const categories = AP.Collections.categories.all();
    if (categories.length === 0) {
      mount.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-box-open"></i>
          <h3>No collections available</h3>
          <p>Please check back soon.</p>
        </div>
      `;
      return;
    }

    categories.forEach((cat) => {
      const products = AP.Collections.products.active()
        .filter((p) => p.categoryId === cat.id)
        .slice(0, 3);

      const row = document.createElement("div");
      row.className = "collection-row";
      row.innerHTML = `
        <div class="collection-row__media">
          <img src="${escapeHtml(cat.image || "ankara image.jpg")}" alt="${escapeHtml(cat.name)}" loading="lazy" onerror="this.style.display='none';" />
        </div>
        <div class="collection-row__body">
          <span class="section-head__eyebrow">Collection</span>
          <h2>${escapeHtml(cat.name)}</h2>
          <p>${escapeHtml(cat.description || "")}</p>
          <a href="shop.html?category=${encodeURIComponent(cat.id)}" class="btn btn--emerald">
            Shop ${escapeHtml(cat.name)} <i class="fa-solid fa-arrow-right"></i>
          </a>
        </div>
      `;
      mount.appendChild(row);

      if (products.length > 0) {
        const grid = document.createElement("div");
        grid.className = "product-grid";
        grid.style.marginTop = "var(--sp-5)";
        grid.style.marginBottom = "var(--sp-6)";
        products.forEach((p) => grid.appendChild(productCard(p)));
        mount.appendChild(grid);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
