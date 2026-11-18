import asyncio
import logging
import os
import resource
import time
import uuid
from importlib.resources import files

import httpx

import phonenumbers
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from maigret import search as maigret_search
from maigret.sites import MaigretDatabase
from phonenumbers import carrier, geocoder, timezone

from deep_sources import (
    domain_info,
    email_info,
    image_info,
    ip_info,
    phone_info,
    phone_public_search,
    public_search,
    search_links,
    vin_info,
)
from extended_search import extended_public_search, SOURCES_RU, SOURCES_FOREIGN
from plate_sources import (
    image_plate_search,
    plate_like,
    plate_public_search,
    normalize_plate,
)
from username_engines import sherlock_search, whatsmyname_search
from holehe_engine import holehe_search
from user_scanner_engine import user_scanner_search
from mailaccess_engine import mailaccess_search
from h8mail_engine import h8mail_search
from blackbird_engine import blackbird_search
from mosint_engine import mosint_search


app = FastAPI(title="Glaz Boga OSINT", version="0.5.2")
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("glaz-boga")

SUPABASE_HTTP_CLIENT = httpx.AsyncClient(
    timeout=5,
    limits=httpx.Limits(max_connections=20, max_keepalive_connections=10, keepalive_expiry=30),
)

MAIGRET_DATA = files("maigret").joinpath("resources", "data.json")

DB = None
SITES = None

JOBS = {}
JOB_OWNERS = {}
ACTIVE_JOB_ID = None

BATCH_SIZE = 5
MAX_CONNECTIONS = 2
REQUEST_TIMEOUT = 2
JOB_TTL = 1800

DEEP_JOB_TTL = 1800
DEEP_CANCEL_REQUEST_TTL = 120
DEEP_JOBS = {}
DEEP_JOB_OWNERS = {}
DEEP_TASKS = {}
DEEP_CANCEL_REQUESTS = {}
MAILACCESS_MEMORY_CACHE = {"at": 0.0, "ram_mb": None}
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
            JOB_OWNERS.pop(job_id, None)


def get_owned_username_job(job_id: str, user_id: str):
    job = JOBS.get(job_id)
    if not job or JOB_OWNERS.get(job_id) != user_id:
        raise HTTPException(
            status_code=404,
            detail="Задание не найдено или уже удалено",
        )
    return job


def cleanup_deep_jobs():
    now = time.time()
    cutoff = now - DEEP_JOB_TTL

    for job_id in list(DEEP_JOBS):
        job = DEEP_JOBS[job_id]

        if job["finished_at"] and job["finished_at"] < cutoff:
            DEEP_JOBS.pop(job_id, None)
            DEEP_JOB_OWNERS.pop(job_id, None)

    for job_id in list(DEEP_CANCEL_REQUESTS):
        if DEEP_CANCEL_REQUESTS[job_id]["expires_at"] <= now:
            DEEP_CANCEL_REQUESTS.pop(job_id, None)


def get_owned_deep_job(job_id: str, user_id: str):
    job = DEEP_JOBS.get(job_id)
    if not job or DEEP_JOB_OWNERS.get(job_id) != user_id:
        raise HTTPException(
            status_code=404,
            detail="Глубокое задание не найдено или уже удалено",
        )
    return job


@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": "maigret",
        "deep_types": [
            "username_sherlock",
            "username",
            "username_wmn",
            "phone",
            "email",
            "person",
            "vin",
            "domain",
            "ip",
            "image",
            "email_extended",
            "phone_extended",
            "email_holehe",
            "email_userscanner",
            "email_mailaccess",
            "email_h8mail",
            "email_blackbird",
            "username_blackbird",
            "email_mosint",
        ],
    }


