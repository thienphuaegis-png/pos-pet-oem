/**
 * Cloudflare Worker cho POS Petcare:
 * 1. Cầu nối siêu tốc (<2ms) vào Cloudflare D1 (binding env.DB) tại /d1/query và /d1/batch.
 * 2. Cổng Reverse Proxy tại Edge: nếu truy cập trực tiếp tên miền Cloudflare, tự chuyển tiếp về BACKEND_ORIGIN (Vercel).
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Nhánh cầu nối cơ sở dữ liệu Cloudflare D1 (D1 Bridge)
    if (url.pathname === "/d1/query" || url.pathname === "/d1/batch") {
      if (env.CF_D1_WORKER_SECRET) {
        const auth = request.headers.get("Authorization") || "";
        if (auth !== `Bearer ${env.CF_D1_WORKER_SECRET}`) {
          return Response.json({ success: false, error: "Unauthorized D1 Bridge" }, { status: 401 });
        }
      }

      try {
        const body = await request.json();

        if (url.pathname === "/d1/query") {
          const stmt = env.DB.prepare(body.sql);
          const bound = body.params && body.params.length ? stmt.bind(...body.params) : stmt;
          const res = await bound.all();
          return Response.json({
            success: true,
            result: [{ results: res.results || [], meta: res.meta || {} }],
          });
        }

        if (url.pathname === "/d1/batch") {
          const statements = (body.statements || []).map((item) => {
            const st = env.DB.prepare(item.sql);
            return item.params && item.params.length ? st.bind(...item.params) : st;
          });
          const batchRes = statements.length ? await env.DB.batch(statements) : [];
          return Response.json({
            success: true,
            result: batchRes.map((r) => ({ results: r.results || [], meta: r.meta || {} })),
          });
        }
      } catch (err) {
        return Response.json({ success: false, error: String(err.message || err) }, { status: 400 });
      }
    }

    // 2. Nhánh Reverse Proxy cho giao diện & API POS trên tên miền Cloudflare
    if (env.BACKEND_ORIGIN) {
      const targetUrl = new URL(url.pathname + url.search, env.BACKEND_ORIGIN);
      const proxyReq = new Request(targetUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
        redirect: "manual",
      });
      return fetch(proxyReq);
    }

    return Response.json({
      service: "POS Petcare Cloudflare D1 Edge Worker",
      status: "ok",
      d1_bound: Boolean(env.DB),
    });
  },
};
