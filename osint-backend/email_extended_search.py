"""Dedicated public indexed-email search for Glaz Boga module 9."""

from urllib.parse import urlparse

from ddgs import DDGS


def _domain(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except Exception:
        return ""


def _search_sync(email: str, max_results: int) -> list[dict]:
    results = DDGS(timeout=8).text(
        f'"{email}"',
        region="ru-ru",
        safesearch="off",
        max_results=max_results,
        backend="auto",
    )
    output = []
    seen = set()
    for item in results:
        href = str(item.get("href") or "").strip()
        title = str(item.get("title") or "").strip()
        body = str(item.get("body") or "").strip()
        if not href.startswith(("http://", "https://")):
            continue
        key = href.rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        output.append({
            "source": f"Публичное упоминание email: {_domain(href) or title}",
            "name": title or _domain(href) or href,
            "url": href,
            "snippet": body,
            "domain": _domain(href),
            "kind": "email_public",
        })
        if len(output) >= max_results:
            break
    return output


async def email_extended_public_search(email: str, max_results: int = 30) -> list[dict]:
    """Return actual indexed public pages containing the exact email."""
    import asyncio

    value = email.strip().lower()
    if not value:
        return []
    try:
        return await asyncio.to_thread(_search_sync, value, max_results)
    except Exception:
        return []
