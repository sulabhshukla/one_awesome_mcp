import type { FastMCP } from "fastmcp";
import { requireAuth, getAuthSession } from "fastmcp";

export function registerIdentityTools(server: FastMCP<any>) {
  server.addTool({
    name: "whoami",
    description:
      "Shows your authenticated identity — who Google says you are",
    canAccess: requireAuth,
    execute: async (_args, { session }) => {
      const { accessToken } = getAuthSession(session);
      const res = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!res.ok) {
        return `Failed to fetch user info (HTTP ${res.status}). Token may have expired.`;
      }
      const userInfo = (await res.json()) as Record<string, string>;
      return [
        `Name: ${userInfo.name || "unknown"}`,
        `Email: ${userInfo.email || "unknown"}`,
        `Picture: ${userInfo.picture || "none"}`,
        `Locale: ${userInfo.locale || "unknown"}`,
      ].join("\n");
    },
  });

  server.addTool({
    name: "what_client",
    description:
      "Identifies which MCP client is connecting (ChatGPT, Claude, VS Code, etc.) using CIMD metadata",
    canAccess: requireAuth,
    execute: async (_args, { session }) => {
      // FastMCP stores CIMD/DCR client metadata on the session when available.
      // The exact shape depends on the FastMCP version — we check common accessors.
      const s = session as Record<string, any>;
      const clientInfo =
        s?.client || s?.clientMetadata || s?.clientRegistration;

      if (clientInfo) {
        return [
          `Client Name: ${clientInfo.client_name || "Unknown"}`,
          `Client URI: ${clientInfo.client_uri || "Unknown"}`,
          `Client ID: ${clientInfo.client_id || "Unknown"}`,
          `Auth Method: ${clientInfo.token_endpoint_auth_method || "none"}`,
        ].join("\n");
      }

      // Fallback: try to extract info from the session's claims or metadata
      const authSession = getAuthSession(session);
      const claims = (authSession as any).claims;
      if (claims?.client_name) {
        return [
          `Client Name: ${claims.client_name}`,
          `Client URI: ${claims.client_uri || "Unknown"}`,
        ].join("\n");
      }

      return "Client identity not available — the connecting client may not support CIMD.";
    },
  });
}
