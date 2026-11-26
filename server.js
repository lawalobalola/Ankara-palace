/* Ankara Palace web server and shared JSON data store.
   Run with: node server.js
   Set HOST=0.0.0.0 only when you intentionally want other devices on the
   same network to reach this development server. */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 4173;
const DATA_DIR = path.join(ROOT, ".data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const MAX_BODY = 8 * 1024 * 1024;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let store = {};
let writeQueue = Promise.resolve();
const adminSessions = new Set();
const customerSessions = new Map();
const verificationCodes = new Map();
const sendAttempts = new Map();
const pendingRegistrations = new Map();
const publicStoreKeys = new Set(["ap_products", "ap_categories", "ap_settings", "ap_promos"]);
const protectedKeys = new Set(publicStoreKeys);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(body);
}

function persist() {
  const snapshot = JSON.stringify(store, null, 2);
  writeQueue = writeQueue.then(async () => {
    await fs.promises.mkdir(DATA_DIR, { recursive: true });
    const tempFile = `${DATA_FILE}.tmp`;
    await fs.promises.writeFile(tempFile, snapshot, "utf8");
    await fs.promises.rename(tempFile, DATA_FILE);
  });
  return writeQueue;
}

function readJsonBody(request, response, callback) {
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
    if (body.length > MAX_BODY) {
      response.writeHead(413); response.end("Payload too large"); request.destroy();
    }
  });
  request.on("end", () => {
    try { callback(JSON.parse(body || "{}")); }
    catch (_) { json(response, 400, { error: "Invalid JSON" }); }
  });
}

function hasAdminSession(request) {
  const cookie = request.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)ap_admin_session=([a-f0-9]+)/);
  return Boolean(match && adminSessions.has(match[1]));
}

function getCustomerSession(request) {
  const cookie = request.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)ap_customer_session=([a-f0-9]+)/);
  return match ? customerSessions.get(match[1]) || null : null;
}

