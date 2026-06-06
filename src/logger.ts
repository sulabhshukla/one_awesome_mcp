import { getAuthSession } from "fastmcp";

export async function logToolCall(
  toolName: string,
  session: unknown,
  args?: Record<string, unknown>
) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [tool:${toolName}]`;

  // Log full session object to discover all available fields (including CIMD)
  console.log(`${prefix} === SESSION DUMP ===`);
  try {
    console.log(JSON.stringify(session, null, 2));
  } catch {
    console.log(`${prefix} Session not serializable:`, session);
  }

  // Log auth session details
  try {
    const authSession = getAuthSession(session as any);
    console.log(`${prefix} === AUTH SESSION ===`);
    console.log(
      JSON.stringify(
        {
          hasAccessToken: !!authSession.accessToken,
          accessTokenPrefix: authSession.accessToken?.slice(0, 20) + "...",
          hasIdToken: !!(authSession as any).idToken,
          hasRefreshToken: !!(authSession as any).refreshToken,
          scopes: (authSession as any).scopes,
          claims: (authSession as any).claims,
          expiresAt: (authSession as any).expiresAt,
        },
        null,
        2
      )
    );
  } catch (e) {
    console.log(`${prefix} getAuthSession failed:`, e);
  }

  // Log CIMD / client metadata — try every possible accessor
  const s = session as Record<string, any>;
  const clientKeys = [
    "client",
    "clientMetadata",
    "clientRegistration",
    "clientInfo",
    "cimd",
    "client_id",
    "client_name",
  ];
  console.log(`${prefix} === CIMD / CLIENT METADATA ===`);
  for (const key of clientKeys) {
    if (s?.[key] !== undefined) {
      console.log(`${prefix} session.${key} =`, JSON.stringify(s[key]));
    }
  }

  // Log all top-level session keys for discovery
  if (s && typeof s === "object") {
    console.log(`${prefix} Session keys: [${Object.keys(s).join(", ")}]`);
  }

  // Log tool args
  if (args && Object.keys(args).length > 0) {
    console.log(`${prefix} Args:`, JSON.stringify(args));
  }

  // Fetch and log Google user info
  try {
    const { accessToken } = getAuthSession(session as any);
    const res = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (res.ok) {
      const userInfo = await res.json();
      console.log(`${prefix} === GOOGLE USER ===`);
      console.log(JSON.stringify(userInfo, null, 2));
    } else {
      console.log(`${prefix} Google userinfo failed: HTTP ${res.status}`);
    }
  } catch (e) {
    console.log(`${prefix} Google userinfo fetch error:`, e);
  }

  console.log(`${prefix} === END ===`);
}
