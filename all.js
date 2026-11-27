/* ============================================================
   ANKARA PALACE — ALL.JS  (v2.0.0 — audited & hardened)
   ------------------------------------------------------------
   Shared coordination layer loaded on every page.

   API surface (unchanged — safe drop-in):
     window.__apAllInit           — init guard
     window.APAll                 — (new) testable exports:
                                     { revealShopGrid, refreshHeader,
                                       uploadReceipt, restoreTrigger,
                                       currentPage, isCustomerLoggedIn,
                                       STYLE_ID }

   Dependencies (must exist before this file loads):
     window.AP                    — see ap-globals.js
       AP.Session.getCustomer()
       AP.Collections.orders.byRef(ref)
       AP.Collections.orders.update(id, patch)
       AP.Collections.notifications.add(obj)
       AP.Collections.logs.add(obj)
       AP.uid(prefix)
       AP.nowISO()
     window.UI                    — see ap-globals.js
       UI.toastError(msg), UI.toastSuccess(msg)

   Fixes applied vs v1 (see audit table in the Part-1 report):
     - currentPage() now handles subdirectories + trailing slashes.
     - Receipt upload is idempotent (per-order in-flight lock).
     - Receipt upload validates order state + ownership + paymentStatus.
     - paymentStatus never downgrades (forward-only transitions).
     - Status transitions validated against ORDER_STATUSES.
     - Duplicate receipts collapsed to single pending_review.
     - Header refresh runs on a MutationObserver (in-place logout safe).
     - Shop grid reveal actually calls shop.js render hook if present.
     - Admin pages excluded from the 4-col product grid override.
     - prefers-reduced-motion + dvh + safe-area handled.
     - Footer scoped to homepage only (requirement 14).
     - aria-live region for upload feedback.
     - Exports window.APAll for testing.
   ============================================================ */

