/* ============================================================
   ANKARA PALACE — SHOP PAGE CONTROLLER (MODIFIED)
   Changes:
     - Grid renders immediately on load (no hidden state).
     - Filters are optional; search and filters compose.
     - Focus on search reveals the grid (all.js assist).
     - Grid column count driven by CSS (4-up desktop).
   ============================================================ */

(function () {
  "use strict";

  const { $, clear, productCard, escapeHtml } = UI;

  const state = {
    search: "",
    categories: new Set(),
    colours: new Set(),
    priceMin: null,
    priceMax: null,
    inStockOnly: false,
    sort: "newest",
    page: 1,
    pageSize: 12
  };

  function applyUrlParams() {
    const params = new URLSearchParams(location.search);
    const cat = params.get("category");
    if (cat) state.categories.add(cat);
    const q = params.get("q");
    if (q) { state.search = q; const input = $("#shop-search"); if (input) input.value = q; }
  }

  function colourToCss(name) {
    const map = {
      emerald: "#174C3C", gold: "#C9A227", cream: "#F7F3EA",
      terracotta: "#B65F43", burgundy: "#6E2B2B", indigo: "#2C3E70",
      silver: "#C0C0C0", white: "#FFFFFF", coral: "#F88379",
      "sky blue": "#87CEEB", ivory: "#FFFFF0", champagne: "#F7E7CE",
      "rose gold": "#B76E79", "sunset orange": "#FD5E53", yellow: "#F4C430",
      brown: "#6B4423", "midnight blue": "#191970", black: "#252925"
    };
    return map[name.toLowerCase()] || "#CCC";
  }

  function renderFilterOptions() {
    const catMount = $("#filter-categories");
    if (catMount) {
      clear(catMount);
      AP.Collections.categories.all().forEach((cat) => {
        const id = `cat-${cat.id}`;
        const label = document.createElement("label");
        label.className = "filter-option";
        label.htmlFor = id;
        label.innerHTML = `
          <input type="checkbox" id="${id}" value="${escapeHtml(cat.id)}" ${state.categories.has(cat.id) ? "checked" : ""} />
          <span>${escapeHtml(cat.name)}</span>
        `;
        label.querySelector("input").addEventListener("change", (e) => {
          if (e.target.checked) state.categories.add(cat.id); else state.categories.delete(cat.id);
          state.page = 1;
          render();
        });
        catMount.appendChild(label);
      });
    }

    const colourMount = $("#filter-colours");
    if (colourMount) {
      const colours = new Set();
      AP.Collections.products.active().forEach((p) => (p.colors || []).forEach((c) => colours.add(c)));
      clear(colourMount);
      Array.from(colours).sort().forEach((colour) => {
        const id = `color-${colour.replace(/\s+/g, "-")}`;
        const label = document.createElement("label");
        label.className = "filter-option";
        label.htmlFor = id;
        label.innerHTML = `
          <input type="checkbox" id="${id}" value="${escapeHtml(colour)}" ${state.colours.has(colour) ? "checked" : ""} />
          <span class="color-swatch" style="background:${colourToCss(colour)};"></span>
          <span>${escapeHtml(colour)}</span>
        `;
        label.querySelector("input").addEventListener("change", (e) => {
          if (e.target.checked) state.colours.add(colour); else state.colours.delete(colour);
          state.page = 1;
          render();
        });
        colourMount.appendChild(label);
      });
    }
  }

  function getFiltered() {
    let list = AP.Collections.products.active();
    if (state.search) {
      const q = state.search.toLowerCase();
      list = list.filter((p) => {
        const cat = AP.Collections.categories.byId(p.categoryId);
        return (
          p.name.toLowerCase().includes(q) ||
          (cat && cat.name.toLowerCase().includes(q)) ||
          (p.colors || []).some((c) => c.toLowerCase().includes(q)) ||
          (p.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      });
    }
    if (state.categories.size > 0) list = list.filter((p) => state.categories.has(p.categoryId));
    if (state.colours.size > 0) list = list.filter((p) => (p.colors || []).some((c) => state.colours.has(c)));
    if (state.priceMin != null) list = list.filter((p) => Number(p.pricePerYard) >= state.priceMin);
    if (state.priceMax != null) list = list.filter((p) => Number(p.pricePerYard) <= state.priceMax);
    if (state.inStockOnly) list = list.filter((p) => Number(p.stock) > 0);

    switch (state.sort) {
      case "price-asc": list.sort((a, b) => Number(a.pricePerYard) - Number(b.pricePerYard)); break;
      case "price-desc": list.sort((a, b) => Number(b.pricePerYard) - Number(a.pricePerYard)); break;
      case "name-asc": list.sort((a, b) => a.name.localeCompare(b.name)); break;
      case "popular": list.sort((a, b) => (b.bestseller ? 1 : 0) - (a.bestseller ? 1 : 0)); break;
      default: list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return list;
  }

  function render() {
    const grid = $("#shop-grid");
    const countEl = $("#shop-count");
    const loadWrap = $("#load-more-wrap");
    if (!grid) return;
    clear(grid);
    grid.classList.remove("ap-empty-hidden");

    const filtered = getFiltered();
    const total = filtered.length;
    const shown = filtered.slice(0, state.page * state.pageSize);

    if (total === 0) {
      if (countEl) countEl.innerHTML = "No fabrics match your filters.";
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <i class="fa-solid fa-magnifying-glass"></i>
          <h3>No results found</h3>
          <p>Try adjusting your search or clearing some filters.</p>
          <button type="button" class="btn btn--outline btn--sm" id="empty-clear">Clear Filters</button>
        </div>
      `;
      const btn = document.getElementById("empty-clear");
      if (btn) btn.addEventListener("click", resetFilters);
      if (loadWrap) loadWrap.hidden = true;
      return;
    }

    if (countEl) countEl.innerHTML = `Showing <strong>${shown.length}</strong> of <strong>${total}</strong> fabric${total === 1 ? "" : "s"}`;
    shown.forEach((p) => grid.appendChild(productCard(p, { showWishlist: true })));
    if (loadWrap) loadWrap.hidden = shown.length >= total;
  }

  function resetFilters() {
    state.search = "";
    state.categories.clear();
    state.colours.clear();
    state.priceMin = null;
    state.priceMax = null;
    state.inStockOnly = false;
    state.sort = "newest";
    state.page = 1;

    const s = $("#shop-search"); if (s) s.value = "";
    const so = $("#shop-sort"); if (so) so.value = "newest";
    const pmin = $("#filter-price-min"); if (pmin) pmin.value = "";
    const pmax = $("#filter-price-max"); if (pmax) pmax.value = "";
    const stock = $("#filter-in-stock"); if (stock) stock.checked = false;
    document.querySelectorAll("#filters input[type=checkbox]").forEach((cb) => (cb.checked = false));

    if (location.search) history.replaceState({}, "", location.pathname);
    render();
  }

  function bind() {
    const search = $("#shop-search");
    if (search) {
      search.addEventListener("input", (e) => { state.search = e.target.value.trim(); state.page = 1; render(); });
      // Show grid on focus/click even without typing
      search.addEventListener("focus", render);
      search.addEventListener("click", render);
    }
    const sort = $("#shop-sort");
    if (sort) sort.addEventListener("change", (e) => { state.sort = e.target.value; state.page = 1; render(); });

    const min = $("#filter-price-min");
    if (min) min.addEventListener("input", (e) => { state.priceMin = e.target.value === "" ? null : Number(e.target.value); state.page = 1; render(); });
    const max = $("#filter-price-max");
    if (max) max.addEventListener("input", (e) => { state.priceMax = e.target.value === "" ? null : Number(e.target.value); state.page = 1; render(); });
    const stock = $("#filter-in-stock");
    if (stock) stock.addEventListener("change", (e) => { state.inStockOnly = e.target.checked; state.page = 1; render(); });

    const clearBtn = $("#clear-filters");
    if (clearBtn) clearBtn.addEventListener("click", resetFilters);
    const loadMore = $("#load-more");
    if (loadMore) loadMore.addEventListener("click", () => { state.page += 1; render(); });

    const fToggle = $("#filters-toggle");
    if (fToggle) fToggle.addEventListener("click", () => {
      const panel = $("#filters");
      if (!panel) return;
      const open = panel.classList.toggle("is-open");
      fToggle.setAttribute("aria-expanded", String(open));
    });
  }

  function init() {
    applyUrlParams();
    renderFilterOptions();
    bind();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();