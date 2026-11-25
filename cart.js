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
      <div class="checkout-layout"><div>${items.map((item, index) => `<article class="checkout-panel cart-line" data-index="${index}">
        <img class="cart-line__image" src="${escapeHtml(item.image || "ankara image.jpg")}" alt="${escapeHtml(item.name)}" />
        <div class="cart-line__details"><h2>${escapeHtml(item.name)}</h2><p class="color-muted">${escapeHtml(item.unitType === "trouser" ? "Per trouser" : "Per yard")}${item.color ? ` · ${escapeHtml(item.color)}` : ""}${item.design ? ` · ${escapeHtml(item.design)}` : ""}</p><strong>${AP.formatNaira(item.unitPrice)} × ${item.quantity}</strong><div class="qty-stepper cart-line__stepper"><button type="button" data-qty="-1" aria-label="Decrease quantity">−</button><span>${item.quantity}</span><button type="button" data-qty="1" aria-label="Increase quantity">+</button></div></div>
        <div class="cart-line__amount"><strong>${AP.formatNaira(item.unitPrice * item.quantity)}</strong><button type="button" class="btn btn--ghost btn--sm" data-remove>Remove</button></div></article>`).join("")}</div>
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
