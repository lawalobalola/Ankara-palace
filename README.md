# Ankara Palace

## Run the website

1. Install Node.js on the computer that will run the site.
2. Open a terminal in this project folder and run `node server.js`.
3. Open `http://127.0.0.1:4173/` in a browser.
4. Sign in to the admin page, then add or update a product. The product catalogue, categories, promotions, and store settings are saved by the server and shared with customer pages that use this same server address.

For a local demo, the existing admin sign-in is `admin@ankarapalace.com` with password `Admin@1234`. Change it before using the site beyond a private demo.

The server checks the admin sign-in before accepting catalogue or settings changes. To set a private admin email and password before starting the server in PowerShell:

```powershell
$env:AP_ADMIN_EMAIL = "your-admin-email@example.com"
$env:AP_ADMIN_PASSWORD = "choose-a-long-private-password"
node server.js
```

## Customer accounts and email codes

Sign-up now sends a one-time code to the customer's email before creating the account. To deliver real email, configure a Resend account with a verified sender, then set these server environment values before starting Node:

```powershell
$env:RESEND_API_KEY = "your-resend-api-key"
$env:EMAIL_FROM = "Ankara Palace <verified-sender@your-domain.com>"
node server.js
```

The code expires after 10 minutes and is limited to five entry attempts. Password reset uses the same email-code flow. Without these email settings, sign-up and password reset will show an error and will not create or change an account.

The shared data file is created at `.data/store.json`. Keep this file private and back it up. Do not place it in a public download folder.

## Data scope

Products, categories, promotions, store settings, customer accounts, and orders are stored by this server. The admin can view customer orders, and customers can view only their own orders. Passwords are stored as salted server-side hashes; verification codes are never returned to the browser. Customer account and order records are kept out of the public storefront data endpoint.

By default, the server listens only on this computer (`127.0.0.1`). Other devices cannot connect unless the server is intentionally configured for network access. Public use requires HTTPS hosting, a private persistent data volume, secure secrets, backups, and review of the deployment configuration. Do not expose the local development server directly to the internet.
