/* ============================================================
   ANKARA PALACE — SHARED HEADER & FOOTER (MODIFIED)
   Changes:
     - When a customer is authenticated, the header hides
       Home, Shop, Collections, About, Contact. Guests still see
       them so the site is discoverable.
     - Footer is a compact 3-column layout that includes About
       and Contact (per spec: About and Contact live only in
       the footer for customers).
     - Footer no longer includes Shop/Collections quick links.
   ============================================================ */

(function () {
  "use strict";

  function isActive(href) {
    const path = window.location.pathname.split("/").pop() || "index.html";
    return path === href ? 'aria-current="page"' : "";
  }

  function renderHeader() {
    const mount = document.getElementById("site-header");
    if (!mount) return;

    const customer = AP.Session.getCustomer();
    const isLoggedIn = Boolean(customer);
    const page = window.location.pathname.split("/").pop() || "index.html";
    const showCart = page === "shop.html" || page === "product.html";
    const cartLink = showCart
      ? '<a href="cart.html" class="btn btn--ghost btn--sm"><i class="fa-solid fa-cart-shopping"></i> Cart <span data-cart-count></span></a>'
      : "";
    const mobileCartLink = showCart
      ? '<a href="cart.html" class="header-cart-mobile" aria-label="View cart"><i class="fa-solid fa-cart-shopping" aria-hidden="true"></i><span class="visually-hidden">Cart</span><span data-cart-count></span></a>'
      : "";

    // Guest-visible links (customer-visible links are hidden once logged in)
    const discoverLinks = `
      <a href="index.html" ${isActive("index.html")} data-ap-guest-only>Home</a>
      <a href="shop.html" ${isActive("shop.html")} data-ap-guest-only>Shop</a>
      <a href="collections.html" ${isActive("collections.html")} data-ap-guest-only>Collections</a>
    `;

    const authActions = isLoggedIn
      ? `
        ${cartLink}
        <a href="shop.html" class="btn btn--outline btn--sm">
          <i class="fa-solid fa-bag-shopping"></i> Shop
        </a>
        <a href="customer-dashboard.html" class="btn btn--ghost btn--sm">
          <i class="fa-regular fa-user"></i> My Account
        </a>
      `
      : `
        ${cartLink}
        <a href="login.html" class="btn btn--ghost btn--sm">Login</a>
        <a href="signup.html" class="btn btn--primary btn--sm">Sign Up</a>
      `;

    mount.className = "site-header";
    mount.innerHTML = `
      <div class="container">
        <div class="header-inner">
          <a href="index.html" class="logo" aria-label="Ankara Palace home">
            <span class="logo__mark">AP</span>
            <span>Ankara Palace</span>
          </a>

          <nav class="nav-primary" aria-label="Primary">
            ${discoverLinks}
          </nav>

          <div class="nav-actions nav-actions--desktop">
            ${authActions}
          </div>

          ${mobileCartLink}

          <button class="nav-toggle" id="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-menu">
            <i class="fa-solid fa-bars" style="font-size:1.25rem;"></i>
          </button>
        </div>
      </div>

      <div class="mobile-menu" id="mobile-menu">
        <div class="container mobile-menu__inner">
          ${discoverLinks}
          <a href="faq.html" ${isActive("faq.html")} data-ap-guest-only>FAQ</a>
          ${isLoggedIn
            ? `<a href="shop.html" class="btn btn--emerald">Shop</a>
               <a href="customer-dashboard.html" class="btn btn--outline">My Account</a>`
            : `<a href="login.html" class="btn btn--ghost">Login</a>
               <a href="signup.html" class="btn btn--primary">Sign Up</a>`}
        </div>
      </div>
    `;

    // Hide guest-only links when the customer is logged in.
    if (isLoggedIn) {
      mount.querySelectorAll("[data-ap-guest-only]").forEach((el) => el.remove());
    }

    try {
      const count = (AP.storage.get("ap_cart", []) || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      mount.querySelectorAll("[data-cart-count]").forEach((el) => { el.textContent = count ? `(${count})` : ""; });
    } catch (_) {}

    document.addEventListener("ap:cart-updated", (event) => {
      const count = Number(event.detail?.count) || 0;
      mount.querySelectorAll("[data-cart-count]").forEach((el) => { el.textContent = count ? `(${count})` : ""; });
    });

    const toggle = document.getElementById("nav-toggle");
    const menu = document.getElementById("mobile-menu");
    if (toggle && menu) {
      toggle.addEventListener("click", () => {
        const open = menu.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(open));
        toggle.querySelector("i").className = open ? "fa-solid fa-xmark" : "fa-solid fa-bars";
      });
    }

    const header = mount;
    const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function renderFooter() {
    const mount = document.getElementById("site-footer");
    if (!mount) return;

    const settings = AP.Collections.settings.get();
    const customer = AP.Session.getCustomer();
    const isLoggedIn = Boolean(customer);

    // Guest footer includes Shop/Collections; logged-in footer omits them
    // (the spec removes these from navigation once authenticated).
    const shopColumn = isLoggedIn ? "" : `
      <div>
        <h4>Shop</h4>
        <ul class="footer-links">
          <li><a href="shop.html">All Fabrics</a></li>
          <li><a href="collections.html">Collections</a></li>
          <li><a href="faq.html">FAQ</a></li>
        </ul>
      </div>
    `;

    mount.className = "site-footer";
    mount.innerHTML = `
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <a href="index.html" class="logo">
              <span class="logo__mark">AP</span>
              <span>Ankara Palace</span>
            </a>
            <p>Premium African textiles, thoughtfully selected. Discover Ankara, Aso-Oke, Adire and lace for your next special moment.</p>
            <div class="footer-social">
              <a href="https://instagram.com" target="_blank" rel="noopener" aria-label="Instagram">
                <i class="fa-brands fa-instagram"></i>
              </a>
              <a href="https://facebook.com" target="_blank" rel="noopener" aria-label="Facebook">
                <i class="fa-brands fa-facebook-f"></i>
              </a>
              <a href="https://wa.me/${(settings.whatsapp || "").replace(/[^\d]/g, "")}" target="_blank" rel="noopener" aria-label="WhatsApp">
                <i class="fa-brands fa-whatsapp"></i>
              </a>
            </div>
          </div>

          ${shopColumn}

          <div>
            <h4>Company</h4>
            <ul class="footer-links">
              <li><a href="about.html">About Us</a></li>
              <li><a href="contact.html">Contact</a></li>
              <li><a href="faq.html">FAQ</a></li>
              ${isLoggedIn ? "" : `<li><a href="login.html">Customer Login</a></li>`}
            </ul>
          </div>

          <div>
            <h4>Contact</h4>
            <ul class="footer-contact">
              <li><i class="fa-solid fa-location-dot"></i><span>${UI.escapeHtml(settings.address || "Lagos, Nigeria")}</span></li>
              <li><i class="fa-solid fa-envelope"></i><span>${UI.escapeHtml(settings.storeEmail || "")}</span></li>
              <li><i class="fa-solid fa-phone"></i><span>${UI.escapeHtml(settings.storePhone || "")}</span></li>
            </ul>
          </div>
        </div>

        <div class="footer-bottom">
          <span>&copy; ${new Date().getFullYear()} Ankara Palace. All rights reserved.</span>
          <a href="#main">Back to top <i class="fa-solid fa-arrow-up" aria-hidden="true"></i></a>
        </div>
      </div>
    `;
  }

  function init() {
    renderHeader();
    renderFooter();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
