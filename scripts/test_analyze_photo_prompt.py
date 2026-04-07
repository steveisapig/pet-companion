#!/usr/bin/env python3
"""
Standalone test for the same Anthropic call as supabase/functions/analyze-photo/index.ts

Uses:
  - POST https://api.anthropic.com/v1/messages
  - model: claude-opus-4-6
  - anthropic-version: 2023-06-01
  - max_tokens: 1024
  - messages[0].content: [ image block, text prompt ] (same shape as the Edge Function)

Setup:
  # optional: loads .env from repo root if present
  python3 scripts/test_analyze_photo_prompt.py path/to/food.jpg
  python3 scripts/test_analyze_photo_prompt.py --url https://example.com/food.jpg

Dependencies: Python 3.9+ standard library only (urllib).
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import ssl
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-opus-4-6"
MAX_TOKENS = 1024
ANTHROPIC_VERSION = "2023-06-01"

ALLOWED_NUTRIENTS = [
    "vitamin-c",
    "vitamin-d",
    "vitamin-a",
    "vitamin-b12",
    "vitamin-b6",
    "vitamin-e",
    "vitamin-k",
    "omega-3",
    "omega-6",
    "iron",
    "zinc",
    "calcium",
    "magnesium",
    "potassium",
    "protein",
    "fiber",
    "folate",
]

DEFAULT_PROMPT = f"""Identify the nutrients and estimate the caloric count of the food items in this image. 
If there is no food, return {{"calorie": 0, "nutrients": []}}.

Otherwise, return ONLY a valid JSON object with exactly these keys:
- "calorie": number (estimated calories)
- "nutrients": array of strings—ONLY use slugs from this exact list: {", ".join(ALLOWED_NUTRIENTS)}

Pick 1–5 nutrients that best match the food. You are not allowed to return any other nutrients than the ones above.
Example: {{"calorie": 120, "nutrients": ["vitamin-c", "zinc", "fiber"]}}
Return nothing else—no markdown, no explanation, only the JSON."""


def load_dotenv_from_repo_root() -> None:
    root = Path(__file__).resolve().parent.parent
    env_path = root / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val


def parse_calorie_nutrients_json(text: str) -> dict[str, Any] | None:
    """Mirror of parseCalorieNutrientsJson in analyze-photo/index.ts"""
    trimmed = text.strip()
    m = re.search(r"\{[\s\S]*\}", trimmed)
    json_str = m.group(0) if m else trimmed
    try:
        obj = json.loads(json_str)
        if (
            isinstance(obj, dict)
            and "calorie" in obj
            and isinstance(obj.get("calorie"), (int, float))
            and "nutrients" in obj
            and isinstance(obj.get("nutrients"), list)
        ):
            nutrients = [n for n in obj["nutrients"] if isinstance(n, str)]
            return {"calorie": int(obj["calorie"]), "nutrients": nutrients}
    except json.JSONDecodeError:
        pass
    return None


def build_messages_image_file(path: Path) -> list[dict[str, Any]]:
    raw = path.read_bytes()
    b64 = base64.standard_b64encode(raw).decode("ascii")
    suffix = path.suffix.lower()
    media = "image/jpeg"
    if suffix == ".png":
        media = "image/png"
    elif suffix == ".webp":
        media = "image/webp"
    elif suffix == ".gif":
        media = "image/gif"
    return [
        {
            "type": "image",
            "source": {"type": "base64", "media_type": media, "data": b64},
        },
        {"type": "text", "text": DEFAULT_PROMPT},
    ]


def build_messages_image_url(image_url: str) -> list[dict[str, Any]]:
    return [
        {
            "type": "image",
            "source": {"type": "url", "url": image_url},
        },
        {"type": "text", "text": DEFAULT_PROMPT},
    ]


def call_anthropic(api_key: str, content: list[dict[str, Any]], prompt_override: str | None) -> dict[str, Any]:
    if prompt_override:
        content = list(content)
        content[-1] = {"type": "text", "text": prompt_override}

    body = {
        "model": MODEL,
        "max_tokens": MAX_TOKENS,
        "messages": [{"role": "user", "content": content}],
    }
    data = json.dumps(body).encode("utf-8")
    req = Request(
        ANTHROPIC_API_URL,
        data=data,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": ANTHROPIC_VERSION,
        },
    )
    ctx = ssl.create_default_context()
    with urlopen(req, context=ctx, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    load_dotenv_from_repo_root()

    p = argparse.ArgumentParser(description="Test analyze-photo Anthropic prompt + model locally.")
    p.add_argument("image", nargs="?", help="Path to a local image (jpg/png/webp/…)")
    p.add_argument("--url", dest="image_url", help="Public image URL (same as Edge Function imageUrl)")
    p.add_argument("--prompt", help="Override DEFAULT_PROMPT (otherwise matches Edge Function)")
    p.add_argument("--raw", action="store_true", help="Print full API JSON response")
    args = p.parse_args()

    if bool(args.image) == bool(args.image_url):
        p.error("Provide exactly one of: IMAGE path or --url")

    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print("Set ANTHROPIC_API_KEY in the environment or in .env at the repo root.", file=sys.stderr)
        return 1

    if args.image_url:
        content = build_messages_image_url(args.image_url)
    else:
        path = Path(args.image).expanduser()
        if not path.is_file():
            print(f"Not a file: {path}", file=sys.stderr)
            return 1
        content = build_messages_image_file(path)

    prompt_note = args.prompt or DEFAULT_PROMPT
    print("--- Request (summary) ---", flush=True)
    print(f"URL: {ANTHROPIC_API_URL}", flush=True)
    print(f"model: {MODEL}  max_tokens: {MAX_TOKENS}  anthropic-version: {ANTHROPIC_VERSION}", flush=True)
    print(f"prompt ({len(prompt_note)} chars):", flush=True)
    print(prompt_note[:500] + ("…" if len(prompt_note) > 500 else ""), flush=True)
    print(flush=True)

    try:
        raw_response = call_anthropic(api_key, content, args.prompt)
    except HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        print(f"HTTP {e.code}: {err_body}", file=sys.stderr)
        return 1
    except URLError as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return 1

    if args.raw:
        print(json.dumps(raw_response, indent=2))
        return 0

    blocks = raw_response.get("content") or []
    text = ""
    for block in blocks:
        if isinstance(block, dict) and block.get("type") == "text":
            text = block.get("text") or ""
            break

    print("--- Model text output ---", flush=True)
    print(text or "(empty)", flush=True)
    print(flush=True)

    parsed = parse_calorie_nutrients_json(text) if text else None
    print("--- Parsed (same rules as Edge Function) ---", flush=True)
    if parsed is not None:
        print(json.dumps(parsed, indent=2))
    else:
        print(json.dumps({"success": False, "raw": text}, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
