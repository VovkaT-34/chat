import asyncio
import logging
import time
import uuid
from importlib.resources import files

import phonenumbers
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from maigret import search as maigret_search
from maigret.sites import MaigretDatabase
from phonenumbers import carrier, geocoder, timezone

app = FastAPI(title="Glaz Boga OSINT", version="0.2.4")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("glaz-boga")
MAIGRET_DATA = files("maigret").joinpath("resources", "data.json")
DB = None
SITES = None
JOBS = {}
ACTIVE_JOB_ID = None
BATCH_SIZE = 25
MAX_CONNECTIONS = 8
REQUEST_TIMEOUT = 3
JOB_TTL = 1800

def get_sites():
    global DB, SITES
    if SITES is None:
        DB = MaigretDatabase().load_from_path(str(MAIGRET_DATA))
        SITES = DB.sites_dict
    return SITES

def cleanup_jobs():
    cutoff = time.time() - JOB_TTL
    for job_id in list(JOBS):
        job = JOBS[job_id]
        if job["finished_at"] and job["finished_at"] < cutoff:
            JOBS.pop(job_id, None)

@app.get("/health")
def health():
    return {"ok": True, "engine": "maigret"}

async def run_username_job(job_id: str, username: str, sites):
    global ACTIVE_JOB_ID
    job = JOBS[job_id]
    try:
        items = list(sites.items())
        job["total"] = len(items)
        job["status"] = "running"
        found = {}
        for offset in range(0, len(items), BATCH_SIZE):
            batch = dict(items[offset:offset + BATCH_SIZE])
            results = await maigret_search(username=username, site_dict=batch, logger=logger, timeout=REQUEST_TIMEOUT, is_parsing_enabled=False, max_connections=MAX_CONNECTIONS, no_progressbar=True)
            for name, data in results.items():
                status = data.get("status")
                if status and status.is_found():
                    found[name] = {"name": name, "url": data.get("url_user"), "http_status": data.get("http_status"), "rank": data.get("rank"), "ids_data": data.get("ids_data", {})}
            job["checked"] = min(offset + len(batch), len(items))
            job["results"] = list(found.values())
            await asyncio.sleep(0.15)
        job["status"] = "done"
    except Exception as exc:
        logger.exception("Maigret job failed: %s", exc)
        job["status"] = "error"
        job["error"] = str(exc)
    finally:
        job["finished_at"] = time.time()
        if ACTIVE_JOB_ID == job_id:
            ACTIVE_JOB_ID = None

@app.get("/username")
async def username(q: str = Query(min_length=1, max_length=64)):
    global ACTIVE_JOB_ID
    cleanup_jobs()
    if ACTIVE_JOB_ID and ACTIVE_JOB_ID in JOBS:
        active = JOBS[ACTIVE_JOB_ID]
        if active["query"].lower() == q.strip().lower():
            return {"type":"username","query":q,"job_id":ACTIVE_JOB_ID,"status":active["status"],"total":active["total"],"checked":active["checked"],"count":len(active["results"]),"results":active["results"]}
        raise HTTPException(status_code=409, detail="Другой username-поиск уже выполняется")
    sites = get_sites()
    total = len(sites)
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {"query":q.strip(),"status":"queued","total":total,"checked":0,"results":[],"error":None,"finished_at":None}
    ACTIVE_JOB_ID = job_id
    asyncio.create_task(run_username_job(job_id, q.strip(), sites))
    return {"type":"username","query":q.strip(),"job_id":job_id,"status":"queued","total":total,"checked":0,"count":0,"results":[]}

@app.get("/username/status")
def username_status(job_id: str = Query(min_length=8, max_length=64)):
    cleanup_jobs()
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Задание не найдено или уже удалено")
    return {"type":"username","query":job["query"],"job_id":job_id,"status":job["status"],"total":job["total"],"checked":job["checked"],"count":len(job["results"]),"results":job["results"],"error":job["error"]}

@app.get("/phone")
def phone(q: str = Query(min_length=3, max_length=32)):
    try:
        p = phonenumbers.parse(q, None)
        return {"type":"phone","query":q,"possible":phonenumbers.is_possible_number(p),"valid":phonenumbers.is_valid_number(p),"international":phonenumbers.format_number(p,phonenumbers.PhoneNumberFormat.INTERNATIONAL),"country":phonenumbers.region_code_for_number(p),"location":geocoder.description_for_number(p,"en"),"carrier":carrier.name_for_number(p,"en"),"timezones":list(timezone.time_zones_for_number(p))}
    except Exception as e:
        return {"type":"phone","query":q,"possible":False,"valid":False,"error":str(e)}
