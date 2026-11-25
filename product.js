/* ============================================================
   ANKARA PALACE — PRODUCT DETAILS CONTROLLER
   ============================================================ */

(function () {
  "use strict";

  const { $, clear, escapeHtml, productCard, toastSuccess, toastError } = UI;

  let product = null;
  let category = null;
  let selectedUnit = "yard";
  let selectedColour = "";
  let selectedDesign = "";
  let quantity = 2;
  let activeImageIndex = 0;

  function getProductId() {
    return new URLSearchParams(location.search).get("id");
  }

  function notFound(message) {
    const root = $("#product-root");
    if (!root) return;
    root.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <h3>Fabric not found</h3>
        <p>${escapeHtml(message || "This fabric may no longer be available.")}</p>
        <a href="shop.html" class="btn btn--emerald">Back to Shop</a>
      </div>
    `;
  }

  function render() {
    const root = $("#product-root");
    if (!root) return;

    if (!product) {
      notFound();
      return;
    }

    if (product.active === false) {
      notFound("This fabric has been archived.");
      return;
    }

    const stock = Number(product.stock) || 0;
    const hasBundle = Number(product.bundleYards) > 0 && Number(product.bundlePrice) > 0;
    const minQty = selectedUnit === "bundle" ? Math.max(1, Math.ceil((Number(product.minOrderQty) || 1) / Number(product.bundleYards))) : (Number(product.minOrderQty) || 1);
    const unitStock = selectedUnit === "bundle" ? Math.floor(stock / Number(product.bundleYards)) : stock;
    const inStock = unitStock > 0;
    const lowStock = unitStock > 0 && unitStock < 10;
    if (inStock) quantity = Math.max(minQty, Math.min(quantity, unitStock));
    const unitPrice = selectedUnit === "bundle" ? Number(product.bundlePrice) : selectedUnit === "trouser" && product.pricePerTrouser ? product.pricePerTrouser : product.pricePerYard;
    const subtotal = unitPrice * quantity;
    const images = (product.images && product.images.length) ? product.images : ["ankara image.jpg"];
    const currentImg = images[Math.min(activeImageIndex, images.length - 1)];

    const hasTrouser = Boolean(product.pricePerTrouser);

    root.innerHTML = `
      <div class="product-detail">
        <div class="breadcrumb" style="color:var(--muted); justify-content:flex-start;">
          <a href="index.html">Home</a><span>/</span>
          <a href="shop.html">Shop</a><span>/</span>
          <span>${escapeHtml(product.name)}</span>
        </div>

        <div class="product-detail__grid">
          <div class="product-gallery">
            <div class="product-gallery__main">
              <img src="${escapeHtml(currentImg)}" alt="${escapeHtml(product.name)}" id="main-image" />
            </div>
            ${images.length > 1 ? `
              <div class="product-gallery__thumbs" id="gallery-thumbs">
                ${images.map((img, i) => `
                  <button type="button" class="product-gallery__thumb ${i === activeImageIndex ? "is-active" : ""}" data-index="${i}" aria-label="View image ${i + 1}">
                    <img src="${escapeHtml(img)}" alt="${escapeHtml(product.name)} thumbnail ${i + 1}" />
                  </button>
                `).join("")}
              </div>
            ` : ""}
          </div>

          <div class="product-info">
            <span class="product-info__cat">${escapeHtml(category ? category.name : "Fabric")}</span>
            <h1 class="product-info__title">${escapeHtml(product.name)}</h1>

            <div class="product-info__meta">
              <span class="product-info__price">${AP.formatNaira(unitPrice)} <small>/ ${selectedUnit === "trouser" ? "trouser" : "yard"}</small></span>
              <span class="stock-indicator ${!inStock ? "is-out" : lowStock ? "is-low" : ""}">
                <span class="dot"></span>
                ${!inStock ? "Out of stock" : lowStock ? `Only ${stock} left` : `${stock} in stock`}
              </span>
            </div>

            <p class="product-info__desc">${escapeHtml(product.description || "")}</p>

            ${hasTrouser ? `
              <div class="product-option">
                <span class="product-option__label">Pricing Unit</span>
                <div class="unit-toggle" role="group" aria-label="Pricing unit">
                  <button type="button" data-unit="yard" class="${selectedUnit === "yard" ? "is-active" : ""}">Per Yard</button>
                  ${hasBundle ? `<button type="button" data-unit="bundle" class="${selectedUnit === "bundle" ? "is-active" : ""}">${escapeHtml(product.bundleName || "Bundle")} (${Number(product.bundleYards)} yards)</button>` : ""}
                  <button type="button" data-unit="trouser" class="${selectedUnit === "trouser" ? "is-active" : ""}">Per Trouser</button>
                </div>
              </div>
            ` : ""}
            ${hasBundle && !hasTrouser ? `<div class="product-option"><span class="product-option__label">Pricing Unit</span><div class="unit-toggle" role="group" aria-label="Pricing unit"><button type="button" data-unit="yard" class="${selectedUnit === "yard" ? "is-active" : ""}">Per Yard</button><button type="button" data-unit="bundle" class="${selectedUnit === "bundle" ? "is-active" : ""}">${escapeHtml(product.bundleName || "Bundle")} (${Number(product.bundleYards)} yards)</button></div></div>` : ""}

            ${(product.colors || []).length ? `
              <div class="product-option">
                <span class="product-option__label">Colour: <span id="selected-colour-label">${escapeHtml(selectedColour)}</span></span>
                <div class="option-pills" id="colour-pills">
                  ${product.colors.map((c) => `
                    <button type="button" class="option-pill ${c === selectedColour ? "is-active" : ""}" data-colour="${escapeHtml(c)}">${escapeHtml(c)}</button>
                  `).join("")}
                </div>
              </div>
            ` : ""}

            ${(product.designs || []).length ? `
              <div class="product-option">
                <span class="product-option__label">Design: <span id="selected-design-label">${escapeHtml(selectedDesign)}</span></span>
                <div class="option-pills" id="design-pills">
                  ${product.designs.map((d) => `
                    <button type="button" class="option-pill ${d === selectedDesign ? "is-active" : ""}" data-design="${escapeHtml(d)}">${escapeHtml(d)}</button>
                  `).join("")}
                </div>
              </div>
            ` : ""}

            <div class="qty-row">
              <div>
                <span class="product-option__label">Quantity</span>
                <div class="qty-stepper">
                  <button type="button" id="qty-dec" aria-label="Decrease quantity"><i class="fa-solid fa-minus"></i></button>
                  <input type="number" id="qty-input" value="${quantity}" min="${minQty}" max="${Math.max(unitStock, 0)}" />
                  <button type="button" id="qty-inc" aria-label="Increase quantity"><i class="fa-solid fa-plus"></i></button>
                </div>
              </div>
              <small class="color-muted">${selectedUnit === "bundle" ? `${product.bundleYards} yards = 1 ${escapeHtml(product.bundleName || "bundle")}` : `Minimum order: ${minQty} ${selectedUnit === "trouser" ? "trouser(s)" : "yard(s)"}`}</small>
            </div>

            <div class="product-calc">
              <div class="product-calc__row">
                <span>Unit price</span>
                <span>${AP.formatNaira(unitPrice)} / ${selectedUnit === "bundle" ? escapeHtml(product.bundleName || "bundle") : selectedUnit}</span>
              </div>
              <div class="product-calc__row">
                <span>Quantity</span>
                <span>× ${quantity}</span>
              </div>
              <div class="product-calc__row product-calc__row--total">
                <span>Estimated Total</span>
                <strong>${AP.formatNaira(subtotal)}</strong>
              </div>
            </div>

            <div class="product-cta">
              <button type="button" class="btn btn--outline btn--lg" id="add-to-cart" ${!inStock ? "disabled" : ""}>
                <i class="fa-solid fa-cart-plus"></i> Add to Cart
              </button>
              <button type="button" class="btn btn--primary btn--lg" id="buy-now" ${!inStock ? "disabled" : ""}>
                <i class="fa-solid fa-bag-shopping"></i> ${inStock ? "Buy Now" : "Out of Stock"}
              </button>
              <button type="button" class="btn btn--outline btn--lg" id="wishlist-btn">
                <i class="fa-regular fa-heart"></i> Save
              </button>
            </div>

            <ul class="product-meta-list">
              <li><strong>Category:</strong> ${escapeHtml(category ? category.name : "Fabric")}</li>
              <li><strong>Available Designs:</strong> ${escapeHtml((product.designs || []).join(", ") || "—")}</li>
              <li><strong>Available Colours:</strong> ${escapeHtml((product.colors || []).join(", ") || "—")}</li>
              <li><strong>Minimum Order:</strong> ${minQty}</li>
            </ul>
          </div>
        </div>

        <div class="product-tabs">
          <div class="tab-list" role="tablist">
            <button type="button" class="tab-btn is-active" data-tab="description" role="tab">Description</button>
            <button type="button" class="tab-btn" data-tab="reviews" role="tab">Reviews (${AP.Collections.reviews.byProduct(product.id).length})</button>
            <button type="button" class="tab-btn" data-tab="delivery" role="tab">Delivery &amp; Returns</button>
          </div>
          <div class="tab-panel is-active" id="tab-description" role="tabpanel">
            <p>${escapeHtml(product.description || "")}</p>
            <p class="color-muted">All Ankara Palace fabrics are inspected for quality before dispatch. Colour may vary slightly between screens and physical fabric due to lighting and monitor calibration.</p>
          </div>
          <div class="tab-panel" id="tab-reviews" role="tabpanel">
            <div id="reviews-list"></div>
          </div>
          <div class="tab-panel" id="tab-delivery" role="tabpanel">
            <p>Orders are processed after payment confirmation. Dispatch typically occurs within 2–4 business days. Delivery timelines vary by location — see the <a href="faq.html">FAQ</a> for details.</p>
            <p>Cancellations and returns are handled per our <a href="faq.html">returns policy</a>. Please contact support if you have any concerns.</p>
          </div>
        </div>
      </div>
    `;

    bindEvents();
    renderRelated();
    renderReviews();
  }

  function bindEvents() {
    const root = $("#product-root");

    // Gallery
    root.querySelectorAll(".product-gallery__thumb").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeImageIndex = Number(btn.dataset.index) || 0;
        render();
      });
    });

    // Unit toggle
    root.querySelectorAll("[data-unit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedUnit = btn.dataset.unit;
        const minQty = selectedUnit === "bundle" ? Math.max(1, Math.ceil((Number(product.minOrderQty) || 1) / Number(product.bundleYards))) : (Number(product.minOrderQty) || 1);
        if (quantity < minQty) quantity = minQty;
        render();
      });
    });

    // Colour
    root.querySelectorAll("[data-colour]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedColour = btn.dataset.colour;
        render();
      });
    });

    // Design
    root.querySelectorAll("[data-design]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedDesign = btn.dataset.design;
        render();
      });
    });

    // Quantity
    const qtyInput = $("#qty-input");
    const minQty = selectedUnit === "bundle" ? Math.max(1, Math.ceil((Number(product.minOrderQty) || 1) / Number(product.bundleYards))) : (Number(product.minOrderQty) || 1);
    const stock = selectedUnit === "bundle" ? Math.floor((Number(product.stock) || 0) / Number(product.bundleYards)) : (Number(product.stock) || 0);

    $("#qty-dec").addEventListener("click", () => {
      quantity = Math.max(minQty, quantity - 1);
      qtyInput.value = quantity;
      updateCalc();
    });
    $("#qty-inc").addEventListener("click", () => {
      if (quantity < stock) quantity += 1;
      qtyInput.value = quantity;
      updateCalc();
    });
    qtyInput.addEventListener("change", () => {
      const v = Number(qtyInput.value) || minQty;
      quantity = Math.max(minQty, Math.min(stock, v));
      qtyInput.value = quantity;
      updateCalc();
    });

    // Tabs
    root.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        root.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("is-active"));
        root.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("is-active"));
        btn.classList.add("is-active");
        const panel = document.getElementById(`tab-${btn.dataset.tab}`);
        if (panel) panel.classList.add("is-active");
      });
    });

    // Wishlist
    const wishBtn = $("#wishlist-btn");
    const customer = AP.Session.getCustomer();
    if (customer) {
      const isWished = AP.Collections.wishlist.has(customer.id, product.id);
      wishBtn.innerHTML = `<i class="${isWished ? "fa-solid" : "fa-regular"} fa-heart" style="color:${isWished ? "var(--terracotta)" : "inherit"}"></i> ${isWished ? "Saved" : "Save"}`;
    }
    wishBtn.addEventListener("click", () => {
      const cust = AP.Session.getCustomer();
      if (!cust) {
        toastError("Please sign in to save fabrics to your wishlist.");
        setTimeout(() => {
          location.href = `login.html?redirect=${encodeURIComponent("product.html?id=" + product.id)}`;
        }, 800);
        return;
      }
      const added = AP.Collections.wishlist.toggle(cust.id, product.id);
      toastSuccess(added ? "Saved to wishlist." : "Removed from wishlist.");
      wishBtn.innerHTML = `<i class="${added ? "fa-solid" : "fa-regular"} fa-heart" style="color:${added ? "var(--terracotta)" : "inherit"}"></i> ${added ? "Saved" : "Save"}`;
    });

    // Buy Now
    $("#add-to-cart").addEventListener("click", handleAddToCart);
    $("#buy-now").addEventListener("click", handleBuyNow);
  }

  function currentCartItem() {
    return {
      productId: product.id,
      name: product.name,
      image: (product.images && product.images[0]) || "ankara image.jpg",
      unitType: selectedUnit,
      unitPrice: selectedUnit === "bundle" ? Number(product.bundlePrice) : selectedUnit === "trouser" && product.pricePerTrouser ? product.pricePerTrouser : product.pricePerYard,
      quantity,
      stockQuantity: selectedUnit === "bundle" ? quantity * Number(product.bundleYards) : quantity,
      bundleYards: selectedUnit === "bundle" ? Number(product.bundleYards) : null,
      color: selectedColour,
      design: selectedDesign
    };
  }

  function validateSelection() {
    const stock = selectedUnit === "bundle" ? Math.floor((Number(product.stock) || 0) / Number(product.bundleYards)) : (Number(product.stock) || 0);
    const minQty = selectedUnit === "bundle" ? Math.max(1, Math.ceil((Number(product.minOrderQty) || 1) / Number(product.bundleYards))) : (Number(product.minOrderQty) || 1);
    if (stock <= 0) { toastError("This fabric is currently out of stock."); return false; }
    if (quantity < minQty) { toastError(`Minimum order quantity is ${minQty}.`); return false; }
    if (quantity > stock) { toastError(`Only ${stock} units available.`); return false; }
    if ((product.colors || []).length && !selectedColour) { toastError("Please select a colour."); return false; }
    if ((product.designs || []).length && !selectedDesign) { toastError("Please select a design."); return false; }
    return true;
  }

  function handleAddToCart() {
    if (!validateSelection()) return;
    const items = AP.storage.get("ap_cart", []);
    const item = currentCartItem();
    const existing = items.find((entry) => entry.productId === item.productId && entry.unitType === item.unitType && entry.color === item.color && entry.design === item.design);
    if (existing) {
      const stock = selectedUnit === "bundle" ? Math.floor((Number(product.stock) || 0) / Number(product.bundleYards)) : (Number(product.stock) || 0);
      if (existing.quantity + item.quantity > stock) { toastError(`Only ${stock} units available for this fabric.`); return; }
      existing.quantity += item.quantity;
      existing.stockQuantity = selectedUnit === "bundle" ? existing.quantity * Number(product.bundleYards) : existing.quantity;
    } else items.push(item);
    AP.storage.set("ap_cart", items);
    toastSuccess("Added to your cart.");
  }

  function updateCalc() {
    const unitPrice = selectedUnit === "bundle" ? Number(product.bundlePrice) : selectedUnit === "trouser" && product.pricePerTrouser
      ? product.pricePerTrouser
      : product.pricePerYard;
    const subtotal = unitPrice * quantity;
    const rows = document.querySelectorAll(".product-calc__row");
    if (rows.length >= 3) {
      rows[1].lastElementChild.textContent = `× ${quantity}`;
      rows[2].lastElementChild.textContent = AP.formatNaira(subtotal);
    }
  }

  function handleBuyNow() {
    if (!validateSelection()) return;
    sessionStorage.setItem("ap_checkout_items", JSON.stringify([currentCartItem()]));

    const customer = AP.Session.getCustomer();
    if (!customer) {
      toastSuccess("Please sign in to complete your order.");
      setTimeout(() => {
        location.href = `login.html?redirect=checkout.html`;
      }, 700);
      return;
    }

    location.href = "checkout.html";
  }

  function renderRelated() {
    const section = $("#related-section");
    const grid = $("#related-grid");
    if (!section || !grid) return;

    const related = AP.Collections.products.active()
      .filter((p) => p.id !== product.id && p.categoryId === product.categoryId)
      .slice(0, 4);

    if (related.length === 0) {
      section.hidden = true;
      return;
    }

    section.hidden = false;
    clear(grid);
    related.forEach((p) => grid.appendChild(productCard(p, { showWishlist: true })));
  }

  function renderReviews() {
    const mount = $("#reviews-list");
    if (!mount) return;

    const reviews = AP.Collections.reviews.byProduct(product.id);
    if (reviews.length === 0) {
      mount.innerHTML = `
        <div class="empty-state" style="padding:var(--sp-5) 0;">
          <i class="fa-regular fa-comment-dots"></i>
          <h3>No reviews yet</h3>
          <p>Be the first to review this fabric after purchase.</p>
        </div>
      `;
      return;
    }

    mount.innerHTML = reviews.map((r) => `
      <div class="review-item">
        <div class="review-item__head">
          <span class="review-item__author">${escapeHtml(r.author || "Verified Customer")}</span>
          <span class="review-item__date">${AP.formatDate(r.createdAt)}</span>
        </div>
        <div class="review-item__stars">${"★".repeat(r.rating || 0)}${"☆".repeat(5 - (r.rating || 0))}</div>
        <p class="review-item__text">${escapeHtml(r.text || "")}</p>
      </div>
    `).join("");
  }

  function init() {
    const id = getProductId();
    if (!id) {
      notFound("No fabric selected.");
      return;
    }

    product = AP.Collections.products.byId(id);
    if (!product) {
      notFound();
      return;
    }

    category = AP.Collections.categories.byId(product.categoryId);

    // Preselect defaults
    selectedColour = (product.colors && product.colors[0]) || "";
    selectedDesign = (product.designs && product.designs[0]) || "";
    quantity = Math.max(Number(product.minOrderQty) || 1, 2);

    document.title = `${product.name} — Ankara Palace`;
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
