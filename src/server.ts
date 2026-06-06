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

await server.start({
  transportType: "httpStream",
  httpStream: {
    port,
    host: "0.0.0.0",
  },
});

console.log(`MCP server running on port ${port}`);
