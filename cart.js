(function () {
  "use strict";
  const { $, escapeHtml, toastError, toastSuccess } = UI;
  const root = $("#cart-root");
  const getItems = () => AP.storage.get("ap_cart", []);
  const saveItems = (items) => AP.storage.set("ap_cart", items);

  function render() {
    const items = getItems();
    if (!items.length) {
      root.innerHTML = `<div class="empty-state"><i class="fa-solid fa-bag-shopping"></i><h1>Your cart is empty</h1><p>Browse the fabric collection and add items here.</p><a href="shop.html" class="btn btn--primary">Shop Fabrics</a></div>`;
      return;
    }
    const totals = AP.OrderCalc.calculate(items);
    root.innerHTML = `<div class="dash-head"><div><h1>Your Cart</h1><p>${items.length} selected fabric${items.length === 1 ? "" : "s"}</p></div><a class="btn btn--ghost" href="shop.html">Continue shopping</a></div>
      <div class="checkout-layout"><div>${items.map((item, index) => `<article class="checkout-panel cart-line" data-index="${index}" style="display:grid;grid-template-columns:100px 1fr auto;gap:16px;align-items:center;margin-bottom:14px;">
        <img src="${escapeHtml(item.image || "ankara image.jpg")}" alt="${escapeHtml(item.name)}" style="width:100px;height:100px;object-fit:cover;border-radius:8px;" />
        <div><h2 style="margin:0 0 6px;">${escapeHtml(item.name)}</h2><p class="color-muted" style="margin:0;">${escapeHtml(item.unitType === "trouser" ? "Per trouser" : "Per yard")}${item.color ? ` · ${escapeHtml(item.color)}` : ""}${item.design ? ` · ${escapeHtml(item.design)}` : ""}</p><strong>${AP.formatNaira(item.unitPrice)} × ${item.quantity}</strong><div class="qty-stepper" style="margin-top:10px;"><button type="button" data-qty="-1" aria-label="Decrease quantity">−</button><span style="padding:0 12px;">${item.quantity}</span><button type="button" data-qty="1" aria-label="Increase quantity">+</button></div></div>
        <div style="text-align:right;"><strong>${AP.formatNaira(item.unitPrice * item.quantity)}</strong><button type="button" class="btn btn--ghost btn--sm" data-remove style="display:block;margin-top:12px;">Remove</button></div></article>`).join("")}</div>
        <aside class="checkout-summary"><div class="checkout-panel"><h2>Order Summary</h2><div class="summary-totals"><div class="summary-totals__row"><span>Subtotal</span><span>${AP.formatNaira(totals.subtotal)}</span></div><div class="summary-totals__row"><span>Delivery</span><span>${totals.deliveryFee ? AP.formatNaira(totals.deliveryFee) : "Free"}</span></div><div class="summary-totals__row summary-totals__row--grand"><span>Estimated total</span><span>${AP.formatNaira(totals.total)}</span></div></div><button type="button" class="btn btn--primary btn--lg btn--block" id="cart-checkout">Proceed to Checkout</button><button type="button" class="btn btn--ghost btn--block" id="cart-clear" style="margin-top:8px;">Clear Cart</button></div></aside></div>`;
    root.querySelectorAll(".cart-line").forEach((line) => {
      const index = Number(line.dataset.index);
      line.querySelectorAll("[data-qty]").forEach((button) => button.addEventListener("click", () => {
        const next = getItems();
        const item = next[index];
        const product = AP.Collections.products.byId(item.productId);
        const minYards = Number(product?.minOrderQty) || 1;
        const bundleYards = item.unitType === "bundle" ? Number(item.bundleYards) || 0 : 0;
        const min = bundleYards ? Math.max(1, Math.ceil(minYards / bundleYards)) : minYards;
        const stock = bundleYards ? Math.floor((Number(product?.stock) || 0) / bundleYards) : (Number(product?.stock) || 0);
        const quantity = Number(item.quantity) + Number(button.dataset.qty);
        if (quantity < min) { toastError(`Minimum order quantity is ${min}.`); return; }
        if (quantity > stock) { toastError(`Only ${stock} units are available.`); return; }
        item.quantity = quantity;
        item.stockQuantity = bundleYards ? quantity * bundleYards : quantity;
        saveItems(next); render();
      }));
      line.querySelector("[data-remove]").addEventListener("click", () => { const next = getItems(); next.splice(index, 1); saveItems(next); render(); });
    });
    $("#cart-clear").addEventListener("click", () => { saveItems([]); render(); });
    $("#cart-checkout").addEventListener("click", () => {
      const current = getItems();
      if (!current.length) return;
      for (const item of current) {
        const product = AP.Collections.products.byId(item.productId);
        if (!product || product.active === false) { toastError(`${item.name} is no longer available.`); return; }
        if (Number(item.stockQuantity || item.quantity) > Number(product.stock)) { toastError(`Please update the quantity for ${item.name}.`); return; }
      }
      sessionStorage.setItem("ap_checkout_items", JSON.stringify(current));
      if (!AP.Session.getCustomer()) { location.href = "login.html?redirect=checkout.html"; return; }
      location.href = "checkout.html";
    });
  }
  render();
})();