async def require_authenticated_user(request: Request):
    """Validate the Supabase session and require an approved profile."""
    authorization = request.headers.get("authorization", "")
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    headers = {
        "Authorization": "Bearer " + token,
        "apikey": "sb_publishable_bepvJnr4yp-TUIyDK4Wnig_5qEhej3N",
    }
    try:
        client = SUPABASE_HTTP_CLIENT
        response = await client.get(
            "https://sxkukrqjtgkxmzuzondm.supabase.co/auth/v1/user",
            headers=headers,
        )
        if response.status_code != 200:
            raise HTTPException(status_code=401, detail="Недействительная сессия")

        user = response.json()
        user_id = user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Недействительная сессия")

        profile_response = await client.post(
            "https://sxkukrqjtgkxmzuzondm.supabase.co/rest/v1/rpc/get_my_access_status",
            headers={
                **headers,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        if profile_response.status_code != 200:
            raise HTTPException(status_code=503, detail="Не удалось проверить одобрение аккаунта")

        profiles = profile_response.json()
        profile = profiles[0] if isinstance(profiles, list) and profiles else None
        if not profile or profile.get("approved") is not True:
            raise HTTPException(status_code=403, detail="Требуется одобренный аккаунт")

        permission_response = await client.post(
            "https://sxkukrqjtgkxmzuzondm.supabase.co/rest/v1/rpc/has_app_access",
            json={"p_app_id": "glaz-boga"},
            headers={**headers, "Content-Type": "application/json", "Accept": "application/json"},
        )
        if permission_response.status_code != 200 or permission_response.json() is not True:
            raise HTTPException(status_code=403, detail="Нет разрешения на приложение «Глаз Бога»")

        return user
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="Не удалось проверить сессию и права доступа")


@app.middleware("http")
async def enforce_admin_access(request: Request, call_next):
    """Protect every OSINT API route; only health checks and CORS preflight are public."""
    if request.url.path == "/health" or request.method == "OPTIONS":
        return await call_next(request)

    try:
        user = await require_authenticated_user(request)
        request.state.user_id = user["id"]
    except HTTPException as exc:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/scan/state")
def scan_state():
    cleanup_jobs()
    cleanup_deep_jobs()
    quick_running = bool(ACTIVE_JOB_ID and ACTIVE_JOB_ID in JOBS and JOBS[ACTIVE_JOB_ID].get("status") not in {"done", "error", "cancelled"})
    deep_running = bool(ACTIVE_DEEP_JOB_ID and ACTIVE_DEEP_JOB_ID in DEEP_JOBS and DEEP_JOBS[ACTIVE_DEEP_JOB_ID].get("status") not in {"done", "error", "cancelled"})
    return {"scanning": quick_running or deep_running, "quick": quick_running, "deep": deep_running}


def _read_process_rss_mb(pid: int) -> float:
    try:
        with open(f"/proc/{pid}/statm", "r", encoding="utf-8") as fh:
            pages = int(fh.read().split()[1])
        return pages * resource.getpagesize() / (1024 * 1024)
    except Exception:
        return 0.0


def _process_tree_pids(root_pid: int) -> set[int]:
    pids = {root_pid}
    queue = [root_pid]

    while queue:
        pid = queue.pop()
        try:
            with open(
                f"/proc/{pid}/task/{pid}/children",
                "r",
                encoding="utf-8",
            ) as fh:
                children = [
                    int(value)
                    for value in fh.read().split()
                    if value.isdigit()
                ]
        except Exception:
            continue

        for child_pid in children:
            if child_pid not in pids:
                pids.add(child_pid)
                queue.append(child_pid)

    return pids


@app.get("/memory")
def memory():
    """Return RSS for this service process and its child processes."""
    try:
        pids = _process_tree_pids(os.getpid())
        rss_mb = sum(
            _read_process_rss_mb(pid)
            for pid in pids
        )
    except Exception:
        pids = {os.getpid()}
        rss_mb = 0.0

    if rss_mb <= 0:
        try:
            rss_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
            rss_mb = rss_kb / 1024
        except Exception:
            rss_mb = 0.0

    return {
        "ram_mb": round(rss_mb, 1),
        "unit": "MB RAM",
        "processes": len(pids),
    }


def release_process_memory():
    """Release reclaimable Python/Linux heap pages after a completed scan."""
    import gc

    gc.collect()
    try:
        import ctypes
        ctypes.CDLL("libc.so.6").malloc_trim(0)
    except Exception:
        pass


@app.post("/memory/reset")
async def reset_memory(request: Request):
    """Release reclaimable Python/Linux heap pages; never reset while a scan is active."""
    state = scan_state()
    if state["scanning"]:
        raise HTTPException(status_code=409, detail="Нельзя очищать ОЗУ во время сканирования")
    release_process_memory()
    return memory()


MAILACCESS_RENDER_SERVICE_ID = "srv-danemmjtqb8s73blr0i0"


async def _render_api_request(path: str, method: str = "GET"):
    api_key = os.getenv("RENDER_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="RENDER_API_KEY не настроен")
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            response = await client.request(
                method,
                "https://api.render.com/v1" + path,
                headers={"Authorization": "Bearer " + api_key, "Accept": "application/json"},
            )
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Render API вернул HTTP {response.status_code}")
        return response.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=502, detail="Не удалось получить данные Render API")


@app.get("/mailaccess/memory")
async def mailaccess_memory():
    """Return cached current Render memory usage for the isolated MailAccess service."""
    now = time.time()
    if (MAILACCESS_MEMORY_CACHE["ram_mb"] is not None and now - MAILACCESS_MEMORY_CACHE["at"] < 10):
        return {"ram_mb": MAILACCESS_MEMORY_CACHE["ram_mb"], "unit": "MB RAM", "service": "glaz-boga-mailaccess", "cached": True}
    end = now
    start = end - 180
    end_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(end))
    start_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(start))
    payload = await _render_api_request(
        f"/metrics/memory?resource={MAILACCESS_RENDER_SERVICE_ID}"
        f"&startTime={start_iso}&endTime={end_iso}&resolutionSeconds=30"
    )

    if isinstance(payload, list):
        series_items = payload
    elif isinstance(payload, dict):
        series_items = []
        metrics = payload.get("metrics", [])
        if isinstance(metrics, list):
            for metric in metrics:
                if not isinstance(metric, dict):
                    continue
                if metric.get("type") == "memory_usage":
                    nested_series = metric.get("data", [])
                    if isinstance(nested_series, list):
                        series_items.extend(nested_series)
                elif "values" in metric:
                    series_items.append(metric)
    else:
        series_items = []

    points = []
    for series in series_items:
        if not isinstance(series, dict):
            continue
        labels = series.get("labels", [])
        service_labels = [
            label for label in labels
            if isinstance(label, dict)
            and label.get("field") in {"service", "resource"}
        ]
        if service_labels and not any(
            label.get("value") == MAILACCESS_RENDER_SERVICE_ID
            for label in service_labels
        ):
            continue
        values = series.get("values", [])
        if not isinstance(values, list):
            continue
        for point in values:
            if isinstance(point, dict) and "timestamp" in point and "value" in point:
                points.append((point, series.get("unit", "")))

    if not points:
        raise HTTPException(status_code=502, detail="Render API не вернул значения RAM MailAccess")

    latest, unit = max(points, key=lambda item: str(item[0].get("timestamp", "")))
    try:
        value = float(latest["value"])
        normalized_unit = str(unit).strip().lower()
        if normalized_unit in {"bytes", "byte", "b"}:
            ram_mb = value / (1024 * 1024)
        elif normalized_unit in {"gb", "gib"}:
            ram_mb = value * 1024
        elif normalized_unit in {"mb", "mib"}:
            ram_mb = value
        else:
            ram_mb = value / (1024 * 1024) if value > 100000 else value
    except (TypeError, ValueError):
        raise HTTPException(status_code=502, detail="Не удалось разобрать значение RAM MailAccess")

    ram_mb = round(ram_mb, 1)
    MAILACCESS_MEMORY_CACHE["at"] = now
    MAILACCESS_MEMORY_CACHE["ram_mb"] = ram_mb
    return {"ram_mb": ram_mb, "unit": "MB RAM", "service": "glaz-boga-mailaccess", "cached": False}


