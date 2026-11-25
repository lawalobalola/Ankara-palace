/* ============================================================
   ANKARA PALACE — CUSTOMER DASHBOARD (MODIFIED)
   Changes:
     - Profile avatar upload (base64 in localStorage).
     - Saved address form uses LGA / Street / State / Country.
     - Renders simplified address display.
   ============================================================ */

(function () {
  "use strict";

  const { $, escapeHtml, statusBadge, toastSuccess, toastError, openModal, closeModal, confirm: confirmDialog } = UI;

  let customer = null;
  let currentSection = "overview";

  const SECTIONS = [
    { id: "overview", label: "Overview", icon: "fa-gauge-high" },
    { id: "orders", label: "My Orders", icon: "fa-box" },
    { id: "profile", label: "My Profile", icon: "fa-user" },
    { id: "addresses", label: "Saved Addresses", icon: "fa-location-dot" },
    { id: "notifications", label: "Notifications", icon: "fa-bell" },
    { id: "wishlist", label: "Wishlist", icon: "fa-heart" }
  ];

  function getAddressesRaw() { return AP.storage.get(`ap_addresses_${customer.id}`, []); }
  function saveAddresses(list) { AP.storage.set(`ap_addresses_${customer.id}`, list); }

  function closeMobileMenu() {
    const side = $("#dash-side");
    const backdrop = $("#dash-side-backdrop");
    const toggle = $("#dash-menu-toggle");
    if (side) side.classList.remove("is-open");
    if (backdrop) backdrop.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  function unreadNotifCount() {
    return AP.Collections.notifications.byCustomer(customer.id).filter((n) => !n.read).length;
  }

  function renderSidebar() {
    const nav = $("#dash-nav");
    nav.innerHTML = "";
    SECTIONS.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.section = s.id;
      btn.className = currentSection === s.id ? "is-active" : "";
      let count = "";
      if (s.id === "notifications") {
        const u = unreadNotifCount();
        if (u > 0) count = `<span class="dash-nav__count">${u}</span>`;
      } else if (s.id === "wishlist") {
        const wl = AP.Collections.wishlist.forCustomer(customer.id);
        if (wl.length > 0) count = `<span class="dash-nav__count">${wl.length}</span>`;
      }
      btn.innerHTML = `<i class="fa-solid ${s.icon}"></i> <span>${s.label}</span> ${count}`;
      btn.addEventListener("click", () => { switchSection(s.id); closeMobileMenu(); });
      nav.appendChild(btn);
    });
  }

  function switchSection(id) { currentSection = id; renderSidebar(); renderSection(); }

  function renderSection() {
    const main = $("#dash-main");
    main.innerHTML = "";
    switch (currentSection) {
      case "overview": return renderOverview(main);
      case "orders": return renderOrders(main);
      case "profile": return renderProfile(main);
      case "addresses": return renderAddresses(main);
      case "notifications": return renderNotifications(main);
      case "wishlist": return renderWishlist(main);
    }
  }

  function ordersListHTML(orders) {
    return `<div class="order-list">${orders.map((o) => `
      <div class="order-row">
        <span class="order-row__ref">${escapeHtml(o.ref)}</span>
        <div class="order-row__info">
          <strong>${escapeHtml(o.items?.[0]?.name || "Order")}${o.items?.length > 1 ? ` + ${o.items.length - 1} more` : ""}</strong>
          <span>${AP.formatDate(o.createdAt)} · ${o.items?.reduce((n, i) => n + Number(i.quantity), 0) || 0} item(s)</span>
        </div>
        <span class="order-row__amount">${AP.formatNaira(o.totals?.total || 0)}</span>
        <div class="order-row__action">
          <a href="order-details.html?ref=${encodeURIComponent(o.ref)}" class="btn btn--outline btn--sm">View</a>
        </div>
      </div>
    `).join("")}</div>`;
  }

  function renderOverview(main) {
    const orders = AP.Collections.orders.byCustomer(customer.id);
    const pending = orders.filter((o) =>
      ["Pending", "Awaiting Payment", "Accepted", "Ready to Dispatch", "Shipped"].includes(o.status));
    const completed = orders.filter((o) => o.status === "Delivered");
    const totalSpent = orders.filter((o) => o.paymentStatus === "paid").reduce((s, o) => s + (o.totals?.total || 0), 0);

    const section = document.createElement("div");
    section.innerHTML = `
      <div class="dash-stats">
        <div class="dash-stat">
          <div class="dash-stat__label">Total Orders</div>
          <div class="dash-stat__value">${orders.length}</div>
          <div class="dash-stat__hint">All time</div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat__label">In Progress</div>
          <div class="dash-stat__value">${pending.length}</div>
          <div class="dash-stat__hint">Currently active</div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat__label">Completed</div>
          <div class="dash-stat__value">${completed.length}</div>
          <div class="dash-stat__hint">Delivered orders</div>
        </div>
        <div class="dash-stat">
          <div class="dash-stat__label">Confirmed Spend</div>
          <div class="dash-stat__value" style="font-size:1.15rem;">${AP.formatNaira(totalSpent)}</div>
          <div class="dash-stat__hint">Paid orders only</div>
        </div>
      </div>

      <div class="dash-card">
        <h2>Recent Orders <button type="button" class="btn btn--outline btn--sm" data-goto="orders">View All</button></h2>
        <div id="recent-orders"></div>
      </div>
    `;

    const recent = orders.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3);
    const list = section.querySelector("#recent-orders");
    if (recent.length === 0) {
      list.innerHTML = `
        <div class="empty-state" style="padding:var(--sp-5) 0;">
          <i class="fa-solid fa-box-open"></i>
          <h3>No orders yet</h3>
          <p>Explore our collection and place your first order.</p>
          <a href="shop.html" class="btn btn--primary btn--sm">Shop Now</a>
        </div>`;
    } else {
      list.innerHTML = ordersListHTML(recent);
    }
    section.querySelectorAll("[data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => switchSection(btn.dataset.goto));
    });
    main.appendChild(section);
  }

  function renderOrders(main) {
    const orders = AP.Collections.orders.byCustomer(customer.id).slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const card = document.createElement("div");
    card.className = "dash-card";
    card.innerHTML = `<h2>My Orders</h2>`;
    if (orders.length === 0) {
      card.innerHTML += `
        <div class="empty-state" style="padding:var(--sp-6) 0;">
          <i class="fa-solid fa-box-open"></i>
          <h3>No orders yet</h3>
          <p>When you place an order, it will appear here.</p>
          <a href="shop.html" class="btn btn--primary btn--sm">Shop Now</a>
        </div>`;
    } else {
      const wrap = document.createElement("div");
      wrap.innerHTML = ordersListHTML(orders);
      card.appendChild(wrap);
    }
    main.appendChild(card);
  }

  function renderProfile(main) {
    const avatarBlock = customer.avatarDataUrl
      ? `<img class="profile-avatar" src="${escapeHtml(customer.avatarDataUrl)}" alt="Profile picture" />`
      : `<div class="profile-avatar-fallback">${escapeHtml((customer.name || "?").charAt(0).toUpperCase())}</div>`;

    const card = document.createElement("div");
    card.className = "dash-card";
    card.innerHTML = `
      <h2>My Profile</h2>

      <div class="profile-avatar-row">
        ${avatarBlock}
        <div class="profile-avatar-actions">
          <label for="avatar-input" class="btn btn--outline btn--sm" style="cursor:pointer;">
            <i class="fa-solid fa-camera"></i> Change Photo
          </label>
          <input type="file" id="avatar-input" accept="image/png,image/jpeg,image/webp" hidden />
          <small>JPG, PNG or WEBP · Max 2 MB</small>
        </div>
      </div>

      <form id="profile-form" novalidate>
        <div class="profile-grid">
          <div class="form-group">
            <label for="pf-name" class="form-label">Full Name <span class="req">*</span></label>
            <input type="text" id="pf-name" class="form-control" value="${escapeHtml(customer.name)}" required />
            <div class="form-error"></div>
          </div>
          <div class="form-group">
            <label for="pf-email" class="form-label">Email Address <span class="req">*</span></label>
            <input type="email" id="pf-email" class="form-control" value="${escapeHtml(customer.email)}" required />
            <div class="form-error"></div>
          </div>
          <div class="form-group">
            <label for="pf-phone" class="form-label">Phone Number <span class="req">*</span></label>
            <input type="tel" id="pf-phone" class="form-control" value="${escapeHtml(customer.phone || "")}" required />
            <div class="form-error"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Account Created</label>
            <input type="text" class="form-control" value="${AP.formatDate(customer.createdAt)}" disabled />
          </div>
        </div>
        <button type="submit" class="btn btn--primary"><i class="fa-solid fa-floppy-disk"></i> Save Changes</button>
      </form>
    `;
    main.appendChild(card);

    // Avatar upload
    const avatarInput = card.querySelector("#avatar-input");
    avatarInput.addEventListener("change", async () => {
      const file = avatarInput.files && avatarInput.files[0];
      if (!file) return;
      const check = AP.Uploads.validate(file, AP.Uploads.ALLOWED_IMAGES);
      if (!check.ok) { toastError(check.error); avatarInput.value = ""; return; }
      try {
        const dataUrl = await AP.Uploads.fileToDataURL(file);
        AP.Collections.customers.update(customer.id, { avatarDataUrl: dataUrl });
        customer = AP.Collections.customers.byId(customer.id);
        AP.Session.loginCustomer(customer);
        toastSuccess("Profile picture updated.");
        renderSection();
      } catch (err) {
        toastError(err.message || "Could not read the file.");
      } finally {
        avatarInput.value = "";
      }
    });

    // Profile form
    card.querySelector("#profile-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = card.querySelector("#pf-name");
      const email = card.querySelector("#pf-email");
      const phone = card.querySelector("#pf-phone");
      let valid = true;
      [name, email, phone].forEach((f) => UI.fieldError(f, ""));
      if (!UI.Validate.required(name.value)) { UI.fieldError(name, "Name is required."); valid = false; }
      if (!UI.Validate.email(email.value)) { UI.fieldError(email, "Valid email required."); valid = false; }
      if (!UI.Validate.phone(phone.value)) { UI.fieldError(phone, "Valid phone required."); valid = false; }
      if (!valid) return;

      const existing = AP.Collections.customers.byEmail(email.value);
      if (existing && existing.id !== customer.id) { UI.fieldError(email, "This email is already in use."); return; }

      AP.Collections.customers.update(customer.id, {
        name: name.value.trim(),
        email: email.value.trim().toLowerCase(),
        phone: phone.value.trim()
      });
      customer = AP.Collections.customers.byId(customer.id);
      AP.Session.loginCustomer(customer);
      toastSuccess("Profile updated.");
    });
  }

  function renderAddresses(main) {
    const list = getAddressesRaw();
    const card = document.createElement("div");
    card.className = "dash-card";
    card.innerHTML = `
      <h2>Saved Addresses <button type="button" class="btn btn--primary btn--sm" id="add-address-btn">
        <i class="fa-solid fa-plus"></i> Add Address
      </button></h2>
      <div class="addr-list" id="addr-list"></div>
    `;
    main.appendChild(card);

    const addrList = card.querySelector("#addr-list");
    if (list.length === 0) {
      addrList.innerHTML = `
        <div class="empty-state" style="padding:var(--sp-5) 0;">
          <i class="fa-solid fa-location-dot"></i>
          <h3>No saved addresses</h3>
          <p>Save a delivery address for faster checkout.</p>
        </div>`;
    } else {
      addrList.innerHTML = list.map((a) => {
        const n = AP.Address.normalize(a);
        return `
          <div class="addr-card" data-id="${escapeHtml(a.id)}">
            <div class="addr-card__body">
              ${a.isDefault ? '<div class="addr-card__label">Default Address</div>' : ""}
              <div class="addr-card__text"><strong>${escapeHtml(n.fullName)}</strong></div>
              <div class="addr-card__text">${escapeHtml(n.street)}</div>
              <div class="addr-card__text">${escapeHtml(n.lga)}, ${escapeHtml(n.state)}</div>
              <div class="addr-card__text">${escapeHtml(n.country)}</div>
              <div class="addr-card__text">${escapeHtml(n.phone)}</div>
            </div>
            <div class="addr-card__actions">
              <button type="button" data-action="edit" title="Edit" aria-label="Edit address"><i class="fa-solid fa-pen"></i></button>
              <button type="button" data-action="default" title="Set as default" aria-label="Set as default"><i class="fa-solid fa-star"></i></button>
              <button type="button" data-action="delete" title="Delete" aria-label="Delete address"><i class="fa-solid fa-trash"></i></button>
            </div>
          </div>
        `;
      }).join("");

      addrList.querySelectorAll(".addr-card").forEach((el) => {
        const id = el.dataset.id;
        el.querySelector('[data-action="edit"]').addEventListener("click", () => openAddressModal(id));
        el.querySelector('[data-action="delete"]').addEventListener("click", async () => {
          const ok = await confirmDialog({ title: "Delete Address", message: "Remove this address?", confirmLabel: "Delete", danger: true });
          if (!ok) return;
          saveAddresses(getAddressesRaw().filter((a) => a.id !== id));
          toastSuccess("Address removed.");
          renderSection();
        });
        el.querySelector('[data-action="default"]').addEventListener("click", () => {
          saveAddresses(getAddressesRaw().map((a) => ({ ...a, isDefault: a.id === id })));
          toastSuccess("Default address updated.");
          renderSection();
        });
      });
    }

    card.querySelector("#add-address-btn").addEventListener("click", () => openAddressModal());
  }

  function openAddressModal(id) {
    const list = getAddressesRaw();
    const editing = id ? list.find((a) => a.id === id) : null;
    const n = editing ? AP.Address.normalize(editing) : AP.Address.empty();

    const content = document.createElement("form");
    content.id = "address-form";
    content.innerHTML = `
      <div class="form-group">
        <label class="form-label">Full Name <span class="req">*</span></label>
        <input type="text" class="form-control" name="fullName" value="${escapeHtml(n.fullName)}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Phone <span class="req">*</span></label>
        <input type="tel" class="form-control" name="phone" value="${escapeHtml(n.phone)}" required />
      </div>
      <div class="form-group">
        <label class="form-label">Street Address <span class="req">*</span></label>
        <input type="text" class="form-control" name="street" value="${escapeHtml(n.street)}" required />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Local Government Area <span class="req">*</span></label>
          <input type="text" class="form-control" name="lga" value="${escapeHtml(n.lga)}" required />
        </div>
        <div class="form-group">
          <label class="form-label">State <span class="req">*</span></label>
          <input type="text" class="form-control" name="state" value="${escapeHtml(n.state)}" required />
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Country <span class="req">*</span></label>
          <input type="text" class="form-control" name="country" value="${escapeHtml(n.country || "Nigeria")}" required />
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end;">
          <label class="auth-checkbox">
            <input type="checkbox" name="isDefault" ${editing && editing.isDefault ? "checked" : ""} />
            Set as default
          </label>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Notes</label>
        <textarea class="form-control" name="notes" rows="2">${escapeHtml(n.notes || "")}</textarea>
      </div>
    `;

    UI.openModal({
      title: editing ? "Edit Address" : "Add Address",
      content,
      actions: [
        { label: "Cancel", className: "btn--ghost" },
        {
          label: editing ? "Save Changes" : "Add Address",
          className: "btn--primary",
          onClick: () => {
            const form = document.getElementById("address-form");
            const raw = Object.fromEntries(new FormData(form).entries());
            const address = AP.Address.normalize(raw);
            const errors = AP.Address.validate(address);
            if (errors.length > 0) { toastError(errors[0]); return; }
            const isDefault = form.querySelector('[name="isDefault"]').checked;
            const addressList = getAddressesRaw();
            if (editing) {
              const idx = addressList.findIndex((a) => a.id === editing.id);
              addressList[idx] = { ...addressList[idx], ...address, isDefault, id: editing.id };
            } else {
              addressList.push({ id: AP.uid("addr-"), ...address, isDefault });
            }
            if (isDefault) addressList.forEach((a) => { if (a.id !== (editing ? editing.id : addressList[addressList.length - 1].id)) a.isDefault = false; });
            if (!addressList.some((a) => a.isDefault) && addressList.length > 0) addressList[0].isDefault = true;
            saveAddresses(addressList);
            toastSuccess(editing ? "Address updated." : "Address added.");
            closeModal();
            renderSection();
          }
        }
      ]
    });
  }

  function renderNotifications(main) {
    const list = AP.Collections.notifications.byCustomer(customer.id);
    const card = document.createElement("div");
    card.className = "dash-card";
    card.innerHTML = `<h2>Notifications</h2>`;
    if (list.length === 0) {
      card.innerHTML += `
        <div class="empty-state" style="padding:var(--sp-6) 0;">
          <i class="fa-regular fa-bell"></i>
          <h3>No notifications</h3>
          <p>You will be notified about order updates here.</p>
        </div>`;
    } else {
      const wrap = document.createElement("div");
      wrap.className = "notif-list";
      wrap.innerHTML = list.map((n) => `
        <div class="notif-item ${n.read ? "" : "is-unread"}">
          <div class="notif-item__icon"><i class="fa-solid ${n.icon || "fa-bell"}"></i></div>
          <div class="notif-item__body">
            <p class="notif-item__title">${escapeHtml(n.title || "Notification")}</p>
            <p class="notif-item__text">${escapeHtml(n.message || "")}</p>
            <span class="notif-item__time">${AP.formatDateTime(n.createdAt)}</span>
          </div>
        </div>
      `).join("");
      card.appendChild(wrap);
      list.forEach((n) => { if (!n.read) AP.Collections.notifications.markRead(n.id); });
    }
    main.appendChild(card);
  }

  function renderWishlist(main) {
    const ids = AP.Collections.wishlist.forCustomer(customer.id);
    const products = ids.map((id) => AP.Collections.products.byId(id)).filter(Boolean);
    const card = document.createElement("div");
    card.className = "dash-card";
    card.innerHTML = `<h2>Wishlist</h2>`;
    if (products.length === 0) {
      card.innerHTML += `
        <div class="empty-state" style="padding:var(--sp-6) 0;">
          <i class="fa-regular fa-heart"></i>
          <h3>Your wishlist is empty</h3>
          <p>Save fabrics you love to return to them later.</p>
          <a href="shop.html" class="btn btn--primary btn--sm">Browse Fabrics</a>
        </div>`;
    } else {
      const grid = document.createElement("div");
      grid.className = "product-grid";
      grid.style.marginTop = "var(--sp-4)";
      products.forEach((p) => grid.appendChild(UI.productCard(p, { showWishlist: true })));
      card.appendChild(grid);
    }
    main.appendChild(card);
  }

  function init() {
    const session = AP.Session.getCustomer();
    if (!session) return;
    customer = AP.Collections.customers.byId(session.id);
    if (!customer) { AP.Session.logoutCustomer(); location.href = "login.html"; return; }
    const greeting = $("#dash-greeting");
    if (greeting) greeting.textContent = `Welcome back, ${customer.name.split(" ")[0]}`;
    const logout = $("#logout-btn");
    if (logout) {
      logout.addEventListener("click", async () => {
        const ok = await confirmDialog({ title: "Sign Out", message: "Are you sure you want to sign out?", confirmLabel: "Sign Out" });
        if (!ok) return;
        AP.Session.logoutCustomer();
        toastSuccess("Signed out.");
        setTimeout(() => (location.href = "index.html"), 400);
      });
    }
    const menuToggle = $("#dash-menu-toggle");
    const menuBackdrop = $("#dash-side-backdrop");
    if (menuToggle && menuBackdrop) {
      menuToggle.addEventListener("click", () => {
        const side = $("#dash-side");
        const open = !side.classList.contains("is-open");
        side.classList.toggle("is-open", open);
        menuBackdrop.hidden = !open;
        menuToggle.setAttribute("aria-expanded", String(open));
      });
      menuBackdrop.addEventListener("click", closeMobileMenu);
      document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeMobileMenu(); });
    }
    renderSidebar();
    renderSection();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
