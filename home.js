/* ============================================================
   ANKARA PALACE — HOMEPAGE CONTROLLER
   ============================================================ */

(function () {
  "use strict";

  const { $, productCard, clear } = UI;

  function renderCollections() {
    const mount = $("#collections-grid");
    if (!mount) return;
    clear(mount);

    AP.Collections.categories.all().forEach((cat) => {
      const img = cat.image || "ankara image.jpg";
      const card = document.createElement("a");
      card.href = `shop.html?category=${encodeURIComponent(cat.id)}`;
      card.className = "collection-card";
      card.setAttribute("aria-label", `Browse the ${cat.name} collection`);
      card.innerHTML = `
        <img src="${img}" alt="${UI.escapeHtml(cat.name)}" loading="lazy" onerror="this.style.background='#174C3C';this.removeAttribute('src');">
        <div class="collection-card__body">
          <h3>${UI.escapeHtml(cat.name)}</h3>
          <span>Discover Our Collection <i class="fa-solid fa-arrow-right"></i></span>
        </div>
      `;
      mount.appendChild(card);
    });
  }

  function renderNewArrivals() {
    const mount = $("#new-arrivals-grid");
    if (!mount) return;
    clear(mount);

    const products = AP.Collections.products.active()
      .filter((p) => p.newArrival)
      .slice(0, 4);

    if (products.length === 0) {
      AP.Collections.products.active()
        .slice()
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 4)
        .forEach((p) => mount.appendChild(productCard(p)));
      return;
    }

    products.forEach((p) => mount.appendChild(productCard(p)));
  }

  function renderBestsellers() {
    const mount = $("#bestsellers-grid");
    if (!mount) return;
    clear(mount);

    const products = AP.Collections.products.active()
      .filter((p) => p.bestseller)
      .slice(0, 4);

    const list = products.length > 0
      ? products
      : AP.Collections.products.active().slice(0, 4);

    list.forEach((p) => mount.appendChild(productCard(p)));
  }

  function updateHeroStats() {
    const statEl = $("#stat-products");
    if (statEl) {
      statEl.textContent = String(AP.Collections.products.active().length);
    }
    const collectionStat = $("#stat-collections");
    if (collectionStat) {
      collectionStat.textContent = String(AP.Collections.categories.all().length);
    }
  }

  function updateHeroImage() {
    const image = document.querySelector(".hero__visual img");
    const settings = AP.Collections.settings.get() || {};
    if (image && settings.heroImage) image.src = settings.heroImage;
  }

  function animateHeroHeadline() {
    const heading = document.querySelector(".hero h1");
    if (!heading || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lines = [
      "Timeless African Fabric, Beautifully Delivered",
      "Discover Fabrics Full of Heritage",
      "Find Your Next Favorite Print",
      "African Fabrics for Every Moment"
    ];
    const typed = document.createElement("span");
    typed.className = "hero__typewriter";
    typed.setAttribute("aria-hidden", "true");
    heading.textContent = "";
    heading.setAttribute("aria-label", lines[0]);
    heading.appendChild(typed);

    let lineIndex = 0;
    let position = 0;
    let deleting = false;
    function step() {
      const line = lines[lineIndex];
      if (!deleting) {
        position = Math.min(position + 1, line.length);
        typed.textContent = line.slice(0, position);
        if (position === line.length) {
          window.setTimeout(() => { deleting = true; step(); }, 1000);
          return;
        }
        window.setTimeout(step, 55);
        return;
      }

      position = Math.max(0, position - 1);
      typed.textContent = line.slice(0, position);
      if (position > 0) {
        window.setTimeout(step, 32);
        return;
      }
      lineIndex = (lineIndex + 1) % lines.length;
      heading.setAttribute("aria-label", lines[lineIndex]);
      deleting = false;
      window.setTimeout(step, 180);
    }
    step();
  }

  function init() {
    renderCollections();
    renderNewArrivals();
    renderBestsellers();
    updateHeroStats();
    updateHeroImage();
    animateHeroHeadline();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