@app.post("/mailaccess/memory/reset")
async def mailaccess_memory_reset(request: Request):
    """Restart the isolated MailAccess Render service after confirming no local deep scan is active."""
    authorization = request.headers.get("authorization", "")
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            role_response = await client.post(
                "https://sxkukrqjtgkxmzuzondm.supabase.co/rest/v1/rpc/get_my_access_status",
                headers={
                    "Authorization": authorization,
                    "apikey": "sb_publishable_bepvJnr4yp-TUIyDK4Wnig_5qEhej3n",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
            )
        if role_response.status_code != 200:
            raise HTTPException(status_code=503, detail="Не удалось проверить роль пользователя")
        role_rows = role_response.json()
        role = role_rows[0].get("role") if isinstance(role_rows, list) and role_rows else None
        if role != "superadmin":
            raise HTTPException(status_code=403, detail="Перезапуск MailAccess доступен только супер-администратору")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail="Не удалось проверить роль пользователя")

    state = scan_state()
    if state["scanning"]:
        raise HTTPException(status_code=409, detail="Нельзя очищать ОЗУ во время сканирования")
    await _render_api_request(f"/services/{MAILACCESS_RENDER_SERVICE_ID}/restart", method="POST")
    return {"ok": True, "action": "restart", "service": "glaz-boga-mailaccess"}


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

            try:
                results = await asyncio.wait_for(
                    maigret_search(
                        username=username,
                        site_dict=batch,
                        logger=logger,
                        timeout=REQUEST_TIMEOUT,
                        is_parsing_enabled=False,
                        max_connections=MAX_CONNECTIONS,
                        no_progressbar=True,
                    ),
                    timeout=18,
                )
            except asyncio.TimeoutError:
                job["checked"] = min(offset + len(batch), len(items))
                job["checked_sites"] = (
                    job["checked_sites"]
                    + [f"Пакет {offset + 1}–{offset + len(batch)}: таймаут, продолжаем"]
                )[-20:]
                await asyncio.sleep(0)
                continue

            for name, data in results.items():
                status = data.get("status")

                if status and status.is_found():
                    found[name] = {
                        "name": name,
                        "url": data.get("url_user"),
                        "http_status": data.get("http_status"),
                        "rank": data.get("rank"),
                        "ids_data": data.get("ids_data", {}),
                    }

            job["checked"] = min(offset + len(batch), len(items))
            job["checked_sites"] = (
                job["checked_sites"] + list(batch.keys())
            )[-20:]
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
async def username(request: Request, q: str = Query(min_length=1, max_length=64)):
    global ACTIVE_JOB_ID

    cleanup_jobs()

    if ACTIVE_JOB_ID and ACTIVE_JOB_ID in JOBS:
        active = JOBS[ACTIVE_JOB_ID]

        if JOB_OWNERS.get(ACTIVE_JOB_ID) != request.state.user_id:
            raise HTTPException(
                status_code=409,
                detail="Другой username-поиск уже выполняется",
            )

        if active["query"].lower() == q.strip().lower():
            return {
                "type": "username",
                "query": q,
                "job_id": ACTIVE_JOB_ID,
                "status": active["status"],
                "total": active["total"],
                "checked": active["checked"],
                "count": len(active["results"]),
                "results": active["results"],
                "checked_sites": active["checked_sites"],
            }

        raise HTTPException(
            status_code=409,
            detail="Другой username-поиск уже выполняется",
        )

    sites = get_sites()
    total = len(sites)
    job_id = uuid.uuid4().hex

    JOB_OWNERS[job_id] = request.state.user_id
    JOBS[job_id] = {
        "query": q.strip(),
        "status": "queued",
        "total": total,
        "checked": 0,
        "results": [],
        "checked_sites": [],
        "error": None,
        "finished_at": None,
    }

    ACTIVE_JOB_ID = job_id

    asyncio.create_task(
        run_username_job(job_id, q.strip(), sites)
    )

    return {
        "type": "username",
        "query": q.strip(),
        "job_id": job_id,
        "status": "queued",
        "total": total,
        "checked": 0,
        "count": 0,
        "results": [],
        "checked_sites": [],
    }


