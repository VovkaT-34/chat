"""Safe public-source deep OSINT helpers for Glaz Boga."""

import re
from urllib.parse import quote, urljoin

import httpx
import phonenumbers
from phonenumbers import carrier, geocoder, timezone

TIMEOUT = 8.0


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
        international = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.INTERNATIONAL)
        e164 = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        national = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.NATIONAL)
        return {
            "possible": phonenumbers.is_possible_number(parsed),
            "valid": phonenumbers.is_valid_number(parsed),
            "international": international,
            "e164": e164,
            "national": national,
            "country": phonenumbers.region_code_for_number(parsed),
            "country_code": parsed.country_code,
            "location": geocoder.description_for_number(parsed, "ru") or geocoder.description_for_number(parsed, "en"),
            "carrier": carrier.name_for_number(parsed, "ru") or carrier.name_for_number(parsed, "en"),
            "timezones": list(timezone.time_zones_for_number(parsed)),
            "type": str(phonenumbers.number_type(parsed)),
        }
    except Exception as exc:
        return {"possible": False, "valid": False, "error": str(exc)}


async def phone_public_search(value: str) -> list[dict]:
    """Fetch public search results server-side instead of sending the user to a search page."""
    variants = {value.strip()}
    info = phone_info(value)
    for key in ("international", "e164", "national"):
        if info.get(key):
            variants.add(info[key])
    results = []
    seen = set()
    headers = {"User-Agent": "Mozilla/5.0 (compatible; GlazBogaOSINT/1.0)"}
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers=headers) as client:
        for variant in list(variants)[:4]:
            url = "https://html.duckduckgo.com/html/?q=" + quote(f'"{variant}"')
            try:
                response = await client.get(url)
                if not response.is_success:
                    continue
                html = response.text
                for match in re.finditer(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.I | re.S):
                    href = match.group(1)
                    title = re.sub(r"<[^>]+>", "", match.group(2)).strip()
                    href = urljoin("https://html.duckduckgo.com/", href)
                    if href in seen or not href.startswith(("http://", "https://")):
                        continue
                    seen.add(href)
                    results.append({"source": "DuckDuckGo", "name": title or href, "url": href, "query": variant})
                    if len(results) >= 30:
                        return results
            except Exception:
                continue
    return results


def validate_vin(value: str) -> bool:
    return bool(re.fullmatch(r"[A-HJ-NPR-Z0-9]{17}", value.strip().upper()))


async def vin_info(value: str) -> dict:
    vin = value.strip().upper()
    if not validate_vin(vin):
        return {"valid_format": False, "error": "VIN должен содержать 17 символов без I, O и Q"}
    url = f"https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{quote(vin)}?format=json"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            data = response.json()
        row = (data.get("Results") or [{}])[0]
        fields = ["Make", "Model", "ModelYear", "VehicleType", "BodyClass", "EngineCylinders", "FuelTypePrimary"]
        return {"valid_format": True, "source": "NHTSA vPIC", "data": {k: row.get(k) for k in fields if row.get(k)}}
    except Exception as exc:
        return {"valid_format": True, "source": "NHTSA vPIC", "error": str(exc)}


async def domain_info(domain: str) -> dict:
    result = {"query": domain, "certificates": [], "dns": {}}
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        cert_task = client.get(f"https://crt.sh/?q={quote(domain)}&output=json")
        rdap_task = client.get(f"https://rdap.org/domain/{quote(domain)}")
        cert, rdap = await __import__("asyncio").gather(cert_task, rdap_task, return_exceptions=True)
        if not isinstance(cert, Exception) and cert.is_success:
            names = set()
            for item in cert.json()[:200]:
                for name in str(item.get("name_value", "")).splitlines():
                    if name.strip(): names.add(name.strip().lower())
            result["certificates"] = sorted(names)[:100]
        if not isinstance(rdap, Exception) and rdap.is_success:
            data = rdap.json()
            result["rdap"] = {"name": data.get("ldhName"), "status": data.get("status", [])}
    return result


async def ip_info(ip: str) -> dict:
    result = {"query": ip}
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True) as client:
        rdap, bgp = await __import__("asyncio").gather(client.get(f"https://rdap.org/ip/{quote(ip)}"), client.get(f"https://api.bgpview.io/ip/{quote(ip)}"), return_exceptions=True)
        if not isinstance(rdap, Exception) and rdap.is_success:
            data = rdap.json()
            result["rdap"] = {"name": data.get("name"), "country": data.get("country"), "handle": data.get("handle")}
        if not isinstance(bgp, Exception) and bgp.is_success:
            data = bgp.json().get("data", {})
            prefix = (data.get("prefixes") or [{}])[0]
            asn = prefix.get("asn") or {}
            result["bgp"] = {"prefix": prefix.get("prefix"), "asn": asn.get("asn"), "name": asn.get("name")}
    return result
