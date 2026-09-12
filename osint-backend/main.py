from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from maigret import search as maigret_search
from maigret.sites import MaigretDatabase
from importlib.resources import files
import logging
import phonenumbers
from phonenumbers import geocoder, carrier, timezone

app = FastAPI(title="Glaz Boga OSINT", version="0.1.2")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("glaz-boga")
MAIGRET_DATA = files("maigret").joinpath("resources", "data.json")
DB = MaigretDatabase().load_from_path(str(MAIGRET_DATA))
SITES = DB.sites

@app.get("/health")
def health():
    return {"ok": True, "engine": "maigret", "sites": len(SITES)}

@app.get("/username")
async def username(q: str = Query(min_length=1, max_length=64)):
    results = await maigret_search(username=q, site_dict=SITES, logger=logger, timeout=20, is_parsing_enabled=True, max_connections=100, no_progressbar=True)
    out = []
    for name, data in results.items():
        status = data.get("status")
        if not (status and status.is_found()):
            continue
        out.append({"name": name, "url": data.get("url_user"), "http_status": data.get("http_status"), "rank": data.get("rank"), "ids_data": data.get("ids_data", {})})
    return {"type": "username", "query": q, "count": len(out), "checked": len(results), "results": out}

@app.get("/phone")
def phone(q: str = Query(min_length=3, max_length=32)):
    try:
        p = phonenumbers.parse(q, None)
        return {"type": "phone", "query": q, "possible": phonenumbers.is_possible_number(p), "valid": phonenumbers.is_valid_number(p), "international": phonenumbers.format_number(p, phonenumbers.PhoneNumberFormat.INTERNATIONAL), "country": phonenumbers.region_code_for_number(p), "location": geocoder.description_for_number(p, "en"), "carrier": carrier.name_for_number(p, "en"), "timezones": list(timezone.time_zones_for_number(p))}
    except Exception as e:
        return {"type": "phone", "query": q, "possible": False, "valid": False, "error": str(e)}
