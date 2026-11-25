/* ============================================================
   ANKARA PALACE — UI HELPERS
   Toast notifications, modal dialogs, product card renderer,
   DOM helpers, validation utilities.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- DOM helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "dataset" && typeof v === "object") {
        Object.entries(v).forEach(([dk, dv]) => (node.dataset[dk] = dv));
      } else {
        node.setAttribute(k, v);
      }
    });
    (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c === null || c === undefined) return;
      if (typeof c === "string") node.appendChild(document.createTextNode(c));
      else if (c instanceof Node) node.appendChild(c);
    });
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ---------- Toast ---------- */
  let toastContainer = null;

  function ensureToastContainer() {
    if (toastContainer && document.body.contains(toastContainer)) return toastContainer;
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-stack";
    toastContainer.setAttribute("aria-live", "polite");
    document.body.appendChild(toastContainer);
    return toastContainer;
  }

  function toast(message, type = "info", duration = 3600) {
    const container = ensureToastContainer();
    const node = document.createElement("div");
    node.className = `toast toast--${type}`;
    node.setAttribute("role", "status");
    node.innerHTML = `
      <span>${escapeHtml(message)}</span>
      <button class="toast__close" aria-label="Dismiss">×</button>
    `;
    const close = () => node.remove();
    node.querySelector(".toast__close").addEventListener("click", close);
    container.appendChild(node);
    if (duration > 0) setTimeout(close, duration);
  }

  const toastSuccess = (m) => toast(m, "success");
  const toastError = (m) => toast(m, "error");
  const toastInfo = (m) => toast(m, "info");

  /* ---------- Modal ---------- */
  function openModal({ title, content, actions, onClose }) {
    closeModal();
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop is-open";
    backdrop.id = "ap-modal";

    const modal = document.createElement("div");
    modal.className = "modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", title || "Dialog");

    const titleEl = document.createElement("h3");
    titleEl.className = "modal__title";
    titleEl.textContent = title || "";

    const body = document.createElement("div");
    if (content instanceof Node) body.appendChild(content);
    else body.innerHTML = content || "";

    const actionRow = document.createElement("div");
    actionRow.className = "modal__actions";
    (actions || []).forEach((action) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `btn ${action.className || "btn--ghost"}`;
      btn.textContent = action.label;
      btn.addEventListener("click", () => {
        if (action.onClick) action.onClick();
        if (action.close !== false) closeModal();
      });
      actionRow.appendChild(btn);
    });

    modal.appendChild(titleEl);
    modal.appendChild(body);
    if (actionRow.children.length) modal.appendChild(actionRow);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const closeOnBackdrop = (e) => {
      if (e.target === backdrop) {
        closeModal();
        if (onClose) onClose();
      }
    };
    backdrop.addEventListener("click", closeOnBackdrop);

    const closeOnEscape = (e) => {
      if (e.key === "Escape") {
        closeModal();
        if (onClose) onClose();
      }
    };
    document.addEventListener("keydown", closeOnEscape, { once: true });

    return modal;
  }

  function closeModal() {
    const existing = document.getElementById("ap-modal");
    if (existing) existing.remove();
  }

  function confirm({ title = "Confirm", message, confirmLabel = "Confirm", danger = false }) {
    return new Promise((resolve) => {
      openModal({
        title,
        content: `<p>${escapeHtml(message || "")}</p>`,
        actions: [
          { label: "Cancel", className: "btn--ghost", onClick: () => resolve(false) },
          {
            label: confirmLabel,
            className: danger ? "btn--danger" : "btn--primary",
            onClick: () => resolve(true)
          }
        ],
        onClose: () => resolve(false)
      });
    });
  }

  /* ---------- Product card ---------- */
  function productCard(product, opts = {}) {
    const category = AP.Collections.categories.byId(product.categoryId);
    const catName = category ? category.name : "Fabric";
    const img = (product.images && product.images[0]) || "ankara image.jpg";
    const stock = Number(product.stock) || 0;
    const inStock = stock > 0;
    const minOrderQty = Math.max(1, Number(product.minOrderQty) || 1);
    const canQuickAdd = Boolean(opts.quickAdd && inStock && stock >= minOrderQty);

    const badges = [];
    if (product.newArrival) badges.push('<span class="badge badge--emerald">New</span>');
    if (product.bestseller) badges.push('<span class="badge badge--terracotta">Bestseller</span>');
    if (!inStock) badges.push('<span class="badge badge--danger">Out of Stock</span>');
    else if (stock < 10) badges.push('<span class="badge badge--warning">Low Stock</span>');

    const card = document.createElement("article");
    card.className = "product-card";
    card.innerHTML = `
      <a href="product.html?id=${encodeURIComponent(product.id)}" class="product-card__media" aria-label="View ${escapeHtml(product.name)}">
        <img src="${escapeHtml(img)}" alt="${escapeHtml(product.name)}" loading="lazy" onerror="this.style.display='none';this.parentElement.style.background='#EFE8D9';">
        <div class="product-card__badges">${badges.join("")}</div>
      </a>
      <div class="product-card__body">
        <span class="product-card__cat">${escapeHtml(catName)}</span>
        <h3 class="product-card__name">
          <a href="product.html?id=${encodeURIComponent(product.id)}">${escapeHtml(product.name)}</a>
        </h3>
        <div class="product-card__price">
          ${AP.formatNaira(product.pricePerYard)} <small>/ yard</small>
        </div>
        <div class="product-card__actions ${canQuickAdd ? "has-quick-add" : "details-only"}">
          ${canQuickAdd ? `<button type="button" class="btn btn--primary btn--sm product-card__add" aria-label="Add ${escapeHtml(product.name)} to cart">
            <i class="fa-solid fa-cart-plus" aria-hidden="true"></i><span>Add to cart</span>
          </button>` : `<a href="product.html?id=${encodeURIComponent(product.id)}" class="btn btn--emerald btn--sm btn--block product-card__details">View details</a>`}
          ${canQuickAdd ? `<a href="product.html?id=${encodeURIComponent(product.id)}" class="product-card__details">Details</a>` : ""}
        </div>
      </div>
    `;

    const addButton = card.querySelector(".product-card__add");
    if (addButton && canQuickAdd) addButton.addEventListener("click", () => {
      const quantity = minOrderQty;
      const item = {
        productId: product.id,
        name: product.name,
        image: img,
        unitType: "yard",
        unitPrice: Number(product.pricePerYard) || 0,
        quantity,
        stockQuantity: quantity,
        bundleYards: null,
        color: (product.colors || [])[0] || "",
        design: (product.designs || [])[0] || ""
      };
      if (quantity > stock) {
        toast("The available stock is below the minimum order quantity.", "error");
        return;
      }
      const items = AP.storage.get("ap_cart", []);
      const existing = items.find((entry) => entry.productId === item.productId && entry.unitType === item.unitType && entry.color === item.color && entry.design === item.design);
      if (existing && Number(existing.quantity) + quantity > Number(product.stock)) {
        toast("That would exceed the available stock.", "error");
        return;
      }
      if (existing) {
        existing.quantity = Number(existing.quantity) + quantity;
        existing.stockQuantity = existing.quantity;
      } else items.push(item);
      AP.storage.set("ap_cart", items);
      toast(`${product.name} added to your cart.`, "success");
      document.dispatchEvent(new CustomEvent("ap:cart-updated", { detail: { count: items.reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0) } }));
    });

    if (opts.showWishlist && AP.Session.getCustomer()) {
      const customer = AP.Session.getCustomer();
      const isWished = AP.Collections.wishlist.has(customer.id, product.id);
      const wishBtn = document.createElement("button");
      wishBtn.type = "button";
      wishBtn.className = "product-card__wishlist btn btn--ghost btn--sm";
      wishBtn.setAttribute("aria-pressed", String(isWished));
      wishBtn.innerHTML = `<i class="fa-solid fa-heart" style="color:${isWished ? "var(--terracotta)" : "inherit"}"></i>`;
      wishBtn.title = isWished ? "Remove from wishlist" : "Save to wishlist";
      wishBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const added = AP.Collections.wishlist.toggle(customer.id, product.id);
        wishBtn.querySelector("i").style.color = added ? "var(--terracotta)" : "inherit";
        wishBtn.setAttribute("aria-pressed", String(added));
        toast(added ? "Saved to wishlist." : "Removed from wishlist.", "success", 2000);
      });
      card.querySelector(".product-card__actions").appendChild(wishBtn);
    }

    return card;
  }

  /* ---------- Validation ---------- */
  const Validate = {
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim()),
    phone: (v) => /^[+()\d\s-]{7,20}$/.test(String(v || "").trim()),
    required: (v) => String(v || "").trim().length > 0,
    minLength: (v, n) => String(v || "").length >= n,
    passwordStrength: (v) => {
      const s = String(v || "");
      const checks = {
        length: s.length >= 8,
        upper: /[A-Z]/.test(s),
        lower: /[a-z]/.test(s),
        number: /\d/.test(s),
        symbol: /[^A-Za-z0-9]/.test(s)
      };
      const score = Object.values(checks).filter(Boolean).length;
      return { checks, score, strong: score >= 4 && checks.length };
    }
  };

  function fieldError(inputEl, message) {
    inputEl.classList.toggle("is-invalid", Boolean(message));
    const err = inputEl.parentElement.querySelector(".form-error");
    if (err) err.textContent = message || "";
    inputEl.setAttribute("aria-invalid", message ? "true" : "false");
  }

  /* ---------- Status helpers ---------- */
  const STATUS_BADGE = {
    "Pending": "badge--warning",
    "Accepted": "badge--emerald",
    "Awaiting Payment": "badge--warning",
    "Payment Confirmed": "badge--success",
    "Processing": "badge--emerald",
    "Ready for Dispatch": "badge--emerald",
    "Shipped": "badge--sage",
    "Delivered": "badge--success",
    "Rejected": "badge--danger",
    "Cancelled": "badge--muted"
  };

  function statusBadge(status) {
    return `<span class="badge ${STATUS_BADGE[status] || "badge--muted"}">${escapeHtml(status)}</span>`;
  }

  /* ---------- Expose ---------- */
  window.UI = {
    $, $$, el, clear, escapeHtml,
    toast, toastSuccess, toastError, toastInfo,
    openModal, closeModal, confirm,
    productCard,
    Validate, fieldError,
    statusBadge
  };
})();
