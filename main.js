/* ============================================================
   ANKARA PALACE — GLOBAL INITIALISER
   Runs on every page. Handles guards and page-level utilities.
   ============================================================ */

(function () {
  "use strict";

  /* Global guards: attribute-driven redirects */
  function runGuards() {
    document.querySelectorAll("[data-requires-customer]").forEach(() => {
      if (!AP.Session.getCustomer()) {
        const redirect = encodeURIComponent(location.pathname.split("/").pop());
        location.replace(`login.html?redirect=${redirect}`);
      }
    });

    document.querySelectorAll("[data-requires-admin]").forEach(() => {
      if (!AP.Session.getAdmin()) {
        location.replace("admin-login.html");
      }
    });

    // Customer-only pages should redirect logged-in customers away from auth pages
    const customer = AP.Session.getCustomer();
    if (customer) {
      const path = location.pathname.split("/").pop();
      if (path === "login.html" || path === "signup.html") {
        location.replace("customer-dashboard.html");
      }
    }

    const admin = AP.Session.getAdmin();
    if (admin && location.pathname.split("/").pop() === "admin-login.html") {
      location.replace("admin.html");
    }
  }

  /* Password visibility toggles */
  function initPasswordToggles() {
    document.querySelectorAll("[data-pw-toggle]").forEach((btn) => {
      const input = document.getElementById(btn.dataset.pwToggle);
      if (!input) return;
      btn.addEventListener("click", () => {
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.querySelector("i").className = show ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
        btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      });
    });
  }

  /* Newsletter forms (homepage + footer shared) */
  function initNewsletterForms() {
    document.querySelectorAll("[data-newsletter]").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = form.querySelector('input[type="email"]');
        if (!input || !UI.Validate.email(input.value)) {
          UI.toastError("Please enter a valid email address.");
          return;
        }
        const added = AP.Collections.newsletter.add(input.value.trim().toLowerCase());
        if (added) {
          UI.toastSuccess("Saved in this browser preview. No email was sent.");
          form.reset();
        } else {
          UI.toastInfo("This email is already saved in this browser preview.");
        }
      });
    });
  }

  /* Contact form */
  function initContactForm() {
    const form = document.getElementById("contact-form");
    if (!form) return;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = form.querySelector("#contact-name");
      const email = form.querySelector("#contact-email");
      const message = form.querySelector("#contact-message");
      let ok = true;

      [name, email, message].forEach((f) => f.classList.remove("is-invalid"));

      if (!UI.Validate.required(name.value)) { name.classList.add("is-invalid"); ok = false; }
      if (!UI.Validate.email(email.value)) { email.classList.add("is-invalid"); ok = false; }
      if (!UI.Validate.required(message.value)) { message.classList.add("is-invalid"); ok = false; }

      if (!ok) {
        UI.toastError("Please complete all required fields correctly.");
        return;
      }

      // Frontend demonstration: log the message locally.
      AP.Collections.logs.add({
        action: "contact_form",
        email: email.value.trim(),
        name: name.value.trim(),
        message: message.value.trim()
      });
      UI.toastSuccess("Your message is saved in this browser preview. It has not been sent to the store.");
      form.reset();
    });
  }

  function init() {
    runGuards();
    initPasswordToggles();
    initNewsletterForms();
    initContactForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
