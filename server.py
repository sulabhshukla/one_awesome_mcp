import os
import random
import logging
from fnmatch import fnmatch

import httpx
from fastmcp import FastMCP
from fastmcp.server.auth.providers.google import GoogleProvider
from fastmcp.server.auth import AccessToken
from fastmcp.server.dependencies import CurrentAccessToken
from fastmcp.utilities.authorization import AuthContext

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

auth = GoogleProvider(
    client_id=os.environ["GOOGLE_CLIENT_ID"],
    client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
    base_url=os.environ["BASE_URL"],
    required_scopes=["openid", "profile", "email"],
    allowed_client_redirect_uris=[
        "https://chatgpt.com/*",
        "https://claude.ai/*",
        "https://cdn.claude.ai/*",
        "https://modelcontextprotocol.io/*",
        "http://localhost:*/*",
        "http://127.0.0.1:*/*",
    ],
    enable_cimd=True,
)

mcp = FastMCP("CIMD Test Server", auth=auth)


# ── Client allow list & per-client tool visibility ──────────────
#
# Each entry maps a client_id pattern (supports wildcards via fnmatch)
# to the list of tools that client can see. Use ["*"] to grant access
# to all tools.
#
# Clients not matching any pattern are denied access to ALL tools.
#
# The client_id comes from the OAuth token:
# - CIMD clients: the HTTPS metadata URL (e.g. https://example.com/client.json)
# - DCR clients: the registered client_id (often the upstream OAuth client_id)
# - ChatGPT: typically the redirect_uri origin or the upstream client_id

CLIENT_POLICIES: dict[str, list[str]] = {
    # Example: connector1 gets all tools
    # "https://chatgpt.com/connector/oauth/CONNECTOR1_ID": ["*"],
    #
    # Example: connector2 gets only fun tools
    # "https://chatgpt.com/connector/oauth/CONNECTOR2_ID": ["magic_8_ball", "dad_joke", "coin_flip"],
    #
    # Wildcard: allow all clients (remove this once you configure specific clients)
    "*": ["*"],
}


def _get_allowed_tools(client_id: str) -> list[str] | None:
    """Return the tool allow list for a client, or None if not in allow list."""
    for pattern, tools in CLIENT_POLICIES.items():
        if fnmatch(client_id, pattern):
            return tools
    return None


def client_access(ctx: AuthContext) -> bool:
    """AuthCheck: enforces client allow list and per-client tool visibility.

    - If the client is not in CLIENT_POLICIES, deny access (tool is hidden).
    - If the client's tool list is ["*"], allow all tools.
    - Otherwise, only allow if this specific tool is in the client's list.
    """
    if ctx.token is None:
        return False

    client_id = ctx.token.client_id
    allowed_tools = _get_allowed_tools(client_id)

    if allowed_tools is None:
        logger.info("Client %s not in allow list — denied", client_id)
        return False

    if "*" in allowed_tools:
        return True

    tool_name = ctx.component.name if ctx.component else None
    if tool_name and tool_name in allowed_tools:
        return True

    logger.info("Client %s denied access to tool %s", client_id, tool_name)
    return False


# ── Identity tools ──────────────────────────────────────────────


@mcp.tool(auth=client_access)
async def whoami(token: AccessToken = CurrentAccessToken()) -> str:
    """Shows your authenticated identity — who Google says you are."""
    async with httpx.AsyncClient() as client:
        res = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {token.token}"},
        )
    if res.status_code != 200:
        return f"Failed to fetch user info (HTTP {res.status_code}). Token may have expired."
    info = res.json()
    return "\n".join([
        f"Name: {info.get('name', 'unknown')}",
        f"Email: {info.get('email', 'unknown')}",
        f"Picture: {info.get('picture', 'none')}",
        f"Locale: {info.get('locale', 'unknown')}",
    ])


@mcp.tool(auth=client_access)
async def what_client(token: AccessToken = CurrentAccessToken()) -> str:
    """Identifies which MCP client is connecting — shows client_id, claims, and CIMD metadata."""
    claims = token.claims or {}
    lines = [
        f"Client ID: {token.client_id}",
        f"Scopes: {', '.join(token.scopes)}",
        f"Subject: {token.subject or 'N/A'}",
    ]

    # Show CIMD metadata if available
    client_name = claims.get("client_name")
    if client_name:
        lines.append(f"Client Name (CIMD): {client_name}")
        lines.append(f"Client URI: {claims.get('client_uri', 'N/A')}")

    # Show all claims for debugging
    lines.append(f"Token claims keys: {list(claims.keys())}")

    return "\n".join(lines)


# ── Fun tools ───────────────────────────────────────────────────


@mcp.tool(auth=client_access)
async def magic_8_ball(question: str) -> str:
    """Ask the Magic 8-Ball a yes/no question and receive a mystical answer."""
    answers = [
        "It is certain.",
        "Without a doubt.",
        "Yes, definitely.",
        "You may rely on it.",
        "Reply hazy, try again.",
        "Ask again later.",
        "Better not tell you now.",
        "Don't count on it.",
        "My sources say no.",
        "Very doubtful.",
        "Outlook not so good.",
    ]
    return f'Question: "{question}"\nAnswer: {random.choice(answers)}'


@mcp.tool(auth=client_access)
async def dad_joke(topic: str = "") -> str:
    """Generate a random dad joke. Groaning is optional."""
    jokes = [
        "Why don't skeletons fight each other? They don't have the guts.",
        "I'm reading a book about anti-gravity. It's impossible to put down!",
        "What do you call a fake noodle? An impasta!",
        "Why did the scarecrow win an award? Because he was outstanding in his field!",
        "I used to hate facial hair, but then it grew on me.",
        "What do you call cheese that isn't yours? Nacho cheese!",
        "Why can't a bicycle stand on its own? It's two-tired.",
        "I told my wife she was drawing her eyebrows too high. She looked surprised.",
    ]
    return random.choice(jokes)


@mcp.tool(auth=client_access)
async def coin_flip(count: int = 1) -> str:
    """Flip a coin (or multiple coins) and get the results."""
    n = min(max(count, 1), 10)
    results = [random.choice(["Heads", "Tails"]) for _ in range(n)]
    heads = results.count("Heads")
    return f"Results: {', '.join(results)}\nHeads: {heads}, Tails: {n - heads}"


@mcp.tool(auth=client_access)
async def mood_color(mood: str) -> str:
    """Converts a mood/emotion into a hex color with explanation."""
    mood_map = {
        "happy": ("#FFD700", "Warm gold — radiating joy"),
        "sad": ("#4169E1", "Royal blue — deep and reflective"),
        "angry": ("#DC143C", "Crimson — intense and fiery"),
        "calm": ("#98FB98", "Pale green — serene and balanced"),
        "anxious": ("#FF6347", "Tomato — restless warmth"),
        "excited": ("#FF4500", "Orange-red — electric energy"),
        "peaceful": ("#87CEEB", "Sky blue — tranquil and open"),
        "nostalgic": ("#DEB887", "Burlywood — warm and familiar"),
        "creative": ("#9370DB", "Medium purple — imaginative and flowing"),
        "energetic": ("#00FF7F", "Spring green — vibrant and alive"),
    }
    color, reason = mood_map.get(mood.lower(), ("#808080", "Gray — undefined, mysterious"))
    return f"Mood: {mood}\nColor: {color}\nWhy: {reason}"


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=int(os.environ.get("PORT", "3000")))
