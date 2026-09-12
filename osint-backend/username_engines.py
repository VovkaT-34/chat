import asyncio
import json
from typing import Callable

import httpx
from sherlock_project.result import QueryStatus
from sherlock_project.sherlock import sherlock as sherlock_scan
from sherlock_project.sites import SitesInformation
from sherlock_project.notify import QueryNotify

SHERLOCK_DATA_URL = "https://raw.githubusercontent.com/sherlock-project/sherlock/master/sherlock_project/resources/data.json"
WMN_DATA_URL = "https://raw.githubusercontent.com/WebBreacher/WhatsMyName/main/wmn-data.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}
BATCH_SIZE = 10
MAX_CONCURRENCY = 4
BATCH_PAUSE = 0.25
TIMEOUT = 3


class QuietNotify(QueryNotify):
    def start(self, message=None):
        return None

    def update(self, result):
        self.result = result

    def finish(self, message=None):
        return None


async def _load_sherlock_sites():
    def load():
        return SitesInformation(data_file_path=SHERLOCK_DATA_URL, honor_exclusions=True)
    return await asyncio.to_thread(load)


async def sherlock_search(username: str, progress: Callable | None = None):
    sites = await _load_sherlock_sites()
    site_data = {site.name: site.information for site in sites}
    items = list(site_data.items())
    total = len(items)
    found = []
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    async def check_one(name, information):
        async with semaphore:
            def run():
                return sherlock_scan(
                    username,
                    {name: information},
                    QuietNotify(),
                    timeout=TIMEOUT,
                )
            try:
                return await asyncio.to_thread(run)
            except Exception:
                return {}

    for start in range(0, total, BATCH_SIZE):
        batch = items[start:start + BATCH_SIZE]
        results = await asyncio.gather(*(check_one(name, information) for name, information in batch))
        for result in results:
            for name, data in result.items():
                status = data.get("status")
                if status and status.status == QueryStatus.CLAIMED:
                    found.append({
                        "name": name,
                        "url": data.get("url_user"),
                        "http_status": data.get("http_status"),
                        "engine": "Sherlock",
                    })
        if progress:
            progress(min(start + len(batch), total), total, "Sherlock", found)
        if start + len(batch) < total:
            await asyncio.sleep(BATCH_PAUSE)

    return found, total


_wmn_cache = None
_wmn_lock = asyncio.Lock()


async def _load_wmn():
    global _wmn_cache
    if _wmn_cache is not None:
        return _wmn_cache
    async with _wmn_lock:
        if _wmn_cache is None:
            async with httpx.AsyncClient(timeout=20, headers=HEADERS, follow_redirects=True) as client:
                response = await client.get(WMN_DATA_URL)
                response.raise_for_status()
                _wmn_cache = response.json()
    return _wmn_cache


def _wmn_url(site, username):
    template = site.get("uri_pretty") or site.get("uri_check") or ""
    return template.replace("{account}", username)


async def whatsmyname_search(username: str, progress: Callable | None = None):
    data = await _load_wmn()
    sites = data.get("sites", []) if isinstance(data, dict) else []
    sites = [site for site in sites if site.get("valid") is not False]
    total = len(sites)
    found = []
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)

    async def check(site):
        url = _wmn_url(site, username)
        if not url:
            return None
        headers = dict(HEADERS)
        headers.update(site.get("headers") or {})
        async with semaphore:
            try:
                async with httpx.AsyncClient(timeout=TIMEOUT, headers=headers, follow_redirects=True) as client:
                    if site.get("post_body"):
                        body = site["post_body"].replace("{account}", username)
                        response = await client.post(site["uri_check"], content=body)
                    else:
                        response = await client.get(site["uri_check"].replace("{account}", username))
                good_code = site.get("e_code")
                good_string = site.get("e_string")
                missing_code = site.get("m_code")
                missing_string = site.get("m_string")
                ok = True
                if good_code is not None:
                    ok = response.status_code == good_code
                if good_string:
                    ok = ok and good_string in response.text
                if missing_code is not None and response.status_code == missing_code:
                    ok = False
                if missing_string and missing_string in response.text:
                    ok = False
                if ok:
                    return {
                        "name": site.get("name") or "WhatsMyName",
                        "url": url,
                        "http_status": response.status_code,
                        "category": site.get("cat"),
                        "engine": "WhatsMyName",
                    }
            except Exception:
                return None
        return None

    for start in range(0, total, BATCH_SIZE):
        batch = sites[start:start + BATCH_SIZE]
        results = await asyncio.gather(*(check(site) for site in batch))
        found.extend(item for item in results if item)
        if progress:
            progress(min(start + len(batch), total), total, "WhatsMyName", found)
        if start + len(batch) < total:
            await asyncio.sleep(BATCH_PAUSE)

    return found, total
