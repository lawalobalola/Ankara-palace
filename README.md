# Ankara Palace preview

This project currently uses browser storage for its demo catalogue, accounts and orders. Serve the files from one local address so the admin and customer pages share that browser storage.

## Run on this computer

1. Open PowerShell in this folder.
2. Run `node server.js`.
3. Open `http://127.0.0.1:4173/` in your browser. Use `/admin.html` and `/shop.html` from the same browser profile.
4. Stop the preview with **Ctrl+C**.

Opening individual HTML files with `file://` can give pages separate browser storage. If an upload is saved in a different browser profile or on a separate device, this local preview cannot share it. A hosted backend and shared database are needed for real customers to see admin changes across devices.
