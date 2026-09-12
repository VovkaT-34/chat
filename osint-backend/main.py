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

from deep_sources import domain_info, ip_info, phone_info, search_links, vin_info

app = FastAPI(title="Glaz Boga OSINT", version="0.3.0")
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
            # Reuse the stable Maigret background engine, while keeping this
            # generic job format ready for the other deep-search libraries.
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
            job["results"] = [{"source": "Phone metadata", "data": phone_info(query)}] + search_links(query, "phone")
            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(job["results"])
        elif kind == "email":
            job["results"] = [{"source": "Public-source search", "data": "Поиск публичных упоминаний"}] + search_links(query, "email")
            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(job["results"])
        elif kind == "person":
            job["results"] = search_links(query, "person")
            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(job["results"])
        elif kind == "vin":
            info = await vin_info(query)
            job["results"] = [{"source": "NHTSA vPIC", "data": info}] + search_links(query, "vin")
            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(job["results"])
        elif kind == "domain":
            info = await domain_info(query)
            job["results"] = [{"source": "DNS/RDAP/certificates", "data": info}] + search_links(query, "domain")
            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(job["results"])
        elif kind == "ip":
            info = await ip_info(query)
            job["results"] = [{"source": "RDAP/BGP", "data": info}] + search_links(query, "ip")
            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(job["results"])
        elif kind == "image":
            job["results"] = search_links(query, "image")
            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(job["results"])
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
    DEEP_JOBS[job_id] = {
        "type": kind, "kind": kind, "query": query, "job_id": job_id,
        "status": "queued", "total": 0, "checked": 0, "count": 0,
        "results": [], "checked_items": [], "error": None, "finished_at": None,
    }
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
