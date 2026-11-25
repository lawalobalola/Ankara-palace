/* ============================================================
   ANKARA PALACE — AUTHENTICATION CONTROLLER
   Handles signup, login, forgot password, admin login.
   FRONTEND DEMO ONLY — see db.js for security notes.

   UPDATE:
   - Successful customer signup now redirects to shop.html
     (or the previously intended page via ?redirect=).
   - Successful customer login does the same.
   - Homepage restriction is enforced on index.html itself
     (see index.html inline guard), so no change is needed
     here for that rule.
   ============================================================ */

(function () {
  "use strict";

  const { $, toastSuccess, toastError, Validate, fieldError } = UI;

  function getRedirect() {
    return new URLSearchParams(location.search).get("redirect") || "";
  }

  // Only allow internal, safe-looking paths. Never allow external URLs.
  function safeRedirect(fallback) {
    const redirect = getRedirect();
    if (
      redirect &&
      /^[a-zA-Z0-9._\-/?=&]+$/.test(redirect) &&
      !redirect.startsWith("http")
    ) {
      return redirect;
    }
    return fallback;
  }

  function goToRedirect(fallback) {
    location.href = safeRedirect(fallback);
  }

  function showAlert(mountId, message, type = "error") {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    mount.innerHTML = `<div class="alert alert--${type}">${UI.escapeHtml(message)}</div>`;
  }

  function clearAlert(mountId) {
    const mount = document.getElementById(mountId);
    if (mount) mount.innerHTML = "";
  }

  /* ---------- Sign Up ---------- */
  function initSignup() {
    const form = document.getElementById("signup-form");
    if (!form) return;

    const nameInput = $("#su-name");
    const emailInput = $("#su-email");
    const phoneInput = $("#su-phone");
    const pwInput = $("#su-password");
    const confirmInput = $("#su-confirm");
    const termsInput = $("#su-terms");
    const pwStrength = $("#pw-strength");
    const pwFill = $("#pw-fill");
    const pwHint = $("#pw-hint");

    if (pwInput && pwStrength) {
      pwInput.addEventListener("input", () => {
        const value = pwInput.value;
        if (!value) {
          pwStrength.hidden = true;
          return;
        }
        pwStrength.hidden = false;
        const { score, checks } = Validate.passwordStrength(value);
        const pct = (score / 5) * 100;
        pwFill.style.width = pct + "%";
        pwFill.classList.toggle("is-medium", score >= 3 && score < 4);
        pwFill.classList.toggle("is-strong", score >= 4);
        const missing = [];
        if (!checks.length) missing.push("8+ characters");
        if (!checks.upper) missing.push("an uppercase letter");
        if (!checks.lower) missing.push("a lowercase letter");
        if (!checks.number) missing.push("a number");
        if (!checks.symbol) missing.push("a symbol");
        pwHint.textContent = missing.length ? `Add ${missing.join(", ")}.` : "Strong password.";
      });
    }

    const termsLink = document.getElementById("terms-link");
    if (termsLink) {
      termsLink.addEventListener("click", (e) => {
        e.preventDefault();
        UI.openModal({
          title: "Terms and Conditions",
          content: `<p>This is a demonstration environment. By creating an account you acknowledge that:</p>
            <ul style="list-style:disc;padding-left:20px;margin-top:12px;">
              <li>Data is stored only in this browser via localStorage.</li>
              <li>Accounts are not real production accounts.</li>
              <li>No payment information is collected or processed.</li>
            </ul>`,
          actions: [{ label: "Close", className: "btn--primary" }]
        });
      });
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearAlert("signup-alert");
      [nameInput, emailInput, phoneInput, pwInput, confirmInput].forEach((f) => f && fieldError(f, ""));

      let valid = true;
      if (!Validate.required(nameInput.value)) { fieldError(nameInput, "Please enter your full name."); valid = false; }
      if (!Validate.email(emailInput.value)) { fieldError(emailInput, "Please enter a valid email address."); valid = false; }
      if (!Validate.phone(phoneInput.value)) { fieldError(phoneInput, "Please enter a valid phone number."); valid = false; }
      const strength = Validate.passwordStrength(pwInput.value);
      if (!strength.strong) {
        fieldError(pwInput, "Password must be at least 8 characters and include letters, numbers and a symbol.");
        valid = false;
      }
      if (pwInput.value !== confirmInput.value) {
        fieldError(confirmInput, "Passwords do not match."); valid = false;
      }
      if (!termsInput.checked) {
        showAlert("signup-alert", "Please agree to the Terms and Conditions to continue.");
        valid = false;
      }
      if (!valid) return;

      const result = AP.Auth.registerCustomer({
        name: nameInput.value,
        email: emailInput.value,
        phone: phoneInput.value,
        password: pwInput.value
      });

      if (!result.ok) {
        showAlert("signup-alert", result.error);
        return;
      }

      AP.Session.loginCustomer(result.customer);
      toastSuccess("Welcome to Ankara Palace!");

      // UPDATE: land on shop.html by default; honour ?redirect= if present.
      setTimeout(() => goToRedirect("shop.html"), 500);
    });
  }

  /* ---------- Login ---------- */
  function initLogin() {
    const form = document.getElementById("login-form");
    if (!form) return;

    const emailInput = $("#li-email");
    const pwInput = $("#li-password");
    const rememberInput = $("#li-remember");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearAlert("login-alert");
      [emailInput, pwInput].forEach((f) => f && fieldError(f, ""));

      let valid = true;
      if (!Validate.email(emailInput.value)) { fieldError(emailInput, "Please enter a valid email address."); valid = false; }
      if (!Validate.required(pwInput.value)) { fieldError(pwInput, "Please enter your password."); valid = false; }
      if (!valid) return;

      const result = AP.Auth.loginCustomer(emailInput.value, pwInput.value);
      if (!result.ok) {
        showAlert("login-alert", result.error);
        return;
      }

      if (rememberInput && rememberInput.checked) {
        AP.storage.set("ap_remember_email", emailInput.value.trim().toLowerCase());
      } else {
        AP.storage.remove("ap_remember_email");
      }

      toastSuccess("Signed in successfully.");

      // UPDATE: land on shop.html by default; honour ?redirect= if present.
      setTimeout(() => goToRedirect("shop.html"), 400);
    });

    const remembered = AP.storage.get("ap_remember_email", "");
    if (remembered && emailInput) {
      emailInput.value = remembered;
      if (rememberInput) rememberInput.checked = true;
    }
  }

  /* ---------- Forgot Password ---------- */
  function initForgot() {
    const form = document.getElementById("forgot-form");
    if (!form) return;

    const emailInput = $("#fp-email");
    const pwInput = $("#fp-password");
    const confirmInput = $("#fp-confirm");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearAlert("forgot-alert");
      [emailInput, pwInput, confirmInput].forEach((f) => f && fieldError(f, ""));

      let valid = true;
      if (!Validate.email(emailInput.value)) { fieldError(emailInput, "Please enter a valid email address."); valid = false; }
      const strength = Validate.passwordStrength(pwInput.value);
      if (!strength.strong) {
        fieldError(pwInput, "Password must be at least 8 characters and include letters, numbers and a symbol.");
        valid = false;
      }
      if (pwInput.value !== confirmInput.value) {
        fieldError(confirmInput, "Passwords do not match."); valid = false;
      }
      if (!valid) return;

      const result = AP.Auth.resetPassword(emailInput.value, pwInput.value);
      if (!result.ok) {
        showAlert("forgot-alert", result.error);
        return;
      }

      showAlert("forgot-alert", "Password updated successfully. You may now sign in.", "success");
      toastSuccess("Password reset. Redirecting to sign in…");
      setTimeout(() => { location.href = "login.html"; }, 1200);
    });
  }

  /* ---------- Admin Login ---------- */
  function initAdminLogin() {
    const form = document.getElementById("admin-login-form");
    if (!form) return;

    const emailInput = $("#al-email");
    const pwInput = $("#al-password");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearAlert("admin-alert");
      [emailInput, pwInput].forEach((f) => f && fieldError(f, ""));

      let valid = true;
      if (!Validate.email(emailInput.value)) { fieldError(emailInput, "Please enter a valid admin email."); valid = false; }
      if (!Validate.required(pwInput.value)) { fieldError(pwInput, "Please enter your password."); valid = false; }
      if (!valid) return;

      const result = AP.Auth.loginAdmin(emailInput.value, pwInput.value);
      if (!result.ok) {
        showAlert("admin-alert", result.error);
        return;
      }

      toastSuccess("Administrator signed in.");
      setTimeout(() => { location.href = "admin.html"; }, 400);
    });
  }

  function init() {
    initSignup();
    initLogin();
    initForgot();
    initAdminLogin();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();