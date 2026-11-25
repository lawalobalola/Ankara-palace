/* ============================================================
   ANKARA PALACE — ADMIN DASHBOARD CONTROLLER (MODIFIED)
   Changes:
     - Product image upload replaces URL text field.
     - Order modal surfaces uploaded receipts with previews.
     - Status transitions use the new chain:
         Pending → Awaiting Payment → Accepted →
         Ready to Dispatch → Shipped → Delivered
     - "Confirm payment" advances Awaiting Payment → Accepted
       and sets paymentStatus to "paid".
   ============================================================ */

(function () {
  "use strict";

  const { $, escapeHtml, toastSuccess, toastError, openModal, closeModal, confirm: confirmDialog, statusBadge } = UI;

  let currentSection = "overview";
  let range = "30d";

  const SECTIONS = [
    { id: "overview", label: "Overview", icon: "fa-gauge-high", title: "Overview", subtitle: "Business performance at a glance." },
    { id: "products", label: "Products", icon: "fa-shirt", title: "Products / Fabrics", subtitle: "Add, edit and manage your fabric catalogue." },
    { id: "orders", label: "Orders", icon: "fa-box", title: "Orders", subtitle: "Review, accept and process customer orders." },
    { id: "customers", label: "Customers", icon: "fa-users", title: "Customers", subtitle: "View registered customers and their order history." },
    { id: "inventory", label: "Inventory", icon: "fa-warehouse", title: "Inventory", subtitle: "Track stock, low-stock and out-of-stock items." },
    { id: "categories", label: "Categories", icon: "fa-tags", title: "Categories", subtitle: "Organise fabrics into collections." },
    { id: "promotions", label: "Promotions", icon: "fa-percent", title: "Promotions", subtitle: "Manage discount codes and campaigns." },
    { id: "reviews", label: "Reviews", icon: "fa-star", title: "Reviews", subtitle: "Moderate customer reviews and ratings." },
    { id: "reports", label: "Reports", icon: "fa-chart-line", title: "Reports & Analytics", subtitle: "Export sales, revenue and product reports." },
    { id: "content", label: "Website Content", icon: "fa-file-lines", title: "Website Content", subtitle: "Update homepage content, contact details and settings." },
    { id: "settings", label: "Settings", icon: "fa-gear", title: "Admin Settings", subtitle: "Store information, bank details and profile." },
    { id: "activity", label: "Activity Log", icon: "fa-list-check", title: "Activity Log", subtitle: "Administrative actions and login history." }
  ];

  function getSession() { return AP.Session.getAdmin(); }
  function settings() { return AP.Collections.settings.get(); }

  function inRange(iso) {
    if (!iso) return false;
    const d = new Date(iso).getTime();
    const now = Date.now();
    const days = range === "today" ? 1
      : range === "7d" ? 7
      : range === "30d" ? 30
      : range === "90d" ? 90
      : range === "year" ? 365
      : range === "month" ? 30
      : range === "last-month" ? 60
      : 365;
    return now - d <= days * 24 * 60 * 60 * 1000;
  }
  function rangeLabel() {
    return { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days",
      month: "This month", "last-month": "Last month", year: "This year" }[range] || "Last 30 days";
  }
  function revenueOf(order) { return order.paymentStatus === "paid" ? Number(order.totals?.total || 0) : 0; }

  function computeStats() {
    const orders = AP.Collections.orders.all();
    const products = AP.Collections.products.all();
    const customers = AP.Collections.customers.all();
    const inOrders = orders.filter((o) => inRange(o.createdAt));
    const pending = orders.filter((o) => ["Pending", "Awaiting Payment"].includes(o.status)).length;
    const accepted = orders.filter((o) => ["Accepted", "Ready to Dispatch", "Shipped", "Delivered"].includes(o.status)).length;
    const rejected = orders.filter((o) => ["Rejected", "Cancelled"].includes(o.status)).length;
    const completed = orders.filter((o) => o.status === "Delivered").length;
    const revenue = orders.reduce((s, o) => s + revenueOf(o), 0);
    const revenueInRange = inOrders.reduce((s, o) => s + revenueOf(o), 0);
    return { totalOrders: orders.length, ordersInRange: inOrders.length, pending, accepted, rejected, completed,
      totalCustomers: customers.length, activeProducts: products.filter((p) => p.active !== false).length,
      revenue, revenueInRange, orders };
  }

  function printReportPDF(title, headers, rows) {
    const reportWindow = window.open("", "_blank", "width=1000,height=760");
    if (!reportWindow) { toastError("Allow the report window, then choose Save as PDF in Print."); return; }
    reportWindow.opener = null;
    const cell = (value) => escapeHtml(String(value == null ? "" : value));
    reportWindow.document.open();
    reportWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${cell(title)}</title>
      <style>body{font:14px Arial,sans-serif;color:#252925;padding:28px}h1{color:#174c3c}p{color:#666}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:9px;border:1px solid #ddd;text-align:left;vertical-align:top}th{background:#174c3c;color:#fff}@media print{body{padding:0}thead{display:table-header-group}}</style>
      </head><body><h1>Ankara Palace</h1><h2>${cell(title)}</h2><p>Generated ${cell(AP.formatDateTime(AP.nowISO()))} · ${rows.length} records</p><table><thead><tr>${headers.map((h) => `<th>${cell(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${cell(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>
      <script>window.onload=function(){window.print()}<\/script></body></html>`);
    reportWindow.document.close();
    toastSuccess("Print dialog opened. Choose Save as PDF to export the report.");
  }

  function renderSidebar() {
    const nav = $("#admin-nav");
    nav.innerHTML = "";
    const orderCount = AP.Collections.orders.all().filter((o) => ["Pending", "Awaiting Payment"].includes(o.status)).length;
    SECTIONS.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = currentSection === s.id ? "is-active" : "";
      const badge = s.id === "orders" && orderCount > 0 ? `<span class="admin-nav__badge">${orderCount}</span>` : "";
      btn.innerHTML = `<i class="fa-solid ${s.icon}"></i> <span>${s.label}</span> ${badge}`;
      btn.addEventListener("click", () => switchSection(s.id));
      nav.appendChild(btn);
    });
  }

  function switchSection(id) {
    currentSection = id;
    const sec = SECTIONS.find((s) => s.id === id);
    $("#admin-title").textContent = sec.title;
    $("#admin-subtitle").textContent = sec.subtitle;
    renderSidebar();
    renderSection();
    closeMobileSidebar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderTopbarActions() {
    const mount = $("#admin-topbar-actions");
    mount.innerHTML = "";
    const dateSelect = document.createElement("select");
    dateSelect.className = "admin-filters select";
    [["today","Today"],["7d","Last 7 days"],["30d","Last 30 days"],["90d","Last 90 days"],["month","This month"],["last-month","Last month"],["year","This year"]].forEach(([v, l]) => {
      const opt = document.createElement("option");
      opt.value = v; opt.textContent = l;
      if (v === range) opt.selected = true;
      dateSelect.appendChild(opt);
    });
    dateSelect.addEventListener("change", (e) => { range = e.target.value; renderSection(); });
    if (["overview", "orders", "reports", "customers"].includes(currentSection)) mount.appendChild(dateSelect);
  }

  function renderSection() {
    const mount = $("#admin-content");
    mount.innerHTML = "";
    renderTopbarActions();
    const map = {
      overview: renderOverview, products: renderProducts, orders: renderOrders,
      customers: renderCustomers, inventory: renderInventory, categories: renderCategories,
      promotions: renderPromotions, reviews: renderReviews, reports: renderReports,
      content: renderContent, settings: renderSettings, activity: renderActivity
    };
    (map[currentSection] || renderOverview)(mount);
  }

  /* ----- Overview (unchanged) ----- */
  function renderOverview(mount) {
    const s = computeStats();
    const orders = s.orders.filter((o) => inRange(o.createdAt));
    const statsHTML = `
      <div class="admin-stats">
        <div class="admin-stat"><div class="admin-stat__label">Total Revenue</div><div class="admin-stat__value">${AP.formatNaira(s.revenue)}</div><div class="admin-stat__hint">Confirmed payments only</div></div>
        <div class="admin-stat"><div class="admin-stat__label">Total Orders</div><div class="admin-stat__value">${s.totalOrders}</div><div class="admin-stat__hint">${s.ordersInRange} in ${rangeLabel().toLowerCase()}</div></div>
        <div class="admin-stat"><div class="admin-stat__label">Pending / Awaiting Payment</div><div class="admin-stat__value">${s.pending}</div><div class="admin-stat__hint">Awaiting review</div></div>
        <div class="admin-stat"><div class="admin-stat__label">Total Customers</div><div class="admin-stat__value">${s.totalCustomers}</div><div class="admin-stat__hint">Registered accounts</div></div>
      </div>
      <div class="admin-stats">
        <div class="admin-stat"><div class="admin-stat__label">Accepted</div><div class="admin-stat__value">${s.accepted}</div></div>
        <div class="admin-stat"><div class="admin-stat__label">Rejected</div><div class="admin-stat__value">${s.rejected}</div></div>
        <div class="admin-stat"><div class="admin-stat__label">Completed</div><div class="admin-stat__value">${s.completed}</div></div>
        <div class="admin-stat"><div class="admin-stat__label">Active Products</div><div class="admin-stat__value">${s.activeProducts}</div></div>
      </div>`;

    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const next = new Date(d); next.setDate(next.getDate() + 1);
      const count = orders.filter((o) => { const t = new Date(o.createdAt).getTime(); return t >= d.getTime() && t < next.getTime(); }).length;
      last7.push({ label: d.toLocaleDateString("en-NG", { weekday: "short" }), count });
    }
    const statusCounts = {};
    AP.ORDER_STATUSES.forEach((st) => (statusCounts[st] = 0));
    orders.forEach((o) => (statusCounts[o.status] = (statusCounts[o.status] || 0) + 1));
    const statusLabels = Object.keys(statusCounts).filter((k) => statusCounts[k] > 0);
    const statusValues = statusLabels.map((k) => statusCounts[k]);

    const soldByProduct = {};
    AP.Collections.orders.all().forEach((o) => o.items.forEach((it) => {
      const key = it.productId;
      if (!soldByProduct[key]) soldByProduct[key] = { name: it.name, qty: 0 };
      soldByProduct[key].qty += Number(it.quantity) || 0;
    }));
    const bestSellers = Object.values(soldByProduct).sort((a, b) => b.qty - a.qty).slice(0, 5);
    const bestLabels = bestSellers.map((b) => b.name.length > 14 ? b.name.slice(0, 13) + "…" : b.name);
    const bestValues = bestSellers.map((b) => b.qty);

    const lowStock = AP.Collections.products.all().filter((p) => Number(p.stock) > 0 && Number(p.stock) < 10);
    const outStock = AP.Collections.products.all().filter((p) => Number(p.stock) === 0);

    const chartCards = `
      <div class="chart-grid">
        <div class="admin-card"><h2>Orders — Last 7 Days</h2><div class="chart-wrap"><canvas id="chart-orders"></canvas></div></div>
        <div class="admin-card"><h2>Order Status</h2><div class="chart-wrap"><canvas id="chart-status"></canvas></div></div>
      </div>
      <div class="chart-grid">
        <div class="admin-card"><h2>Best Selling Fabrics</h2><div class="chart-wrap"><canvas id="chart-bestsellers"></canvas></div></div>
        <div class="admin-card"><h2>Recent Orders <button type="button" class="btn btn--outline btn--sm" data-goto="orders">View All</button></h2><div id="overview-recent-orders"></div></div>
      </div>`;

    const alertsHTML = `
      <div class="admin-card">
        <h2>Alerts &amp; Warnings</h2>
        <div style="display:grid; gap:var(--sp-3); grid-template-columns:repeat(3,1fr);">
          <div><strong style="display:block; font-size:0.82rem; text-transform:uppercase; color:var(--muted); margin-bottom:6px;">Low Stock</strong><span style="font-family:var(--font-heading); font-size:1.4rem; color:var(--warning);">${lowStock.length}</span></div>
          <div><strong style="display:block; font-size:0.82rem; text-transform:uppercase; color:var(--muted); margin-bottom:6px;">Out of Stock</strong><span style="font-family:var(--font-heading); font-size:1.4rem; color:var(--danger);">${outStock.length}</span></div>
          <div><strong style="display:block; font-size:0.82rem; text-transform:uppercase; color:var(--muted); margin-bottom:6px;">Pending Review</strong><span style="font-family:var(--font-heading); font-size:1.4rem; color:var(--terracotta);">${s.pending}</span></div>
        </div>
      </div>`;

    mount.innerHTML = statsHTML + chartCards + alertsHTML;

    const recent = orders.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
    const recentMount = $("#overview-recent-orders");
    if (recent.length === 0) recentMount.innerHTML = `<p class="color-muted" style="font-size:0.88rem;">No orders in ${rangeLabel().toLowerCase()}.</p>`;
    else recentMount.innerHTML = recent.map((o) => `
      <div style="padding:8px 0; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; gap:8px; font-size:0.85rem;">
        <div style="min-width:0;"><strong style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(o.ref)}</strong><span class="color-muted">${escapeHtml(o.customerName)}</span></div>
        <div style="text-align:right; flex-shrink:0;"><div>${AP.formatNaira(o.totals?.total || 0)}</div><span class="color-muted">${statusBadge(o.status)}</span></div>
      </div>`).join("");

    requestAnimationFrame(() => {
      APCharts.line($("#chart-orders"), { labels: last7.map((d) => d.label), values: last7.map((d) => d.count) });
      APCharts.doughnut($("#chart-status"), { labels: statusLabels, values: statusValues });
      APCharts.bar($("#chart-bestsellers"), { labels: bestLabels.length ? bestLabels : ["No data"], values: bestValues.length ? bestValues : [0] });
    });

    mount.querySelectorAll("[data-goto]").forEach((btn) => btn.addEventListener("click", () => switchSection(btn.dataset.goto)));
  }

  /* ----- Products (MODIFIED: image upload) ----- */
  function renderProducts(mount) {
    const products = AP.Collections.products.all();
    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML = `
      <h2>Product Catalogue
        <div class="admin-card__actions">
          <input type="search" id="admin-product-search" placeholder="Search products…" style="padding:0.5rem 0.8rem; border:1px solid var(--border); border-radius:var(--radius); font-size:0.85rem;" />
          <button type="button" class="btn btn--primary btn--sm" id="add-product-btn"><i class="fa-solid fa-plus"></i> Add Fabric</button>
        </div>
      </h2>
      <div class="admin-table-wrap">
        <table class="admin-table" id="products-table">
          <thead><tr><th>Fabric</th><th>Category</th><th>Price / Yard</th><th>Stock</th><th>Flags</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
      </div>`;
    mount.appendChild(card);

    const tbody = card.querySelector("tbody");
    function draw(list) {
      tbody.innerHTML = list.map((p) => {
        const cat = AP.Collections.categories.byId(p.categoryId);
        const stock = Number(p.stock) || 0;
        const stockCls = stock === 0 ? "stock-out" : stock < 10 ? "stock-low" : "";
        const flags = [];
        if (p.featured) flags.push("Featured");
        if (p.bestseller) flags.push("Bestseller");
        if (p.newArrival) flags.push("New");
        if (p.active === false) flags.push("Archived");
        const img = (p.images && p.images[0]) || "ankara image.jpg";
        return `
          <tr data-id="${escapeHtml(p.id)}">
            <td><div class="admin-product-cell">
              <img class="admin-thumb" src="${escapeHtml(img)}" onerror="this.style.background='#EFE8D9';this.removeAttribute('src');" alt="" />
              <div><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.id)}</small></div>
            </div></td>
            <td>${escapeHtml(cat ? cat.name : "—")}</td>
            <td>${AP.formatNaira(p.pricePerYard)}</td>
            <td class="${stockCls}">${stock}</td>
            <td style="font-size:0.8rem;">${flags.length ? flags.join(" · ") : "—"}</td>
            <td><div class="table-actions">
              <button type="button" data-action="edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
              <button type="button" data-action="toggle-active" title="${p.active === false ? "Publish" : "Archive"}"><i class="fa-solid fa-${p.active === false ? "eye" : "eye-slash"}"></i></button>
              <button type="button" class="is-danger" data-action="delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div></td>
          </tr>`;
      }).join("");

      tbody.querySelectorAll("tr").forEach((row) => {
        const id = row.dataset.id;
        row.querySelector('[data-action="edit"]').addEventListener("click", () => openProductModal(id));
        row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
          const ok = await confirmDialog({ title: "Delete Fabric", message: "This will remove the fabric from the catalogue. Existing orders will still keep their records.", confirmLabel: "Delete", danger: true });
          if (!ok) return;
          if (!AP.Collections.products.remove(id)) {
            toastError("The fabric could not be removed from browser storage.");
            return;
          }
          toastSuccess("Fabric deleted.");
          renderSection();
        });
        row.querySelector('[data-action="toggle-active"]').addEventListener("click", () => {
          const p = AP.Collections.products.byId(id);
          if (!AP.Collections.products.update(id, { active: p.active === false })) {
            toastError("The catalogue could not be updated. Browser storage may be full.");
            return;
          }
          toastSuccess(p.active === false ? "Fabric published." : "Fabric archived.");
          renderSection();
        });
      });
    }
    draw(products);

    card.querySelector("#admin-product-search").addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      draw(q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products);
    });
    card.querySelector("#add-product-btn").addEventListener("click", () => openProductModal());
  }

  function openProductModal(id) {
    const editing = id ? AP.Collections.products.byId(id) : null;
    const categories = AP.Collections.categories.all();
    const existingImage = editing && editing.images && editing.images[0] ? editing.images[0] : "";
    let pendingImageDataUrl = null;

    const form = document.createElement("form");
    form.id = "product-form";
    form.innerHTML = `
      <div class="admin-form-grid">
        <div class="form-group full">
          <label class="form-label">Fabric Name <span class="req">*</span></label>
          <input type="text" class="form-control" name="name" value="${editing ? escapeHtml(editing.name) : ""}" required />
        </div>
        <div class="form-group full">
          <label class="form-label">Description <span class="req">*</span></label>
          <textarea class="form-control" name="description" rows="3" required>${editing ? escapeHtml(editing.description) : ""}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Category</label>
          <select class="form-control" name="categoryId">
            ${categories.map((c) => `<option value="${escapeHtml(c.id)}" ${editing && editing.categoryId === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Price / Yard (₦)</label>
          <input type="number" class="form-control" name="pricePerYard" min="0" value="${editing ? editing.pricePerYard : ""}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Price / Trouser (₦, optional)</label>
          <input type="number" class="form-control" name="pricePerTrouser" min="0" value="${editing && editing.pricePerTrouser ? editing.pricePerTrouser : ""}" />
        </div>
        <div class="form-group">
          <label class="form-label">Bundle Name (optional)</label>
          <input type="text" class="form-control" name="bundleName" value="${editing ? escapeHtml(editing.bundleName || "") : ""}" placeholder="Bundle" />
        </div>
        <div class="form-group">
          <label class="form-label">Yards per Bundle</label>
          <input type="number" class="form-control" name="bundleYards" min="0" step="1" value="${editing ? Number(editing.bundleYards) || 0 : 0}" />
        </div>
        <div class="form-group">
          <label class="form-label">Price per Bundle (₦)</label>
          <input type="number" class="form-control" name="bundlePrice" min="0" value="${editing ? Number(editing.bundlePrice) || 0 : 0}" />
        </div>
        <div class="form-group">
          <label class="form-label">Stock</label>
          <input type="number" class="form-control" name="stock" min="0" value="${editing ? editing.stock : 0}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Minimum Order Qty</label>
          <input type="number" class="form-control" name="minOrderQty" min="1" value="${editing ? editing.minOrderQty || 1 : 1}" />
        </div>
        <div class="form-group full">
          <label class="form-label">Product Image</label>
          <div style="display:flex; gap:12px; align-items:flex-start; flex-wrap:wrap;">
            <img id="product-image-preview" class="admin-img-preview" src="${escapeHtml(existingImage || "ankara image.jpg")}" alt="Product preview" />
            <div style="display:flex; flex-direction:column; gap:6px;">
              <label for="product-image-input" class="btn btn--outline btn--sm" style="cursor:pointer;">
                <i class="fa-solid fa-image"></i> Choose Image
              </label>
              <input type="file" id="product-image-input" accept="image/png,image/jpeg,image/webp" hidden />
              <small class="color-muted">JPG, PNG or WEBP · Max 2 MB. Images are compressed for browser storage.</small>
            </div>
          </div>
        </div>
        <div class="form-group full">
          <label class="form-label">Colours (comma separated)</label>
          <input type="text" class="form-control" name="colors" value="${editing ? escapeHtml((editing.colors || []).join(", ")) : ""}" placeholder="Emerald, Gold, Cream" />
        </div>
        <div class="form-group full">
          <label class="form-label">Designs (comma separated)</label>
          <input type="text" class="form-control" name="designs" value="${editing ? escapeHtml((editing.designs || []).join(", ")) : ""}" placeholder="Floral, Geometric" />
        </div>
        <div class="form-group full">
          <label class="auth-checkbox" style="margin-right:16px;"><input type="checkbox" name="featured" ${editing && editing.featured ? "checked" : ""} /> Featured</label>
          <label class="auth-checkbox" style="margin-right:16px;"><input type="checkbox" name="bestseller" ${editing && editing.bestseller ? "checked" : ""} /> Bestseller</label>
          <label class="auth-checkbox"><input type="checkbox" name="newArrival" ${editing && editing.newArrival ? "checked" : ""} /> New Arrival</label>
        </div>
      </div>`;

    openModal({
      title: editing ? "Edit Fabric" : "Add New Fabric",
      content: form,
      actions: [
        { label: "Cancel", className: "btn--ghost" },
        {
          label: editing ? "Save Changes" : "Create Fabric",
          className: "btn--primary",
          onClick: async () => {
            const data = Object.fromEntries(new FormData(form).entries());
            const name = (data.name || "").trim();
            const desc = (data.description || "").trim();
            const price = Number(data.pricePerYard);
            if (!name) { toastError("Fabric name is required."); return false; }
            if (!desc) { toastError("Description is required."); return false; }
            if (!price || price <= 0) { toastError("Price per yard must be greater than zero."); return false; }
            const bundleYards = Number(data.bundleYards) || 0;
            const bundlePrice = Number(data.bundlePrice) || 0;
            if ((bundleYards > 0) !== (bundlePrice > 0)) { toastError("Enter both yards per bundle and its price, or leave both blank."); return false; }

            let imageToUse = existingImage;
            if (pendingImageDataUrl) imageToUse = pendingImageDataUrl;
            if (!imageToUse) imageToUse = "ankara image.jpg";

            const payload = {
              name, description: desc,
              categoryId: data.categoryId,
              pricePerYard: price,
              pricePerTrouser: data.pricePerTrouser ? Number(data.pricePerTrouser) : null,
              bundleName: bundleYards ? (data.bundleName || "Bundle").trim() : "",
              bundleYards,
              bundlePrice,
              stock: Number(data.stock) || 0,
              minOrderQty: Number(data.minOrderQty) || 1,
              colors: (data.colors || "").split(",").map((s) => s.trim()).filter(Boolean),
              designs: (data.designs || "").split(",").map((s) => s.trim()).filter(Boolean),
              featured: form.querySelector('[name="featured"]').checked,
              bestseller: form.querySelector('[name="bestseller"]').checked,
              newArrival: form.querySelector('[name="newArrival"]').checked,
              active: editing ? editing.active !== false : true,
              images: [imageToUse]
            };

            const saved = editing
              ? AP.Collections.products.update(id, payload)
              : AP.Collections.products.add({ id: AP.uid("prod-"), ...payload, tags: [], createdAt: AP.nowISO() });
            if (!saved) {
              toastError("The fabric could not be saved. Browser storage may be full; try a smaller image or clear old demo data.");
              return false;
            }
            toastSuccess(editing ? "Fabric updated and published to the catalogue." : "Fabric created and published to the catalogue.");
            closeModal();
            renderSection();
            return true;
          }
        }
      ]
    });

    // Wire the image picker + preview (inside the just-created modal)
    const input = document.getElementById("product-image-input");
    const preview = document.getElementById("product-image-preview");
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const check = AP.Uploads.validate(file, AP.Uploads.ALLOWED_IMAGES);
      if (!check.ok) { toastError(check.error); input.value = ""; return; }
      try {
        const dataUrl = await AP.Uploads.optimizeImage(file);
        pendingImageDataUrl = dataUrl;
        preview.src = dataUrl;
        toastSuccess("Optimized image ready. Save to publish the fabric.");
      } catch (err) {
        toastError(err.message || "Could not read the image.");
      } finally {
        input.value = "";
      }
    });
  }

  /* ----- Orders (MODIFIED: receipts + new transitions) ----- */
  function renderOrders(mount) {
    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML = `
      <h2>Customer Orders
        <div class="admin-card__actions">
          <select id="order-status-filter" style="padding:0.5rem 0.8rem; border:1px solid var(--border); border-radius:var(--radius); font-size:0.85rem;">
            <option value="">All statuses</option>
            ${AP.ORDER_STATUSES.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
          </select>
          <input type="search" id="order-search" placeholder="Search order / customer…" style="padding:0.5rem 0.8rem; border:1px solid var(--border); border-radius:var(--radius); font-size:0.85rem;" />
        </div>
      </h2>
      <div class="admin-table-wrap">
        <table class="admin-table" id="orders-table">
          <thead><tr><th>Reference</th><th>Customer</th><th>Item</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
      </div>`;
    mount.appendChild(card);

    const tbody = card.querySelector("tbody");
    const statusFilter = card.querySelector("#order-status-filter");
    const search = card.querySelector("#order-search");

    function draw() {
      let list = AP.Collections.orders.all().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (statusFilter.value) list = list.filter((o) => o.status === statusFilter.value);
      if (search.value.trim()) {
        const q = search.value.trim().toLowerCase();
        list = list.filter((o) => o.ref.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q) || o.customerEmail.toLowerCase().includes(q));
      }
      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:var(--sp-5); color:var(--muted);">No orders match your filters.</td></tr>`;
        return;
      }
      tbody.innerHTML = list.map((o) => `
        <tr data-id="${escapeHtml(o.id)}">
          <td><strong>${escapeHtml(o.ref)}</strong></td>
          <td>${escapeHtml(o.customerName)}<br><small class="color-muted">${escapeHtml(o.customerEmail)}</small></td>
          <td>${escapeHtml(o.items[0].name)}${o.items.length > 1 ? ` +${o.items.length - 1}` : ""}</td>
          <td>${AP.formatNaira(o.totals.total)}</td>
          <td>${o.paymentStatus === "paid" ? '<span class="badge badge--success">Paid</span>' : o.paymentStatus === "receipt_submitted" ? '<span class="badge badge--warning">Receipt Submitted</span>' : '<span class="badge badge--warning">Unpaid</span>'}</td>
          <td>${statusBadge(o.status)}</td>
          <td>${AP.formatDate(o.createdAt)}</td>
          <td><div class="table-actions"><button type="button" data-action="view" title="View order"><i class="fa-solid fa-eye"></i></button></div></td>
        </tr>`).join("");

      tbody.querySelectorAll("tr").forEach((row) => {
        row.querySelector('[data-action="view"]').addEventListener("click", () => openOrderModal(row.dataset.id));
      });
    }

    draw();
    statusFilter.addEventListener("change", draw);
    search.addEventListener("input", draw);
  }

  function openOrderModal(id) {
    const order = AP.Collections.orders.byId(id);
    if (!order) return;

    const transitions = AP.OrderCalc.allowedTransitions(order.status);
    const receipts = Array.isArray(order.receipts) ? order.receipts : [];

    const receiptsHTML = receipts.length > 0
      ? receipts.map((r) => {
          const isImg = r.fileType && r.fileType.startsWith("image/");
          return `
            <div class="admin-receipt-preview">
              ${isImg
                ? `<img src="${escapeHtml(r.dataUrl)}" alt="Receipt" />`
                : `<div style="width:80px;height:110px;display:grid;place-items:center;background:#F7F3EA;border-radius:4px;"><i class="fa-solid fa-file-pdf" style="font-size:1.6rem;color:#B0362B;"></i></div>`}
              <div style="flex:1; font-size:0.82rem;">
                <strong style="display:block;">${escapeHtml(r.fileName || "Receipt")}</strong>
                <span class="color-muted">${AP.formatDateTime(r.uploadedAt)}</span>
                <div style="margin-top:6px;">
                  <a href="${escapeHtml(r.dataUrl)}" download="${escapeHtml(r.fileName || "receipt")}" class="btn btn--outline btn--sm" style="padding:2px 8px; font-size:0.76rem;">
                    <i class="fa-solid fa-download"></i> Download
                  </a>
                </div>
              </div>
            </div>`;
        }).join("")
      : `<p class="color-muted" style="font-size:0.82rem; margin-top:8px;">No receipt uploaded yet.</p>`;

    const content = document.createElement("div");
    const delivery = AP.Address.normalize(order.delivery || {});
    content.innerHTML = `
      <div style="display:flex; justify-content:space-between; gap:var(--sp-3); flex-wrap:wrap; margin-bottom:var(--sp-3);">
        <div><div class="color-muted" style="font-size:0.8rem;">Order Reference</div><strong style="font-size:1.05rem;">${escapeHtml(order.ref)}</strong></div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${statusBadge(order.status)}
          <span class="badge ${order.paymentStatus === "paid" ? "badge--success" : order.paymentStatus === "receipt_submitted" ? "badge--warning" : "badge--muted"}">
            ${order.paymentStatus === "paid" ? "Paid" : order.paymentStatus === "receipt_submitted" ? "Receipt Submitted" : "Unpaid"}
          </span>
        </div>
      </div>

      <div style="background:var(--cream); padding:var(--sp-3); border-radius:var(--radius); font-size:0.88rem; margin-bottom:var(--sp-3);">
        <div><strong>${escapeHtml(order.customerName)}</strong> — ${escapeHtml(order.customerEmail)} · ${escapeHtml(order.customerPhone || "")}</div>
        <div style="margin-top:6px;">
          <div class="color-muted" style="font-size:0.78rem; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">Delivery Address</div>
          <div>${escapeHtml(delivery.street || "")}</div>
          <div>${escapeHtml(delivery.lga || "")}, ${escapeHtml(delivery.state || "")}</div>
          <div>${escapeHtml(delivery.country || "")}</div>
          ${delivery.notes ? `<div style="margin-top:4px; font-size:0.8rem;"><em>Notes: ${escapeHtml(delivery.notes)}</em></div>` : ""}
        </div>
      </div>

      <h4 style="margin:var(--sp-3) 0 var(--sp-2); font-size:0.9rem;">Items</h4>
      ${order.items.map((it) => `
        <div style="display:flex; gap:var(--sp-2); align-items:center; padding:var(--sp-2) 0; border-bottom:1px solid var(--border); font-size:0.88rem;">
          <img src="${escapeHtml(it.image || "")}" onerror="this.style.display='none';" style="width:40px;height:50px;border-radius:4px;object-fit:cover;background:#EFE8D9;" alt="" />
          <div style="flex:1;"><strong>${escapeHtml(it.name)}</strong><br><span class="color-muted">${escapeHtml(it.unitType === "trouser" ? "Trouser" : "Yard")} × ${it.quantity} ${it.color ? `· ${escapeHtml(it.color)}` : ""} ${it.design ? `· ${escapeHtml(it.design)}` : ""}</span></div>
          <div>${AP.formatNaira(it.lineTotal)}</div>
        </div>`).join("")}

      <div style="margin-top:var(--sp-3); display:grid; gap:4px; font-size:0.9rem;">
        <div style="display:flex; justify-content:space-between;"><span>Subtotal</span><span>${AP.formatNaira(order.totals.subtotal)}</span></div>
        <div style="display:flex; justify-content:space-between;"><span>Delivery</span><span>${AP.formatNaira(order.totals.deliveryFee)}</span></div>
        ${order.totals.discount > 0 ? `<div style="display:flex; justify-content:space-between; color:var(--success);"><span>Discount</span><span>−${AP.formatNaira(order.totals.discount)}</span></div>` : ""}
        <div style="display:flex; justify-content:space-between; font-weight:700; border-top:1px solid var(--border); padding-top:4px;"><span>Total</span><span>${AP.formatNaira(order.totals.total)}</span></div>
      </div>

      <div style="margin-top:var(--sp-3);">
        <h4 style="margin:0 0 4px; font-size:0.9rem;">Transfer Receipt</h4>
        ${receiptsHTML}
      </div>

      <div style="margin-top:var(--sp-3);">
        <label class="form-label" style="font-size:0.82rem;">Admin Notes</label>
        <textarea id="order-admin-notes" class="form-control" rows="2" style="font-size:0.85rem;">${escapeHtml((order.adminNotes || []).slice(-1)[0]?.text || "")}</textarea>
      </div>

      <div style="margin-top:var(--sp-3); display:flex; gap:var(--sp-2); flex-wrap:wrap;">
        ${order.status === "Awaiting Payment" && order.paymentStatus !== "paid"
          ? `<button type="button" class="btn btn--emerald btn--sm" id="confirm-payment-btn"><i class="fa-solid fa-check"></i> Confirm Payment &amp; Accept</button>`
          : ""}
        ${transitions.map((t) => {
          const danger = ["Rejected", "Cancelled"].includes(t);
          return `<button type="button" class="btn ${danger ? "btn--danger" : "btn--outline"} btn--sm" data-transition="${escapeHtml(t)}">${escapeHtml(t)}</button>`;
        }).join("")}
      </div>
      ${transitions.length === 0 && order.status !== "Awaiting Payment" ? `<p class="color-muted" style="font-size:0.82rem; margin-top:var(--sp-2);">This order is in a terminal status and cannot be changed further.</p>` : ""}
    `;

    const modal = openModal({
      title: "Order Details",
      content,
      actions: [{ label: "Close", className: "btn--ghost" }]
    });

    const confirmBtn = modal.querySelector("#confirm-payment-btn");
    if (confirmBtn) {
      confirmBtn.addEventListener("click", async () => {
        const ok = await confirmDialog({ title: "Confirm Payment", message: "Confirm the customer's bank transfer has been received? The order will advance to Accepted.", confirmLabel: "Confirm", danger: false });
        if (!ok) return;
        const order2 = AP.Collections.orders.byId(order.id);
        AP.Collections.orders.update(order.id, {
          paymentStatus: "paid",
          status: "Accepted",
          statusHistory: (order2.statusHistory || []).concat([{ status: "Accepted", at: AP.nowISO(), by: "admin" }])
        });
        AP.Collections.notifications.add({
          id: AP.uid("notif-"), customerId: order.customerId,
          title: "Payment Confirmed", message: `Your payment for order ${order.ref} has been confirmed. Your order is now Accepted.`,
          icon: "fa-credit-card", read: false, createdAt: AP.nowISO()
        });
        AP.Collections.logs.add({ action: "order_payment_confirmed", ref: order.ref, email: getSession()?.email });
        toastSuccess("Payment confirmed. Order is now Accepted.");
        closeModal();
        renderSection();
      });
    }

    modal.querySelectorAll("[data-transition]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const target = btn.dataset.transition;
        if (["Rejected", "Cancelled"].includes(target)) {
          const ok = await confirmDialog({ title: target, message: `Are you sure you want to mark this order as ${target}?`, confirmLabel: target, danger: true });
          if (!ok) return;
          order.items.forEach((it) => {
            const p = AP.Collections.products.byId(it.productId);
            if (p) AP.Collections.products.update(p.id, { stock: Number(p.stock) + Number(it.quantity) });
          });
        }
        const notesEl = modal.querySelector("#order-admin-notes");
        const noteText = notesEl ? notesEl.value.trim() : "";
        const order2 = AP.Collections.orders.byId(order.id);
        const updatedHistory = (order2.statusHistory || []).concat([{ status: target, at: AP.nowISO(), by: "admin" }]);
        const adminNotes = (order2.adminNotes || []).slice();
        if (noteText) adminNotes.push({ text: noteText, at: AP.nowISO(), by: getSession()?.email });

        AP.Collections.orders.update(order.id, { status: target, statusHistory: updatedHistory, adminNotes });
        AP.Collections.notifications.add({
          id: AP.uid("notif-"), customerId: order.customerId,
          title: `Order ${target}`, message: `Your order ${order.ref} is now ${target}.`,
          icon: "fa-bell", read: false, createdAt: AP.nowISO()
        });
        AP.Collections.logs.add({ action: "order_status", ref: order.ref, from: order2.status, to: target, email: getSession()?.email });
        toastSuccess(`Order updated to ${target}.`);
        closeModal();
        renderSection();
      });
    });
  }

  /* ----- Customers (unchanged) ----- */
  function renderCustomers(mount) {
    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML = `
      <h2>Registered Customers <input type="search" id="customer-search" placeholder="Search name / email…" style="padding:0.5rem 0.8rem; border:1px solid var(--border); border-radius:var(--radius); font-size:0.85rem;" /></h2>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Customer</th><th>Contact</th><th>Orders</th><th>Total Spend</th><th>Joined</th><th></th></tr></thead>
          <tbody id="customers-tbody"></tbody>
        </table>
      </div>`;
    mount.appendChild(card);

    const tbody = card.querySelector("#customers-tbody");
    const search = card.querySelector("#customer-search");

    function draw() {
      let list = AP.Collections.customers.all().slice().reverse();
      if (search.value.trim()) {
        const q = search.value.trim().toLowerCase();
        list = list.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
      }
      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:var(--sp-5); color:var(--muted);">No customers found.</td></tr>`;
        return;
      }
      tbody.innerHTML = list.map((c) => {
        const orders = AP.Collections.orders.byCustomer(c.id);
        const spend = orders.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + (o.totals?.total || 0), 0);
        return `<tr data-id="${escapeHtml(c.id)}">
          <td><strong>${escapeHtml(c.name)}</strong><br><small class="color-muted">${escapeHtml(c.id)}</small></td>
          <td>${escapeHtml(c.email)}<br><small class="color-muted">${escapeHtml(c.phone || "")}</small></td>
          <td>${orders.length}</td>
          <td>${AP.formatNaira(spend)}</td>
          <td>${AP.formatDate(c.createdAt)}</td>
          <td><div class="table-actions"><button type="button" data-action="view" title="View customer"><i class="fa-solid fa-eye"></i></button></div></td>
        </tr>`;
      }).join("");
      tbody.querySelectorAll("tr").forEach((row) => {
        row.querySelector('[data-action="view"]').addEventListener("click", () => openCustomerModal(row.dataset.id));
      });
    }

    draw();
    search.addEventListener("input", draw);
  }

  function openCustomerModal(id) {
    const c = AP.Collections.customers.byId(id);
    if (!c) return;
    const orders = AP.Collections.orders.byCustomer(c.id).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const paid = orders.filter((o) => o.paymentStatus === "paid");
    const spend = paid.reduce((s, o) => s + (o.totals?.total || 0), 0);

    const avatarBlock = c.avatarDataUrl
      ? `<img src="${escapeHtml(c.avatarDataUrl)}" style="width:64px;height:64px;border-radius:50%;object-fit:cover;background:#EFE8D9;" alt="" />`
      : `<div style="width:64px;height:64px;border-radius:50%;background:#174C3C;color:#F7F3EA;display:grid;place-items:center;font-family:'Playfair Display',serif;font-size:1.4rem;">${escapeHtml((c.name||"?").charAt(0).toUpperCase())}</div>`;

    const content = document.createElement("div");
    content.innerHTML = `
      <div style="display:flex; gap:14px; align-items:center; margin-bottom:var(--sp-3);">
        ${avatarBlock}
        <div>
          <strong style="font-size:1.1rem;">${escapeHtml(c.name)}</strong>
          <div class="color-muted" style="font-size:0.88rem;">${escapeHtml(c.email)} · ${escapeHtml(c.phone || "")}</div>
          <div class="color-muted" style="font-size:0.8rem; margin-top:2px;">Joined ${AP.formatDate(c.createdAt)}</div>
        </div>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:var(--sp-3);">
        <div class="admin-stat" style="padding:var(--sp-3);"><div class="admin-stat__label">Orders</div><div class="admin-stat__value" style="font-size:1.2rem;">${orders.length}</div></div>
        <div class="admin-stat" style="padding:var(--sp-3);"><div class="admin-stat__label">Paid</div><div class="admin-stat__value" style="font-size:1.2rem;">${paid.length}</div></div>
        <div class="admin-stat" style="padding:var(--sp-3);"><div class="admin-stat__label">Spend</div><div class="admin-stat__value" style="font-size:1rem;">${AP.formatNaira(spend)}</div></div>
      </div>
      <h4 style="margin:var(--sp-3) 0 var(--sp-2); font-size:0.9rem;">Order History</h4>
      ${orders.length === 0
        ? `<p class="color-muted" style="font-size:0.88rem;">No orders yet.</p>`
        : orders.map((o) => `
          <div style="padding:8px 0; border-bottom:1px solid var(--border); font-size:0.85rem; display:flex; justify-content:space-between; gap:8px;">
            <div><strong>${escapeHtml(o.ref)}</strong><br><span class="color-muted">${AP.formatDate(o.createdAt)}</span></div>
            <div style="text-align:right;"><div>${AP.formatNaira(o.totals.total)}</div><span>${statusBadge(o.status)}</span></div>
          </div>`).join("")}
    `;

    openModal({ title: "Customer Profile", content, actions: [{ label: "Close", className: "btn--ghost" }] });
  }

  /* ----- Inventory (unchanged) ----- */
  function renderInventory(mount) {
    const products = AP.Collections.products.all().slice().sort((a, b) => Number(a.stock) - Number(b.stock));
    const low = products.filter((p) => Number(p.stock) > 0 && Number(p.stock) < 10).length;
    const out = products.filter((p) => Number(p.stock) === 0).length;
    mount.innerHTML = `
      <div class="admin-stats">
        <div class="admin-stat"><div class="admin-stat__label">Total SKUs</div><div class="admin-stat__value">${products.length}</div></div>
        <div class="admin-stat"><div class="admin-stat__label">Low Stock</div><div class="admin-stat__value" style="color:var(--warning);">${low}</div></div>
        <div class="admin-stat"><div class="admin-stat__label">Out of Stock</div><div class="admin-stat__value" style="color:var(--danger);">${out}</div></div>
        <div class="admin-stat"><div class="admin-stat__label">Total Units</div><div class="admin-stat__value">${products.reduce((s, p) => s + (Number(p.stock) || 0), 0)}</div></div>
      </div>
      <div class="admin-card">
        <h2>Stock Levels</h2>
        <div class="admin-table-wrap">
          <table class="admin-table"><thead><tr><th>Fabric</th><th>Stock</th><th>Status</th><th>Adjust</th></tr></thead>
            <tbody>
              ${products.map((p) => {
                const stock = Number(p.stock) || 0;
                const status = stock === 0 ? '<span class="badge badge--danger">Out of Stock</span>'
                  : stock < 10 ? '<span class="badge badge--warning">Low Stock</span>'
                  : '<span class="badge badge--success">In Stock</span>';
                return `<tr data-id="${escapeHtml(p.id)}">
                  <td><strong>${escapeHtml(p.name)}</strong></td><td>${stock}</td><td>${status}</td>
                  <td><div style="display:flex; gap:4px; align-items:center;">
                    <input type="number" min="0" value="${stock}" data-stock-input style="width:70px; padding:4px 6px; border:1px solid var(--border); border-radius:4px; font-size:0.82rem;" />
                    <button type="button" class="btn btn--outline btn--sm" data-stock-save>Update</button>
                  </div></td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
    mount.querySelectorAll("tr[data-id]").forEach((row) => {
      const id = row.dataset.id;
      row.querySelector("[data-stock-save]").addEventListener("click", () => {
        const val = Number(row.querySelector("[data-stock-input]").value);
        if (!Number.isFinite(val) || val < 0) { toastError("Please enter a valid stock value."); return; }
        AP.Collections.products.update(id, { stock: val });
        toastSuccess("Stock updated.");
        renderSection();
      });
    });
  }

  /* ----- Categories / Promotions / Reviews / Reports / Content / Settings / Activity (unchanged) ----- */
  function renderCategories(mount) {
    const cats = AP.Collections.categories.all();
    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML = `
      <h2>Categories <button type="button" class="btn btn--primary btn--sm" id="add-category-btn"><i class="fa-solid fa-plus"></i> Add Category</button></h2>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Category</th><th>Slug</th><th>Products</th><th></th></tr></thead><tbody>
        ${cats.map((c) => {
          const count = AP.Collections.products.all().filter((p) => p.categoryId === c.id).length;
          return `<tr data-id="${escapeHtml(c.id)}">
            <td><strong>${escapeHtml(c.name)}</strong><br><small class="color-muted">${escapeHtml(c.description || "")}</small></td>
            <td>${escapeHtml(c.slug)}</td><td>${count}</td>
            <td><div class="table-actions">
              <button type="button" data-action="edit" title="Edit"><i class="fa-solid fa-pen"></i></button>
              <button type="button" class="is-danger" data-action="delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div></td>
          </tr>`;
        }).join("")}
      </tbody></table></div>`;
    mount.appendChild(card);
    card.querySelector("#add-category-btn").addEventListener("click", () => openCategoryModal());
    card.querySelectorAll("tr[data-id]").forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-action="edit"]').addEventListener("click", () => openCategoryModal(id));
      row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
        const count = AP.Collections.products.all().filter((p) => p.categoryId === id).length;
        if (count > 0) { toastError(`Cannot delete — ${count} product(s) still use this category.`); return; }
        const ok = await confirmDialog({ title: "Delete Category", message: "Are you sure?", confirmLabel: "Delete", danger: true });
        if (!ok) return;
        AP.Collections.categories.save(AP.Collections.categories.all().filter((c) => c.id !== id));
        toastSuccess("Category deleted.");
        renderSection();
      });
    });
  }

  function openCategoryModal(id) {
    const editing = id ? AP.Collections.categories.byId(id) : null;
    const form = document.createElement("form");
    form.innerHTML = `
      <div class="form-group"><label class="form-label">Name <span class="req">*</span></label><input type="text" class="form-control" name="name" value="${editing ? escapeHtml(editing.name) : ""}" required /></div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-control" name="description" rows="2">${editing ? escapeHtml(editing.description || "") : ""}</textarea></div>`;
    openModal({
      title: editing ? "Edit Category" : "Add Category",
      content: form,
      actions: [
        { label: "Cancel", className: "btn--ghost" },
        { label: editing ? "Save" : "Create", className: "btn--primary", onClick: () => {
          const data = Object.fromEntries(new FormData(form).entries());
          if (!data.name || !data.name.trim()) { toastError("Name is required."); return; }
          const list = AP.Collections.categories.all();
          if (editing) {
            const idx = list.findIndex((c) => c.id === id);
            list[idx] = { ...list[idx], name: data.name.trim(), description: (data.description || "").trim() };
          } else {
            list.push({ id: AP.uid("cat-"), name: data.name.trim(), slug: data.name.trim().toLowerCase().replace(/\s+/g, "-"), description: (data.description || "").trim(), image: "ankara image.jpg" });
          }
          AP.Collections.categories.save(list);
          toastSuccess(editing ? "Category updated." : "Category created.");
          closeModal();
          renderSection();
        }}
      ]
    });
  }

  function renderPromotions(mount) {
    const promos = AP.Collections.promos.all();
    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML = `
      <h2>Discount Codes <button type="button" class="btn btn--primary btn--sm" id="add-promo-btn"><i class="fa-solid fa-plus"></i> New Promo</button></h2>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Window</th><th>Status</th><th></th></tr></thead><tbody>
        ${promos.length === 0 ? `<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:var(--sp-4);">No promotions yet.</td></tr>` :
          promos.map((p) => `<tr data-id="${escapeHtml(p.id)}">
            <td><strong>${escapeHtml(p.code)}</strong></td>
            <td>${escapeHtml(p.type === "percent" ? "% Discount" : "Fixed Discount")}</td>
            <td>${p.type === "percent" ? p.value + "%" : AP.formatNaira(p.value)}</td>
            <td style="font-size:0.82rem;">${p.startDate ? AP.formatDate(p.startDate) : "—"} to ${p.endDate ? AP.formatDate(p.endDate) : "—"}</td>
            <td>${p.active ? '<span class="badge badge--success">Active</span>' : '<span class="badge badge--muted">Inactive</span>'}</td>
            <td><div class="table-actions">
              <button type="button" data-action="toggle" title="Toggle active"><i class="fa-solid fa-power-off"></i></button>
              <button type="button" class="is-danger" data-action="delete" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div></td>
          </tr>`).join("")}
      </tbody></table></div>`;
    mount.appendChild(card);
    card.querySelector("#add-promo-btn").addEventListener("click", openPromoModal);
    card.querySelectorAll("tr[data-id]").forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-action="toggle"]').addEventListener("click", () => {
        const list = AP.Collections.promos.all();
        const idx = list.findIndex((p) => p.id === id);
        if (idx !== -1) { list[idx].active = !list[idx].active; AP.storage.set(AP.KEYS.promos, list); toastSuccess("Promotion updated."); renderSection(); }
      });
      row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
        const ok = await confirmDialog({ title: "Delete Promo", message: "Delete this promotion?", confirmLabel: "Delete", danger: true });
        if (!ok) return;
        AP.storage.set(AP.KEYS.promos, AP.Collections.promos.all().filter((p) => p.id !== id));
        toastSuccess("Promotion deleted.");
        renderSection();
      });
    });
  }

  function openPromoModal() {
    const form = document.createElement("form");
    form.innerHTML = `
      <div class="form-group"><label class="form-label">Code <span class="req">*</span></label><input type="text" class="form-control" name="code" placeholder="WELCOME10" required /></div>
      <div class="admin-form-grid">
        <div class="form-group"><label class="form-label">Type</label><select class="form-control" name="type"><option value="percent">Percentage</option><option value="fixed">Fixed Amount</option></select></div>
        <div class="form-group"><label class="form-label">Value</label><input type="number" class="form-control" name="value" min="0" required /></div>
        <div class="form-group"><label class="form-label">Start Date</label><input type="date" class="form-control" name="startDate" /></div>
        <div class="form-group"><label class="form-label">End Date</label><input type="date" class="form-control" name="endDate" /></div>
      </div>`;
    openModal({
      title: "New Promotion", content: form,
      actions: [
        { label: "Cancel", className: "btn--ghost" },
        { label: "Create", className: "btn--primary", onClick: () => {
          const data = Object.fromEntries(new FormData(form).entries());
          if (!data.code || !data.code.trim()) { toastError("Promo code is required."); return; }
          if (!data.value || Number(data.value) <= 0) { toastError("Value must be greater than zero."); return; }
          const list = AP.Collections.promos.all();
          if (list.some((p) => p.code.toLowerCase() === data.code.trim().toLowerCase())) { toastError("A promo with that code already exists."); return; }
          list.push({
            id: AP.uid("promo-"), code: data.code.trim().toUpperCase(), type: data.type,
            value: Number(data.value), active: true,
            startDate: data.startDate ? new Date(data.startDate).toISOString() : null,
            endDate: data.endDate ? new Date(data.endDate).toISOString() : null
          });
          AP.storage.set(AP.KEYS.promos, list);
          toastSuccess("Promotion created.");
          closeModal();
          renderSection();
        }}
      ]
    });
  }

  function renderReviews(mount) {
    const reviews = AP.Collections.reviews.all();
    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML = `
      <h2>Customer Reviews</h2>
      <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Fabric</th><th>Author</th><th>Rating</th><th>Review</th><th>Date</th><th></th></tr></thead><tbody>
        ${reviews.length === 0
          ? `<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:var(--sp-4);">No reviews yet.</td></tr>`
          : reviews.map((r) => {
            const p = AP.Collections.products.byId(r.productId);
            return `<tr data-id="${escapeHtml(r.id)}">
              <td>${escapeHtml(p ? p.name : "—")}</td>
              <td>${escapeHtml(r.author || "Customer")}</td>
              <td>${"★".repeat(r.rating || 0)}${"☆".repeat(5 - (r.rating || 0))}</td>
              <td style="max-width:240px;">${escapeHtml(r.text || "")}</td>
              <td>${AP.formatDate(r.createdAt)}</td>
              <td><div class="table-actions"><button type="button" class="is-danger" data-action="delete" title="Delete"><i class="fa-solid fa-trash"></i></button></div></td>
            </tr>`;
          }).join("")}
      </tbody></table></div>`;
    mount.appendChild(card);
    card.querySelectorAll("tr[data-id]").forEach((row) => {
      const id = row.dataset.id;
      row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
        const ok = await confirmDialog({ title: "Delete Review", message: "Remove this review?", confirmLabel: "Delete", danger: true });
        if (!ok) return;
        AP.storage.set(AP.KEYS.reviews, AP.Collections.reviews.all().filter((r) => r.id !== id));
        toastSuccess("Review deleted.");
        renderSection();
      });
    });
  }

  function renderReports(mount) {
    const orders = AP.Collections.orders.all().filter((o) => inRange(o.createdAt));
    const revenue = orders.reduce((s, o) => s + revenueOf(o), 0);
    const paidOrders = orders.filter((o) => o.paymentStatus === "paid");
    const avg = paidOrders.length ? Math.round(revenue / paidOrders.length) : 0;
    mount.innerHTML = `
      <div class="admin-stats">
        <div class="admin-stat"><div class="admin-stat__label">Orders (${rangeLabel()})</div><div class="admin-stat__value">${orders.length}</div></div>
        <div class="admin-stat"><div class="admin-stat__label">Revenue (${rangeLabel()})</div><div class="admin-stat__value">${AP.formatNaira(revenue)}</div></div>
        <div class="admin-stat"><div class="admin-stat__label">Paid Orders</div><div class="admin-stat__value">${paidOrders.length}</div></div>
        <div class="admin-stat"><div class="admin-stat__label">Avg. Order Value</div><div class="admin-stat__value">${AP.formatNaira(avg)}</div></div>
      </div>
      <div class="admin-card">
        <h2>Export Reports</h2>
        <div style="display:flex; gap:var(--sp-3); flex-wrap:wrap;">
          <button type="button" class="btn btn--primary" id="export-orders"><i class="fa-solid fa-file-pdf"></i> Orders PDF</button>
          <button type="button" class="btn btn--outline" id="export-products"><i class="fa-solid fa-file-pdf"></i> Products PDF</button>
          <button type="button" class="btn btn--outline" id="export-customers"><i class="fa-solid fa-file-pdf"></i> Customers PDF</button>
        </div>
      </div>`;
    $("#export-orders").addEventListener("click", () => {
      const rows = [["Reference","Customer","Email","Date","Status","Payment","Total","Items"]];
      orders.forEach((o) => rows.push([o.ref, o.customerName, o.customerEmail, AP.formatDate(o.createdAt), o.status, o.paymentStatus, o.totals.total, o.items.map((i) => `${i.name}×${i.quantity}`).join("; ")]));
      printReportPDF("Orders Report", rows.shift(), rows);
    });
    $("#export-products").addEventListener("click", () => {
      const rows = [["ID","Name","Category","Price/Yard","Stock","Active"]];
      AP.Collections.products.all().forEach((p) => {
        const cat = AP.Collections.categories.byId(p.categoryId);
        rows.push([p.id, p.name, cat ? cat.name : "", p.pricePerYard, p.stock, p.active !== false]);
      });
      printReportPDF("Products Report", rows.shift(), rows);
    });
    $("#export-customers").addEventListener("click", () => {
      const rows = [["ID","Name","Email","Phone","Joined"]];
      AP.Collections.customers.all().forEach((c) => rows.push([c.id, c.name, c.email, c.phone || "", AP.formatDate(c.createdAt)]));
      printReportPDF("Customers Report", rows.shift(), rows);
    });
  }

  function renderContent(mount) {
    const s = settings();
    let heroImage = s.heroImage || "";
    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML = `
      <h2>Homepage &amp; Store Content</h2>
      <form id="content-form">
        <div class="form-group"><label class="form-label" for="hero-image-input">Homepage Hero Image</label>
          <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;">
            <img id="hero-image-preview" src="${escapeHtml(heroImage || "ankara image.jpg")}" alt="Homepage hero preview" style="width:min(360px,100%);height:180px;object-fit:cover;border-radius:var(--radius);background:var(--cream);" />
            <div><input id="hero-image-input" type="file" accept="image/png,image/jpeg,image/webp" />
              <small class="color-muted">JPG, PNG or WEBP · Max 2 MB. Stored in this browser demo.</small></div>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Homepage Announcement</label><input type="text" class="form-control" name="announcement" value="${escapeHtml(s.announcement || "")}" /></div>
        <div class="form-group"><label class="form-label">Store Email</label><input type="email" class="form-control" name="storeEmail" value="${escapeHtml(s.storeEmail || "")}" /></div>
        <div class="form-group"><label class="form-label">Store Phone</label><input type="text" class="form-control" name="storePhone" value="${escapeHtml(s.storePhone || "")}" /></div>
        <div class="form-group"><label class="form-label">WhatsApp Number</label><input type="text" class="form-control" name="whatsapp" value="${escapeHtml(s.whatsapp || "")}" /></div>
        <div class="form-group"><label class="form-label">Address / Location</label><input type="text" class="form-control" name="address" value="${escapeHtml(s.address || "")}" /></div>
        <button type="submit" class="btn btn--primary"><i class="fa-solid fa-floppy-disk"></i> Save Changes</button>
      </form>`;
    mount.appendChild(card);
    const imageInput = card.querySelector("#hero-image-input");
    imageInput.addEventListener("change", async () => {
      const file = imageInput.files && imageInput.files[0];
      if (!file) return;
      const check = AP.Uploads.validate(file, AP.Uploads.ALLOWED_IMAGES);
      if (!check.ok) { toastError(check.error); imageInput.value = ""; return; }
      try {
        heroImage = await AP.Uploads.optimizeImage(file);
        card.querySelector("#hero-image-preview").src = heroImage;
      } catch (_) { toastError("Could not read that image. Please try another file."); }
    });
    card.querySelector("#content-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.heroImage = heroImage;
      if (!AP.Collections.settings.save(data)) {
        toastError("The content could not be saved. Browser storage may be full.");
        return;
      }
      toastSuccess("Content updated. The homepage image will use this photo in this browser demo.");
    });
  }

  function renderSettings(mount) {
    const s = settings();
    const admin = getSession();
    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML = `
      <h2>Store &amp; Payment Settings</h2>
      <form id="settings-form">
        <div class="admin-form-grid">
          <div class="form-group"><label class="form-label">Bank Name</label><input type="text" class="form-control" name="bankName" value="${escapeHtml(s.bankName || "")}" /></div>
          <div class="form-group"><label class="form-label">Account Name</label><input type="text" class="form-control" name="accountName" value="${escapeHtml(s.accountName || "")}" /></div>
          <div class="form-group"><label class="form-label">Account Number</label><input type="text" class="form-control" name="accountNumber" value="${escapeHtml(s.accountNumber || "")}" /></div>
          <div class="form-group"><label class="form-label">Delivery Fee (₦)</label><input type="number" class="form-control" name="deliveryFee" min="0" value="${s.deliveryFee || 0}" /></div>
          <div class="form-group"><label class="form-label">Free Delivery Threshold (₦)</label><input type="number" class="form-control" name="freeDeliveryThreshold" min="0" value="${s.freeDeliveryThreshold || 0}" /></div>
        </div>
        <button type="submit" class="btn btn--primary"><i class="fa-solid fa-floppy-disk"></i> Save Settings</button>
      </form>
      <h2 style="margin-top:var(--sp-6);">Admin Profile</h2>
      <p class="color-muted" style="font-size:0.9rem;">Signed in as <strong>${escapeHtml(admin?.email || "")}</strong></p>
      <div style="margin-top:var(--sp-5); padding:var(--sp-3); background:var(--cream); border:1px dashed var(--border-strong); border-radius:var(--radius); font-size:0.82rem; color:var(--muted);">
        <strong style="color:var(--charcoal);">Security notice:</strong> This admin dashboard is a frontend demonstration. Role checks occur only in the browser and are not secure for production.
      </div>`;
    mount.appendChild(card);
    card.querySelector("#settings-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.deliveryFee = Number(data.deliveryFee) || 0;
      data.freeDeliveryThreshold = Number(data.freeDeliveryThreshold) || 0;
      if (!AP.Collections.settings.save(data)) {
        toastError("Settings could not be saved. Browser storage may be full.");
        return;
      }
      AP.Collections.logs.add({ action: "settings_update", email: getSession()?.email });
      toastSuccess("Settings saved.");
    });
  }

  function renderActivity(mount) {
    const logs = AP.Collections.logs.all().slice().reverse();
    const card = document.createElement("div");
    card.className = "admin-card";
    card.innerHTML = `<h2>Activity Log (${logs.length})</h2>`;
    if (logs.length === 0) card.innerHTML += `<p class="color-muted">No admin activity recorded yet.</p>`;
    else {
      const wrap = document.createElement("div");
      wrap.className = "activity-list";
      wrap.innerHTML = logs.slice(0, 100).map((l) => `
        <div class="activity-item">
          <i class="fa-solid fa-circle-dot"></i>
          <div class="activity-item__body">
            <strong>${escapeHtml(l.action || "action")}</strong>
            <span>${AP.formatDateTime(l.createdAt)}${l.email ? " · " + escapeHtml(l.email) : ""}${l.ref ? " · " + escapeHtml(l.ref) : ""}</span>
          </div>
        </div>`).join("");
      card.appendChild(wrap);
    }
    mount.appendChild(card);
  }

  function closeMobileSidebar() {
    const side = $("#admin-side");
    const overlay = $("#admin-side-overlay");
    if (side) side.classList.remove("is-open");
    if (overlay) overlay.classList.remove("is-open");
  }

  function initMobileSidebar() {
    const toggle = $("#admin-menu-toggle");
    const side = $("#admin-side");
    const overlay = $("#admin-side-overlay");
    if (!toggle || !side || !overlay) return;
    toggle.addEventListener("click", () => {
      const open = side.classList.toggle("is-open");
      overlay.classList.toggle("is-open", open);
    });
    overlay.addEventListener("click", closeMobileSidebar);
  }

  function init() {
    const session = getSession();
    if (!session) return;
    renderSidebar();
    renderTopbarActions();
    renderSection();
    initMobileSidebar();
    $("#admin-logout").addEventListener("click", async () => {
      const ok = await confirmDialog({ title: "Sign Out", message: "Sign out of the admin console?", confirmLabel: "Sign Out" });
      if (!ok) return;
      AP.Session.logoutAdmin();
      toastSuccess("Signed out.");
      setTimeout(() => (location.href = "admin-login.html"), 400);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();


