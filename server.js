/* Local preview server for Ankara Palace.
   Run with: node server.js
   Serving every page from one origin keeps the browser demo's catalogue shared
   between admin.html and the customer pages on this computer. */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 4173;
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

const server = http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${HOST}:${PORT}`).pathname);
  } catch (_) {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  if (pathname === "/") pathname = "/index.html";
  const filePath = path.resolve(ROOT, `.${pathname}`);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
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

server.listen(PORT, HOST, () => {
  console.log(`Ankara Palace preview: http://${HOST}:${PORT}/`);
  console.log("Open /admin.html and /shop.html in this same browser profile.");
  console.log("Stop the preview with Ctrl+C.");
});