@app.get("/username/status")
def username_status(
    request: Request,
    job_id: str = Query(min_length=8, max_length=64),
):
    cleanup_jobs()

    job = get_owned_username_job(job_id, request.state.user_id)

    return {
        "type": "username",
        "query": job["query"],
        "job_id": job_id,
        "status": job["status"],
        "total": job["total"],
        "checked": job["checked"],
        "count": len(job["results"]),
        "results": job["results"],
        "checked_sites": job["checked_sites"],
        "error": job["error"],
    }


@app.get("/phone")
def phone(q: str = Query(min_length=3, max_length=32)):
    return {
        "type": "phone",
        "query": q,
        **phone_info(q),
    }


async def run_deep_job(job_id: str, kind: str, query: str):
    global ACTIVE_DEEP_JOB_ID

    job = DEEP_JOBS[job_id]

    try:
        job["status"] = "running"

        if kind == "username_sherlock":

            def progress(checked, total, current, results):
                job["checked"] = checked
                job["total"] = total
                job["count"] = len(results)
                job["results"] = list(results)
                job["checked_items"] = [current]

            results, total = await sherlock_search(
                query,
                progress=progress,
            )

            job["results"] = results
            job["total"] = total
            job["checked"] = total
            job["count"] = len(results)
            job["checked_items"] = [
                f"Sherlock: готово ({total} сайтов)"
            ]

        elif kind == "username":

            sites = get_sites()
            job["total"] = len(sites)
            items = list(sites.items())
            found = {}

            for offset in range(0, len(items), BATCH_SIZE):
                batch = dict(items[offset:offset + BATCH_SIZE])

                try:
                    results = await asyncio.wait_for(
                        maigret_search(
                            username=query,
                            site_dict=batch,
                            logger=logger,
                            timeout=REQUEST_TIMEOUT,
                            is_parsing_enabled=False,
                            max_connections=MAX_CONNECTIONS,
                            no_progressbar=True,
                        ),
                        timeout=18,
                    )
                except asyncio.TimeoutError:
                    job["checked"] = min(
                        offset + len(batch),
                        len(items),
                    )
                    job["checked_items"] = (
                        job["checked_items"]
                        + [f"Пакет {offset + 1}–{offset + len(batch)}: таймаут, продолжаем"]
                    )[-20:]
                    await asyncio.sleep(0)
                    continue

                for name, data in results.items():
                    status = data.get("status")

                    if status and status.is_found():
                        found[name] = {
                            "name": name,
                            "url": data.get("url_user"),
                            "http_status": data.get("http_status"),
                        }

                job["checked"] = min(
                    offset + len(batch),
                    len(items),
                )
                job["count"] = len(found)
                job["results"] = list(found.values())

                job["checked_items"] = (
                    job["checked_items"] + list(batch.keys())
                )[-20:]

                await asyncio.sleep(0.25)

        elif kind == "username_wmn":

            def progress(checked, total, current, results):
                job["checked"] = checked
                job["total"] = total
                job["count"] = len(results)
                job["results"] = list(results)
                job["checked_items"] = [current]

            results, total = await whatsmyname_search(
                query,
                progress=progress,
            )

            job["results"] = results
            job["total"] = total
            job["checked"] = total
            job["count"] = len(results)
            job["checked_items"] = [
                f"WhatsMyName: готово ({total} сайтов)"
            ]

        elif kind == "phone":

            info_results = await phone_public_search(query)
            public_results = await public_search(
                query,
                "phone",
            )
            info = phone_info(query)

            phone_results = []

            for item in info_results:
                item = dict(item)
                item["source"] = (
                    item.get("name")
                    or item.get("source")
                    or "Python / phonenumbers"
                )
                phone_results.append(item)

            for item in public_results:
                item["source"] = (
                    item.get("name")
                    or item.get("url")
                    or "Python / public web"
                )

            metadata = {
                "source": "Python / phonenumbers",
                "name": "Результаты анализа телефона",
                "kind": "phone_metadata",
                "data": info,
            }

            job["results"] = (
                [metadata]
                + phone_results
                + public_results
            )
            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(job["results"])
            job["checked_items"] = [
                "Python / phonenumbers",
                "Python / public web",
            ]

        elif kind == "email":

            info = await email_info(query)
            public_results = await public_search(
                query,
                "email",
            )

            job["results"] = [
                {
                    "source": "Python / email-validator + DNS",
                    "name": "Email-анализ",
                    "data": info,
                }
            ] + public_results

            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(public_results)
            job["checked_items"] = [
                "email-validator",
                "DNS/MX/TXT/DMARC",
                "Python / public web",
            ]

        elif kind == "email_extended":

            def progress(checked, total, current, results):
                job["checked"] = checked
                job["total"] = total
                job["count"] = len(results)
                job["results"] = list(results)
                job["checked_items"] = [current]

            public_results = await extended_public_search(
                query,
                "email",
                progress=progress,
            )

            total_sources = (
                len(SOURCES_RU["email"])
                + len(SOURCES_FOREIGN["email"])
            )

            job["results"] = public_results
            job["total"] = total_sources
            job["checked"] = total_sources
            job["count"] = len(public_results)
            job["checked_items"] = [
                f"Готово: Россия + иностранные публичные сайты ({total_sources})"
            ]

        elif kind == "phone_extended":

            def progress(checked, total, current, results):
                job["checked"] = checked
                job["total"] = total
                job["count"] = len(results)
                job["results"] = list(results)
                job["checked_items"] = [current]

            public_results = await extended_public_search(
                query,
                "phone",
                progress=progress,
            )

            total_sources = (
                len(SOURCES_RU["phone"])
                + len(SOURCES_FOREIGN["phone"])
            )

            job["results"] = public_results
            job["total"] = total_sources
            job["checked"] = total_sources
            job["count"] = len(public_results)
            job["checked_items"] = [
                f"Готово: Россия + иностранные публичные сайты ({total_sources})"
            ]

        elif kind == "person":

            def progress(checked, total, current, results):
                job["checked"] = checked
                job["total"] = total
                job["count"] = len(results)
                job["results"] = list(results)
                job["checked_items"] = [current]

            public_results = await extended_public_search(
                query,
                "person",
                progress=progress,
            )

            job["results"] = public_results
            job["count"] = len(public_results)

            if job["total"] == 0:
                job["total"] = (
                    len(SOURCES_RU["person"])
                    + len(SOURCES_FOREIGN["person"])
                    + 5
                )

            job["checked_items"] = [
                f"Готово: ФИО — проверка источников завершена "
                f"({job['checked']}/{job['total']})"
            ]

        elif kind == "vin":

            if plate_like(query) and not len(normalize_plate(query)) == 17:

                public_results = await plate_public_search(query)

                job["results"] = [
                    {
                        "source": "Python / public web + DuckDuckGo Images",
                        "name": "Поиск по номеру автомобиля",
                        "data": {
                            "plate": normalize_plate(query)
                        },
                    }
                ] + public_results

                job["total"] = len(job["results"])
                job["checked"] = job["total"]
                job["count"] = len(public_results)
                job["checked_items"] = [
                    "Нормализация номера",
                    "Python / public web",
                    "DuckDuckGo Images",
                ]

            else:

                info = await vin_info(query)
                public_results = await public_search(
                    query,
                    "vin",
                )

                job["results"] = [
                    {
                        "source": "Python / NHTSA vPIC",
                        "name": "VIN-анализ",
                        "data": info,
                    }
                ] + public_results

                job["total"] = len(job["results"])
                job["checked"] = job["total"]
                job["count"] = len(public_results)
                job["checked_items"] = [
                    "Python / NHTSA vPIC",
                    "Python / public web",
                ]

        elif kind == "domain":

            info = await domain_info(query)
            public_results = await public_search(
                query,
                "domain",
            )

            job["results"] = [
                {
                    "source": "Python / dnspython + RDAP + crt.sh",
                    "name": "Доменный анализ",
                    "data": info,
                }
            ] + public_results

            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(public_results)
            job["checked_items"] = [
                "dnspython / DNS",
                "RDAP",
                "crt.sh",
                "Python / public web",
            ]

        elif kind == "ip":

            info = await ip_info(query)
            public_results = await public_search(
                query,
                "ip",
            )

            job["results"] = [
                {
                    "source": "Python / ipaddress + RDAP + BGP",
                    "name": "IP-анализ",
                    "data": info,
                }
            ] + public_results

            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(public_results)
            job["checked_items"] = [
                "Python / ipaddress",
                "RDAP",
                "BGPView",
                "Python / public web",
            ]

        elif kind == "image":

            info = await image_info(query)
            plate_scan = await image_plate_search(query)
            extracted = plate_scan.get("plates") or []

            plate_results = []

            for plate in extracted:
                plate_results.extend(
                    await plate_public_search(
                        plate,
                    )
                )

            job["results"] = [
                {
                    "source": "Python / Pillow + RapidOCR",
                    "name": "Анализ изображения и распознавание номера",
                    "data": {
                        **info,
                        **plate_scan,
                    },
                }
            ] + plate_results

            job["total"] = len(job["results"])
            job["checked"] = job["total"]
            job["count"] = len(plate_results) + (
                1 if "error" not in info else 0
            )
            job["checked_items"] = [
                "Python / Pillow",
                "RapidOCR / ONNX Runtime",
                "Поиск по распознанному номеру",
            ]

        elif kind == "email_holehe":

            def progress(checked, total, current, results):
                job["checked"] = checked
                job["total"] = total
                job["count"] = len(
                    [r for r in results if r.get("exists")]
                )

                found_only = [
                    {
                        "name": r.get("name") or r.get("domain"),
                        "source": "Holehe",
                        "exists": r.get("exists"),
                        "emailrecovery": r.get("emailrecovery"),
                        "phoneNumber": r.get("phoneNumber"),
                        "rateLimit": r.get("rateLimit"),
                        "error": r.get("error"),
                        "data": r,
                    }
                    for r in results
                    if r.get("exists")
                ]

                job["results"] = found_only
                job["checked_items"] = [current]

            results, total = await holehe_search(
                query,
                progress=progress,
            )

            found_only = [
                {
                    "name": r.get("name") or r.get("domain"),
                    "source": "Holehe",
                    "exists": r.get("exists"),
                    "emailrecovery": r.get("emailrecovery"),
                    "phoneNumber": r.get("phoneNumber"),
                    "rateLimit": r.get("rateLimit"),
                    "error": r.get("error"),
                    "data": r,
                }
                for r in results
                if r.get("exists")
            ]

            job["results"] = found_only
            job["total"] = total
            job["checked"] = total
            job["count"] = len(found_only)
            job["checked_items"] = [
                f"Holehe: готово ({total} модулей, найдено {len(found_only)})"
            ]

        elif kind == "email_userscanner":

            def progress(checked, total, current, results):
                job["checked"] = checked
                job["total"] = total
                job["count"] = len(results)
                job["results"] = list(results)
                job["checked_items"] = [current]

            found, total, errors, error_details = await user_scanner_search(
                query,
                progress=progress,
            )

            job["results"] = found
            job["total"] = total
            job["checked"] = total
            job["count"] = len(found)
            job["diagnostics"] = {
                "errors": errors,
                "details": error_details,
            }

            summary = (
                f"user-scanner: готово ({total} модулей, найдено {len(found)}, "
                f"ошибок внешних проверок: {errors})"
            )
            if error_details:
                summary += " • " + " | ".join(error_details[:5])

            job["checked_items"] = [summary]


        elif kind == "email_mailaccess":

            def progress(checked, total, current, results):
                job["checked"] = checked
                job["total"] = total
                job["count"] = len(results)
                job["results"] = list(results)
                job["checked_items"] = [current]

            found, total, checked, errors, error_details, completed = await mailaccess_search(
                query,
                progress=progress,
            )

            job["results"] = found
            job["total"] = total
            job["checked"] = checked
            job["count"] = len(found)
            job["diagnostics"] = {
                "errors": errors,
                "details": error_details,
            }

            summary = (
                f"MailAccess: {'готово' if completed else 'прервано'} "
                f"({checked}/{total} модулей, найдено {len(found)}, "
                f"ошибок внешних проверок: {errors})"
            )
            if error_details:
                summary += " • " + " | ".join(error_details[:5])

            job["checked_items"] = [summary]
            if not completed:
                raise RuntimeError(
                    error_details[-1] if error_details
                    else "MailAccess: расследование не завершилось"
                )

        elif kind == "email_h8mail":

            def progress(checked, total, current, results):
                job["checked"] = checked
                job["total"] = total
                job["count"] = len(results)
                job["results"] = list(results)
                job["checked_items"] = [current]

            found, total = await h8mail_search(
                query,
                progress=progress,
            )

            job["results"] = found
            job["total"] = total
            job["checked"] = total
            job["count"] = len(found)
            job["checked_items"] = [
                f"h8mail: готово (найдено {len(found)})"
            ]

        elif kind == "email_blackbird":

            def progress(checked, total, current, results):
                job["checked"] = checked
                job["total"] = total
                job["count"] = len(results)
                job["results"] = list(results)
                job["checked_items"] = [current]

            found, total = await blackbird_search(
                query,
                is_email=True,
                progress=progress,
            )

            job["results"] = found
            job["total"] = total
            job["checked"] = total
            job["count"] = len(found)
            job["checked_items"] = [
                f"Blackbird (email): готово (найдено {len(found)})"
            ]

        elif kind == "username_blackbird":

            def progress(checked, total, current, results):
                job["checked"] = checked
                job["total"] = total
                job["count"] = len(results)
                job["results"] = list(results)
                job["checked_items"] = [current]

            found, total = await blackbird_search(
                query,
                is_email=False,
                progress=progress,
            )

            job["results"] = found
            job["total"] = total
            job["checked"] = total
            job["count"] = len(found)
            job["checked_items"] = [
                f"Blackbird (username): готово (найдено {len(found)})"
            ]

        elif kind == "email_mosint":

            MOSINT_MODULES = 12

            def progress(checked, total, current, results):
                job["checked"] = MOSINT_MODULES
                job["total"] = MOSINT_MODULES
                job["count"] = sum(
                    1
                    for item in results
                    if isinstance(item, dict)
                    and item.get("finding") is True
                )
                job["results"] = list(results)
                job["checked_items"] = [current]

            found, _ = await mosint_search(
                query,
                progress=progress,
            )

            findings = sum(
                1
                for item in found
                if isinstance(item, dict)
                and item.get("finding") is True
            )

            job["results"] = found
            job["total"] = MOSINT_MODULES
            job["checked"] = MOSINT_MODULES
            job["count"] = findings
            job["checked_items"] = [
                f"Mosint: готово ({MOSINT_MODULES} проверок, найдено {findings})"
            ]

        else:
            raise ValueError("Неизвестный тип глубокого поиска")

        job["status"] = "done"

    except asyncio.CancelledError:
        job["status"] = "cancelled"
        raise

    except Exception as exc:
        logger.exception("Deep job failed: %s", exc)
        job["status"] = "error"
        job["error"] = str(exc)

    finally:
        if kind == "email_userscanner":
            release_process_memory()

        job["finished_at"] = time.time()

        if ACTIVE_DEEP_JOB_ID == job_id:
            ACTIVE_DEEP_JOB_ID = None

        DEEP_TASKS.pop(job_id, None)


