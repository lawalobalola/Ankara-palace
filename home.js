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

    const links = $("#home-category-links");
    if (links) {
      clear(links);
      AP.Collections.categories.all().forEach((cat) => {
        const link = document.createElement("a");
        link.href = `shop.html?category=${encodeURIComponent(cat.id)}`;
        link.textContent = cat.name;
        links.appendChild(link);
      });
    }
  }

  function renderNewArrivals() {
    const mount = $("#new-arrivals-grid");
    if (!mount) return;
    clear(mount);

    const products = AP.Collections.products.active()
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 4);
    products.forEach((p) => mount.appendChild(productCard(p)));
  }

  function renderBestsellers() {
    const mount = $("#bestsellers-grid");
    if (!mount) return;
    clear(mount);

    const allProducts = AP.Collections.products.active()
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const products = allProducts
      .filter((p) => p.bestseller)
      .slice(0, 4);

    const list = [...products, ...allProducts.filter((p) => !products.some((featured) => featured.id === p.id))].slice(0, 4);

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

  function updateAnnouncement() {
    const bar = document.querySelector("[data-store-announcement]");
    if (!bar) return;
    const message = String(AP.Collections.settings.get()?.announcement || "").trim();
    bar.textContent = message;
    bar.hidden = !message;
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
    updateAnnouncement();
    animateHeroHeadline();
    const refresh = () => {
      renderCollections();
      renderNewArrivals();
      renderBestsellers();
      updateHeroStats();
      updateHeroImage();
      updateAnnouncement();
    };
    const refreshIfCatalogueChanged = (key) => {
      if (key === AP.KEYS.products || key === AP.KEYS.categories || key === AP.KEYS.settings) refresh();
    };
    window.addEventListener("ap:data-change", (event) => refreshIfCatalogueChanged(event.detail?.key));
    window.addEventListener("storage", (event) => refreshIfCatalogueChanged(event.key));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

