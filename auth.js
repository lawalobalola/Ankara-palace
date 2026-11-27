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

  function bindResendTimer(button, sendCode) {
    if (!button) return;
    let remaining = 60;
    const original = button.textContent.trim();
    button.disabled = true;
    const tick = () => {
      button.textContent = remaining > 0 ? `Resend code in ${remaining}s` : "Resend code";
      button.disabled = remaining > 0;
      if (remaining > 0) { remaining -= 1; window.setTimeout(tick, 1000); }
    };
    tick();
    button.addEventListener("click", () => {
      if (button.disabled) return;
      sendCode();
      remaining = 60;
      tick();
    });
  }

  /* ---------- Sign Up ---------- */
  function initSignup() {
    const form = document.getElementById("signup-form");
    if (!form) return;

    const firstNameInput = $("#su-first-name");
    const lastNameInput = $("#su-last-name");
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
          content: `<p>By creating an account you acknowledge that:</p>
            <ul style="list-style:disc;padding-left:20px;margin-top:12px;">
              <li>A verification code will be sent to your email address.</li>
              <li>Your account details are used to manage your account and orders.</li>
              <li>Payments are currently handled by bank transfer.</li>
            </ul>`,
          actions: [{ label: "Close", className: "btn--primary" }]
        });
      });
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearAlert("signup-alert");
      [firstNameInput, lastNameInput, emailInput, phoneInput, pwInput, confirmInput].forEach((f) => f && fieldError(f, ""));

      let valid = true;
      if (!Validate.required(firstNameInput.value)) { fieldError(firstNameInput, "Please enter your first name."); valid = false; }
      if (!Validate.required(lastNameInput.value)) { fieldError(lastNameInput, "Please enter your last name."); valid = false; }
      if (!Validate.email(emailInput.value)) { fieldError(emailInput, "Please enter a valid email address."); valid = false; }
      if (!/^\d{11}$/.test(phoneInput.value.replace(/\D/g, ""))) { fieldError(phoneInput, "Enter 11 digits after +234."); valid = false; }
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

      const email = emailInput.value.trim().toLowerCase();
      const sent = AP.Auth.sendVerificationCode(email, {
        name: `${firstNameInput.value.trim()} ${lastNameInput.value.trim()}`,
        phone: `+234${phoneInput.value.replace(/\D/g, "")}`,
        password: pwInput.value
      });
      if (!sent.ok) {
        showAlert("signup-alert", sent.error || "We couldn't send the code. Please try again.");
        return;
      }
      sessionStorage.setItem("ap_signup_email", email);
      sessionStorage.setItem("ap_signup_pending", JSON.stringify({
        name: `${firstNameInput.value.trim()} ${lastNameInput.value.trim()}`,
        phone: `+234${phoneInput.value.replace(/\D/g, "")}`,
        password: pwInput.value
      }));
      const redirect = getRedirect();
      location.href = `signup-verify.html?email=${encodeURIComponent(email)}${redirect ? `&redirect=${encodeURIComponent(redirect)}` : ""}`;
    });
  }

  function initSignupVerification() {
    const form = document.getElementById("signup-verify-form");
    if (!form) return;
    const email = (new URLSearchParams(location.search).get("email") || sessionStorage.getItem("ap_signup_email") || "").trim().toLowerCase();
    const emailLabel = document.getElementById("signup-verify-email");
    const codeInput = $("#sv-code");
    if (!email || !Validate.email(email)) {
      showAlert("signup-verify-alert", "Your sign-up request is missing. Please start again.");
      return;
    }
    if (emailLabel) emailLabel.textContent = email;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      clearAlert("signup-verify-alert");
      if (!/^\d{6}$/.test(codeInput.value.trim())) { fieldError(codeInput, "Enter the 6-digit code from your email."); return; }
      const verified = AP.Auth.verifyCustomerCode(email, codeInput.value.trim());
      if (!verified.ok) { showAlert("signup-verify-alert", verified.error || "That code could not be verified."); return; }
      let pending = {};
      try { pending = JSON.parse(sessionStorage.getItem("ap_signup_pending") || "{}"); } catch (_) {}
      if (!pending.name || !pending.phone || !pending.password) {
        showAlert("signup-verify-alert", "Your sign-up details expired. Please create your account again.");
        return;
      }
      const result = AP.Auth.registerCustomer({ email, code: codeInput.value.trim(), ...pending });
      if (!result.ok) { showAlert("signup-verify-alert", result.error); return; }
      sessionStorage.removeItem("ap_signup_email");
      sessionStorage.removeItem("ap_signup_pending");
      AP.Session.loginCustomer(result.customer);
      toastSuccess("Welcome to Ankara Palace!");
      setTimeout(() => goToRedirect("shop.html"), 500);
    });
    const resend = document.getElementById("signup-resend-code");
    bindResendTimer(resend, () => {
      const result = AP.Auth.sendVerificationCode(email);
      showAlert("signup-verify-alert", result.ok ? "A new code has been sent to your email." : result.error, result.ok ? "success" : "error");
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
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearAlert("forgot-alert");
      fieldError(emailInput, "");
      if (!Validate.email(emailInput.value)) { fieldError(emailInput, "Please enter a valid email address."); return; }
      const email = emailInput.value.trim().toLowerCase();
      const sent = AP.Auth.sendPasswordResetCode(email);
      if (!sent.ok) {
        showAlert("forgot-alert", sent.error || "Could not send the reset code.");
        return;
      }
      location.href = `reset-verify.html?email=${encodeURIComponent(email)}`;
    });
  }

  function initResetVerification() {
    const form = document.getElementById("reset-verify-form");
    if (!form) return;
    const email = (new URLSearchParams(location.search).get("email") || "").trim().toLowerCase();
    const codeInput = $("#rv-code");
    const label = document.getElementById("reset-verify-email");
    if (!email || !Validate.email(email)) { showAlert("reset-verify-alert", "The reset request is missing. Please start again."); return; }
    if (label) label.textContent = email;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      clearAlert("reset-verify-alert");
      if (!/^\d{6}$/.test(codeInput.value.trim())) { fieldError(codeInput, "Enter the 6-digit code from your email."); return; }
      const result = AP.Auth.verifyPasswordResetCode(email, codeInput.value.trim());
      if (!result.ok) { showAlert("reset-verify-alert", result.error || "The code could not be verified."); return; }
      sessionStorage.setItem("ap_reset_verified_email", email);
      sessionStorage.setItem("ap_reset_verified_code", codeInput.value.trim());
      location.href = `reset-password.html?email=${encodeURIComponent(email)}`;
    });
    bindResendTimer(document.getElementById("reset-resend-code"), () => {
      const result = AP.Auth.sendPasswordResetCode(email);
      showAlert("reset-verify-alert", result.ok ? "A new reset code has been sent." : result.error, result.ok ? "success" : "error");
    });
  }

  function initPasswordReset() {
    const form = document.getElementById("reset-password-form");
    if (!form) return;
    const email = (new URLSearchParams(location.search).get("email") || "").trim().toLowerCase();
    const verifiedEmail = sessionStorage.getItem("ap_reset_verified_email");
    const code = sessionStorage.getItem("ap_reset_verified_code");
    const emailLabel = document.getElementById("reset-password-email");
    const passwordInput = $("#rp-password");
    const confirmInput = $("#rp-confirm");
    if (!email || !Validate.email(email) || verifiedEmail !== email || !code) { location.replace("forget-password.html"); return; }
    if (emailLabel) emailLabel.textContent = email;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      clearAlert("reset-alert");
      [passwordInput, confirmInput].forEach((field) => fieldError(field, ""));
      let valid = true;
      const strength = Validate.passwordStrength(passwordInput.value);
      if (!strength.strong) { fieldError(passwordInput, "Password must be at least 8 characters and include letters, numbers and a symbol."); valid = false; }
      if (passwordInput.value !== confirmInput.value) { fieldError(confirmInput, "Passwords do not match."); valid = false; }
      if (!valid) return;
      const result = AP.Auth.resetPassword(email, passwordInput.value, code);
      if (!result.ok) { showAlert("reset-alert", result.error); return; }
      showAlert("reset-alert", "Password updated. You can now sign in.", "success");
      sessionStorage.removeItem("ap_reset_verified_email");
      sessionStorage.removeItem("ap_reset_verified_code");
      toastSuccess("Password reset successfully.");
      setTimeout(() => { location.href = "login.html"; }, 1000);
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

      if (result.catalogSynced === false) {
        showAlert("admin-alert", "You signed in, but the shared fabric catalogue could not be saved. Check that the server is running, then try again.");
      } else {
        toastSuccess("Administrator signed in.");
      }
      setTimeout(() => { location.href = "admin.html"; }, 400);
    });
  }

  function init() {
    initSignup();
    initSignupVerification();
    initLogin();
    initForgot();
    initResetVerification();
    initPasswordReset();
    initAdminLogin();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
