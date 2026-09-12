"""Free public-source deep OSINT helpers for Glaz Boga."""

import asyncio
import html as html_lib
import io
import re
from urllib.parse import parse_qs, quote, unquote, urlparse

import dns.resolver
import httpx
import phonenumbers
from ddgs import DDGS
from email_validator import EmailNotValidError, validate_email
from PIL import Image, UnidentifiedImageError
from phonenumbers import carrier, geocoder, timezone

TIMEOUT = 8.0
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; GlazBogaOSINT/1.0)"}


def search_links(query: str, kind: str) -> list[dict]:
    q = quote(query.strip())
    templates = {
        "person": [("Google", f'https://www.google.com/search?q=%22{q}%22'), ("Bing", f'https://www.bing.com/search?q=%22{q}%22'), ("Yandex", f'https://yandex.ru/search/?text=%22{q}%22')],
        "phone": [("Google", f'https://www.google.com/search?q=%22{q}%22'), ("Bing", f'https://www.bing.com/search?q=%22{q}%22'), ("Yandex", f'https://yandex.ru/search/?text=%22{q}%22')],
        "email": [("Google", f'https://www.google.com/search?q=%22{q}%22'), ("Bing", f'https://www.bing.com/search?q=%22{q}%22'), ("GitHub", f'https://github.com/search?q={q}&type=users')],
        "vin": [("Google", f'https://www.google.com/search?q=%22{q}%22'), ("Bing", f'https://www.bing.com/search?q=%22{q}%22'), ("NHTSA vPIC", f'https://vpic.nhtsa.dot.gov/decoder/Decoder?VIN={q}&ModelYear=')],
        "domain": [("Google", f'https://www.google.com/search?q=%22{q}%22'), ("crt.sh", f'https://crt.sh/?q={q}'), ("Wayback", f'https://web.archive.org/web/*/{q}')],
        "ip": [("Google", f'https://www.google.com/search?q=%22{q}%22'), ("BGP HE", f'https://bgp.he.net/ip/{q}'), ("IPinfo", f'https://ipinfo.io/{q}')],
        "image": [("Google Lens", 'https://lens.google.com/'), ("Yandex Images", 'https://yandex.ru/images/'), ("TinEye", 'https://tineye.com/')],
    }
    return [{"name": name, "url": url} for name, url in templates.get(kind, [])]


def phone_info(value: str) -> dict:
    try:
        parsed = phonenumbers.parse(value, None)
        number_type = phonenumbers.number_type(parsed)
        type_names = {
            phonenumbers.PhoneNumberType.FIXED_LINE: "Стационарный",
            phonenumbers.PhoneNumberType.MOBILE: "Мобильный",
            phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE: "Стационарный / мобильный",
            phonenumbers.PhoneNumberType.TOLL_FREE: "Бесплатный",
            phonenumbers.PhoneNumberType.PREMIUM_RATE: "Платный",
            phonenumbers.PhoneNumberType.SHARED_COST: "Общая стоимость",
            phonenumbers.PhoneNumberType.VOIP: "VoIP",
            phonenumbers.PhoneNumberType.PERSONAL_NUMBER: "Персональный",
            phonenumbers.PhoneNumberType.PAGER: "Пейджер",
            phonenumbers.PhoneNumberType.UAN: "UAN",
            phonenumbers.PhoneNumberType.VOICEMAIL: "Голосовая почта",
            phonenumbers.PhoneNumberType.UNKNOWN: "Неизвестный",
        }
        region_code = phonenumbers.region_code_for_number(parsed)
        country_name = geocoder.country_name_for_number(parsed, "ru") or geocoder.country_name_for_number(parsed, "en")
        location = geocoder.description_for_number(parsed, "ru") or geocoder.description_for_number(parsed, "en")
        carrier_name = carrier.name_for_number(parsed, "ru") or carrier.name_for_number(parsed, "en")
        return {
            "possible": phonenumbers.is_possible_number(parsed),
            "valid": phonenumbers.is_valid_number(parsed),
            "international": phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.INTERNATIONAL),
            "e164": phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164),
            "national": phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.NATIONAL),
            "rfc3966": phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.RFC3966),
            "country": region_code,
            "country_name": country_name,
            "country_code": parsed.country_code,
            "region": location,
            "location": location,
            "carrier": carrier_name,
            "timezones": list(timezone.time_zones_for_number(parsed)),
            "type": type_names.get(number_type, str(number_type)),
            "type_code": number_type,
        }
    except Exception as exc:
        return {"possible": False, "valid": False, "error": str(exc)}


