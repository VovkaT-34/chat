"""Public-source vehicle plate search and OCR helpers."""

import re
from urllib.parse import quote

import httpx
from PIL import Image
from io import BytesIO

TIMEOUT = 10.0
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; GlazBogaOSINT/1.0)"}


def normalize_plate(value: str) -> str:
    return re.sub(r"[^A-Za-zА-Яа-я0-9]", "", value.strip()).upper()


def plate_like(value: str) -> bool:
    v = normalize_plate(value)
    return bool(re.fullmatch(r"[A-ZА-Я0-9]{5,10}", v)) and any(c.isdigit() for c in v)

async def _ddg_images(query: str, limit: int = 12) -> list[dict]:
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers=HEADERS) as client:
        page = await client.get("https://duckduckgo.com/?q=" + quote(query) + "&iar=images&iax=images&ia=images")
        page.raise_for_status()
        m = re.search(r"vqd=['\"]([^'\"]+)['\"]", page.text)
        if not m:
            return []
        api = await client.get("https://duckduckgo.com/i.js", params={"q": query, "o": "json", "l": "ru-ru", "vqd": m.group(1), "f": ",,,,", "p": "1"})
        api.raise_for_status()
        data = api.json()
    out = []
    for item in (data.get("results") or [])[:limit]:
        out.append({"source": "DuckDuckGo Images", "name": item.get("title") or "Фото по номеру", "url": item.get("image") or item.get("url"), "snippet": item.get("url") or "", "kind": "plate_image"})
    return [x for x in out if x.get("url")]

async def plate_public_search(value: str, max_results: int = 12) -> list[dict]:
    plate = normalize_plate(value)
    variants = [plate, value.strip(), f'"{plate}"']
    results = []
    seen = set()
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers=HEADERS) as client:
        for q in dict.fromkeys(variants):
            try:
                response = await client.get("https://html.duckduckgo.com/html/?q=" + quote(q))
                response.raise_for_status()
                blocks = re.findall(r'<div class="result results_links[^>]*>(.*?)</div>\s*</div>', response.text, re.S)
                for block in blocks:
                    m = re.search(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', block, re.S)
                    if not m:
                        continue
                    url = m.group(1).replace("&amp;", "&")
                    if url in seen:
                        continue
                    seen.add(url)
                    title = re.sub(r"<[^>]+>", " ", m.group(2)).strip()
                    sm = re.search(r'class="result__snippet"[^>]*>(.*?)</', block, re.S)
                    snippet = re.sub(r"<[^>]+>", " ", sm.group(1)).strip() if sm else ""
                    results.append({"source": "Python / public web", "name": title, "url": url, "snippet": snippet, "kind": "plate_public"})
                    if len(results) >= max_results:
                        break
            except Exception:
                continue
            if len(results) >= max_results:
                break
    try:
        results.extend(await _ddg_images(plate, 12))
    except Exception:
        pass
    return results

async def image_plate_search(url: str) -> dict:
    result = {"query": url, "ocr": [], "plates": []}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers=HEADERS) as client:
            response = await client.get(url)
            response.raise_for_status()
        image = Image.open(BytesIO(response.content)).convert("RGB")
        try:
            from rapidocr import RapidOCR
            engine = RapidOCR()
            ocr_result = engine(image)
            texts = []
            for item in getattr(ocr_result, "txts", []) or []:
                texts.append(str(item).strip())
            if not texts and hasattr(ocr_result, "boxes"):
                texts = [str(x).strip() for x in getattr(ocr_result, "txts", []) or []]
            result["ocr"] = list(dict.fromkeys(x for x in texts if x))[:50]
            result["plates"] = list(dict.fromkeys(normalize_plate(x) for x in result["ocr"] if plate_like(x)))[:10]
        except Exception as exc:
            result["ocr_error"] = str(exc)
    except Exception as exc:
        result["error"] = str(exc)
    return result
