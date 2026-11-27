/* ============================================================
   ANKARA PALACE — CENTRAL DATA LAYER (MODIFIED)
   See previous delivery for the full rationale.
   Changes in this version:
     - Order status flow aligned with payment review:
       Awaiting Payment → Pending (receipt uploaded) → Accepted
            → Shipped → Ready to Dispatch → Delivered
       Rejected / Cancelled are terminal.
     - AP.Address helpers for the simplified address model
       (Local Government Area, street, state, country).
     - AP.Uploads constants + AP.Uploads.fileToDataURL helper
       used by page controllers (base64 in localStorage).
     - Customer record now supports avatarDataUrl.
     - Product images now store data URLs, not only asset paths.
   ============================================================ */

(function () {
  "use strict";

  const KEYS = {
    customers: "ap_customers",
    admin: "ap_admin",
    products: "ap_products",
    categories: "ap_categories",
    orders: "ap_orders",
    notifications: "ap_notifications",
    wishlist: "ap_wishlist",
    promos: "ap_promos",
    reviews: "ap_reviews",
    cart: "ap_cart",
    visitors: "ap_visitors",
    logs: "ap_admin_logs",
    sessionCustomer: "ap_session_customer",
    sessionAdmin: "ap_session_admin",
    seeded: "ap_seeded_v1",
    newsletter: "ap_newsletter",
    settings: "ap_settings"
  };

  // MongoDB-backed server state is the shared source of truth. Browser storage
  // remains a cache and a migration source for a first-time admin catalogue sync.
  const sharedState = (() => {
    try {
      const request = new XMLHttpRequest();
      request.open("GET", "/api/state", false);
      request.send();
      if (request.status >= 200 && request.status < 300) return JSON.parse(request.responseText || "{}");
    } catch (error) {
      console.warn("[AP.Db] Shared server is unavailable; using this browser's saved data.", error);
    }
    return null;
  })();
  let sharedReady = Boolean(sharedState);
  let lastOrderError = "";

  function apiRequest(method, route, body) {
    try {
      const request = new XMLHttpRequest();
      request.open(method, route, false);
      if (body !== undefined) request.setRequestHeader("Content-Type", "application/json");
      request.send(body === undefined ? null : JSON.stringify(body));
      let payload = {};
      try { payload = JSON.parse(request.responseText || "{}"); } catch (_) {}
      return { ok: request.status >= 200 && request.status < 300, status: request.status, ...payload };
    } catch (_) {
      return { ok: false, status: 0, error: "The server is not available. Please try again." };
    }
  }
  // These keys are excluded from the public catalogue state endpoint. Customer
  // and order changes use authenticated API routes; per-visitor UI data remains local.
  const localOnlyKeys = new Set([
    KEYS.sessionCustomer, KEYS.sessionAdmin, KEYS.customers, KEYS.admin,
    KEYS.orders, KEYS.notifications, KEYS.wishlist, KEYS.reviews, KEYS.cart,
    KEYS.visitors, KEYS.logs, KEYS.newsletter, KEYS.seeded
  ]);

  function saveSharedValue(key, value) {
    if (!sharedReady || localOnlyKeys.has(key)) return true;
    try {
      const request = new XMLHttpRequest();
      request.open("PUT", `/api/state/${encodeURIComponent(key)}`, false);
      request.setRequestHeader("Content-Type", "application/json");
      request.send(JSON.stringify({ value }));
      if (request.status < 200 || request.status >= 300) throw new Error(`Server returned ${request.status}`);
      sharedState[key] = value;
      return true;
    } catch (error) {
      console.error("[AP.Db] Could not save shared data for", key, error);
      return false;
    }
  }

  const storage = {
    get(key, fallback) {
      try {
        if (sharedReady && Object.prototype.hasOwnProperty.call(sharedState, key)) return sharedState[key];
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        const value = JSON.parse(raw);
        if (sharedReady && !localOnlyKeys.has(key)) saveSharedValue(key, value);
        return value;
      } catch (err) {
        console.warn("[AP.Db] Corrupt stored value for", key, "— resetting to fallback.");
        try { localStorage.removeItem(key); } catch (_) {}
        return fallback;
      }
    },
    set(key, value) {
      const serverSaved = saveSharedValue(key, value);
      let localSaved = true;
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) {
        localSaved = false;
        // The server is the source of truth; a full browser cache must not
        // prevent an upload or admin change from reaching other customers.
        console.warn("[AP.Db] Saved on server; browser cache could not be updated for", key, err);
      }
      try {
        try { window.dispatchEvent(new CustomEvent("ap:data-change", { detail: { key } })); } catch (_) {}
        return localOnlyKeys.has(key) ? localSaved : serverSaved && localSaved;
      } catch (err) {
        console.error("[AP.Db] Unable to persist", key, err);
        return false;
      }
    },
    remove(key) { try { localStorage.removeItem(key); } catch (_) {} }
  };

  // Keep open customer pages in step with admin edits made by another browser.
  // Session keys are deliberately local to each visitor.
  let lastOrdersSnapshot = null;
  let lastCustomersSnapshot = null;
  if (sharedReady) {
    window.setInterval(() => {
      try {
        const request = new XMLHttpRequest();
        request.open("GET", "/api/state", false);
        request.send();
        if (request.status < 200 || request.status >= 300) return;
        const latest = JSON.parse(request.responseText || "{}");
        Object.keys(latest).forEach((key) => {
          if (localOnlyKeys.has(key)) return;
          const before = JSON.stringify(sharedState[key]);
          const after = JSON.stringify(latest[key]);
          if (before === after) return;
          sharedState[key] = latest[key];
          try { localStorage.setItem(key, after); } catch (_) {}
          try { window.dispatchEvent(new CustomEvent("ap:data-change", { detail: { key } })); } catch (_) {}
        });
        const orderResponse = apiRequest("GET", "/api/orders");
        if (orderResponse.ok && Array.isArray(orderResponse.orders)) {
          const snapshot = JSON.stringify(orderResponse.orders);
          if (lastOrdersSnapshot !== null && snapshot !== lastOrdersSnapshot) {
            window.dispatchEvent(new CustomEvent("ap:orders-change"));
          }
          lastOrdersSnapshot = snapshot;
        }
        if (storage.get(KEYS.sessionAdmin, null)) {
          const customerResponse = apiRequest("GET", "/api/admin/customers");
          if (customerResponse.ok && Array.isArray(customerResponse.customers)) {
            const snapshot = JSON.stringify(customerResponse.customers);
            if (lastCustomersSnapshot !== null && snapshot !== lastCustomersSnapshot) {
              storage.set(KEYS.customers, customerResponse.customers);
              window.dispatchEvent(new CustomEvent("ap:customers-change"));
              window.dispatchEvent(new CustomEvent("ap:data-change", { detail: { key: KEYS.customers } }));
            }
            lastCustomersSnapshot = snapshot;
          }
        }
      } catch (_) { /* Retry on the next polling interval. */ }
    }, 3000);
  }

  function uid(prefix = "") {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}${Date.now().toString(36)}${rand}`;
  }
  function orderRef() {
    const y = new Date().getFullYear();
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `AP-${y}-${rand}`;
  }
  function nowISO() { return new Date().toISOString(); }
  function daysAgo(days) {
    const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString();
  }
  function formatNaira(amount) {
    const num = Number(amount) || 0;
    return "₦" + num.toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso); if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" });
  }
  function formatDateTime(iso) {
    if (!iso) return "—";
    const d = new Date(iso); if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-NG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  /* ---------- Seed ---------- */
  const CATEGORY_IMAGES = {
    "cat-ankara": "ankara  2.jpeg",
    "cat-asooke": "aso oke.jpg",
    "cat-adire": "ADIRE.jpg",
    "cat-lace": "lace image.jpg",
    "cat-prints": "african.jpg",
    "cat-special": "special.jpg"
  };
  const PRODUCT_IMAGES = {
    "cat-ankara": ["ankara image.jpg", "ANKARACOLTH.jpg", "royal.jpg"],
    "cat-asooke": ["aso oke.jpg", "cloth.jpeg"],
    "cat-adire": ["ADIRE.jpg", "adire imgae.jpg", "kampala.jpg"],
    "cat-lace": ["lace image.jpg", "LACE.jpeg"],
    "cat-prints": ["african.jpg", "ankara  2.jpeg"],
    "cat-special": ["special.jpg", "royal.jpg"]
  };
  const SEED_CATEGORIES = [
    { id: "cat-ankara", name: "Ankara Fabrics", slug: "ankara", description: "Vibrant wax-print fabrics with bold African patterns.", image: CATEGORY_IMAGES["cat-ankara"] },
    { id: "cat-asooke", name: "Aso-Oke", slug: "aso-oke", description: "Handwoven Yoruba textiles for special occasions.", image: CATEGORY_IMAGES["cat-asooke"] },
    { id: "cat-adire", name: "Adire", slug: "adire", description: "Indigo-dyed textiles with traditional Yoruba artistry.", image: CATEGORY_IMAGES["cat-adire"] },
    { id: "cat-lace", name: "Lace Fabrics", slug: "lace", description: "Elegant lace for ceremonies and formal wear.", image: CATEGORY_IMAGES["cat-lace"] },
    { id: "cat-prints", name: "African Prints", slug: "prints", description: "Contemporary African-inspired print fabrics.", image: CATEGORY_IMAGES["cat-prints"] },
    { id: "cat-special", name: "Special Collections", slug: "special", description: "Curated premium fabrics for the discerning buyer.", image: CATEGORY_IMAGES["cat-special"] }
  ];

  function seedProducts() {
    const mk = (i, name, catId, price, priceTrouser, stock, colors, designs, tags, desc) => ({
      id: `prod-${i}`,
      name,
      categoryId: catId,
      description: desc,
      pricePerYard: price,
      pricePerTrouser: priceTrouser || null,
      bundleName: "",
      bundleYards: 0,
      bundlePrice: 0,
      colors, designs, stock,
      minOrderQty: 2,
      images: [PRODUCT_IMAGES[catId][(i - 1) % PRODUCT_IMAGES[catId].length]],
      tags: tags || [],
      featured: tags && tags.includes("featured"),
      bestseller: tags && tags.includes("bestseller"),
      newArrival: tags && tags.includes("new"),
      active: true,
      createdAt: daysAgo(30 - i)
    });
    return [
      mk(1, "Royal Emerald Ankara", "cat-ankara", 8500, 24000, 42, ["Emerald","Gold","Cream"], ["Geometric","Floral","Abstract"], ["featured","bestseller"], "A luxurious Ankara fabric featuring intricate emerald and gold patterns inspired by traditional Nigerian motifs."),
      mk(2, "Terracotta Bloom Ankara", "cat-ankara", 7800, 22000, 35, ["Terracotta","Burgundy","Cream"], ["Floral","Paisley"], ["bestseller"], "Warm terracotta tones paired with delicate floral prints."),
      mk(3, "Indigo Heritage Aso-Oke", "cat-asooke", 16500, null, 18, ["Indigo","Silver","White"], ["Striped","Textured"], ["featured"], "Handwoven Aso-Oke in deep indigo with metallic silver accents."),
      mk(4, "Coral Ceremony Aso-Oke", "cat-asooke", 18500, null, 12, ["Coral","Gold"], ["Striped","Embellished"], ["new"], "Vibrant coral Aso-Oke with hand-embroidered gold detailing."),
      mk(5, "Adire Eleko Indigo", "cat-adire", 9200, 26000, 28, ["Indigo","White"], ["Eleko","Cascading"], ["featured","bestseller"], "Traditional Adire Eleko fabric, hand-dyed in natural indigo."),
      mk(6, "Adire Oniko Classic", "cat-adire", 8500, 24000, 22, ["Indigo","Sky Blue"], ["Starburst","Geometric"], [], "A refined Adire Oniko with classic starburst patterns."),
      mk(7, "Ivory French Lace", "cat-lace", 22500, null, 15, ["Ivory","Champagne"], ["Floral","Beaded"], ["featured","new"], "Delicate French lace with hand-beaded floral motifs."),
      mk(8, "Gold Cord Lace", "cat-lace", 24500, null, 10, ["Gold","Rose Gold"], ["Corded","Floral"], ["bestseller"], "Rich gold cord lace with intricate embroidery."),
      mk(9, "Sunset African Print", "cat-prints", 6800, 19000, 50, ["Sunset Orange","Yellow","Brown"], ["Abstract","Geometric"], ["new"], "A bold African print inspired by sunset colours."),
      mk(10, "Midnight Bloom Print", "cat-prints", 7200, 20000, 40, ["Midnight Blue","Cream","Gold"], ["Floral","Botanical"], [], "Deep midnight blue with cream and gold botanical motifs."),
      mk(11, "Emerald Prestige Collection", "cat-special", 32000, null, 8, ["Emerald","Gold","Black"], ["Brocade","Textured"], ["featured"], "Part of our Special Collection — a premium brocade in emerald and gold."),
      mk(12, "Heirloom Indigo Aso-Oke", "cat-special", 38000, null, 5, ["Indigo","Silver","Cream"], ["Handwoven","Heirloom"], ["new"], "A rare, handwoven Aso-Oke from our heirloom collection.")
    ];
  }

  function seedAdmin() {
    return {
      id: "admin-1",
      name: "Ankara Palace Admin",
      email: "admin@ankarapalace.com",
      password: "Admin@1234",
      role: "admin"
    };
  }

  function seed() {
    if (storage.get(KEYS.seeded, false)) {
      if (!storage.get(KEYS.products, []).length) storage.set(KEYS.products, seedProducts());
      if (!storage.get(KEYS.categories, []).length) storage.set(KEYS.categories, SEED_CATEGORIES);
      if (!storage.get(KEYS.admin, []).length) storage.set(KEYS.admin, [seedAdmin()]);
      return;
    }
    const sharedStoreKeys = [KEYS.products, KEYS.categories, KEYS.promos, KEYS.settings];
    if (sharedReady && sharedStoreKeys.some((key) => Object.prototype.hasOwnProperty.call(sharedState, key))) {
      // A new browser must use the existing shared catalogue and settings,
      // never replace them with starter content from this browser.
      storage.set(KEYS.seeded, true);
      return;
    }
    storage.set(KEYS.categories, SEED_CATEGORIES);
    storage.set(KEYS.products, seedProducts());
    storage.set(KEYS.admin, [seedAdmin()]);
    storage.set(KEYS.customers, []);
    storage.set(KEYS.orders, []);
    storage.set(KEYS.notifications, []);
    storage.set(KEYS.wishlist, {});
    storage.set(KEYS.promos, [{
      id: "promo-welcome", code: "WELCOME10", type: "percent", value: 10,
      description: "10% off your first order", active: true,
      startDate: daysAgo(30), endDate: daysAgo(-180)
    }]);
    storage.set(KEYS.reviews, []);
    storage.set(KEYS.visitors, { total: 0, today: 0, lastDate: nowISO() });
    storage.set(KEYS.logs, []);
    storage.set(KEYS.newsletter, []);
    storage.set(KEYS.settings, {
      bankName: "[PLACEHOLDER — Add real bank name]",
      accountName: "[PLACEHOLDER — Add real account name]",
      accountNumber: "[PLACEHOLDER — Add real account number]",
      storeEmail: "hello@ankarapalace.com",
      storePhone: "+234 800 000 0000",
      whatsapp: "+234 800 000 0000",
      address: "Lagos, Nigeria",
      deliveryFee: 0,
      deliveryFees: {},
      freeDeliveryThreshold: 0,
      currency: "NGN",
      announcement: "Welcome to Ankara Palace — Bringing African Fabric and Elegance to the World."
    });
    storage.set(KEYS.seeded, true);
  }

  function syncMissingSharedCatalog() {
    if (!sharedReady) return false;
    const defaults = [
      [KEYS.categories, SEED_CATEGORIES],
      [KEYS.products, seedProducts()],
      [KEYS.promos, []],
      [KEYS.settings, {}]
    ];
    let synced = true;
    defaults.forEach(([key, fallback]) => {
      const hasRemote = Object.prototype.hasOwnProperty.call(sharedState, key);
      const remoteValue = sharedState[key];
      const remoteEmpty = Array.isArray(remoteValue) ? remoteValue.length === 0 : remoteValue && typeof remoteValue === "object" ? Object.keys(remoteValue).length === 0 : false;
      let cachedValue = null;
      try {
        const raw = localStorage.getItem(key);
        if (raw !== null) cachedValue = JSON.parse(raw);
      } catch (_) {}
      const value = hasRemote && remoteEmpty && cachedValue !== null ? cachedValue : storage.get(key, fallback);
      const localHasData = Array.isArray(value) ? value.length > 0 : value && typeof value === "object" ? Object.keys(value).length > 0 : false;
      if ((!hasRemote || (remoteEmpty && localHasData)) && !storage.set(key, value)) synced = false;
    });
    return synced;
  }

  function repairSeedImages() {
    const categories = storage.get(KEYS.categories, []);
    let categoriesChanged = false;
    categories.forEach((category) => {
      if (CATEGORY_IMAGES[category.id] && String(category.image || "").startsWith("assets/fabrics/")) {
        category.image = CATEGORY_IMAGES[category.id];
        categoriesChanged = true;
      }
    });
    if (categoriesChanged) storage.set(KEYS.categories, categories);

    const products = storage.get(KEYS.products, []);
    let productsChanged = false;
    products.forEach((product) => {
      const images = Array.isArray(product.images) ? product.images : [];
      if (String(images[0] || "").startsWith("assets/fabrics/") && PRODUCT_IMAGES[product.categoryId]) {
        const productNumber = Number(String(product.id || "").replace("prod-", "")) || 1;
        product.images = [PRODUCT_IMAGES[product.categoryId][(productNumber - 1) % PRODUCT_IMAGES[product.categoryId].length]];
        productsChanged = true;
      }
    });
    if (productsChanged) storage.set(KEYS.products, products);
  }

  /* ---------- Collections ---------- */
  const Collections = {
    customers: {
      all: () => {
        const local = storage.get(KEYS.customers, []);
        if (sharedReady && storage.get(KEYS.sessionAdmin, null)) {
          const response = apiRequest("GET", "/api/admin/customers");
          if (response.ok && Array.isArray(response.customers)) {
            storage.set(KEYS.customers, response.customers);
            return response.customers;
          }
        }
        return local;
      },
      byId: (id) => Collections.customers.all().find((c) => c.id === id) || null,
      byEmail: (email) => Collections.customers.all().find((c) => (c.email || "").toLowerCase() === (email || "").toLowerCase()) || null,
      save: (list) => storage.set(KEYS.customers, list),
      add: (customer) => { const list = Collections.customers.all(); list.push(customer); Collections.customers.save(list); return customer; },
      update: (id, patch) => {
        const list = Collections.customers.all();
        const idx = list.findIndex((c) => c.id === id);
        if (idx === -1) return null;
        if (sharedReady && storage.get(KEYS.sessionCustomer, null)?.id === id) {
          const response = apiRequest("PUT", "/api/customer/profile", patch);
          if (!response.ok || !response.customer) {
            window.AP_LAST_PROFILE_ERROR = response.error || "Could not save your profile.";
            return null;
          }
          list[idx] = { ...list[idx], ...response.customer };
          storage.set(KEYS.customers, list);
          window.AP_LAST_PROFILE_ERROR = "";
          return list[idx];
        }
        list[idx] = { ...list[idx], ...patch };
        Collections.customers.save(list);
        return list[idx];
      }
    },
    admin: {
      all: () => storage.get(KEYS.admin, []),
      byEmail: (email) => Collections.admin.all().find((a) => (a.email || "").toLowerCase() === (email || "").toLowerCase()) || null
    },
    products: {
      all: () => storage.get(KEYS.products, []),
      active: () => Collections.products.all().filter((p) => p.active !== false),
      byId: (id) => Collections.products.all().find((p) => p.id === id) || null,
      save: (list) => storage.set(KEYS.products, list),
      add: (product) => {
        const list = Collections.products.all();
        list.push(product);
        return Collections.products.save(list) ? product : null;
      },
      update: (id, patch) => {
        const list = Collections.products.all();
        const idx = list.findIndex((p) => p.id === id);
        if (idx === -1) return null;
        list[idx] = { ...list[idx], ...patch };
        return Collections.products.save(list) ? list[idx] : null;
      },
      remove: (id) => {
        const list = Collections.products.all().filter((p) => p.id !== id);
        return Collections.products.save(list);
      }
    },
    categories: {
      all: () => storage.get(KEYS.categories, []),
      byId: (id) => Collections.categories.all().find((c) => c.id === id) || null,
      bySlug: (slug) => Collections.categories.all().find((c) => c.slug === slug) || null,
      save: (list) => storage.set(KEYS.categories, list)
    },
    orders: {
      all: () => {
        if (sharedReady) {
          const response = apiRequest("GET", "/api/orders");
          if (response.ok && Array.isArray(response.orders)) return response.orders;
          if (response.status === 401) return [];
        }
        return storage.get(KEYS.orders, []);
      },
      byId: (id) => Collections.orders.all().find((o) => o.id === id) || null,
      byRef: (ref) => Collections.orders.all().find((o) => o.ref === ref) || null,
      byCustomer: (customerId) => Collections.orders.all().filter((o) => o.customerId === customerId),
      save: (list) => { let ok = true; list.forEach((order) => { if (!Collections.orders.update(order.id, order)) ok = false; }); return ok; },
      add: (order) => {
        if (sharedReady) {
          const response = apiRequest("POST", "/api/orders", order);
          lastOrderError = response.ok ? "" : (response.error || "The order service could not save this order.");
          return response.ok ? response.order : null;
        }
        const list = storage.get(KEYS.orders, []); list.push(order);
        return storage.set(KEYS.orders, list) ? order : null;
      },
      update: (id, patch) => {
        if (sharedReady) {
          const response = apiRequest("PUT", `/api/orders/${encodeURIComponent(id)}`, patch);
          return response.ok ? response.order : null;
        }
        const list = Collections.orders.all();
        const idx = list.findIndex((o) => o.id === id);
        if (idx === -1) return null;
        list[idx] = { ...list[idx], ...patch, updatedAt: nowISO() };
        Collections.orders.save(list);
        return list[idx];
      }
    },
    notifications: {
      all: () => storage.get(KEYS.notifications, []),
      byCustomer: (customerId) => Collections.notifications.all().filter((n) => n.customerId === customerId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      add: (notif) => { const list = Collections.notifications.all(); list.push(notif); storage.set(KEYS.notifications, list); return notif; },
      markRead: (id) => {
        const list = Collections.notifications.all();
        const idx = list.findIndex((n) => n.id === id);
        if (idx !== -1) { list[idx].read = true; storage.set(KEYS.notifications, list); }
      }
    },
    wishlist: {
      forCustomer: (customerId) => { const all = storage.get(KEYS.wishlist, {}); return all[customerId] || []; },
      toggle: (customerId, productId) => {
        const all = storage.get(KEYS.wishlist, {});
        const list = all[customerId] || [];
        const idx = list.indexOf(productId);
        if (idx === -1) list.push(productId); else list.splice(idx, 1);
        all[customerId] = list;
        storage.set(KEYS.wishlist, all);
        return idx === -1;
      },
      has: (customerId, productId) => Collections.wishlist.forCustomer(customerId).includes(productId)
    },
    promos: {
      all: () => storage.get(KEYS.promos, []),
      byCode: (code) => Collections.promos.all().find((p) => p.code.toLowerCase() === (code || "").toLowerCase()) || null
    },
    reviews: {
      all: () => storage.get(KEYS.reviews, []),
      byProduct: (productId) => Collections.reviews.all().filter((r) => r.productId === productId),
      add: (review) => { const list = Collections.reviews.all(); list.push(review); storage.set(KEYS.reviews, list); return review; }
    },
    visitors: {
      get: () => storage.get(KEYS.visitors, { total: 0, today: 0, lastDate: nowISO() }),
      trackVisit: () => {
        const v = Collections.visitors.get();
        const today = new Date().toDateString();
        const last = v.lastDate ? new Date(v.lastDate).toDateString() : null;
        v.total = (v.total || 0) + 1;
        v.today = (today === last ? (v.today || 0) + 1 : 1);
        v.lastDate = nowISO();
        storage.set(KEYS.visitors, v);
      }
    },
    logs: {
      all: () => storage.get(KEYS.logs, []),
      add: (entry) => {
        const list = Collections.logs.all();
        list.push({ ...entry, id: uid("log-"), createdAt: nowISO() });
        storage.set(KEYS.logs, list);
      }
    },
    newsletter: {
      all: () => storage.get(KEYS.newsletter, []),
      add: (email) => {
        const list = Collections.newsletter.all();
        if (!list.includes(email)) { list.push(email); storage.set(KEYS.newsletter, list); return true; }
        return false;
      }
    },
    settings: {
      get: () => storage.get(KEYS.settings, {}),
      save: (patch) => {
        const s = { ...Collections.settings.get(), ...patch };
        return storage.set(KEYS.settings, s) ? s : null;
      }
    }
  };

  /* ---------- Session ---------- */
  const Session = {
    loginCustomer(customer) {
      storage.set(KEYS.sessionCustomer, { id: customer.id, email: customer.email, name: customer.name, loggedInAt: nowISO() });
    },
    getCustomer() { return storage.get(KEYS.sessionCustomer, null); },
    logoutCustomer() { apiRequest("POST", "/api/auth/logout"); storage.remove(KEYS.sessionCustomer); },
    loginAdmin(admin) {
      storage.set(KEYS.sessionAdmin, { id: admin.id, email: admin.email, name: admin.name, loggedInAt: nowISO() });
      Collections.logs.add({ action: "admin_login", email: admin.email });
    },
    getAdmin() { return storage.get(KEYS.sessionAdmin, null); },
    logoutAdmin() {
      const admin = Session.getAdmin();
      if (admin) Collections.logs.add({ action: "admin_logout", email: admin.email });
      if (sharedReady) apiRequest("POST", "/api/admin/logout");
      storage.remove(KEYS.sessionAdmin);
    }
  };

  /* ---------- Auth ---------- */
  function hashDemo(password) {
    let h = 0;
    for (let i = 0; i < password.length; i++) { h = (h << 5) - h + password.charCodeAt(i); h |= 0; }
    return "demo_" + Math.abs(h).toString(36);
  }

  const Auth = {
    hashDemo,
    sendVerificationCode(email, registration) {
      return apiRequest("POST", "/api/auth/send-code", { email, ...(registration ? { registration } : {}) });
    },
    verifyCustomerCode(email, code) {
      return apiRequest("POST", "/api/auth/verify-code", { email, code });
    },
    sendPasswordResetCode(email) {
      return apiRequest("POST", "/api/auth/send-code", { email, purpose: "reset" });
    },
    verifyPasswordResetCode(email, code) {
      return apiRequest("POST", "/api/auth/verify-reset-code", { email, code });
    },
    registerCustomer({ name, email, phone, password, code }) {
      if (sharedReady) {
        const response = apiRequest("POST", "/api/auth/register", { email, code });
        if (!response.ok) return { ok: false, error: response.error || "Could not create the account." };
        Collections.customers.add(response.customer);
        Session.loginCustomer(response.customer);
        return { ok: true, customer: response.customer };
      }
      if (Collections.customers.byEmail(email)) return { ok: false, error: "An account with this email already exists." };
      const response = apiRequest("POST", "/api/auth/register", { email, code });
      if (!response.ok) return { ok: false, error: response.error || "Could not create the account." };
      const customer = {
        ...response.customer, name: name.trim(), email: email.trim().toLowerCase(),
        phone: phone.trim(), passwordHash: hashDemo(password),
        avatarDataUrl: response.customer?.avatarDataUrl || null,
        createdAt: response.customer?.createdAt || nowISO()
      };
      Collections.customers.add(customer);
      return { ok: true, customer };
    },
    loginCustomer(email, password) {
      if (sharedReady) {
        const response = apiRequest("POST", "/api/auth/login", { email, password });
        if (!response.ok) return { ok: false, error: response.error || "Email or password is incorrect." };
        Collections.customers.add(response.customer);
        Session.loginCustomer(response.customer);
        return { ok: true, customer: response.customer };
      }
      const customer = Collections.customers.byEmail(email);
      if (customer && customer.passwordHash === hashDemo(password)) {
        Session.loginCustomer(customer);
        return { ok: true, customer };
      }
      const response = apiRequest("POST", "/api/auth/login", { email, password });
      if (!response.ok) return { ok: false, error: customer ? "Incorrect password. Please try again." : (response.error || "No account found with this email.") };
      Collections.customers.add(response.customer);
      Session.loginCustomer(response.customer);
      return { ok: true, customer: response.customer };
    },
    currentCustomer() {
      if (!sharedReady) return Session.getCustomer();
      const response = apiRequest("GET", "/api/auth/session");
      if (!response.ok) {
        window.AP_SESSION_ERROR = response.error || "Could not verify your sign-in.";
        if (response.status === 401) return null;
        const saved = Session.getCustomer();
        return saved ? (Collections.customers.byId(saved.id) || saved) : null;
      }
      if (!response.customer) return null;
      window.AP_SESSION_ERROR = "";
      Collections.customers.add(response.customer);
      Session.loginCustomer(response.customer);
      return response.customer;
    },
    loginAdmin(email, password) {
      // The server validates administrator credentials and issues an
      // HttpOnly session cookie before this browser marks the session active.
      if (sharedReady) {
        try {
          const request = new XMLHttpRequest();
          request.open("POST", "/api/admin/login", false);
          request.setRequestHeader("Content-Type", "application/json");
          request.send(JSON.stringify({ email, password }));
          if (request.status < 200 || request.status >= 300) {
            const response = JSON.parse(request.responseText || "{}");
            return { ok: false, error: response.error || "Invalid administrator credentials." };
          }
          const admin = Collections.admin.byEmail(email) || { id: "server-admin", email, name: "Ankara Palace Admin", role: "admin" };
          Session.loginAdmin(admin);
          const catalogSynced = syncMissingSharedCatalog();
          return { ok: true, admin, catalogSynced };
        } catch (error) {
          return { ok: false, error: "Could not reach the administrator sign-in service. Check that the site server is running." };
        }
      }
      const admin = Collections.admin.byEmail(email);
      if (!admin) return { ok: false, error: "Invalid administrator credentials." };
      if (admin.password !== password) return { ok: false, error: "Invalid administrator credentials." };
      Session.loginAdmin(admin);
      return { ok: true, admin };
    },
    resetPassword(email, newPassword, code) {
      if (sharedReady) {
        const response = apiRequest("POST", "/api/auth/reset-password", { email, password: newPassword, code });
        return response.ok ? { ok: true } : { ok: false, error: response.error || "Could not reset your password." };
      }
      const remote = apiRequest("POST", "/api/auth/reset-password", { email, password: newPassword, code });
      if (!remote.ok) return { ok: false, error: remote.error || "Could not reset your password." };
      const customer = Collections.customers.byEmail(email);
      if (!customer) return { ok: false, error: "No account found with this email." };
      Collections.customers.update(customer.id, { passwordHash: hashDemo(newPassword) });
      return { ok: true };
    }
  };

  /* ---------- Order statuses & transitions ----------
   Customer-facing flow:
       Awaiting Payment → Pending (receipt review) → Accepted
            → Shipped → Ready to Dispatch → Delivered
     The admin-only transitions mirror this and prevent skipping steps.
     Rejected / Cancelled are terminal.
  ---------------------------------------------- */
  const ORDER_STATUSES = [
    "Awaiting Payment",
    "Pending",
    "Accepted",
    "Shipped",
    "Ready to Dispatch",
    "Delivered",
    "Rejected",
    "Cancelled"
  ];

  const ALLOWED_TRANSITIONS = {
    "Awaiting Payment": ["Pending", "Cancelled"],
    "Pending": ["Cancelled"],
    "Accepted": ["Shipped", "Cancelled"],
    "Shipped": ["Ready to Dispatch"],
    "Ready to Dispatch": ["Delivered"],
    "Delivered": [],
    "Rejected": [],
    "Cancelled": []
  };

  const NIGERIAN_STATES = [
    "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno",
    "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu", "Gombe", "Imo",
    "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos",
    "Nasarawa", "Niger", "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers",
    "Sokoto", "Taraba", "Yobe", "Zamfara", "FCT"
  ];

  function deliveryStateKey(state) {
    const value = String(state || "").trim().toLowerCase().replace(/\s+state$/i, "");
    if (["abuja", "fct", "federal capital territory", "abuja (fct)"].includes(value)) return "FCT";
    return NIGERIAN_STATES.find((entry) => entry.toLowerCase() === value) || String(state || "").trim();
  }

  const OrderCalc = {
    calculate(items, options = {}) {
      const settings = Collections.settings.get();
      const subtotal = items.reduce((sum, item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unitPrice) || 0;
        return sum + qty * price;
      }, 0);
      const threshold = Number(settings.freeDeliveryThreshold) || 0;
      const stateKey = deliveryStateKey(options.state);
      const configuredFee = settings.deliveryFees && Object.prototype.hasOwnProperty.call(settings.deliveryFees, stateKey)
        ? Number(settings.deliveryFees[stateKey])
        : 0;
      const stateFee = Number.isFinite(configuredFee) && configuredFee >= 0 ? configuredFee : 0;
      const deliveryFee = stateFee;
      let discount = 0;
      if (options.promo) {
        const promo = options.promo;
        if (promo.type === "percent") discount = Math.round(subtotal * (Number(promo.value) / 100));
        else if (promo.type === "fixed") discount = Math.min(Number(promo.value) || 0, subtotal);
      }
      const total = Math.max(0, subtotal + deliveryFee - discount);
      return { subtotal, deliveryFee, discount, total, freeDeliveryThreshold: threshold, deliveryState: stateKey, itemCount: items.reduce((n, i) => n + (Number(i.quantity) || 0), 0) };
    },
    allowedTransitions(status) { return ALLOWED_TRANSITIONS[status] || []; },
    canTransition(from, to) { return OrderCalc.allowedTransitions(from).includes(to); }
  };

  /* ---------- Address helpers ----------
     Simplified single-address model:
       { fullName, phone, lga, street, state, country, notes }
     Legacy fields (line1, line2, city, postalCode) are still tolerated
     on read so older orders keep rendering.
  ------------------------------------------------ */
  const Address = {
    empty() { return { fullName: "", phone: "", lga: "", street: "", state: "", country: "Nigeria", notes: "" }; },
    normalize(raw) {
      const r = raw || {};
      return {
        fullName: (r.fullName || "").trim(),
        phone: (r.phone || "").trim(),
        lga: (r.lga || r.city || "").trim(),
        street: (r.street || r.line1 || "").trim(),
        state: (r.state || "").trim(),
        country: (r.country || "Nigeria").trim(),
        notes: (r.notes || "").trim()
      };
    },
    validate(a) {
      const errors = [];
      if (!a.fullName) errors.push("Full name is required.");
      if (!a.phone) errors.push("Phone is required.");
      if (!a.lga) errors.push("Local Government Area is required.");
      if (!a.street) errors.push("Street address is required.");
      if (!a.state) errors.push("State is required.");
      if (!a.country) errors.push("Country is required.");
      return errors;
    },
    format(a) {
      const n = Address.normalize(a);
      return `${n.street}, ${n.lga}, ${n.state}, ${n.country}`;
    }
  };

  /* ---------- Upload helpers (base64 in localStorage) ---------- */
  const Uploads = {
    MAX_BYTES: 2 * 1024 * 1024, // 2 MB — localStorage limits are tight
    ALLOWED_IMAGES: ["image/png", "image/jpeg", "image/webp"],
    ALLOWED_RECEIPTS: ["image/png", "image/jpeg", "image/webp", "application/pdf"],
    validate(file, allowedTypes) {
      if (!file) return { ok: false, error: "No file selected." };
      if (!allowedTypes.includes(file.type)) {
        return { ok: false, error: "Unsupported file type. Allowed: " + allowedTypes.map(t => t.split("/")[1]).join(", ") };
      }
      if (file.size > Uploads.MAX_BYTES) {
        return { ok: false, error: "File is too large. Maximum 2 MB." };
      }
      return { ok: true };
    },
    fileToDataURL(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read the file."));
        reader.onload = () => resolve(String(reader.result || ""));
        reader.readAsDataURL(file);
      });
    },
    optimizeImage(file, maxChars = 260000) {
      return Uploads.fileToDataURL(file).then((source) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onerror = () => reject(new Error("Could not open the selected image."));
        image.onload = () => {
          let scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
          let result = "";
          try {
            for (let attempt = 0; attempt < 12; attempt += 1) {
              const canvas = document.createElement("canvas");
              canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
              canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
              const context = canvas.getContext("2d", { alpha: false });
              if (!context) throw new Error("Image editing is not supported in this browser.");
              context.fillStyle = "#ffffff";
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.drawImage(image, 0, 0, canvas.width, canvas.height);
              const quality = Math.max(0.48, 0.84 - attempt * 0.045);
              result = canvas.toDataURL("image/jpeg", quality);
              if (result.length <= maxChars) { resolve(result); return; }
              scale *= 0.86;
            }
            reject(new Error("This image is still too large after compression. Choose a smaller photo."));
          } catch (error) {
            reject(error);
          }
        };
        image.src = source;
      }));
    }
  };

  function trackVisit() {
    if (sessionStorage.getItem("ap_visit_tracked")) return;
    Collections.visitors.trackVisit();
    sessionStorage.setItem("ap_visit_tracked", "1");
  }

  window.AP = {
    KEYS, storage, uid, orderRef, nowISO, formatNaira, formatDate, formatDateTime,
    Collections, Session, Auth, OrderCalc, ORDER_STATUSES, Address, Uploads, NIGERIAN_STATES, deliveryStateKey,
    sharedConnected: () => sharedReady,
    getLastOrderError: () => lastOrderError,
    trackVisit, seed
  };

  AP.seed();
  repairSeedImages();
  AP.trackVisit();
})();
