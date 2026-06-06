import http from "node:http";
import { FastMCP, GoogleProvider } from "fastmcp";
import { registerFunTools } from "./tools/fun.js";
import { registerIdentityTools } from "./tools/identity.js";

const server = new FastMCP({
  name: "CIMD Test Server",
  version: "1.0.0",
  auth: new GoogleProvider({
    baseUrl: process.env.BASE_URL!,
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    scopes: ["openid", "profile", "email"],
    allowedRedirectUriPatterns: [
      "https://chatgpt.com/*",
      "https://claude.ai/*",
      "https://cdn.claude.ai/*",
      "https://modelcontextprotocol.io/*",
      "http://localhost:*/*",
      "http://127.0.0.1:*/*",
    ],
  }),
});

registerFunTools(server);
registerIdentityTools(server);

const port = parseInt(process.env.PORT || "3000", 10);

// Debug proxy: log all OAuth/.well-known requests before forwarding to FastMCP
const debugPort = port + 1;

await server.start({
  transportType: "httpStream",
  httpStream: {
    port: debugPort,
    host: "0.0.0.0",
  },
});

const proxy = http.createServer((req, res) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const isDebug =
    url.pathname.includes("oauth") || url.pathname.includes(".well-known");

  if (isDebug) {
    console.log(`\n[DEBUG] >>> ${req.method} ${req.url}`);
    console.log(`[DEBUG] User-Agent: ${req.headers["user-agent"]}`);
    for (const [k, v] of url.searchParams.entries()) {
      console.log(`[DEBUG]   ${k} = ${v}`);
    }
  }

  // Collect request body for POST
  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    if (isDebug && body.length > 0) {
      console.log(`[DEBUG] POST body: ${body.toString()}`);
    }

    // Forward to FastMCP
    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: debugPort,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: req.headers.host },
      },
      (proxyRes) => {
        if (isDebug) {
          console.log(`[DEBUG] <<< ${proxyRes.statusCode}`);
          if (proxyRes.headers.location) {
            console.log(`[DEBUG] Location: ${proxyRes.headers.location}`);
          }
        }

        // Collect response body for debug logging
        if (isDebug) {
          const resChunks: Buffer[] = [];
          proxyRes.on("data", (chunk) => resChunks.push(chunk));
          proxyRes.on("end", () => {
            const resBody = Buffer.concat(resChunks).toString();
            if (resBody) {
              console.log(`[DEBUG] Response body: ${resBody}`);
            }
            res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
            res.end(Buffer.concat(resChunks));
          });
        } else {
          res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
          proxyRes.pipe(res);
        }
      }
    );

    proxyReq.on("error", (err) => {
      console.error(`[DEBUG] Proxy error: ${err.message}`);
      res.writeHead(502).end("Bad Gateway");
    });

    if (body.length > 0) {
      proxyReq.write(body);
    }
    proxyReq.end();
  });
});

proxy.listen(port, "0.0.0.0", () => {
  console.log(`Debug proxy on port ${port}, FastMCP on port ${debugPort}`);
});