function setSessionCookie(response, name, token) {
  response.setHeader("Set-Cookie", `${name}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
}

function createAdminSession(response, email) {
  const token = require("node:crypto").randomBytes(24).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  adminSessions.add(token);
  store.adminSessions = [...(store.adminSessions || []).filter((entry) => entry.expiresAt > Date.now()), { token, email, expiresAt }];
  setSessionCookie(response, "ap_admin_session", token);
}

function publicCustomer(customer) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone || "",
    avatarDataUrl: customer.avatarDataUrl || null,
    emailVerified: Boolean(customer.emailVerified),
    createdAt: customer.createdAt
  };
}

function sendCodeEmail(email, code, purpose = "signup") {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return Promise.reject(new Error("Email verification is not configured. Set RESEND_API_KEY and EMAIL_FROM on the server."));
  const isReset = purpose === "reset";
  const heading = isReset ? "Reset your password" : "Verify your email";
  const intro = isReset ? "Use this code to reset your Ankara Palace password:" : "Use this code to finish creating your Ankara Palace account:";
  const subject = isReset ? "Your Ankara Palace password reset code" : "Your Ankara Palace verification code";
  const plainText = `${intro} ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f5f3ee;font-family:Arial,Helvetica,sans-serif;color:#26332e;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:28px 32px;background:#173d32;color:#ffffff;">
      <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#e7c99a;">Ankara Palace</div>
      <h1 style="margin:10px 0 0;font-size:25px;line-height:1.3;">${heading}</h1>
    </td></tr>
    <tr><td style="padding:32px;">
      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">${intro}</p>
      <div style="padding:18px;text-align:center;background:#f5f3ee;border:1px solid #e7e1d6;border-radius:12px;color:#173d32;font-size:32px;font-weight:bold;letter-spacing:8px;">${code}</div>
      <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#68736d;">This code expires in 10 minutes. If you didn’t request it, you can ignore this email.</p>
    </td></tr>
    <tr><td style="padding:18px 32px;border-top:1px solid #eee9df;color:#68736d;font-size:12px;">Ankara Palace · African fabrics, beautifully delivered</td></tr>
  </table>
</body></html>`;
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject,
      text: plainText,
      html
    })
  }).then(async (response) => {
    if (!response.ok) throw new Error("The email service could not send the verification code. Check the email provider settings.");
  });
}

function makePassword(password) {
  const salt = require("node:crypto").randomBytes(16).toString("hex");
  const hash = require("node:crypto").scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function passwordMatches(password, account) {
  if (!account?.passwordSalt || !account?.passwordHash) return false;
  const candidate = require("node:crypto").scryptSync(password, account.passwordSalt, 64);
  const expected = Buffer.from(account.passwordHash, "hex");
  return candidate.length === expected.length && require("node:crypto").timingSafeEqual(candidate, expected);
}

function createCustomerSession(response, customer) {
  const token = require("node:crypto").randomBytes(24).toString("hex");
  const session = { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone, expiresAt: Date.now() + SESSION_TTL_MS };
  customerSessions.set(token, session);
  store.customerSessions = [...(store.customerSessions || []).filter((entry) => entry.expiresAt > Date.now()), { token, ...session }];
  setSessionCookie(response, "ap_customer_session", token);
}

function byEmail(email) {
  return (store.customers || []).find((customer) => customer.email === email) || null;
}

const server = http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${HOST}:${PORT}`).pathname);
  } catch (_) {
    response.writeHead(400); response.end("Bad request"); return;
  }

  if (pathname === "/api/auth/send-code" && request.method === "POST") {
    readJsonBody(request, response, async (body) => {
      const email = String(body.email || "").trim().toLowerCase();
      const purpose = body.purpose === "reset" ? "reset" : "signup";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(response, 400, { error: "Enter a valid email address." });
      if (purpose === "signup") {
        if (byEmail(email)) return json(response, 409, { error: "An account with this email already exists." });
        if (body.registration) {
          const name = String(body.registration.name || "").trim();
          const phone = String(body.registration.phone || "").trim();
          const password = String(body.registration.password || "");
          if (!name || !phone || password.length < 8) return json(response, 400, { error: "Complete all required account details." });
          const { salt, hash } = makePassword(password);
          pendingRegistrations.set(email, { name, phone, passwordSalt: salt, passwordHash: hash });
        } else if (!pendingRegistrations.has(email)) {
          return json(response, 400, { error: "Please return to the create account page and enter your details first." });
        }
      }
      if (purpose === "reset" && !byEmail(email)) return json(response, 404, { error: "No account was found for this email." });
      const codeKey = `${purpose}:${email}`;
      const lastSent = sendAttempts.get(codeKey) || 0;
      if (Date.now() - lastSent < 60_000) return json(response, 429, { error: "Please wait a minute before requesting another code." });
      const code = String(require("node:crypto").randomInt(100000, 1000000));
      try {
        await sendCodeEmail(email, code, purpose);
        verificationCodes.set(codeKey, { code, expiresAt: Date.now() + 10 * 60_000, attempts: 0 });
        sendAttempts.set(codeKey, Date.now());
        json(response, 200, { ok: true });
      } catch (error) {
        json(response, 503, { error: error.message || "Could not send a verification code." });
      }
    });
    return;
  }

  if (pathname === "/api/auth/register" && request.method === "POST") {
    readJsonBody(request, response, async (body) => {
      const email = String(body.email || "").trim().toLowerCase();
      const pending = verificationCodes.get(`signup:${email}`);
      if (!pending || pending.expiresAt < Date.now()) {
        verificationCodes.delete(`signup:${email}`);
        return json(response, 400, { error: "Request a new verification code and try again." });
      }
      pending.attempts += 1;
      if (pending.attempts > 5) {
        verificationCodes.delete(`signup:${email}`);
        return json(response, 429, { error: "Too many incorrect codes. Request a new code." });
      }
      if (String(body.code || "").trim() !== pending.code) return json(response, 400, { error: "That verification code is incorrect." });
      if (byEmail(email)) return json(response, 409, { error: "An account with this email already exists." });
      const pendingRegistration = pendingRegistrations.get(email);
      if (!pendingRegistration) return json(response, 400, { error: "Your sign-up details expired. Please start again." });
      const customer = { id: `cust-${require("node:crypto").randomBytes(12).toString("hex")}`, ...pendingRegistration, email, emailVerified: true, createdAt: new Date().toISOString() };
      store.customers = [...(store.customers || []), customer];
      verificationCodes.delete(`signup:${email}`);
      pendingRegistrations.delete(email);
      try {
        createCustomerSession(response, customer);
        await persist();
        json(response, 201, { ok: true, customer: publicCustomer(customer) });
      } catch (error) { json(response, 500, { error: "Could not save the account. Please try again." }); }
    });
    return;
  }

  if (pathname === "/api/auth/reset-password" && request.method === "POST") {
    readJsonBody(request, response, async (body) => {
      const email = String(body.email || "").trim().toLowerCase();
      const codeKey = `reset:${email}`;
      const pending = verificationCodes.get(codeKey);
      if (!pending || pending.expiresAt < Date.now()) return json(response, 400, { error: "Request a new reset code and try again." });
      pending.attempts += 1;
      if (pending.attempts > 5) { verificationCodes.delete(codeKey); return json(response, 429, { error: "Too many incorrect codes. Request a new code." }); }
      if (String(body.code || "").trim() !== pending.code) return json(response, 400, { error: "That verification code is incorrect." });
      const account = byEmail(email);
      const password = String(body.password || "");
      if (!account || password.length < 8) return json(response, 400, { error: "Enter a valid new password." });
      const { salt, hash } = makePassword(password);
      account.passwordSalt = salt;
      account.passwordHash = hash;
      verificationCodes.delete(codeKey);
      try { await persist(); json(response, 200, { ok: true }); }
      catch (_) { json(response, 500, { error: "Could not reset the password. Please try again." }); }
    });
    return;
  }

  if (pathname === "/api/auth/login" && request.method === "POST") {
    readJsonBody(request, response, async (body) => {
      const email = String(body.email || "").trim().toLowerCase();
      const account = byEmail(email);
      if (!account || !passwordMatches(String(body.password || ""), account)) return json(response, 401, { error: "Email or password is incorrect." });
      createCustomerSession(response, account);
      try { await persist(); json(response, 200, { ok: true, customer: publicCustomer(account) }); }
      catch (_) { json(response, 500, { error: "Could not save your sign-in. Please try again." }); }
    });
    return;
  }

  if (pathname === "/api/auth/session" && request.method === "GET") {
    const session = getCustomerSession(request);
    if (!session) return json(response, 401, { error: "Your sign-in has expired. Please sign in again." });
    const account = byEmail(session.email);
    if (!account) return json(response, 401, { error: "This customer account is no longer available. Please sign in again." });
    return json(response, 200, { ok: true, customer: publicCustomer(account) });
  }

  if (pathname === "/api/customer/profile" && request.method === "PUT") {
    const session = getCustomerSession(request);
    if (!session) return json(response, 401, { error: "Your sign-in has expired. Please sign in again." });
    readJsonBody(request, response, async (body) => {
      const account = (store.customers || []).find((entry) => entry.id === session.id);
      if (!account) return json(response, 404, { error: "Customer account not found." });
      const name = String(body.name ?? account.name).trim();
      const email = String(body.email ?? account.email).trim().toLowerCase();
      const phone = String(body.phone ?? account.phone ?? "").trim();
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone) return json(response, 400, { error: "Enter a valid name, email and phone number." });
      if ((store.customers || []).some((entry) => entry.id !== account.id && entry.email.toLowerCase() === email)) return json(response, 409, { error: "This email is already in use." });
      account.name = name;
      account.email = email;
      account.phone = phone;
      if (typeof body.avatarDataUrl === "string" || body.avatarDataUrl === null) account.avatarDataUrl = body.avatarDataUrl;
      session.name = name;
      session.email = email;
      session.phone = phone;
      const token = (request.headers.cookie || "").match(/(?:^|;\s*)ap_customer_session=([a-f0-9]+)/)?.[1];
      const storedSession = (store.customerSessions || []).find((entry) => entry.token === token);
      if (storedSession) Object.assign(storedSession, { name, email, phone });
      try { await persist(); json(response, 200, { ok: true, customer: publicCustomer(account) }); }
      catch (_) { json(response, 500, { error: "Could not save your profile. Please try again." }); }
    });
    return;
  }

  if (pathname === "/api/auth/logout" && request.method === "POST") {
    const token = (request.headers.cookie || "").match(/(?:^|;\s*)ap_customer_session=([a-f0-9]+)/)?.[1];
    if (token) {
      customerSessions.delete(token);
      store.customerSessions = (store.customerSessions || []).filter((entry) => entry.token !== token);
      persist().catch(() => {});
    }
    response.writeHead(200, { "Set-Cookie": "ap_customer_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (pathname === "/api/orders" && request.method === "GET") {
    if (hasAdminSession(request)) return json(response, 200, { orders: store.orders || [] });
    const customer = getCustomerSession(request);
    if (!customer) return json(response, 401, { error: "Sign in to view orders." });
    return json(response, 200, { orders: (store.orders || []).filter((order) => order.customerId === customer.id) });
  }

  if (pathname === "/api/admin/customers" && request.method === "GET") {
    if (!hasAdminSession(request)) return json(response, 401, { error: "Administrator sign-in is required." });
    return json(response, 200, { customers: (store.customers || []).map(publicCustomer) });
  }

  if (pathname === "/api/orders" && request.method === "POST") {
    const customer = getCustomerSession(request);
    if (!customer) return json(response, 401, { error: "Sign in before placing your order." });
    readJsonBody(request, response, async (body) => {
      const order = { ...body, customerId: customer.id, customerName: customer.name, customerEmail: customer.email, customerPhone: customer.phone };
      for (const item of order.items || []) {
        const product = (store.ap_products || []).find((entry) => entry.id === item.productId);
        if (!product) return json(response, 400, { error: "A fabric in this order is no longer available." });
        const stockNeeded = item.unitType === "bundle" ? (Number(item.quantity) || 0) * (Number(item.bundleYards) || 0) : Number(item.quantity) || 0;
        if (stockNeeded <= 0 || stockNeeded > Number(product.stock || 0)) return json(response, 409, { error: `${product.name} does not have enough stock for this order.` });
      }
      for (const item of order.items || []) {
        const product = (store.ap_products || []).find((entry) => entry.id === item.productId);
        const stockNeeded = item.unitType === "bundle" ? (Number(item.quantity) || 0) * (Number(item.bundleYards) || 0) : Number(item.quantity) || 0;
        product.stock = Math.max(0, Number(product.stock || 0) - stockNeeded);
      }
      store.orders = [order, ...(store.orders || []).filter((entry) => entry.id !== order.id)];
      try { await persist(); json(response, 201, { ok: true, order }); }
      catch (_) { json(response, 500, { error: "We couldn't save the order. Please try again." }); }
    });
    return;
  }

  const orderMatch = pathname.match(/^\/api\/orders\/([a-zA-Z0-9_-]+)$/);
  if (orderMatch && request.method === "PUT") {
    const admin = hasAdminSession(request);
    const customer = getCustomerSession(request);
    if (!admin && !customer) return json(response, 401, { error: "Sign in is required." });
    readJsonBody(request, response, async (body) => {
      const orders = store.orders || [];
      const index = orders.findIndex((order) => order.id === orderMatch[1]);
      if (index < 0) return json(response, 404, { error: "Order not found." });
      if (!admin) {
        if (orders[index].customerId !== customer.id) return json(response, 403, { error: "You can only update your own order." });
        if (["paid", "confirmed"].includes(orders[index].paymentStatus)) return json(response, 409, { error: "Payment is already confirmed." });
        const now = new Date().toISOString();
        orders[index] = {
          ...orders[index],
          receipts: Array.isArray(body.receipts) ? body.receipts.slice(-10) : orders[index].receipts,
          paymentStatus: "receipt_submitted",
          status: "Payment Pending Verification",
          statusHistory: [...(orders[index].statusHistory || []), { status: "Payment Pending Verification", at: now, by: "customer", note: "Transfer receipt uploaded" }],
          updatedAt: now
        };
      } else {
        orders[index] = { ...orders[index], ...body, id: orders[index].id, updatedAt: new Date().toISOString() };
      }
      store.orders = orders;
      try { await persist(); json(response, 200, { ok: true, order: orders[index] }); }
      catch (_) { json(response, 500, { error: "Could not update the order." }); }
    });
    return;
  }

  if (pathname === "/api/state" && request.method === "GET") {
    const publicState = {};
    publicStoreKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(store, key)) publicState[key] = store[key];
    });
    // Customer accounts, order addresses, and admin credentials never leave the server.
    json(response, 200, publicState);
    return;
  }

  if (pathname === "/api/admin/login" && request.method === "POST") {
    readJsonBody(request, response, async (body) => {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const configuredEmail = String(process.env.AP_ADMIN_EMAIL || "admin@ankarapalace.com").toLowerCase();
      const configuredPassword = process.env.AP_ADMIN_PASSWORD || "Admin@1234";
      const savedAdmins = Array.isArray(store.ap_admin) ? store.ap_admin : [];
      const matched = savedAdmins.some((admin) => (admin.email || "").toLowerCase() === email && admin.password === password);
      const isConfiguredAdmin = email === configuredEmail && password === configuredPassword;
      if (!matched && !isConfiguredAdmin) return json(response, 401, { error: "Invalid administrator credentials." });
      createAdminSession(response, email);
      try { await persist(); json(response, 200, { ok: true }); }
      catch (_) { json(response, 500, { error: "Could not save administrator sign-in. Please try again." }); }
    });
    return;
  }

  if (pathname === "/api/admin/logout" && request.method === "POST") {
    const token = (request.headers.cookie || "").match(/(?:^|;\s*)ap_admin_session=([a-f0-9]+)/)?.[1];
    if (token) {
      adminSessions.delete(token);
      store.adminSessions = (store.adminSessions || []).filter((entry) => entry.token !== token);
      persist().catch(() => {});
    }
    response.writeHead(200, { "Set-Cookie": "ap_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0", "Cache-Control": "no-store" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  const keyMatch = pathname.match(/^\/api\/state\/([a-zA-Z0-9_-]+)$/);
  if (keyMatch && request.method === "PUT") {
    if (!publicStoreKeys.has(keyMatch[1])) {
      json(response, 404, { error: "This data type is not available through the shared storefront API." });
      return;
    }
    if (protectedKeys.has(keyMatch[1]) && !hasAdminSession(request)) {
      json(response, 401, { error: "Administrator sign-in is required to change this information." });
      return;
    }
    readJsonBody(request, response, async (parsed) => {
      try {
        if (!Object.prototype.hasOwnProperty.call(parsed, "value")) return json(response, 400, { error: "Missing value" });
        store[keyMatch[1]] = parsed.value;
        await persist();
        json(response, 200, { ok: true });
      } catch (error) {
        console.error("Could not save shared data:", error);
        json(response, 500, { error: "Could not save shared data" });
      }
    });
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(ROOT, `.${pathname}`);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  if (filePath === DATA_DIR || filePath.startsWith(DATA_DIR + path.sep)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-store"
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!response.headersSent) response.writeHead(500);
      response.end("Could not read file");
    });
    stream.pipe(response);
  });
});

async function start() {
  try {
    const raw = await fs.promises.readFile(DATA_FILE, "utf8");
    store = JSON.parse(raw);
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Could not load shared data store:", error);
    store = {};
  }
  const now = Date.now();
  (store.customerSessions || []).forEach((session) => {
    if (session.token && session.expiresAt > now) {
      const { token, ...customer } = session;
      customerSessions.set(token, customer);
    }
  });
  store.customerSessions = (store.customerSessions || []).filter((session) => session.token && session.expiresAt > now);
  (store.adminSessions || []).forEach((session) => {
    if (session.token && session.expiresAt > now) adminSessions.add(session.token);
  });
  store.adminSessions = (store.adminSessions || []).filter((session) => session.token && session.expiresAt > now);
  server.listen(PORT, HOST, () => {
    console.log(`Ankara Palace: http://${HOST}:${PORT}/`);
    console.log("Products, categories, promotions, and store settings are shared by connected browsers.");
    console.log("Stop the server with Ctrl+C.");
  });
}

start();
