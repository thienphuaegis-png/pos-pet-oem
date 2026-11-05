import { Readable } from "stream";

export const config = {
  api: {
    bodyParser: false,
  },
};

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const API_TOKEN = process.env.CF_API_TOKEN || "";
const DB_ID = process.env.CF_D1_DATABASE_ID || "";
const STORE_NAME = process.env.STORE_NAME || "POS Mastercare";

const D1_QUERY_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`;

let cachedUrl = "";
let cachedAt = 0;

async function getLiveTunnelUrl() {
  const now = Date.now();
  if (now - cachedAt < 60000 && cachedUrl) {
    return cachedUrl;
  }
  if (!ACCOUNT_ID || !API_TOKEN || !DB_ID) {
    return cachedUrl || "";
  }
  try {
    const resp = await fetch(D1_QUERY_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql: "SELECT value FROM settings WHERE key = ? LIMIT 1",
        params: ["live_tunnel_url"],
      }),
      signal: AbortSignal.timeout(3500),
    });
    const data = await resp.json();
    const val = data?.result?.[0]?.results?.[0]?.value || "";
    cachedUrl = String(val).trim().replace(/\/+$/, "");
    cachedAt = now;
    return cachedUrl;
  } catch (err) {
    return cachedUrl || "";
  }
}

async function registerTunnelUrl(newUrl) {
  cachedUrl = newUrl;
  cachedAt = Date.now();
  if (!ACCOUNT_ID || !API_TOKEN || !DB_ID) {
    return true;
  }
  try {
    await fetch(D1_QUERY_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql: "INSERT INTO settings (key, value) VALUES ('live_tunnel_url', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params: [newUrl],
      }),
      signal: AbortSignal.timeout(5000),
    });
    return true;
  } catch (err) {
    console.error("Lỗi cập nhật D1:", err);
    return false;
  }
}

async function extractRequestBody(req) {
  if (req.method === "GET" || req.method === "HEAD") {
    return null;
  }
  const contentType = String(req.headers["content-type"] || "").toLowerCase();

  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === "string") return Buffer.from(req.body, "utf-8");
    if (typeof req.body === "object") {
      if (contentType.includes("application/x-www-form-urlencoded")) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(req.body)) {
          params.append(k, String(v));
        }
        return Buffer.from(params.toString(), "utf-8");
      }
      return Buffer.from(JSON.stringify(req.body), "utf-8");
    }
  }

  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      resolve(chunks.length > 0 ? Buffer.concat(chunks) : null);
    });
    req.on("error", () => resolve(null));
  });
}

function renderOfflineHtml(storeName) {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${storeName} - Máy chủ đang ngoại tuyến</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #0f172a;
      color: #f8fafc;
      padding: 20px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 20px;
      padding: 40px 32px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
    }
    .icon {
      font-size: 56px;
      margin-bottom: 16px;
      line-height: 1;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 16px;
      border-radius: 9999px;
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 20px;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .dot {
      width: 8px;
      height: 8px;
      background: #ef4444;
      border-radius: 50%;
      display: inline-block;
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 10px;
      color: #f1f5f9;
    }
    .store {
      font-size: 14px;
      color: #38bdf8;
      font-weight: 600;
      margin-bottom: 16px;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0 0 28px;
    }
    .btn {
      display: inline-block;
      width: 100%;
      background: #2563eb;
      color: white;
      text-decoration: none;
      padding: 13px 24px;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: background 0.2s, transform 0.1s;
    }
    .btn:hover { background: #1d4ed8; }
    .btn:active { transform: scale(0.98); }
    .tip {
      margin-top: 28px;
      font-size: 13px;
      line-height: 1.6;
      color: #94a3b8;
      border-top: 1px solid #334155;
      padding-top: 20px;
      text-align: left;
      background: rgba(15, 23, 42, 0.4);
      border-radius: 10px;
      padding: 16px;
    }
    .tip b { color: #f1f5f9; }
    code {
      background: #0f172a;
      color: #38bdf8;
      padding: 3px 6px;
      border-radius: 6px;
      font-family: monospace;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔌</div>
    <div class="badge"><span class="dot"></span> Máy chủ ngoại tuyến</div>
    <h1>Máy chủ POS chưa được bật</h1>
    <div class="store">${storeName}</div>
    <p>Hệ thống không phát hiện kết nối từ máy tính tại cửa hàng. Vui lòng bật máy chủ POS để tiếp tục bán hàng.</p>
    <button class="btn" onclick="location.reload()">🔄 Thử kết nối lại</button>
    <div class="tip">
      💡 <b>Cách bật máy chủ tại cửa hàng:</b><br>
      Mở thư mục POS trên máy tính và nhấp đúp vào file <code>CHAY_2_MAY_CHU.bat</code> (hoặc <code>CHAY_ONLINE_CLOUDFLARE.bat</code>).
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  const urlPath = req.url.split("?")[0];

  // 1. Health check & status
  if (urlPath === "/api/ping" || urlPath === "/healthz") {
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify({ ok: true, app: "pos-vercel-bridge", store: STORE_NAME }));
    return;
  }

  // 2. Endpoint kiểm tra tunnel status
  if (urlPath === "/api/tunnel/status") {
    const liveUrl = await getLiveTunnelUrl();
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify({ live_tunnel_url: liveUrl, is_online: Boolean(liveUrl), store: STORE_NAME }));
    return;
  }

  // 3. Endpoint đăng ký tunnel URL từ máy Windows
  if ((urlPath === "/api/tunnel/register" || urlPath === "/__tunnel__/register") && req.method === "POST") {
    const rawBody = await extractRequestBody(req);
    let payload = {};
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody.toString("utf-8"));
      } catch (e) {}
    }
    const newTunnelUrl = String(payload.tunnel_url || "").trim().replace(/\/+$/, "");
    if (newTunnelUrl && !newTunnelUrl.startsWith("https://")) {
      res.status(400).json({ ok: false, detail: "Tunnel URL phải bắt đầu bằng https://" });
      return;
    }
    await registerTunnelUrl(newTunnelUrl);
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(JSON.stringify({ ok: true, registered_url: newTunnelUrl, store: STORE_NAME }));
    return;
  }

  // 4. Lấy tunnel URL hiện tại của máy Windows
  const liveUrl = await getLiveTunnelUrl();

  // 5. Nếu chưa có kết nối hoặc máy chủ đang tắt
  if (!liveUrl) {
    const accept = String(req.headers["accept"] || "");
    const isApi = urlPath.startsWith("/api/") || (!accept.includes("text/html") && urlPath !== "/");
    if (!isApi) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.status(503).send(renderOfflineHtml(STORE_NAME));
    } else {
      res.setHeader("Content-Type", "application/json");
      res.status(503).send(JSON.stringify({
        ok: false,
        error: "POS_OFFLINE",
        message: "Máy chủ POS tại cửa hàng đang tắt. Vui lòng bật máy chủ để tiếp tục.",
        store: STORE_NAME
      }));
    }
    return;
  }

  // 6. Tùy chọn 307 Redirect nếu có query ?direct=1 hoặc ?redirect=1
  if (req.url.includes("direct=1") || req.url.includes("redirect=1")) {
    const targetRedirect = new URL(req.url, liveUrl).href;
    res.writeHead(307, { Location: targetRedirect });
    res.end();
    return;
  }

  // 7. Reverse Proxy: chuyển tiếp toàn bộ request về máy chủ Windows
  try {
    const targetUrl = new URL(req.url, liveUrl);
    const forwardHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const lk = k.toLowerCase();
      // Bỏ qua các header quản lý kết nối tầng hop-by-hop
      if (lk !== "host" && lk !== "connection" && lk !== "content-length" && lk !== "transfer-encoding") {
        forwardHeaders[k] = v;
      }
    }
    forwardHeaders["host"] = targetUrl.host;
    forwardHeaders["x-forwarded-host"] = req.headers["host"] || "";
    forwardHeaders["x-forwarded-proto"] = "https";
    forwardHeaders["accept-encoding"] = "gzip";

    const isBodyAllowed = req.method !== "GET" && req.method !== "HEAD";
    const bodyBuffer = isBodyAllowed ? await extractRequestBody(req) : null;
    if (bodyBuffer && bodyBuffer.length > 0) {
      forwardHeaders["content-length"] = String(bodyBuffer.length);
    } else {
      delete forwardHeaders["content-length"];
    }

    const proxyResp = await fetch(targetUrl.href, {
      method: req.method,
      headers: forwardHeaders,
      body: bodyBuffer && bodyBuffer.length > 0 ? bodyBuffer : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(55000),
    });

    // Chuyển tiếp status & headers
    res.status(proxyResp.status);
    proxyResp.headers.forEach((val, key) => {
      const lk = key.toLowerCase();
      if (lk !== "content-encoding" && lk !== "transfer-encoding" && lk !== "connection" && lk !== "content-length") {
        res.setHeader(key, val);
      }
    });

    if (typeof proxyResp.headers.getSetCookie === "function") {
      const cookies = proxyResp.headers.getSetCookie();
      if (cookies && cookies.length > 0) {
        res.setHeader("set-cookie", cookies);
      }
    }

    // Static fallback (nếu lọt vào proxy) cho phép cache; HTML & API giữ no-store
    if (urlPath.startsWith("/static/")) {
      res.setHeader("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
    } else {
      res.setHeader("cache-control", "no-cache, no-store, must-revalidate");
      res.setHeader("pragma", "no-cache");
      res.setHeader("expires", "0");
    }

    if (proxyResp.body) {
      const arrayBuffer = await proxyResp.arrayBuffer();
      const respBuf = Buffer.from(arrayBuffer);
      res.setHeader("content-length", String(respBuf.length));
      res.end(respBuf);
    } else {
      res.end();
    }
  } catch (proxyErr) {
    console.error("Lỗi chuyển tiếp tới tunnel:", proxyErr);
    const accept = String(req.headers["accept"] || "");
    const isApi = urlPath.startsWith("/api/") || (!accept.includes("text/html") && urlPath !== "/");
    if (!isApi) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(503).send(renderOfflineHtml(STORE_NAME));
    } else {
      res.setHeader("Content-Type", "application/json");
      res.status(503).send(JSON.stringify({
        ok: false,
        error: "POS_CONNECTION_LOST",
        message: "Không thể kết nối tới máy chủ tại cửa hàng (Mất kết nối).",
      }));
    }
  }
}
