"""Russian-first public indexed search for extended Glaz Boga modules."""

import asyncio
import re
from urllib.parse import urlparse

from ddgs import DDGS
import httpx

TIMEOUT = 8
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; GlazBogaOSINT/1.0)"}

SOURCES = {
    "email": [
        ("Яндекс", "yandex.ru"), ("Mail.ru", "mail.ru"), ("VK", "vk.com"),
        ("Одноклассники", "ok.ru"), ("Дзен", "dzen.ru"), ("Пикабу", "pikabu.ru"),
        ("Habr", "habr.com"), ("Avito", "avito.ru"), ("Юла", "youla.ru"),
        ("HH.ru", "hh.ru"), ("ЦИАН", "cian.ru"), ("2ГИС", "2gis.ru"),
        ("Telegram", "t.me"), ("GitHub", "github.com"), ("GitLab", "gitlab.com"),
        ("Reddit", "reddit.com"), ("LinkedIn", "linkedin.com"), ("Stack Overflow", "stackoverflow.com"),
    ],
    "phone": [
        ("Яндекс", "yandex.ru"), ("VK", "vk.com"), ("Одноклассники", "ok.ru"),
        ("Avito", "avito.ru"), ("Юла", "youla.ru"), ("2ГИС", "2gis.ru"),
        ("Auto.ru", "auto.ru"), ("Drom", "drom.ru"), ("Пикабу", "pikabu.ru"),
        ("Дзен", "dzen.ru"), ("HH.ru", "hh.ru"), ("ЦИАН", "cian.ru"),
        ("Telegram", "t.me"), ("GitHub", "github.com"), ("Reddit", "reddit.com"),
        ("LinkedIn", "linkedin.com"), ("Facebook", "facebook.com"),
    ],
}


def _phone_variants(value: str) -> list[str]:
    digits = re.sub(r"\D", "", value)
    variants = [value.strip()]
    if digits:
        variants += [digits, "+" + digits]
        if digits.startswith("7") and len(digits) == 11:
            variants += ["8" + digits[1:], "+7 " + digits[1:4] + " " + digits[4:7] + "-" + digits[7:9] + "-" + digits[9:]]
    return list(dict.fromkeys(x for x in variants if x))


def _query_for(kind: str, value: str, domain: str) -> str:
    if kind == "email":
        return f'"{value.lower()}" site:{domain}'
    variants = _phone_variants(value)
    return f'"{variants[0]}" site:{domain}'


def _relevant(kind: str, query: str, title: str, body: str, href: str) -> bool:
    haystack = " ".join((title, body, href)).lower()
    if kind == "email":
        return query.strip().lower() in haystack
    digits = re.sub(r"\D", "", query)
    found_digits = re.sub(r"\D", "", haystack)
    return bool(digits and digits in found_digits)


async def _verify_page(kind: str, query: str, url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5, follow_redirects=True, headers=HEADERS) as client:
            response = await client.get(url)
        if not response.is_success:
            return False
        text = response.text[:2_000_000].lower()
        if kind == "email":
            return query.strip().lower() in text
        digits = re.sub(r"\D", "", query)
        compact = re.sub(r"\D", "", text)
        return bool(digits and digits in compact)
    except Exception:
        return False


async def extended_public_search(query: str, kind: str, max_results: int = 30, progress=None) -> list[dict]:
    sources = SOURCES.get(kind, [])
    if not sources:
        return []
    results, seen = [], set()
    total = len(sources)
    if progress:
        progress(0, total, "Подготовка", results)
    for index, (name, domain) in enumerate(sources, 1):
        current = f"{name} ({domain})"
        try:
            search_query = _query_for(kind, query, domain)
            items = await asyncio.to_thread(
                lambda q=search_query: DDGS(timeout=TIMEOUT).text(
                    q, region="ru-ru", safesearch="off", max_results=5, backend="auto"
                )
            )
            for item in items:
                href = str(item.get("href") or "").strip()
                title = str(item.get("title") or "").strip()
                body = str(item.get("body") or "").strip()
                if not href.startswith(("http://", "https://")):
                    continue
                if domain not in (urlparse(href).hostname or "").lower():
                    continue
                if not _relevant(kind, query, title, body, href):
                    continue
                key = href.rstrip("/")
                if key in seen:
                    continue
                if not await _verify_page(kind, query, href):
                    continue
                seen.add(key)
                results.append({
                    "source": f"{name}: точное публичное упоминание",
                    "name": title or href,
                    "url": href,
                    "snippet": body,
                    "domain": domain,
                    "site": name,
                    "kind": f"{kind}_public",
                })
                if len(results) >= max_results:
                    break
        except Exception:
            pass
        if progress:
            progress(index, total, current, results)
        if len(results) >= max_results:
            break
    return results