async def phone_public_search(value: str, max_results: int = 30) -> list[dict]:
    info = phone_info(value)
    if info.get("error"):
        return [{"source": f"Телефон: ошибка разбора — {info['error']}", "name": "Ошибка разбора номера", "kind": "error"}]
    lines = [
        f"Номер: {info.get('international') or value}",
        f"E.164: {info.get('e164') or '—'}",
        f"Национальный: {info.get('national') or '—'}",
        f"Страна: {info.get('country_name') or info.get('country') or '—'}",
        f"Код страны: +{info.get('country_code') or '—'}",
        f"Регион: {info.get('region') or 'не определён'}",
        f"Оператор: {info.get('carrier') or 'не определён'}",
        f"Тип: {info.get('type') or 'не определён'}",
        f"Часовые зоны: {', '.join(info.get('timezones') or []) or 'не определены'}",
        f"Возможен: {'Да' if info.get('possible') else 'Нет'}",
        f"Валиден: {'Да' if info.get('valid') else 'Нет'}",
    ]
    metadata = {"source": "Телефон / phonenumbers — " + " | ".join(lines), "name": "Полные метаданные номера", "kind": "phone_metadata", "data": info}
    public_results = await public_search(value, "phone", max_results=max_results)
    return [metadata] + public_results


async def _email_extended_search(query: str, max_results: int = 30) -> list[dict]:
    """Search exact email in public indexed pages and return real URLs."""
    value = query.strip().lower()
    if not value:
        return []
    results = await asyncio.to_thread(
        lambda: DDGS(timeout=8).text(
            f'"{value}"',
            region="ru-ru",
            safesearch="off",
            max_results=max_results,
            backend="auto",
        )
    )
    output, seen = [], set()
    for item in results:
        href = str(item.get("href") or "").strip()
        if not href.startswith(("http://", "https://")):
            continue
        href_key = href.rstrip("/")
        if href_key in seen:
            continue
        seen.add(href_key)
        title = str(item.get("title") or "").strip()
        body = str(item.get("body") or "").strip()
        domain = (urlparse(href).hostname or "").lower()
        output.append({
            "source": f"Публичное упоминание email: {domain or title}",
            "name": title or domain or href,
            "url": href,
            "snippet": body,
            "domain": domain,
            "kind": "email_public",
        })
        if len(output) >= max_results:
            break
    return output


async def public_search(query: str, kind: str, max_results: int = 20) -> list[dict]:
    """Fetch public indexed pages server-side; browser never redirects to a search engine."""
    if kind == "person":
        from extended_search import extended_public_search
        return await extended_public_search(query, "person", max_results=max_results)
    if kind == "email" and max_results == 30:
        return await _email_extended_search(query, max_results=max_results)
    variants = [query.strip()]
    if kind == "email":
        variants.append(query.strip().lower())
    elif kind == "person":
        variants.append(re.sub(r"\s+", " ", query.strip()))
    elif kind == "phone":
        info = phone_info(query)
        for item in (info.get("e164"), info.get("international"), info.get("national")):
            if item:
                variants.append(item)
                variants.append(re.sub(r"[^0-9+]", "", item))
        variants = list(dict.fromkeys(variants))
    results, seen = [], set()
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers=HEADERS) as client:
        for variant in variants:
            try:
                url = "https://html.duckduckgo.com/html/?q=" + quote(f'"{variant}"')
                response = await client.get(url)
                response.raise_for_status()
                html = response.text
                matches = re.findall(r'<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html, re.S | re.I)
                if not matches:
                    matches = re.findall(r'<a[^>]+href="([^"]+)"[^>]+class="[^"]*result__a[^"]*"[^>]*>(.*?)</a>', html, re.S | re.I)
                for href, raw_title in matches:
                    href = html_lib.unescape(href).strip()
                    if href.startswith("//"):
                        href = "https:" + href
                    parsed = urlparse(href)
                    if parsed.scheme not in ("http", "https") or not parsed.netloc:
                        continue
                    title = re.sub(r"<[^>]+>", " ", html_lib.unescape(raw_title))
                    title = re.sub(r"\s+", " ", title).strip()
                    key = href.rstrip("/")
                    if key in seen:
                        continue
                    seen.add(key)
                    results.append({
                        "source": f"Публичное упоминание: {parsed.hostname or 'web'}",
                        "name": title or href,
                        "url": href,
                        "kind": f"{kind}_public",
                    })
                    if len(results) >= max_results:
                        return results
            except Exception:
                continue
    return results
