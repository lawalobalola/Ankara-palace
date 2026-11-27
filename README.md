# Ankara Palace

## Setup

1. Install Node.js 18 or newer.
2. In PowerShell, go to the Ankara Palace folder and install its packages:

```powershell
cd "$env:USERPROFILE\Desktop\Ankara-palace"
npm install
```

3. In MongoDB Atlas, create a database user and copy the connection string for the application. Add the computer's IP address to the Atlas network access list. Keep the database password private.
4. Set the server settings in the same PowerShell window, replacing each example value:

```powershell
$env:MONGODB_URI = "mongodb+srv://DB_USER:DB_PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority"
$env:MONGODB_DB = "ankara_palace"
$env:AP_ADMIN_EMAIL = "your-admin-email@example.com"
$env:AP_ADMIN_PASSWORD = "your-private-admin-password"
$env:RESEND_API_KEY = "your-resend-api-key"
$env:EMAIL_FROM = "Ankara Palace <verified-sender@your-domain.com>"
npm start
```

5. Open `http://127.0.0.1:4173/`. The server checks MongoDB before it starts. Visit `http://127.0.0.1:4173/api/health` to confirm the database connection.
6. Sign in to the admin page once before placing customer test orders. This syncs the existing browser catalogue to the new MongoDB database.

## Database and verification

Products, categories, store settings, promotions, customer accounts, sessions, and orders are stored by the Node server in MongoDB. Admin changes and customer orders therefore use the same database across browsers that connect to this server. The server imports the old `.data/store.json` data once when the MongoDB collection is empty.

Signup sends a six-digit email code before account creation. Codes expire after 10 minutes, are limited to five attempts, and are not sent back to the browser. Forgot password uses a separate code-confirmation step before changing the password. Both flows need a working Resend API key and verified sender address.

Keep `MONGODB_URI`, `RESEND_API_KEY`, and admin credentials private. Do not paste them into chat, source code, or a public repository. For a deployed website, configure these values in the hosting provider's secret/environment settings and use HTTPS.