@app.get("/deep")
async def deep_search(
    request: Request,
    kind: str = Query(
        pattern=(
            "^(username_sherlock|username|username_wmn|phone|email|"
            "person|vin|domain|ip|image|email_extended|phone_extended|"
            "email_holehe|email_userscanner|email_mailaccess|"
            "email_h8mail|email_blackbird|username_blackbird|email_mosint)$"
        )
    ),
    q: str = Query(min_length=1, max_length=256),
    job_id: str | None = Query(
        default=None,
        min_length=32,
        max_length=32,
        pattern="^[a-f0-9]{32}$",
    ),
):
    global ACTIVE_DEEP_JOB_ID

    cleanup_deep_jobs()

    query = q.strip()
    job_id = job_id or uuid.uuid4().hex

    cancel_request = DEEP_CANCEL_REQUESTS.pop(job_id, None)
    if cancel_request:
        if cancel_request["user_id"] != request.state.user_id:
            raise HTTPException(status_code=404, detail="Глубокое задание не найдено")
        cancelled_job = {
            "type": kind,
            "kind": kind,
            "query": query,
            "job_id": job_id,
            "status": "cancelled",
            "total": 0,
            "checked": 0,
            "count": 0,
            "results": [],
            "checked_items": [],
            "error": None,
            "finished_at": time.time(),
        }
        DEEP_JOB_OWNERS[job_id] = request.state.user_id
        DEEP_JOBS[job_id] = cancelled_job
        return cancelled_job

    if ACTIVE_DEEP_JOB_ID and ACTIVE_DEEP_JOB_ID in DEEP_JOBS:
        raise HTTPException(
            status_code=409,
            detail="Другой глубокий поиск уже выполняется",
        )

    DEEP_JOB_OWNERS[job_id] = request.state.user_id
    DEEP_JOBS[job_id] = {
        "type": kind,
        "kind": kind,
        "query": query,
        "job_id": job_id,
        "status": "queued",
        "total": 0,
        "checked": 0,
        "count": 0,
        "results": [],
        "checked_items": [],
        "error": None,
        "finished_at": None,
    }

    ACTIVE_DEEP_JOB_ID = job_id

    DEEP_TASKS[job_id] = asyncio.create_task(
        run_deep_job(
            job_id,
            kind,
            query,
        )
    )

    return DEEP_JOBS[job_id]


