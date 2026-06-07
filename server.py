import os
import random
import logging

import httpx
from fastmcp import FastMCP
from fastmcp.server.auth.providers.google import GoogleProvider
from fastmcp.server.auth import AccessToken
from fastmcp.server.dependencies import CurrentAccessToken

logging.basicConfig(level=logging.DEBUG)

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


# ── Identity tools ──────────────────────────────────────────────


@mcp.tool()
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


@mcp.tool()
async def what_client(token: AccessToken = CurrentAccessToken()) -> str:
    """Identifies which MCP client is connecting (ChatGPT, Claude, VS Code, etc.) using CIMD metadata."""
    claims = token.claims or {}

    # Check for CIMD client metadata in token claims
    client_name = claims.get("client_name")
    client_uri = claims.get("client_uri")
    client_id = claims.get("client_id") or token.client_id

    if client_name:
        return "\n".join([
            f"Client Name: {client_name}",
            f"Client URI: {client_uri or 'Unknown'}",
            f"Client ID: {client_id or 'Unknown'}",
        ])

    # If CIMD metadata isn't in claims, report what we know
    if client_id and client_id.startswith("https://"):
        return f"CIMD Client ID: {client_id}\n(Client metadata available at that URL)"

    return "Client identity not available — the connecting client may not support CIMD."


# ── Fun tools ───────────────────────────────────────────────────


@mcp.tool()
async def magic_8_ball(question: str, token: AccessToken = CurrentAccessToken()) -> str:
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


@mcp.tool()
async def dad_joke(topic: str = "", token: AccessToken = CurrentAccessToken()) -> str:
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


@mcp.tool()
async def coin_flip(count: int = 1, token: AccessToken = CurrentAccessToken()) -> str:
    """Flip a coin (or multiple coins) and get the results."""
    n = min(max(count, 1), 10)
    results = [random.choice(["Heads", "Tails"]) for _ in range(n)]
    heads = results.count("Heads")
    return f"Results: {', '.join(results)}\nHeads: {heads}, Tails: {n - heads}"


@mcp.tool()
async def mood_color(mood: str, token: AccessToken = CurrentAccessToken()) -> str:
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
