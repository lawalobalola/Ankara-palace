/* ============================================================
   ANKARA PALACE — CHECKOUT CONTROLLER (MODIFIED)
   Changes:
     - Single delivery address: fullName, phone, lga, street,
       state, country, notes.
     - No second address, no postal code.
     - Uses AP.Address helpers for validation and formatting.
     - Order status starts at "Awaiting Payment". A receipt changes
       it to "Pending" for review; admin approval marks it Accepted.
       Tracking then moves Shipped → Ready to Dispatch → Delivered.
   ============================================================ */

(function () {
  "use strict";

  const { $, escapeHtml, toastError, toastSuccess } = UI;

  let cart = [];
  let customer = null;
  let promo = null;
  let useAddressId = null;
  let placing = false;

  function loadCart() {
    try {
      const many = sessionStorage.getItem("ap_checkout_items");
      const single = sessionStorage.getItem("ap_checkout_item");
      const parsed = JSON.parse(many || (single ? `[${single}]` : "[]"));
      cart = Array.isArray(parsed) ? parsed : [parsed].filter(Boolean);
    } catch (_) { cart = []; }
    return cart;
  }

  function notFound() {
    $("#checkout-root").innerHTML = `
      <div class="empty-state" style="padding-block:var(--sp-8);">
        <i class="fa-solid fa-bag-shopping"></i>
        <h3>Your checkout is empty</h3>
        <p>Select a fabric before proceeding to checkout.</p>
        <a href="shop.html" class="btn btn--emerald">Back to Shop</a>
      </div>
    `;
  }

  function getAddresses() {
    return AP.storage.get(`ap_addresses_${customer.id}`, []).map((a) => AP.Address.normalize(a));
  }

  function defaultAddress() {
    const list = AP.storage.get(`ap_addresses_${customer.id}`, []);
    return list.find((a) => a.isDefault) || list[0] || null;
  }

  function render() {
    const root = $("#checkout-root");
    const addresses = getAddresses();
    const selectedAddr = addresses.find((a) => a.id === useAddressId) || defaultAddress();
    const addr = selectedAddr || AP.Address.empty();
    const totals = AP.OrderCalc.calculate(cart, { promo, state: addr.state });

    root.innerHTML = `
      <div class="dash-head" style="margin-bottom:var(--sp-4);">
        <div>
          <h1>Checkout</h1>
          <p>Review your order and provide your delivery details.</p>
        </div>
        <a href="cart.html" class="btn btn--ghost btn--sm">
          <i class="fa-solid fa-arrow-left"></i> Back
        </a>
      </div>

      <div class="checkout-layout">
        <div>
          <div class="checkout-panel">
            <h2><i class="fa-solid fa-location-dot"></i> Delivery Details</h2>

            ${addresses.length > 0 ? `
              <div class="form-group">
                <label class="form-label">Use a saved address</label>
                <select id="addr-select" class="form-control">
                  ${addresses.map((a) => `
                    <option value="${escapeHtml(a.id)}" ${selectedAddr && selectedAddr.id === a.id ? "selected" : ""}>
                      ${escapeHtml(a.fullName)} — ${escapeHtml(a.street)}, ${escapeHtml(a.lga)}${a.isDefault ? " (Default)" : ""}
                    </option>
                  `).join("")}
                </select>
              </div>
              <div class="auth-divider">or enter a new address</div>
            ` : ""}

            <form id="checkout-form" novalidate>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Full Name <span class="req">*</span></label>
                  <input type="text" id="co-name" class="form-control" value="${escapeHtml(addr.fullName || customer.name)}" required />
                  <div class="form-error"></div>
                </div>
                <div class="form-group">
                  <label class="form-label">Phone <span class="req">*</span></label>
                  <input type="tel" id="co-phone" class="form-control" value="${escapeHtml(addr.phone || customer.phone || "")}" required />
                  <div class="form-error"></div>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Street Address <span class="req">*</span></label>
                <input type="text" id="co-street" class="form-control" value="${escapeHtml(addr.street || "")}" required />
                <div class="form-error"></div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Local Government Area <span class="req">*</span></label>
                  <input type="text" id="co-lga" class="form-control" value="${escapeHtml(addr.lga || "")}" required />
                  <div class="form-error"></div>
                </div>
                <div class="form-group">
                  <label class="form-label">State <span class="req">*</span></label>
                  <select id="co-state" class="form-control" required>
                    <option value="">Choose your state</option>
                    ${AP.NIGERIAN_STATES.map((state) => `<option value="${escapeHtml(state)}" ${AP.deliveryStateKey(addr.state) === state ? "selected" : ""}>${state === "FCT" ? "Abuja (FCT)" : escapeHtml(state)}</option>`).join("")}
                  </select>
                  <div class="form-error"></div>
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label class="form-label">Country <span class="req">*</span></label>
                  <input type="text" id="co-country" class="form-control" value="${escapeHtml(addr.country || "Nigeria")}" required />
                  <div class="form-error"></div>
                </div>
                <div class="form-group" style="display:flex;align-items:flex-end;">
                  <label class="auth-checkbox">
                    <input type="checkbox" id="co-save-address" />
                    Save this address to my account
                  </label>
                </div>
              </div>

              <div class="form-group">
                <label class="form-label">Additional Instructions</label>
                <textarea id="co-notes" class="form-control" rows="3" placeholder="Delivery notes, landmark, preferred time…">${escapeHtml(addr.notes || "")}</textarea>
              </div>
            </form>
          </div>

          <div class="checkout-panel">
            <h2><i class="fa-solid fa-money-bill-transfer"></i> Payment Method</h2>
            <div style="background:var(--cream); border:1px solid var(--border); border-radius:var(--radius); padding:var(--sp-4);">
              <p style="margin:0 0 var(--sp-2);"><strong>Bank Transfer</strong></p>
              <p class="color-muted" style="margin:0; font-size:0.88rem;">
                After placing your order, you will receive our bank account details.
                Your order will move to <strong>Awaiting Payment</strong> until our team confirms your transfer.
              </p>
            </div>
          </div>
        </div>

        <aside class="checkout-summary">
          <div class="checkout-panel">
            <h2>Order Summary</h2>
            ${cart.map((item) => `<div class="summary-item">
              <img src="${escapeHtml(item.image || "ankara image.jpg")}" alt="${escapeHtml(item.name)}" />
              <div class="summary-item__body">
                <p class="summary-item__name">${escapeHtml(item.name)}</p>
                <p class="summary-item__meta">${item.color ? `Colour: ${escapeHtml(item.color)}` : ""}${item.color && item.design ? " · " : ""}${item.design ? `Design: ${escapeHtml(item.design)}` : ""}</p>
                <p class="summary-item__meta">${escapeHtml(item.unitType === "trouser" ? "Trouser" : item.unitType === "bundle" ? `Bundle (${Number(item.bundleYards) || 0} yards)` : "Yard")} × ${item.quantity}</p>
                <p class="summary-item__price">${AP.formatNaira(item.unitPrice * item.quantity)}</p>
              </div>
            </div>`).join("")}

            <div class="promo-row">
              <input type="text" id="promo-input" placeholder="Promo code" value="${promo ? escapeHtml(promo.code) : ""}" ${promo ? "disabled" : ""} />
              ${promo
                ? `<button type="button" id="promo-remove" style="background:var(--danger);">Remove</button>`
                : `<button type="button" id="promo-apply">Apply</button>`}
            </div>

            <div class="summary-totals">
              <div class="summary-totals__row"><span>Subtotal</span><span>${AP.formatNaira(totals.subtotal)}</span></div>
              <div class="summary-totals__row"><span id="delivery-fee-label">Delivery${totals.deliveryState ? ` to ${escapeHtml(totals.deliveryState === "FCT" ? "Abuja (FCT)" : totals.deliveryState)}` : ""}</span><span id="delivery-fee-value">${totals.deliveryFee === 0 ? "Free" : AP.formatNaira(totals.deliveryFee)}</span></div>
              ${totals.discount > 0 ? `<div class="summary-totals__row summary-totals__row--discount"><span>Discount (${escapeHtml(promo.code)})</span><span>−${AP.formatNaira(totals.discount)}</span></div>` : ""}
              <div class="summary-totals__row summary-totals__row--grand"><span>Total</span><span id="order-total-value">${AP.formatNaira(totals.total)}</span></div>
            </div>

            <button type="button" class="btn btn--primary btn--lg btn--block" id="place-order" style="margin-top:var(--sp-4);">
              <i class="fa-solid fa-lock"></i> Place Order
            </button>
            <p class="form-hint" style="text-align:center;margin-top:var(--sp-2);">
              You will receive bank transfer instructions after placing your order.
            </p>
            <div class="bank-note" style="margin-top:var(--sp-3);">
              Your order is saved for store review. Bank transfer details and receipt steps appear after you place the order.
            </div>
          </div>
        </aside>
      </div>
    `;

    bind();
  }

  function bind() {
    const stateSelect = $("#co-state");
    if (stateSelect) stateSelect.addEventListener("change", () => {
      const totals = AP.OrderCalc.calculate(cart, { promo, state: stateSelect.value });
      const fee = $("#delivery-fee-value");
      const label = $("#delivery-fee-label");
      const total = $("#order-total-value");
      if (label) label.textContent = totals.deliveryState ? `Delivery to ${totals.deliveryState === "FCT" ? "Abuja (FCT)" : totals.deliveryState}` : "Delivery";
      if (fee) fee.textContent = totals.deliveryFee === 0 ? "Free" : AP.formatNaira(totals.deliveryFee);
      if (total) total.textContent = AP.formatNaira(totals.total);
    });
    const addrSelect = $("#addr-select");
    if (addrSelect) {
      addrSelect.addEventListener("change", () => { useAddressId = addrSelect.value; render(); });
    }

    const applyBtn = $("#promo-apply");
    if (applyBtn) applyBtn.addEventListener("click", () => {
      const code = $("#promo-input").value.trim();
      if (!code) { toastError("Please enter a promo code."); return; }
      const found = AP.Collections.promos.byCode(code);
      if (!found || !found.active) { toastError("Invalid or expired promo code."); return; }
      promo = found;
      toastSuccess(`Promo applied: ${found.code}`);
      render();
    });

    const removeBtn = $("#promo-remove");
    if (removeBtn) removeBtn.addEventListener("click", () => { promo = null; render(); });

    const placeBtn = $("#place-order");
    if (placeBtn) placeBtn.addEventListener("click", placeOrder);
  }

  function collectDelivery() {
    const fields = {
      fullName: $("#co-name"),
      phone: $("#co-phone"),
      street: $("#co-street"),
      lga: $("#co-lga"),
      state: $("#co-state"),
      country: $("#co-country"),
      notes: $("#co-notes")
    };
    const data = {};
    Object.entries(fields).forEach(([k, el]) => {
      if (el) {
        data[k] = el.value.trim();
        el.classList.remove("is-invalid");
        const err = el.parentElement.querySelector(".form-error");
        if (err) err.textContent = "";
      }
    });

    const normalized = AP.Address.normalize(data);
    const errors = AP.Address.validate(normalized);
    if (errors.length === 0 && !UI.Validate.phone(normalized.phone)) {
      errors.push("Please enter a valid phone number.");
    }

    if (errors.length > 0) {
      // Attach error to the first relevant field where possible
      const map = {
        "Full name is required.": fields.fullName,
        "Phone is required.": fields.phone,
        "Local Government Area is required.": fields.lga,
        "Street address is required.": fields.street,
        "State is required.": fields.state,
        "Country is required.": fields.country,
        "Please enter a valid phone number.": fields.phone
      };
      errors.forEach((msg) => {
        const el = map[msg];
        if (el) {
          el.classList.add("is-invalid");
          const err = el.parentElement.querySelector(".form-error");
          if (err) err.textContent = msg;
        }
      });
      return { valid: false, data: normalized, errors };
    }

    return { valid: true, data: normalized, errors: [] };
  }

  function placeOrder() {
    if (placing) return;

    const result = collectDelivery();
    if (!result.valid) {
      toastError(result.errors[0] || "Please complete all required delivery fields.");
      return;
    }
    const delivery = result.data;

    const requestedByProduct = new Map();
    cart.forEach((item) => requestedByProduct.set(item.productId, (requestedByProduct.get(item.productId) || 0) + Number(item.stockQuantity || item.quantity || 0)));
    for (const [productId, requested] of requestedByProduct) {
      const product = AP.Collections.products.byId(productId);
      if (!product || product.active === false || requested > Number(product.stock || 0)) {
        toastError("A selected fabric is unavailable or no longer has enough stock. Please update your cart.");
        placing = false;
        return;
      }
    }

    placing = true;
    const btn = $("#place-order");
    if (btn) { btn.disabled = true; btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Placing Order…`; }

    const totals = AP.OrderCalc.calculate(cart, { promo, state: delivery.state });
    const order = {
      id: AP.uid("order-"),
      ref: AP.orderRef(),
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      items: cart.map((item) => ({
        productId: item.productId,
        name: item.name,
        image: item.image,
        unitType: item.unitType,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        bundleYards: item.bundleYards || null,
        color: item.color,
        design: item.design,
        lineTotal: item.unitPrice * item.quantity
      })),
      totals,
      promoCode: promo ? promo.code : null,
      delivery,
              status: "Awaiting Payment",
      paymentStatus: "unpaid",        // Until admin confirms → "Awaiting Payment"
      paymentMethod: "Bank Transfer",
      receipts: [],
      statusHistory: [{ status: "Awaiting Payment", at: AP.nowISO(), by: "customer" }],
      createdAt: AP.nowISO(),
      updatedAt: AP.nowISO(),
      adminNotes: []
    };

    const savedOrder = AP.Collections.orders.add(order);
    if (!savedOrder) {
      placing = false;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-lock"></i> Place Order`;
      }
      const reason = AP.getLastOrderError?.();
      toastError(reason ? `Couldn't place the order: ${reason}` : "We couldn't place the order. Please check your connection and try again.");
      return;
    }

    // The shared server reserves stock atomically with the order save. Only
    // the browser-only fallback needs to adjust stock here.
    if (!AP.sharedConnected()) {
      requestedByProduct.forEach((quantity, productId) => {
        const product = AP.Collections.products.byId(productId);
        if (product) AP.Collections.products.update(product.id, { stock: Math.max(0, Number(product.stock) - quantity) });
      });
    }

    AP.Collections.notifications.add({
      id: AP.uid("notif-"),
      customerId: customer.id,
      title: "Order Received",
      message: `Your order ${order.ref} has been received. Please complete bank transfer to confirm.`,
      icon: "fa-circle-check",
      read: false,
      createdAt: AP.nowISO()
    });

    const saveCb = $("#co-save-address");
    if (saveCb && saveCb.checked) {
      const list = AP.storage.get(`ap_addresses_${customer.id}`, []);
      list.push({
        id: AP.uid("addr-"),
        ...delivery,
        isDefault: list.length === 0
      });
      AP.storage.set(`ap_addresses_${customer.id}`, list);
    }

    sessionStorage.removeItem("ap_checkout_item");
    sessionStorage.removeItem("ap_checkout_items");
    AP.storage.set("ap_cart", []);
    toastSuccess("Order placed successfully.");
    setTimeout(() => { location.href = `order-success.html?ref=${encodeURIComponent(order.ref)}`; }, 600);
  }

  function init() {
    const savedSession = AP.Session.getCustomer();
    customer = AP.sharedConnected()
      ? (savedSession ? AP.Auth.currentCustomer() : null)
      : AP.Collections.customers.byId(savedSession?.id);
    if (!customer) {
      if (savedSession && AP.sharedConnected()) AP.Session.logoutCustomer();
      if (loadCart().length) location.replace("login.html?redirect=checkout.html");
      else notFound();
      return;
    }
    if (!loadCart().length) { notFound(); return; }
    if (cart.some((item) => !AP.Collections.products.byId(item.productId))) {
      sessionStorage.removeItem("ap_checkout_item");
      sessionStorage.removeItem("ap_checkout_items");
      notFound();
      return;
    }
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