@app.get("/deep/status")
def deep_status(
    request: Request,
    job_id: str = Query(min_length=8, max_length=64),
):
    cleanup_deep_jobs()

    job = get_owned_deep_job(job_id, request.state.user_id)
    return job


@app.get("/deep/cancel")
async def deep_cancel(
    request: Request,
    job_id: str = Query(
        min_length=32,
        max_length=32,
        pattern="^[a-f0-9]{32}$",
    ),
):
    global ACTIVE_DEEP_JOB_ID

    cleanup_deep_jobs()

    job = DEEP_JOBS.get(job_id)
    if not job:
        pending_cancel = DEEP_CANCEL_REQUESTS.get(job_id)
        if pending_cancel and pending_cancel["user_id"] != request.state.user_id:
            raise HTTPException(status_code=404, detail="Глубокое задание не найдено")
        if not pending_cancel and len(DEEP_CANCEL_REQUESTS) >= 100:
            raise HTTPException(status_code=429, detail="Слишком много ожидающих отмен")
        DEEP_CANCEL_REQUESTS[job_id] = {
            "user_id": request.state.user_id,
            "expires_at": time.time() + DEEP_CANCEL_REQUEST_TTL,
        }
        return {
            "type": "pending",
            "kind": "pending",
            "query": "",
            "job_id": job_id,
            "status": "cancelled",
            "total": 0,
            "checked": 0,
            "count": 0,
            "results": [],
            "checked_items": [],
            "error": None,
            "finished_at": time.time(),
        }

    job = get_owned_deep_job(job_id, request.state.user_id)

    if job["status"] in {"done", "error", "cancelled"}:
        return job

    job["status"] = "cancelled"
    job["error"] = None

    task = DEEP_TASKS.get(job_id)

    if task and not task.done():
        task.cancel()
        await asyncio.gather(task, return_exceptions=True)
    elif task is None:
        job["finished_at"] = time.time()
        if ACTIVE_DEEP_JOB_ID == job_id:
            ACTIVE_DEEP_JOB_ID = None

    return job


@app.get("/deep/sources")
def deep_sources(
    kind: str = Query(
        pattern=(
            "^(username_sherlock|username|username_wmn|phone|email|"
            "person|vin|domain|ip|image|email_extended|phone_extended|"
            "email_holehe|email_userscanner|email_mailaccess|"
            "email_h8mail|email_blackbird|username_blackbird|email_mosint)$"
        )
    ),
    q: str = Query(min_length=1, max_length=256),
):
    return {
        "type": kind,
        "query": q.strip(),
        "sources": search_links(
            q.strip(),
            "username" if kind.startswith("username") else kind,
        ),
    }