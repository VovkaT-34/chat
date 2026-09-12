from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from maigret import MaigretDatabase, search
from pathlib import Path
import asyncio
import phonenumbers
from phonenumbers import geocoder, carrier, timezone

app = FastAPI(title="Glaz Boga OSINT", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"]
)

DB = MaigretDatabase()
DB.load_from_path(Path(__file__).resolve().parent / "maigret-data.json")

@app.get("/health")
def health():
    return {"ok": True, "engine": "maigret", "sites": len(DB.sites)}

@app.get("/username")
async def username(q: str = Query(min_length=1, max_length=64)):
    results = await search(q, site_dict=DB.sites, timeout=10, no_progressbar=True)
    out = []
    for name, data in results.items():
        url = data.get("url_user") or data.get("url")
        if not url:
            continue
        out.append({
            "name": name,
            "url": url,
            "status": data.get("status", {}).get("status") if isinstance(data.get("status"), dict) else None,
            "http_status": data.get("http_status"),
        })
    return {"type": "username", "query": q, "count": len(out), "results": out}

@app.get("/phone")
def phone(q: str = Query(min_length=3, max_length=32)):
    try:
        p = phonenumbers.parse(q, None)
        if not phonenumbers.is_possible_number(p):
            return {"type": "phone", "query": q, "valid": False, "results": []}
        return {
            "type": "phone", "query": q,
            "valid": phonenumbers.is_valid_number(p),
            "international": phonenumbers.format_number(p, phonenumbers.PhoneNumberFormat.INTERNATIONAL),
            "country": phonenumbers.region_code_for_number(p),
            "location": geocoder.description_for_number(p, "en"),
            "carrier": carrier.name_for_number(p, "en"),
            "timezones": list(timezone.time_zones_for_number(p)),
        }
    except Exception as e:
        return {"type": "phone", "query": q, "valid": False, "error": str(e), "results": []}
