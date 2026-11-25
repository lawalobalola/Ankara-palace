/* ============================================================
   ANKARA PALACE — LIVE.JS
   ------------------------------------------------------------
   Progressive enhancement layer. Adds:
   - Page load / section reveal animations
   - Scroll-to-top button
   - Smooth scrolling for anchor links
   - Button hover + press micro-interactions
   - Button loading states
   - Image fade-in on load
   - Live quantity/summary recalc (observes existing forms)
   - Toast/modal entrance animations
   - Empty-state fade
   - Mobile nav improvements
   - Active navigation indicators (already handled by nav.js,
     but we layer an underline transition for smoothness)

   RULES:
   - Never touches localStorage / sessionStorage.
   - Never redefines AP / UI functions.
   - Uses event delegation for dynamically injected content.
   - Safe to load on every page, including admin.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Guard: no double init ---------- */
  if (window.__apLiveInitialised) return;
  window.__apLiveInitialised = true;

  const prefersReducedMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  /* ---------- Global styles injected once ---------- */
  const STYLE_ID = "ap-live-styles";
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const css = `
      /* Reveal animations */
      [data-ap-reveal] {
        opacity: 0;
        transform: translateY(18px);
        transition: opacity 620ms cubic-bezier(.22,.61,.36,1),
                    transform 620ms cubic-bezier(.22,.61,.36,1);
        will-change: opacity, transform;
      }
      [data-ap-reveal].ap-visible {
        opacity: 1;
        transform: none;
      }
      [data-ap-reveal="fade"] { transform: none; }
      [data-ap-reveal="left"] { transform: translateX(-24px); }
      [data-ap-reveal="right"] { transform: translateX(24px); }
      [data-ap-reveal="scale"] { transform: scale(0.96); }
      [data-ap-reveal="left"].ap-visible,
      [data-ap-reveal="right"].ap-visible,
      [data-ap-reveal="scale"].ap-visible { transform: none; }

      /* Page fade-in on load */
      body.ap-loading { opacity: 0; }
      body.ap-loaded {
        opacity: 1;
        transition: opacity 320ms ease-out;
      }

      /* Image fade-in */
      img[data-ap-img] {
        opacity: 0;
        transition: opacity 400ms ease-out;
      }
      img[data-ap-img].ap-img-loaded { opacity: 1; }

      /* Button press */
      .btn { position: relative; overflow: hidden; }
      .btn.ap-pressed { transform: scale(0.97); }

      /* Button loading spinner */
      .btn.ap-is-loading {
        pointer-events: none;
        color: transparent !important;
      }
      .btn.ap-is-loading::after {
        content: "";
        position: absolute;
        top: 50%; left: 50%;
        width: 16px; height: 16px;
        margin: -8px 0 0 -8px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 50%;
        animation: ap-spin 700ms linear infinite;
        color: #fff;
        border-color: rgba(255,255,255,0.5);
        border-right-color: #fff;
      }
      .btn--outline.ap-is-loading::after,
      .btn--ghost.ap-is-loading::after {
        border-color: rgba(37,41,37,0.3);
        border-right-color: #252925;
      }

      /* Scroll-to-top */
      .ap-scroll-top {
        position: fixed;
        right: 24px;
        bottom: 24px;
        width: 46px;
        height: 46px;
        border-radius: 50%;
        background: #174C3C;
        color: #F7F3EA;
        display: grid;
        place-items: center;
        font-size: 0.95rem;
        box-shadow: 0 10px 24px rgba(23,76,60,0.35);
        opacity: 0;
        transform: translateY(16px) scale(0.9);
        pointer-events: none;
        transition: opacity 260ms ease, transform 260ms ease, background 200ms ease;
        z-index: 9000;
      }
      .ap-scroll-top.ap-visible {
        opacity: 1;
        transform: none;
        pointer-events: auto;
      }
      .ap-scroll-top:hover { background: #B65F43; }
      .ap-scroll-top:active { transform: scale(0.94); }
      @media (max-width: 480px) {
        .ap-scroll-top { right: 16px; bottom: 16px; width: 42px; height: 42px; }
      }

      /* Smooth hover lift for product cards (fallback for older browsers) */
      .product-card:hover { transform: translateY(-4px); }

      /* Nav underline smoother than default */
      .nav-primary a::after { transition: transform 240ms cubic-bezier(.22,.61,.36,1); }

      /* Toast entrance polish */
      .toast { animation: ap-toast-in 280ms cubic-bezier(.22,.61,.36,1) both; }
      @keyframes ap-toast-in {
        from { opacity: 0; transform: translateY(12px) scale(0.98); }
        to   { opacity: 1; transform: none; }
      }

      /* Modal entrance polish */
      .modal { animation: ap-modal-in 260ms cubic-bezier(.22,.61,.36,1) both; }
      .modal-backdrop { animation: ap-fade-in 200ms ease-out both; }
      @keyframes ap-modal-in {
        from { opacity: 0; transform: translateY(10px) scale(0.98); }
        to   { opacity: 1; transform: none; }
      }
      @keyframes ap-fade-in { from { opacity: 0; } to { opacity: 1; } }

      /* Empty-state fade */
      .empty-state { animation: ap-fade-in 500ms ease-out both; }

      /* Section reveal for dynamically inserted content via MutationObserver */
      .ap-fade-in { animation: ap-fade-in 400ms ease-out both; }

      /* Spin keyframe used by button loader */
      @keyframes ap-spin { to { transform: rotate(360deg); } }

      /* Skeleton shimmer (optional utility) */
      .ap-skeleton {
        background: linear-gradient(90deg, #EFE8D9 0%, #F7F3EA 50%, #EFE8D9 100%);
        background-size: 200% 100%;
        animation: ap-shimmer 1200ms ease-in-out infinite;
      }
      @keyframes ap-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      /* Respect reduced motion */
      @media (prefers-reduced-motion: reduce) {
        [data-ap-reveal] { opacity: 1 !important; transform: none !important; transition: none !important; }
        body.ap-loading { opacity: 1; }
        .toast, .modal, .modal-backdrop, .empty-state, .ap-fade-in { animation: none !important; }
        .ap-scroll-top { transition: none !important; }
      }
    `;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ---------- Page load fade ---------- */
  function initPageFade() {
    if (prefersReducedMotion) {
      document.body.classList.add("ap-loaded");
      return;
    }
    document.body.classList.add("ap-loading");
    const onReady = () => {
      requestAnimationFrame(() => {
        document.body.classList.remove("ap-loading");
        document.body.classList.add("ap-loaded");
      });
    };
    if (document.readyState === "complete") onReady();
    else window.addEventListener("load", onReady, { once: true });
  }

  /* ---------- Scroll reveal ---------- */
  let revealObserver = null;
  function ensureRevealObserver() {
    if (revealObserver || !("IntersectionObserver" in window) || prefersReducedMotion) return;
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("ap-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
  }

  function tagRevealTargets() {
    // Avoid re-tagging already tagged elements.
    const selectors = [
      ".section-head",
      ".why-card",
      ".testimonial",
      ".collection-card",
      ".product-card",
      ".admin-stat",
      ".dash-stat",
      ".dash-card",
      ".order-row",
      ".faq-item",
      ".about-hero__grid > *",
      ".about-story__grid > *",
      ".mv-card",
      ".checkout-panel",
      ".auth-card",
      ".page-banner h1"
    ];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (el.hasAttribute("data-ap-reveal")) return;
        el.setAttribute("data-ap-reveal", "fade");
        if (revealObserver) revealObserver.observe(el);
        else el.classList.add("ap-visible");
      });
    });
  }

  /* ---------- Image fade-in ---------- */
  function tagImages(root) {
    (root || document).querySelectorAll("img:not([data-ap-img])").forEach((img) => {
      img.setAttribute("data-ap-img", "");
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add("ap-img-loaded");
      } else {
        img.addEventListener("load", () => img.classList.add("ap-img-loaded"), { once: true });
        img.addEventListener("error", () => img.classList.add("ap-img-loaded"), { once: true });
      }
    });
  }

  /* ---------- Smooth scrolling for same-page anchors ---------- */
  function initSmoothAnchors() {
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href === "#" || href.length < 2) return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const offset = 76; // header height
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: prefersReducedMotion ? "auto" : "smooth"
      });
    });
  }

  /* ---------- Scroll-to-top ---------- */
  function initScrollTop() {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ap-scroll-top";
    btn.setAttribute("aria-label", "Scroll to top");
    btn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
    document.body.appendChild(btn);

    let ticking = false;
    const update = () => {
      const y = window.scrollY || window.pageYOffset;
      btn.classList.toggle("ap-visible", y > 500);
      ticking = false;
    };
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });

    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
    });

    update();
  }

  /* ---------- Button press + loading helper ---------- */
  const LOADING_CLASS = "ap-is-loading";

  function isFormSubmittingButton(btn) {
    if (!btn || btn.tagName !== "BUTTON") return false;
    if (btn.type === "submit") return true;
    // Buttons inside forms without type default to submit
    if (!btn.type && btn.closest("form")) return true;
    return false;
  }

  function initButtonMicroInteractions() {
    // Press effect
    document.addEventListener("pointerdown", (e) => {
      const btn = e.target.closest(".btn");
      if (!btn) return;
      btn.classList.add("ap-pressed");
    });
    document.addEventListener("pointerup", (e) => {
      const btn = e.target.closest(".btn");
      if (btn) btn.classList.remove("ap-pressed");
    });
    document.addEventListener("pointercancel", (e) => {
      const btn = e.target.closest(".btn");
      if (btn) btn.classList.remove("ap-pressed");
    });

    // Auto loading state for form submit buttons
    document.addEventListener("submit", (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.apLiveNoSpinner === "true") return;
      const submitBtn = form.querySelector('button[type="submit"], button:not([type])');
      if (!submitBtn || !submitBtn.classList.contains("btn")) return;
      if (submitBtn.classList.contains(LOADING_CLASS)) return;
      // Don't spin if form has novalidate with broken fields — a real submit is about to happen.
      submitBtn.classList.add(LOADING_CLASS);
      // Release on next tick if navigation didn't happen (e.g., validation failed silently)
      // The page's own submit handler may preventDefault — the click already went through
      // so we allow the spinner to run; if the page stays, we clear after a short grace.
      setTimeout(() => {
        if (document.body.contains(submitBtn)) submitBtn.classList.remove(LOADING_CLASS);
      }, 1400);
    }, true);

    // Public helper (attached to window for page scripts if they want to use it)
    window.APLive = window.APLive || {};
    window.APLive.setLoading = function (btn, isLoading) {
      if (!btn) return;
      btn.classList.toggle(LOADING_CLASS, Boolean(isLoading));
    };
  }

  /* ---------- Live summary / quantity helpers ----------
     Recalculates cart totals when quantity or unit changes on
     known forms WITHOUT overriding the page's own logic. We only
     run when we can identify the checkout summary in DOM. */
  function initLiveQuantity() {
    document.addEventListener("input", (e) => {
      const t = e.target;
      if (!t) return;
      if (t.id === "qty-input") maybeRecalcCheckout();
    });
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (!t) return;
      if (t.id === "qty-input") maybeRecalcCheckout();
    });
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("#qty-inc, #qty-dec");
      if (btn) setTimeout(maybeRecalcCheckout, 40);
    });
  }

  function maybeRecalcCheckout() {
    // The checkout controller owns the live totals; live.js does not
    // duplicate the calculation. This hook exists only to trigger
    // an optional CSS pulse on the total when it changes.
    const totalRow = document.querySelector(".summary-totals__row--grand, .product-calc__row--total");
    if (!totalRow) return;
    totalRow.style.transition = "background 300ms ease";
    totalRow.style.background = "rgba(182,95,67,0.08)";
    setTimeout(() => (totalRow.style.background = ""), 320);
  }

  /* ---------- Mobile nav polish ---------- */
  function initMobileNavPolish() {
    document.addEventListener("click", (e) => {
      const link = e.target.closest(".mobile-menu a");
      if (!link) return;
      // Let nav.js handle open/close; just add a closing animation frame
      const menu = document.getElementById("mobile-menu");
      if (menu && menu.classList.contains("is-open")) {
        menu.classList.add("ap-fade-in");
      }
    });
  }

  /* ---------- Active nav indicator ---------- */
  function initActiveNav() {
    // nav.js already sets aria-current on active links. We only refine
    // the transition so the underline animates in once on load.
    document.querySelectorAll('.nav-primary a[aria-current="page"]').forEach((a) => {
      a.style.setProperty("--ap-underline-delay", "120ms");
    });
  }

  /* ---------- Observe DOM mutations for dynamic content ---------- */
  function initMutationObserver() {
    if (!("MutationObserver" in window)) return;
    const mo = new MutationObserver((mutations) => {
      let added = false;
      for (const m of mutations) {
        if (m.addedNodes && m.addedNodes.length) {
          added = true;
          break;
        }
      }
      if (!added) return;
      tagImages(document);
      tagRevealTargets();
      tagEmptyStates();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- Empty-state fade ---------- */
  function tagEmptyStates() {
    document.querySelectorAll(".empty-state:not(.ap-fade-in)").forEach((el) => {
      el.classList.add("ap-fade-in");
    });
  }

  /* ---------- Public API for page scripts ---------- */
  function exposeHelpers() {
    window.APLive = window.APLive || {};
    window.APLive.reveal = function (root) {
      (root || document).querySelectorAll("[data-ap-reveal]").forEach((el) => {
        if (revealObserver) revealObserver.observe(el);
        else el.classList.add("ap-visible");
      });
    };
    window.APLive.pulse = function (el) {
      if (!el) return;
      el.classList.add("ap-fade-in");
      setTimeout(() => el.classList.remove("ap-fade-in"), 450);
    };
  }

  /* ---------- Init sequence ---------- */
  function init() {
    injectStyles();
    initPageFade();
    ensureRevealObserver();

    // DOM will keep changing as nav.js/header footers inject.
    // First pass on our own tick, then again after load.
    const first = () => {
      tagImages(document);
      tagRevealTargets();
      tagEmptyStates();
      initActiveNav();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", first);
    } else {
      first();
    }

    // Re-tag once the full load has happened (nav/footer injected).
    window.addEventListener("load", () => {
      tagImages(document);
      tagRevealTargets();
      tagEmptyStates();
    }, { once: true });

    // Observers & interactions (safe to attach immediately)
    initMutationObserver();
    initSmoothAnchors();
    initScrollTop();
    initButtonMicroInteractions();
    initLiveQuantity();
    initMobileNavPolish();
    exposeHelpers();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();