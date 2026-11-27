/* ============================================================
   ANKARA PALACE — ORDER SUCCESS & DETAILS (MODIFIED)
   Changes:
     - Customers confirm a transfer before uploading its receipt.
     - Uploaded receipt previews are shown to the customer.
     - Timeline uses the new status chain:
       Awaiting Payment → Pending → Accepted → Shipped
       → Ready to Dispatch → Delivered
     - Delivery block renders LGA / Street / State / Country.
   ============================================================ */

(function () {
  "use strict";

  const { $, escapeHtml, statusBadge, toastSuccess, toastError } = UI;

  const FLOW = [
    "Awaiting Payment",
    "Pending",
    "Accepted",
    "Shipped",
    "Ready to Dispatch",
    "Delivered"
  ];

  function getRef() { return new URLSearchParams(location.search).get("ref"); }

  function getOrder() {
    const ref = getRef();
    if (!ref) return null;
    const order = AP.Collections.orders.byRef(ref);
    if (!order) return null;
    const customer = AP.Session.getCustomer();
    if (!customer || order.customerId !== customer.id) return null;
    return order;
  }

  function isOrderSuccessful(order) {
    return ["paid", "confirmed"].includes(String(order?.paymentStatus || "").toLowerCase())
      || ["Accepted", "Order Success"].includes(order?.status);
  }

  function renderBankPanel(order) {
    const settings = AP.Collections.settings.get();
    const receipts = Array.isArray(order.receipts) ? order.receipts : [];
    const hasReceipt = receipts.length > 0;
    const latest = hasReceipt ? receipts[receipts.length - 1] : null;
    const orderSuccessful = isOrderSuccessful(order);

    const receiptBlock = hasReceipt
      ? `
        <div class="receipt-panel">
          <h4>Transfer Receipt</h4>
          <span class="receipt-panel__status ${order.paymentStatus === "paid" ? "is-ok" : "is-pending"}">
            ${order.paymentStatus === "paid" ? "Payment confirmed" : "Awaiting verification"}
          </span>
          <div style="margin-top:8px;">
            ${latest.fileType && latest.fileType.startsWith("image/")
              ? `<img class="receipt-thumb" src="${escapeHtml(latest.dataUrl)}" alt="Uploaded receipt" />`
              : `<a href="${escapeHtml(latest.dataUrl)}" download="${escapeHtml(latest.fileName || "receipt")}" class="btn btn--outline btn--sm"><i class="fa-solid fa-file-pdf"></i> View PDF receipt</a>`}
          </div>
          <p class="color-muted" style="margin-top:8px; font-size:0.8rem;">Uploaded ${AP.formatDateTime(latest.uploadedAt)}</p>
          ${order.paymentStatus !== "paid"
            ? `<button type="button" class="btn btn--outline btn--sm" style="margin-top:8px;" data-ap-receipt-upload data-order-ref="${escapeHtml(order.ref)}">
                 <i class="fa-solid fa-upload"></i> Upload another receipt
               </button>`
            : ""}
        </div>
      `
      : order.transferReportedAt ? `
        <div style="margin-top:var(--sp-3); display:flex; gap:var(--sp-2); flex-wrap:wrap;">
          <button type="button" class="btn btn--emerald" data-ap-receipt-upload data-order-ref="${escapeHtml(order.ref)}">
            <i class="fa-solid fa-upload"></i> Upload transfer receipt
          </button>
        </div>
        <p class="color-muted" style="margin-top:8px; font-size:0.82rem;">Upload a clear photo or PDF so our team can verify your transfer.</p>
      ` : `
        <div style="margin-top:var(--sp-3); display:flex; gap:var(--sp-2); flex-wrap:wrap;">
          <button type="button" class="btn btn--emerald" data-ap-transfer-confirm data-order-ref="${escapeHtml(order.ref)}">
            <i class="fa-solid fa-check"></i> I've made the transfer
          </button>
        </div>
        <p class="color-muted" style="margin-top:8px; font-size:0.82rem;">
          Copy the account details above, make your transfer, then confirm it here to upload your receipt.
        </p>
      `;

    if (orderSuccessful) {
      return `<div class="bank-panel"><h3><i class="fa-solid fa-circle-check"></i> Payment Confirmed</h3>
        <p>Your order is successful. No further transfer is needed, and bank account details are hidden.</p>
        ${hasReceipt ? `<p class="color-muted">Receipt uploaded ${AP.formatDateTime(latest.uploadedAt)}.</p>` : ""}
        <p><strong>Order reference:</strong> ${escapeHtml(order.ref)}</p></div>`;
    }

    return `
      <div class="bank-panel">
        <h3><i class="fa-solid fa-money-bill-transfer"></i> Bank Transfer Instructions</h3>
        <div class="bank-row">
          <span class="bank-row__label">Bank Name</span>
          <span class="bank-row__value" data-copy="${escapeHtml(settings.bankName)}">
            ${escapeHtml(settings.bankName)}
            <button type="button" class="copy-btn" data-copy-btn>Copy</button>
          </span>
        </div>
        <div class="bank-row">
          <span class="bank-row__label">Account Name</span>
          <span class="bank-row__value" data-copy="${escapeHtml(settings.accountName)}">
            ${escapeHtml(settings.accountName)}
            <button type="button" class="copy-btn" data-copy-btn>Copy</button>
          </span>
        </div>
        <div class="bank-row">
          <span class="bank-row__label">Account Number</span>
          <span class="bank-row__value" data-copy="${escapeHtml(settings.accountNumber)}">
            ${escapeHtml(settings.accountNumber)}
            <button type="button" class="copy-btn" data-copy-btn>Copy</button>
          </span>
        </div>
        <div class="bank-row">
          <span class="bank-row__label">Amount</span>
          <span class="bank-row__value">${AP.formatNaira(order.totals.total)}</span>
        </div>
        <div class="bank-row">
          <span class="bank-row__label">Reference</span>
          <span class="bank-row__value" data-copy="${escapeHtml(order.ref)}">
            ${escapeHtml(order.ref)}
            <button type="button" class="copy-btn" data-copy-btn>Copy</button>
          </span>
        </div>
        <p class="bank-note">
          Please use <strong>${escapeHtml(order.ref)}</strong> as your transfer reference. Your order will remain
          <strong>${order.status === "Pending" ? "Pending" : "Awaiting Payment"}</strong> until payment is confirmed by our team.
        </p>
        ${receiptBlock}
      </div>
    `;
  }

  function bindCopyButtons(root) {
    root.querySelectorAll("[data-copy-btn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const parent = btn.closest("[data-copy]");
        if (!parent) return;
        const text = parent.getAttribute("data-copy");
        if (!navigator.clipboard) { toastError("Clipboard is not available in this browser."); return; }
        navigator.clipboard.writeText(text).then(
          () => toastSuccess("Copied to clipboard."),
          () => toastError("Unable to copy. Please copy manually.")
        );
      });
    });
  }

  function bindTransferButtons(root) {
    root.querySelectorAll("[data-ap-transfer-confirm]").forEach((button) => {
      button.addEventListener("click", () => {
        const ref = button.getAttribute("data-order-ref");
        const order = AP.Collections.orders.byRef(ref);
        if (!order || order.paymentStatus === "paid") return;
        const updated = AP.Collections.orders.update(order.id, { transferReportedAt: AP.nowISO() });
        if (!updated) { toastError("Could not save this step. Please try again."); return; }
        toastSuccess("Thanks. Upload your transfer receipt to send it for review.");
        if (root.id === "success-root") renderSuccess(); else renderDetails();
      });
    });
  }

  function addressBlockHTML(delivery) {
    const a = AP.Address.normalize(delivery || {});
    return `
      <div class="detail-block delivery-address-block">
        <h3>Delivery Address</h3>
        <p><strong>${escapeHtml(a.fullName || "—")}</strong></p>
        <p>${escapeHtml(a.phone || "")}</p>
        <p>${escapeHtml(a.street || "")}</p>
        <p>${escapeHtml(a.lga || "")}, ${escapeHtml(a.state || "")}</p>
        <p>${escapeHtml(a.country || "")}</p>
      </div>
      ${a.notes ? `<div class="detail-block" style="margin-top:var(--sp-3);"><h3>Notes</h3><p>${escapeHtml(a.notes)}</p></div>` : ""}
    `;
  }

  function renderSuccess() {
    const root = $("#success-root");
    const order = getOrder();
    if (!order) {
      root.innerHTML = `
        <div class="empty-state" style="padding-block:var(--sp-8);">
          <i class="fa-solid fa-circle-exclamation"></i>
          <h3>Order not found</h3>
          <p>The order reference is invalid or does not belong to your account.</p>
          <a href="shop.html" class="btn btn--emerald">Back to Shop</a>
        </div>
      `;
      return;
    }

    const orderSuccessful = isOrderSuccessful(order);

    root.innerHTML = `
      <div class="success-wrap">
        <div class="success-icon"><i class="fa-solid fa-check"></i></div>
        <h1>${orderSuccessful ? "Order Success" : "Order Received"}</h1>
        <p>${orderSuccessful
          ? "Your order has been approved. No further transfer is needed."
          : "Thank you for your order. Please complete your bank transfer using the details below."}</p>

        <div class="success-ref">
          <span>Order Reference</span>
          <strong>${escapeHtml(order.ref)}</strong>
        </div>

        ${renderBankPanel(order)}

        <div class="card" style="text-align:left; margin-top:var(--sp-4);">
          <div style="padding:var(--sp-4);">
            <h3 style="margin-bottom:var(--sp-3);">Order Summary</h3>
            ${order.items.map((item) => `
              <div class="order-item" style="margin-bottom:var(--sp-3);">
                <img src="${escapeHtml(item.image || "ankara image.jpg")}" alt="${escapeHtml(item.name)}" />
                <div class="order-item__body">
                  <p class="order-item__name">${escapeHtml(item.name)}</p>
                  <p class="order-item__meta">${item.color ? `Colour: ${escapeHtml(item.color)}` : ""}${item.color && item.design ? " · " : ""}${item.design ? `Design: ${escapeHtml(item.design)}` : ""}</p>
                <p class="order-item__meta">${escapeHtml(item.unitType === "trouser" ? "Trouser" : item.unitType === "bundle" ? `Bundle (${Number(item.bundleYards) || 0} yards)` : "Yard")} × ${item.quantity}</p>
                </div>
                <span class="order-item__price">${AP.formatNaira(item.lineTotal)}</span>
              </div>
            `).join("")}
            <div class="totals-list">
              <div class="totals-list__row"><span>Subtotal</span><span>${AP.formatNaira(order.totals.subtotal)}</span></div>
              <div class="totals-list__row"><span>Delivery</span><span>${order.totals.deliveryFee === 0 ? "Free" : AP.formatNaira(order.totals.deliveryFee)}</span></div>
              ${order.totals.discount > 0 ? `<div class="totals-list__row" style="color:var(--success);"><span>Discount</span><span>−${AP.formatNaira(order.totals.discount)}</span></div>` : ""}
              <div class="totals-list__row totals-list__row--grand"><span>Total</span><span>${AP.formatNaira(order.totals.total)}</span></div>
            </div>
          </div>
        </div>

        <div class="success-actions">
          <a href="order-details.html?ref=${encodeURIComponent(order.ref)}" class="btn btn--emerald">
            <i class="fa-solid fa-receipt"></i> View Order Details
          </a>
          <a href="customer-dashboard.html" class="btn btn--outline">
            <i class="fa-solid fa-gauge-high"></i> My Dashboard
          </a>
          <a href="shop.html" class="btn btn--ghost">Continue Shopping</a>
        </div>
      </div>
    `;

    bindCopyButtons(root);
    bindTransferButtons(root);
  }

  function renderDetails() {
    const root = $("#order-root");
    const order = getOrder();
    if (!order) {
      root.innerHTML = `
        <div class="empty-state" style="padding-block:var(--sp-8);">
          <i class="fa-solid fa-circle-exclamation"></i>
          <h3>Order not found</h3>
          <p>This order does not exist or does not belong to your account.</p>
          <a href="customer-dashboard.html" class="btn btn--emerald">Back to Dashboard</a>
        </div>
      `;
      return;
    }

    const statusIndex = FLOW.indexOf(order.status);
    const isTerminal = ["Rejected", "Cancelled"].includes(order.status);

    const timelineHTML = isTerminal
      ? `
        <div class="timeline">
          <div class="timeline-step is-done">
            <span class="timeline-step__title">Order Placed</span>
            <span class="timeline-step__time">${AP.formatDateTime(order.createdAt)}</span>
          </div>
          <div class="timeline-step is-current">
            <span class="timeline-step__title">${escapeHtml(order.status)}</span>
            <span class="timeline-step__time">${AP.formatDateTime(order.updatedAt)}</span>
          </div>
        </div>
      `
      : `
        <div class="timeline">
          ${FLOW.map((step, i) => {
            const done = i < statusIndex;
            const current = i === statusIndex;
            const history = (order.statusHistory || []).find((h) => h.status === step);
            return `
              <div class="timeline-step ${done ? "is-done" : current ? "is-current" : "is-pending"}">
                <span class="timeline-step__title">${escapeHtml(step)}</span>
                ${history ? `<span class="timeline-step__time">${AP.formatDateTime(history.at)}</span>` : ""}
              </div>
            `;
          }).join("")}
        </div>
      `;

    root.innerHTML = `
      <div class="order-details-head">
        <div>
          <h1 style="margin-bottom:4px;">Order ${escapeHtml(order.ref)}</h1>
          <p class="color-muted" style="margin:0;">Placed on ${AP.formatDateTime(order.createdAt)}</p>
        </div>
        <div style="display:flex; gap:var(--sp-2); flex-wrap:wrap;">
          ${statusBadge(order.status)}
          <span class="badge ${isOrderSuccessful(order) ? "badge--success" : "badge--warning"}">
            Payment: ${isOrderSuccessful(order) ? "Confirmed" : "Pending"}
          </span>
        </div>
      </div>

      ${renderBankPanel(order)}

      <div class="detail-grid">
        <div class="dash-card">
          <h2>Order Items</h2>
          <div class="order-items">
            ${order.items.map((item) => `
              <div class="order-item">
                <img src="${escapeHtml(item.image || "ankara image.jpg")}" alt="${escapeHtml(item.name)}" />
                <div class="order-item__body">
                  <p class="order-item__name">${escapeHtml(item.name)}</p>
                  <p class="order-item__meta">${item.color ? `Colour: ${escapeHtml(item.color)}` : ""}${item.color && item.design ? " · " : ""}${item.design ? `Design: ${escapeHtml(item.design)}` : ""}</p>
                  <p class="order-item__meta">${escapeHtml(item.unitType === "trouser" ? "Trouser" : item.unitType === "bundle" ? `Bundle (${Number(item.bundleYards) || 0} yards)` : "Yard")} × ${item.quantity} @ ${AP.formatNaira(item.unitPrice)}</p>
                </div>
                <span class="order-item__price">${AP.formatNaira(item.lineTotal)}</span>
              </div>
            `).join("")}
          </div>
          <div class="totals-list">
            <div class="totals-list__row"><span>Subtotal</span><span>${AP.formatNaira(order.totals.subtotal)}</span></div>
            <div class="totals-list__row"><span>Delivery</span><span>${order.totals.deliveryFee === 0 ? "Free" : AP.formatNaira(order.totals.deliveryFee)}</span></div>
            ${order.totals.discount > 0 ? `<div class="totals-list__row" style="color:var(--success);"><span>Discount${order.promoCode ? ` (${escapeHtml(order.promoCode)})` : ""}</span><span>−${AP.formatNaira(order.totals.discount)}</span></div>` : ""}
            <div class="totals-list__row totals-list__row--grand"><span>Total</span><span>${AP.formatNaira(order.totals.total)}</span></div>
          </div>
        </div>

        <div>
          <div class="dash-card">
            <h2>Delivery Information</h2>
            ${addressBlockHTML(order.delivery)}
          </div>

          <div class="dash-card">
            <h2>Order Timeline</h2>
            ${timelineHTML}
          </div>

          <div class="dash-card">
            <h2>Payment</h2>
            <div class="detail-block">
              <h3>Method</h3>
              <p>${escapeHtml(order.paymentMethod || "Bank Transfer")}</p>
            </div>
            <div class="detail-block" style="margin-top:var(--sp-3);">
              <h3>Status</h3>
              <p>${isOrderSuccessful(order) ? "Payment confirmed. No further transfer is needed." : "Awaiting payment confirmation from Ankara Palace."}</p>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-top:var(--sp-5); display:flex; gap:var(--sp-2); flex-wrap:wrap;">
        <a href="customer-dashboard.html" class="btn btn--ghost"><i class="fa-solid fa-arrow-left"></i> Back to Dashboard</a>
        <a href="shop.html" class="btn btn--outline">Continue Shopping</a>
      </div>
    `;

    bindCopyButtons(root);
    bindTransferButtons(root);
  }

  function init() {
    if ($("#success-root")) renderSuccess();
    else if ($("#order-root")) renderDetails();
    window.addEventListener("ap:orders-change", () => {
      if ($("#success-root")) renderSuccess();
      else if ($("#order-root")) renderDetails();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
