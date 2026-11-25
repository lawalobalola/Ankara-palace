/* ============================================================
   ANKARA PALACE — CENTRAL DATA LAYER (MODIFIED)
   See previous delivery for the full rationale.
   Changes in this version:
     - Order status flow aligned with customer journey:
         Pending → Awaiting Payment → (payment confirmed)
              → Accepted → (shipped) → Ready to Dispatch
              → Shipped → Delivered
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
    visitors: "ap_visitors",
    logs: "ap_admin_logs",
    sessionCustomer: "ap_session_customer",
    sessionAdmin: "ap_session_admin",
    seeded: "ap_seeded_v1",
    newsletter: "ap_newsletter",
    settings: "ap_settings"
  };

  const storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        if (raw === null) return fallback;
        return JSON.parse(raw);
      } catch (err) {
        console.warn("[AP.Db] Corrupt stored value for", key, "— resetting to fallback.");
        try { localStorage.removeItem(key); } catch (_) {}
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (err) {
        console.error("[AP.Db] Unable to persist", key, err);
        return false;
      }
    },
    remove(key) { try { localStorage.removeItem(key); } catch (_) {} }
  };

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
    if (storage.get(KEYS.seeded, false)) return;
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
      deliveryFee: 3500,
      freeDeliveryThreshold: 100000,
      currency: "NGN",
      announcement: "Welcome to Ankara Palace — Bringing African Fabric and Elegance to the World."
    });
    storage.set(KEYS.seeded, true);
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
      all: () => storage.get(KEYS.customers, []),
      byId: (id) => Collections.customers.all().find((c) => c.id === id) || null,
      byEmail: (email) => Collections.customers.all().find((c) => (c.email || "").toLowerCase() === (email || "").toLowerCase()) || null,
      save: (list) => storage.set(KEYS.customers, list),
      add: (customer) => { const list = Collections.customers.all(); list.push(customer); Collections.customers.save(list); return customer; },
      update: (id, patch) => {
        const list = Collections.customers.all();
        const idx = list.findIndex((c) => c.id === id);
        if (idx === -1) return null;
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
      add: (product) => { const list = Collections.products.all(); list.push(product); Collections.products.save(list); return product; },
      update: (id, patch) => {
        const list = Collections.products.all();
        const idx = list.findIndex((p) => p.id === id);
        if (idx === -1) return null;
        list[idx] = { ...list[idx], ...patch };
        Collections.products.save(list);
        return list[idx];
      },
      remove: (id) => { const list = Collections.products.all().filter((p) => p.id !== id); Collections.products.save(list); }
    },
    categories: {
      all: () => storage.get(KEYS.categories, []),
      byId: (id) => Collections.categories.all().find((c) => c.id === id) || null,
      bySlug: (slug) => Collections.categories.all().find((c) => c.slug === slug) || null,
      save: (list) => storage.set(KEYS.categories, list)
    },
    orders: {
      all: () => storage.get(KEYS.orders, []),
      byId: (id) => Collections.orders.all().find((o) => o.id === id) || null,
      byRef: (ref) => Collections.orders.all().find((o) => o.ref === ref) || null,
      byCustomer: (customerId) => Collections.orders.all().filter((o) => o.customerId === customerId),
      save: (list) => storage.set(KEYS.orders, list),
      add: (order) => { const list = Collections.orders.all(); list.push(order); Collections.orders.save(list); return order; },
      update: (id, patch) => {
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
      save: (patch) => { const s = { ...Collections.settings.get(), ...patch }; storage.set(KEYS.settings, s); return s; }
    }
  };

  /* ---------- Session ---------- */
  const Session = {
    loginCustomer(customer) {
      storage.set(KEYS.sessionCustomer, { id: customer.id, email: customer.email, name: customer.name, loggedInAt: nowISO() });
    },
    getCustomer() { return storage.get(KEYS.sessionCustomer, null); },
    logoutCustomer() { storage.remove(KEYS.sessionCustomer); },
    loginAdmin(admin) {
      storage.set(KEYS.sessionAdmin, { id: admin.id, email: admin.email, name: admin.name, loggedInAt: nowISO() });
      Collections.logs.add({ action: "admin_login", email: admin.email });
    },
    getAdmin() { return storage.get(KEYS.sessionAdmin, null); },
    logoutAdmin() {
      const admin = Session.getAdmin();
      if (admin) Collections.logs.add({ action: "admin_logout", email: admin.email });
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
    registerCustomer({ name, email, phone, password }) {
      if (Collections.customers.byEmail(email)) return { ok: false, error: "An account with this email already exists." };
      const customer = {
        id: uid("cust-"), name: name.trim(), email: email.trim().toLowerCase(),
        phone: phone.trim(), passwordHash: hashDemo(password),
        avatarDataUrl: null, createdAt: nowISO()
      };
      Collections.customers.add(customer);
      return { ok: true, customer };
    },
    loginCustomer(email, password) {
      const customer = Collections.customers.byEmail(email);
      if (!customer) return { ok: false, error: "No account found with this email." };
      if (customer.passwordHash !== hashDemo(password)) return { ok: false, error: "Incorrect password. Please try again." };
      Session.loginCustomer(customer);
      return { ok: true, customer };
    },
    loginAdmin(email, password) {
      const admin = Collections.admin.byEmail(email);
      if (!admin) return { ok: false, error: "Invalid administrator credentials." };
      if (admin.password !== password) return { ok: false, error: "Invalid administrator credentials." };
      Session.loginAdmin(admin);
      return { ok: true, admin };
    },
    resetPassword(email, newPassword) {
      const customer = Collections.customers.byEmail(email);
      if (!customer) return { ok: false, error: "No account found with this email." };
      Collections.customers.update(customer.id, { passwordHash: hashDemo(newPassword) });
      return { ok: true };
    }
  };

  /* ---------- Order statuses & transitions ----------
     Required customer-facing flow:
       Pending → Awaiting Payment → (payment confirmed)
            → Accepted → (shipped) → Ready to Dispatch
            → Shipped → Delivered
     The admin-only transitions mirror this and prevent skipping steps.
     Rejected / Cancelled are terminal.
  ---------------------------------------------- */
  const ORDER_STATUSES = [
    "Pending",
    "Awaiting Payment",
    "Accepted",
    "Ready to Dispatch",
    "Shipped",
    "Delivered",
    "Rejected",
    "Cancelled"
  ];

  const ALLOWED_TRANSITIONS = {
    "Pending": ["Awaiting Payment", "Cancelled"],
    "Awaiting Payment": ["Accepted", "Cancelled"],
    "Accepted": ["Ready to Dispatch", "Cancelled"],
    "Ready to Dispatch": ["Shipped"],
    "Shipped": ["Delivered"],
    "Delivered": [],
    "Rejected": [],
    "Cancelled": []
  };

  const OrderCalc = {
    calculate(items, options = {}) {
      const settings = Collections.settings.get();
      const subtotal = items.reduce((sum, item) => {
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unitPrice) || 0;
        return sum + qty * price;
      }, 0);
      const threshold = Number(settings.freeDeliveryThreshold) || 0;
      const baseFee = Number(settings.deliveryFee) || 0;
      const deliveryFee = subtotal >= threshold ? 0 : baseFee;
      let discount = 0;
      if (options.promo) {
        const promo = options.promo;
        if (promo.type === "percent") discount = Math.round(subtotal * (Number(promo.value) / 100));
        else if (promo.type === "fixed") discount = Math.min(Number(promo.value) || 0, subtotal);
      }
      const total = Math.max(0, subtotal + deliveryFee - discount);
      return { subtotal, deliveryFee, discount, total, freeDeliveryThreshold: threshold, itemCount: items.reduce((n, i) => n + (Number(i.quantity) || 0), 0) };
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
    }
  };

  function trackVisit() {
    if (sessionStorage.getItem("ap_visit_tracked")) return;
    Collections.visitors.trackVisit();
    sessionStorage.setItem("ap_visit_tracked", "1");
  }

  window.AP = {
    KEYS, storage, uid, orderRef, nowISO, formatNaira, formatDate, formatDateTime,
    Collections, Session, Auth, OrderCalc, ORDER_STATUSES, Address, Uploads,
    trackVisit, seed
  };

  AP.seed();
  repairSeedImages();
  AP.trackVisit();
})();
