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

from deep_sources import domain_info, email_info, image_info, ip_info, phone_info, phone_public_search, public_search, search_links, vin_info

app = FastAPI(title="Glaz Boga OSINT", version="0.4.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("glaz-boga")
MAIGRET_DATA = files("maigret").joinpath("resources", "data.json")
DB = None
SITES = None
JOBS = {}
ACTIVE_JOB_ID = None
BATCH_SIZE = 10
MAX_CONNECTIONS = 4
REQUEST_TIMEOUT = 3
JOB_TTL = 1800
DEEP_JOB_TTL = 1800
DEEP_JOBS = {}
ACTIVE_DEEP_JOB_ID = None


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


def cleanup_deep_jobs():
    cutoff = time.time() - DEEP_JOB_TTL
    for job_id in list(DEEP_JOBS):
        job = DEEP_JOBS[job_id]
        if job["finished_at"] and job["finished_at"] < cutoff:
            DEEP_JOBS.pop(job_id, None)


@app.get("/health")
def health():
    return {"ok": True, "engine": "maigret", "deep_types": ["username", "phone", "email", "person", "vin", "domain", "ip", "image"]}


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
            job["checked_sites"] = (job["checked_sites"] + list(batch.keys()))[-20:]
            job["results"] = list(found.values())
            await asyncio.sleep(0.25)
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
            return {"type":"username","query":q,"job_id":ACTIVE_JOB_ID,"status":active["status"],"total":active["total"],"checked":active["checked"],"count":len(active["results"]),"results":active["results"],"checked_sites":active["checked_sites"]}
        raise HTTPException(status_code=409, detail="Другой username-поиск уже выполняется")
    sites = get_sites()
    total = len(sites)
    job_id = uuid.uuid4().hex
    JOBS[job_id] = {"query":q.strip(),"status":"queued","total":total,"checked":0,"results":[],"checked_sites":[],"error":None,"finished_at":None}
    ACTIVE_JOB_ID = job_id
    asyncio.create_task(run_username_job(job_id, q.strip(), sites))
    return {"type":"username","query":q.strip(),"job_id":job_id,"status":"queued","total":total,"checked":0,"count":0,"results":[],"checked_sites":[]}


@app.get("/username/status")
def username_status(job_id: str = Query(min_length=8, max_length=64)):
    cleanup_jobs()
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Задание не найдено или уже удалено")
    return {"type":"username","query":job["query"],"job_id":job_id,"status":job["status"],"total":job["total"],"checked":job["checked"],"count":len(job["results"]),"results":job["results"],"checked_sites":job["checked_sites"],"error":job["error"]}


@app.get("/phone")
def phone(q: str = Query(min_length=3, max_length=32)):
    return {"type":"phone","query":q,**phone_info(q)}


async def run_deep_job(job_id: str, kind: str, query: str):
    global ACTIVE_DEEP_JOB_ID
    job = DEEP_JOBS[job_id]
    try:
        job["status"] = "running"
        if kind == "username":
            sites = get_sites()
            job["total"] = len(sites)
            items = list(sites.items())
            found = {}
            for offset in range(0, len(items), BATCH_SIZE):
                batch = dict(items[offset:offset + BATCH_SIZE])
                results = await maigret_search(username=query, site_dict=batch, logger=logger, timeout=REQUEST_TIMEOUT, is_parsing_enabled=False, max_connections=MAX_CONNECTIONS, no_progressbar=True)
                for name, data in results.items():
                    status = data.get("status")
                    if status and status.is_found():
                        found[name] = {"name": name, "url": data.get("url_user"), "http_status": data.get("http_status")}
                job["checked"] = min(offset + len(batch), len(items))
                job["count"] = len(found)
                job["results"] = list(found.values())
                job["checked_items"] = (job["checked_items"] + list(batch.keys()))[-20:]
                await asyncio.sleep(0.25)
        elif kind == "phone":
            public_results = await phone_public_search(query)
            job["results"] = public_results
            job["total"] = len(public_results)
            job["checked"] = len(public_results)
            job["count"] = len(public_results)
            job["checked_items"] = ["Python / phonenumbers"]
        elif kind == "email":
            info = await email_info(query)
            public_results = await public_search(query, "email")
            job["results"] = [{"source": "Python / email-validator + DNS", "name": "Email-анализ", "data": info}] + public_results
            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(public_results)
            job["checked_items"] = ["email-validator", "DNS/MX/TXT/DMARC", "Python / public web"]
        elif kind == "person":
            public_results = await public_search(query, "person")
            job["results"] = public_results
            job["total"] = len(public_results)
            job["checked"] = job["total"]
            job["count"] = len(public_results)
            job["checked_items"] = ["Python / public web"]
        elif kind == "vin":
            info = await vin_info(query)
            public_results = await public_search(query, "vin")
            job["results"] = [{"source": "Python / NHTSA vPIC", "name": "VIN-анализ", "data": info}] + public_results
            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(public_results)
            job["checked_items"] = ["Python / NHTSA vPIC", "Python / public web"]
        elif kind == "domain":
            info = await domain_info(query)
            public_results = await public_search(query, "domain")
            job["results"] = [{"source": "Python / dnspython + RDAP + crt.sh", "name": "Доменный анализ", "data": info}] + public_results
            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(public_results)
            job["checked_items"] = ["dnspython / DNS", "RDAP", "crt.sh", "Python / public web"]
        elif kind == "ip":
            info = await ip_info(query)
            public_results = await public_search(query, "ip")
            job["results"] = [{"source": "Python / ipaddress + RDAP + BGP", "name": "IP-анализ", "data": info}] + public_results
            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(public_results)
            job["checked_items"] = ["Python / ipaddress", "RDAP", "BGPView", "Python / public web"]
        elif kind == "image":
            info = await image_info(query)
            job["results"] = [{"source": "Python / Pillow", "name": "Анализ изображения", "data": info}]
            job["total"] = 1
            job["checked"] = 1
            job["count"] = 1 if "error" not in info else 0
            job["checked_items"] = ["Python / Pillow"]
        else:
            raise ValueError("Неизвестный тип глубокого поиска")
        job["status"] = "done"
    except Exception as exc:
        logger.exception("Deep job failed: %s", exc)
        job["status"] = "error"
        job["error"] = str(exc)
    finally:
        job["finished_at"] = time.time()
        if ACTIVE_DEEP_JOB_ID == job_id:
            ACTIVE_DEEP_JOB_ID = None


@app.get("/deep")
async def deep_search(kind: str = Query(pattern="^(username|phone|email|person|vin|domain|ip|image)$"), q: str = Query(min_length=1, max_length=256)):
    global ACTIVE_DEEP_JOB_ID
    cleanup_deep_jobs()
    query = q.strip()
    if ACTIVE_DEEP_JOB_ID and ACTIVE_DEEP_JOB_ID in DEEP_JOBS:
        active = DEEP_JOBS[ACTIVE_DEEP_JOB_ID]
        if active["kind"] == kind and active["query"].lower() == query.lower():
            return active
        raise HTTPException(status_code=409, detail="Другой глубокий поиск уже выполняется")
    job_id = uuid.uuid4().hex
    DEEP_JOBS[job_id] = {"type": kind, "kind": kind, "query": query, "job_id": job_id, "status": "queued", "total": 0, "checked": 0, "count": 0, "results": [], "checked_items": [], "error": None, "finished_at": None}
    ACTIVE_DEEP_JOB_ID = job_id
    asyncio.create_task(run_deep_job(job_id, kind, query))
    return DEEP_JOBS[job_id]


@app.get("/deep/status")
def deep_status(job_id: str = Query(min_length=8, max_length=64)):
    cleanup_deep_jobs()
    job = DEEP_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Глубокое задание не найдено или уже удалено")
    return job


@app.get("/deep/sources")
def deep_sources(kind: str = Query(pattern="^(username|phone|email|person|vin|domain|ip|image)$"), q: str = Query(min_length=1, max_length=256)):
    return {"type": kind, "query": q.strip(), "sources": search_links(q.strip(), kind)}
