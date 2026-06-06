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
const fastmcpPort = port + 1;

await server.start({
  transportType: "httpStream",
  httpStream: {
    port: fastmcpPort,
    host: "0.0.0.0",
  },
});

/**
 * Helper: forward a request to the FastMCP backend and return the response.
 */
function forwardRequest(
  method: string,
  path: string,
  headers: http.IncomingHttpHeaders,
  body?: Buffer
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: fastmcpPort,
        path,
        method,
        headers: { ...headers },
      },
      (proxyRes) => {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (chunk) => chunks.push(chunk));
        proxyRes.on("end", () => {
          resolve({
            status: proxyRes.statusCode || 500,
            headers: proxyRes.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );
    proxyReq.on("error", reject);
    if (body && body.length > 0) proxyReq.write(body);
    proxyReq.end();
  });
}

/**
 * Auto-register a client via DCR before forwarding to /oauth/authorize.
 * ChatGPT (and possibly other clients) skip the /oauth/register step,
 * so we synthesize it when we see an unregistered redirect_uri.
 */
async function autoRegister(redirectUri: string, clientName?: string) {
  const registerBody = JSON.stringify({
    redirect_uris: [redirectUri],
    client_name: clientName || "auto-registered",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_basic",
  });

  console.log(`[PROXY] Auto-registering redirect_uri: ${redirectUri}`);

  const result = await forwardRequest("POST", "/oauth/register", {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(registerBody)),
  }, Buffer.from(registerBody));

  console.log(`[PROXY] Registration response: ${result.status} ${result.body.toString()}`);
  return result.status === 201;
}

const proxy = http.createServer((req, res) => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const isOAuth =
    url.pathname.includes("oauth") || url.pathname.includes(".well-known");

  if (isOAuth) {
    console.log(`\n[DEBUG] >>> ${req.method} ${req.url}`);
    console.log(`[DEBUG] User-Agent: ${req.headers["user-agent"]}`);
    for (const [k, v] of url.searchParams.entries()) {
      console.log(`[DEBUG]   ${k} = ${v}`);
    }
  }

  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", async () => {
    const body = Buffer.concat(chunks);
    if (isOAuth && body.length > 0) {
      console.log(`[DEBUG] POST body: ${body.toString()}`);
    }

    try {
      // If this is /oauth/authorize and has a redirect_uri, auto-register first
      if (req.method === "GET" && url.pathname === "/oauth/authorize") {
        const redirectUri = url.searchParams.get("redirect_uri");
        if (redirectUri) {
          await autoRegister(redirectUri);
        }
      }

      const result = await forwardRequest(
        req.method || "GET",
        req.url || "/",
        req.headers,
        body
      );

      if (isOAuth) {
        console.log(`[DEBUG] <<< ${result.status}`);
        if (result.headers.location) {
          console.log(`[DEBUG] Location: ${result.headers.location}`);
        }
        const resBody = result.body.toString();
        if (resBody) {
          console.log(`[DEBUG] Response body: ${resBody}`);
        }
      }

      res.writeHead(result.status, result.headers);
      res.end(result.body);
    } catch (err: any) {
      console.error(`[PROXY] Error: ${err.message}`);
      res.writeHead(502).end("Bad Gateway");
    }
  });
});

proxy.listen(port, "0.0.0.0", () => {
  console.log(`Proxy on port ${port}, FastMCP on port ${fastmcpPort}`);
});