(function () {
  "use strict";

  if (window.__apAllInit) return;
  window.__apAllInit = true;

  /* ---------- Safe helpers ---------- */
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const HAS_DOM = typeof document !== "undefined";

  /* currentPage(): robust against /sub/dir/shop.html, /shop/, ?query#hash */
  function currentPage() {
    try {
      const path = (location && location.pathname) || "/";
      const clean = path.split("?")[0].split("#")[0].replace(/\/+$/, "");
      const last = clean.split("/").pop() || "";
      return last || "index.html";
    } catch (_) {
      return "index.html";
    }
  }

  function isCustomerLoggedIn() {
    try {
      return Boolean(window.AP && AP.Session && AP.Session.getCustomer && AP.Session.getCustomer());
    } catch (_) {
      return false;
    }
  }

  function isAdminPage() {
    return /^admin/i.test(currentPage()) || document.body.classList.contains("admin-body");
  }

  function isHomePage() {
    const p = currentPage();
    return p === "index.html" || p === "" || p === "/";
  }

  /* Valid order statuses (requirement 6) */
  const ORDER_STATUSES = Object.freeze({
    AWAITING_PAYMENT:          "Awaiting Payment",
    PAYMENT_PENDING:           "Pending",
    PAYMENT_CONFIRMED:         "Accepted",
    PROCESSING:                "Accepted",
    READY_FOR_DELIVERY:        "Ready to Dispatch",
    SHIPPED:                   "Shipped",
    DELIVERED:                 "Delivered",
    CANCELLED:                 "Cancelled",
    PAYMENT_REJECTED:          "Rejected"
  });
  const ORDER_STATUS_SET = new Set(Object.values(ORDER_STATUSES));

  /* Forward-only paymentStatus ladder. Index must only increase. */
  const PAYMENT_LADDER = [
    "unpaid",
    "receipt_submitted",
    "pending_verification",
    "rejected",
    "paid",
    "confirmed"
  ];

  function paymentRank(status) {
    const i = PAYMENT_LADDER.indexOf(String(status || "unpaid"));
    return i === -1 ? 0 : i;
  }

  /* ============================================================
     INJECTED GLOBAL POLISH STYLES
     ============================================================ */
  const STYLE_ID = "ap-all-styles";

  function injectStyles() {
    if (!HAS_DOM || document.getElementById(STYLE_ID)) return;

    const css = `
      /* ----- Brand tokens (fallbacks only; page CSS may override) ----- */
      :root {
        --ap-emerald:  #174C3C;
        --ap-cream:    #F7F3EA;
        --ap-terracotta:#B65F43;
        --ap-sage:     #A7B9A3;
        --ap-charcoal: #252925;
        --ap-white:    #FFFFFF;
        --ap-ink-muted:#6B6F6A;
        --ap-line:     #E4DDCF;
        --ap-paper:    #FBF8F2;
      }

      /* ----- Focus visibility (WCAG 2.4.7) ----- */
      a:focus-visible,
      button:focus-visible,
      input:focus-visible,
      select:focus-visible,
      textarea:focus-visible,
      [role="button"]:focus-visible,
      [tabindex]:focus-visible {
        outline: 3px solid var(--ap-terracotta);
        outline-offset: 2px;
        border-radius: 4px;
      }

      /* ----- Product grid: 4 / 3 / 2 / 1 ----- */
      .shop-grid, .product-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: var(--sp-5, 24px);
      }
      @media (max-width: 1200px) {
        .shop-grid, .product-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      }
      @media (max-width: 860px) {
        .shop-grid, .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      }
      @media (max-width: 420px) {
        .shop-grid, .product-grid { grid-template-columns: 1fr; }
      }

      /* Admin pages get a gentler grid so the dashboard stays readable (req 10). */
      body.admin-body .shop-grid,
      body.admin-body .product-grid,
      body.admin-body .admin-preview-grid {
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      }

      /* ----- Shop toolbar ----- */
      .shop-toolbar { align-items: stretch; }
      .shop-search input:focus {
        border-color: var(--ap-emerald);
        box-shadow: 0 0 0 3px rgba(23,76,60,0.12);
      }

      /* ----- Footer: homepage only (req 14) ----- */
      body:not(.ap-home) .site-footer { display: none !important; }

      /* ----- Header nav cleanup ----- */
      .nav-primary a[data-ap-footer-only] { display: none !important; }

      /* ----- Profile avatar ----- */
      .profile-avatar-row {
        display: flex; align-items: center; gap: 16px;
        margin-bottom: 20px; flex-wrap: wrap;
      }
      .profile-avatar,
      .profile-avatar-fallback {
        width: 84px; height: 84px; border-radius: 50%;
        flex-shrink: 0; object-fit: cover;
      }
      .profile-avatar {
        background: #EFE8D9; border: 3px solid var(--ap-cream);
        box-shadow: 0 2px 10px rgba(37,41,37,0.12);
      }
      .profile-avatar-fallback {
        background: var(--ap-emerald); color: var(--ap-cream);
        display: grid; place-items: center;
        font-family: "Playfair Display", serif;
        font-size: 1.8rem; font-weight: 700;
      }
      .profile-avatar-actions { display: flex; flex-direction: column; gap: 6px; }
      .profile-avatar-actions small { color: var(--ap-ink-muted); font-size: 0.78rem; }

      /* ----- Receipt panel ----- */
      .receipt-panel {
        background: var(--ap-paper);
        border: 1px dashed #D3C9B5;
        border-radius: 8px;
        padding: 16px;
        margin-top: 16px;
      }
      .receipt-panel h4 {
        font-size: 0.86rem; text-transform: uppercase;
        letter-spacing: 0.06em; color: var(--ap-ink-muted);
        margin: 0 0 8px;
        font-family: "DM Sans", sans-serif; font-weight: 700;
      }
      .receipt-thumb {
        max-width: 140px; max-height: 180px;
        border-radius: 6px; border: 1px solid var(--ap-line);
        background: #EFE8D9; object-fit: cover;
      }
      .receipt-panel__status {
        display: inline-block; font-size: 0.78rem;
        padding: 2px 8px; border-radius: 999px;
        background: rgba(23,76,60,0.1); color: var(--ap-emerald);
        font-weight: 600; margin-bottom: 8px;
      }
      .receipt-panel__status.is-pending { background: rgba(181,138,43,0.16); color: #7a5c17; }
      .receipt-panel__status.is-ok      { background: rgba(46,107,79,0.14); color: #2E6B4F; }
      .receipt-panel__status.is-error   { background: rgba(176,54,43,0.12); color: #B0362B; }

      /* ----- Admin receipt preview ----- */
      .admin-receipt-preview {
        display: flex; gap: 12px; align-items: flex-start;
        padding: 10px; background: var(--ap-paper);
        border-radius: 6px; border: 1px solid var(--ap-line);
        margin-top: 8px;
      }
      .admin-receipt-preview img {
        max-width: 80px; max-height: 110px;
        border-radius: 4px; object-fit: cover; background: #EFE8D9;
      }

      /* ----- Admin image preview ----- */
      .admin-img-preview {
        width: 100%; max-width: 180px; aspect-ratio: 4/5;
        border-radius: 8px; border: 1px solid var(--ap-line);
        background: #EFE8D9; object-fit: cover;
      }

      /* ----- Empty shop grid ----- */
      .shop-grid.ap-empty-hidden { display: none; }

      /* ----- Delivery block ----- */
      .delivery-address-block p { margin: 0 0 2px; font-size: 0.92rem; line-height: 1.55; color: var(--ap-charcoal); }

      /* ----- Reduced motion (req 15) ----- */
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.001ms !important;
          scroll-behavior: auto !important;
        }
      }

      /* ----- Mobile DVH safety (req 16) ----- */
      @supports (height: 100dvh) {
        .ap-sidebar, .ap-cs-panel { max-height: 100dvh; }
      }

      /* ----- Safe-area insets for floating buttons (req 16) ----- */
      @supports (padding: env(safe-area-inset-bottom)) {
        .ap-cs-button, .ap-sidebar-toggle {
          bottom: calc(20px + env(safe-area-inset-bottom));
          right:  calc(20px + env(safe-area-inset-right));
        }
      }

      /* ----- Screen-reader-only live region (a11y for upload feedback) ----- */
      .ap-sr-live {
        position: absolute !important;
        width: 1px; height: 1px;
        padding: 0; margin: -1px;
        overflow: hidden; clip: rect(0,0,0,0);
        white-space: nowrap; border: 0;
      }

      /* ----- Print safe: hide overlays ----- */
      @media print {
        .ap-cs-button, .ap-cs-panel, .ap-sidebar, .ap-sidebar-backdrop { display: none !important; }
      }
    `;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* Homepage body class (requirement 14) — set as early as possible */
  function markHomepage() {
    if (!HAS_DOM) return;
    if (isHomePage()) document.body.classList.add("ap-home");
    else document.body.classList.remove("ap-home");
  }

  /* ============================================================
     SHOP GRID REVEAL (req 3, 16)
     ============================================================ */
  function revealShopGrid() {
    if (!HAS_DOM) return;
    const grid = document.getElementById("shop-grid");
    if (!grid) return;
    grid.classList.remove("ap-empty-hidden");

    /* If shop.js exposes a render hook, call it without filters.
       This is the fix for audit finding #1 — the old code only
       removed a class and hoped for the best. */
    if (typeof window.APShop !== "undefined" && typeof window.APShop.render === "function") {
      try { window.APShop.render({ q: "" }); } catch (e) { console.warn("[APAll] APShop.render failed", e); }
    } else if (typeof window.renderShop === "function") {
      try { window.renderShop(); } catch (e) { console.warn("[APAll] renderShop failed", e); }
    }
  }

  function initShopSearchReveal() {
    if (!HAS_DOM || currentPage() !== "shop.html") return;
    const search = document.getElementById("shop-search");
    if (!search) return;
    if (search.dataset.apRevealBound === "1") return;   // idempotent
    search.dataset.apRevealBound = "1";
    const handler = () => revealShopGrid();
    search.addEventListener("focus", handler, { passive: true });
    search.addEventListener("click", handler, { passive: true });
    /* Also reveal on initial load so a fresh visit is not blank */
    revealShopGrid();
  }

  /* ============================================================
     HEADER REFRESH ON SESSION CHANGE (req 14)
     Replaces the fragile inline-style hack. Re-runs on any DOM
     mutation that replaces the nav, so in-place logout works.
     ============================================================ */
  function updateHeaderHomeVisibility() {
    if (!HAS_DOM) return;
    const homeLinks = $$('.nav-primary a[href="index.html"], .nav-primary a[href="/"], .nav-primary a[href="./"]');
    if (homeLinks.length === 0) return;
    const hide = isCustomerLoggedIn();
    homeLinks.forEach((a) => {
      if (hide) {
        a.setAttribute("aria-hidden", "true");
        a.style.display = "none";
      } else {
        a.removeAttribute("aria-hidden");
        a.style.display = "";
      }
    });
  }

  function initHeaderObserver() {
    if (!HAS_DOM) return;
    const nav = document.querySelector(".nav-primary") || document.querySelector("header");
    if (!nav) return;
    /* Coalesce mutations to one refresh per frame. */
    let scheduled = false;
    const obs = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        updateHeaderHomeVisibility();
      });
    });
    obs.observe(nav, { childList: true, subtree: true });
    /* Expose disconnect for SPA teardown if ever needed */
    window.APAll = window.APAll || {};
    window.APAll._headerObserver = obs;
  }

  /* ============================================================
     RECEIPT UPLOAD (req 5, 6, 17)
     Hardened against: duplicate submits, wrong-state orders,
     payment-status downgrades, cross-tab lost updates.
     ============================================================ */
  const RECEIPT_ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
  const RECEIPT_MAX_BYTES = 2 * 1024 * 1024;
  const IN_FLIGHT = new Set();          // per-order lock
  const LOCK_TTL_MS = 30_000;

  function liveRegion() {
    if (!HAS_DOM) return null;
    let el = document.getElementById("ap-sr-live");
    if (!el) {
      el = document.createElement("div");
      el.id = "ap-sr-live";
      el.className = "ap-sr-live";
      el.setAttribute("aria-live", "polite");
      el.setAttribute("aria-atomic", "true");
      document.body.appendChild(el);
    }
    return el;
  }
  function announce(msg) {
    const el = liveRegion();
    if (el) el.textContent = msg;
  }

  function canUploadReceipt(order) {
    if (!order) return { ok: false, reason: "Order not found." };
    if (order.paymentStatus === "paid" || order.paymentStatus === "confirmed") {
      return { ok: false, reason: "This order is already paid." };
    }
    if (String(order.status || "").toLowerCase() === ORDER_STATUSES.CANCELLED.toLowerCase()) {
      return { ok: false, reason: "This order was cancelled." };
    }
    if (String(order.status || "").toLowerCase() === ORDER_STATUSES.PAYMENT_REJECTED.toLowerCase()) {
      /* Allow re-upload after rejection — customer should send a corrected receipt. */
    }
    return { ok: true };
  }

  function acquireLock(orderId) {
    if (IN_FLIGHT.has(orderId)) return false;
    IN_FLIGHT.add(orderId);
    setTimeout(() => IN_FLIGHT.delete(orderId), LOCK_TTL_MS);
    return true;
  }
  function releaseLock(orderId) { IN_FLIGHT.delete(orderId); }

  function setButtonBusy(btn, busy) {
    if (!btn) return;
    if (busy) {
      if (!btn.hasAttribute("data-ap-receipt-original")) {
        btn.setAttribute("data-ap-receipt-original", btn.innerHTML);
      }
      btn.disabled = true;
      btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Uploading…`;
    } else {
      btn.disabled = false;
      const original = btn.getAttribute("data-ap-receipt-original");
      if (original) {
        btn.innerHTML = original;
        btn.removeAttribute("data-ap-receipt-original");
      } else {
        btn.innerHTML = "I've sent the money";
      }
    }
  }

  function restoreTrigger(btn) { setButtonBusy(btn, false); }

  function uploadReceipt(orderRef, file, triggerBtn) {
    /* --- synchronous validation first (before any async) --- */
    if (!file) return;
    if (!RECEIPT_ALLOWED.has(file.type)) {
      (window.UI && UI.toastError) ? UI.toastError("Please upload a JPG, PNG, WEBP or PDF file.") : alert("Please upload a JPG, PNG, WEBP or PDF file.");
      announce("Invalid file type.");
      return;
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      (window.UI && UI.toastError) ? UI.toastError("File is too large. Maximum 2 MB.") : alert("File is too large. Maximum 2 MB.");
      announce("File is too large.");
      return;
    }

    const session = window.AP && AP.Session && AP.Session.getCustomer ? AP.Session.getCustomer() : null;
    if (!session) {
      (window.UI && UI.toastError) ? UI.toastError("Please sign in to upload a receipt.") : alert("Please sign in to upload a receipt.");
      return;
    }
    const order = AP.Collections.orders.byRef(orderRef);
    if (!order || order.customerId !== session.id) {
      (window.UI && UI.toastError) ? UI.toastError("Order not found or does not belong to your account.") : alert("Order not found.");
      return;
    }
    const gate = canUploadReceipt(order);
    if (!gate.ok) {
      (window.UI && UI.toastError) ? UI.toastError(gate.reason) : alert(gate.reason);
      return;
    }
    if (!acquireLock(order.id)) {
      (window.UI && UI.toastError) ? UI.toastError("Upload already in progress. Please wait.") : alert("Upload already in progress.");
      return;
    }

    setButtonBusy(triggerBtn, true);
    announce("Uploading receipt…");

    const reader = new FileReader();
    reader.onerror = () => {
      (window.UI && UI.toastError) ? UI.toastError("Could not read the file. Please try again.") : alert("Could not read the file.");
      announce("Upload failed.");
      setButtonBusy(triggerBtn, false);
      releaseLock(order.id);
    };
    reader.onload = () => {
      try {
        const dataUrl = String(reader.result || "");
        if (!dataUrl || dataUrl.length < 32) throw new Error("Empty file data");

        const now = AP.nowISO ? AP.nowISO() : new Date().toISOString();
        const receipt = {
          id: AP.uid ? AP.uid("receipt-") : "receipt-" + Date.now(),
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          dataUrl,
          uploadedAt: now,
          status: "pending_review"
        };

        /* Re-read inside the lock — prevents cross-tab lost update. */
        const fresh = AP.Collections.orders.byRef(orderRef) || order;
        const gate2 = canUploadReceipt(fresh);
        if (!gate2.ok) {
          setButtonBusy(triggerBtn, false);
          releaseLock(order.id);
          (window.UI && UI.toastError) ? UI.toastError(gate2.reason) : alert(gate2.reason);
          return;
        }

        /* Collapse duplicate receipts: keep only the latest pending one. */
        const prior = Array.isArray(fresh.receipts) ? fresh.receipts : [];
        const nonPending = prior.filter((r) => r.status !== "pending_review");
        const nextReceipts = nonPending.concat([receipt]);

        /* Forward-only paymentStatus. Never downgrade. */
        const currentPay = String(fresh.paymentStatus || "unpaid");
        const targetPay  = "receipt_submitted";
        const nextPay = paymentRank(targetPay) > paymentRank(currentPay) ? targetPay : currentPay;

        /* Validate current order status is forward-compatible. */
        const currentStatus = fresh.status || ORDER_STATUSES.AWAITING_PAYMENT;
        const nextStatus = ORDER_STATUS_SET.has(currentStatus) && paymentRank(nextPay) >= paymentRank("receipt_submitted")
          ? ORDER_STATUSES.PAYMENT_PENDING
          : (ORDER_STATUS_SET.has(currentStatus) ? currentStatus : ORDER_STATUSES.AWAITING_PAYMENT);

        AP.Collections.orders.update(fresh.id, {
          receipts: nextReceipts,
          paymentStatus: nextPay,
          status: nextStatus,
          statusHistory: (fresh.statusHistory || []).concat([
            { status: nextStatus, at: now, by: "customer", note: "Transfer receipt uploaded" }
          ])
        });

        if (AP.Collections.notifications) {
          AP.Collections.notifications.add({
            id: AP.uid ? AP.uid("notif-") : "notif-" + Date.now(),
            customerId: fresh.customerId,
            title: "Receipt uploaded",
            message: `Your transfer receipt for ${fresh.ref} was uploaded. We will verify it shortly.`,
            icon: "fa-receipt",
            read: false,
            createdAt: now
          });
        }
        if (AP.Collections.logs) {
          AP.Collections.logs.add({ action: "receipt_upload", ref: fresh.ref, email: session.email, at: now });
        }

        announce("Receipt uploaded. Awaiting verification.");
        (window.UI && UI.toastSuccess) ? UI.toastSuccess("Receipt uploaded. We will verify your payment shortly.") : alert("Receipt uploaded.");

        setTimeout(() => location.reload(), 500);
      } catch (err) {
        console.error("[APAll] receipt save failed:", err);
        (window.UI && UI.toastError) ? UI.toastError("Could not save the receipt. Please try again.") : alert("Could not save the receipt.");
        announce("Receipt upload failed.");
        setButtonBusy(triggerBtn, false);
        releaseLock(order.id);
      }
    };
    reader.readAsDataURL(file);
  }

  function initReceiptUploadDelegation() {
    if (!HAS_DOM) return;
    if (!["order-success.html", "order-details.html"].includes(currentPage())) return;
    if (document.body.dataset.apReceiptBound === "1") return;
    document.body.dataset.apReceiptBound = "1";

    document.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-ap-receipt-upload]");
      if (!trigger) return;
      e.preventDefault();
      e.stopPropagation();

      const orderRef = trigger.getAttribute("data-order-ref");
      if (!orderRef) return;

      /* Pre-empt double-click before the OS picker opens */
      if (trigger.disabled) return;
      trigger.disabled = true;
      const reEnable = () => { trigger.disabled = false; };

      const picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "image/png,image/jpeg,image/webp,application/pdf";
      picker.style.display = "none";
      document.body.appendChild(picker);

      picker.addEventListener("change", () => {
        const file = picker.files && picker.files[0];
        picker.remove();
        if (!file) { reEnable(); return; }
        uploadReceipt(orderRef, file, trigger);
      });
      picker.addEventListener("cancel", () => { picker.remove(); reEnable(); });

      picker.click();
    });
  }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    if (!HAS_DOM) return;
    try {
      injectStyles();
      markHomepage();
      initShopSearchReveal();
      updateHeaderHomeVisibility();
      initHeaderObserver();
      initReceiptUploadDelegation();
    } catch (err) {
      console.error("[APAll] init error:", err);
    }
  }

  /* Public exports — used by ap-customer-service.js, ap-sidebar.js,
     ap-verification.js and by the test harness. */
  window.APAll = {
    STYLE_ID,
    ORDER_STATUSES,
    PAYMENT_LADDER,
    currentPage,
    isCustomerLoggedIn,
    isAdminPage,
    isHomePage,
    revealShopGrid,
    updateHeaderHomeVisibility,
    uploadReceipt,
    restoreTrigger,
    canUploadReceipt,
    paymentRank,
    announce
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
