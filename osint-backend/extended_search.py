"""MailAccess email search compatibility layer.

All non-email searches continue to use the existing implementation unchanged.
"""

import asyncio
from urllib.parse import urlparse

import extended_search_original as _original

# Preserve the existing public surface from the original module.
extended_public_search = _original.extended_public_search
SOURCES_RU = _original.SOURCES_RU
SOURCES_FOREIGN = _original.SOURCES_FOREIGN

EMAIL_BATCH_SIZE = 10
EMAIL_CONCURRENCY = 4
EMAIL_BATCH_PAUSE = 0.25


async def _search_email_catalogue_batch(sources, query, seen):
    semaphore = asyncio.Semaphore(EMAIL_CONCURRENCY)

    async def search_source(name, domain):
        async with semaphore:
            try:
                items = await _original._search_items(
                    _original._query_for("email", query, domain)
                )
                found = []
                for item in items:
                    href = str(item.get("href") or "").strip()
                    title = str(item.get("title") or "").strip()
                    body = str(item.get("body") or "").strip()
                    hostname = (urlparse(href).hostname or "").lower()

                    if not href.startswith(("http://", "https://")):
                        continue
                    if not (hostname == domain or hostname.endswith("." + domain)):
                        continue
                    if not _original._relevant("email", query, title, body, href):
                        continue

                    key = href.rstrip("/")
                    if key in seen:
                        continue

                    found.append({
                        "source": f"{name}: точное публичное упоминание",
                        "name": title or href,
                        "url": href,
                        "snippet": body,
                        "domain": domain,
                        "site": name,
                        "kind": "email_public",
                    })
                return found
            except Exception:
                return []

    groups = await asyncio.gather(
        *(search_source(name, domain) for name, domain in sources),
        return_exceptions=True,
    )

    results = []
    for group in groups:
        if isinstance(group, Exception):
            continue
        results.extend(group)
    return results


async def extended_public_search(query, kind, max_results=30, progress=None):
    """Run MailAccess email search in bounded batches; delegate everything else."""
    if kind != "email":
        return await _original.extended_public_search(
            query, kind, max_results=max_results, progress=progress
        )

    ru_sources = _original.SOURCES_RU.get("email", [])
    foreign_sources = _original.SOURCES_FOREIGN.get("email", [])
    sources = ru_sources + foreign_sources
    total = len(sources)
    results = []
    seen = set()

    if not sources:
        if progress:
            progress(0, 0, "MailAccess: источников нет", results)
        return results

    if progress:
        progress(0, total, "MailAccess: определено источников: " + str(total), results)

    # Keep the existing direct search-engine stage, but do not count it as catalogue sources.
    try:
        engine_items = await _original._multi_engine_search("email", query)
        for item in engine_items:
            href = item.get("url") or ""
            if not href.startswith(("http://", "https://")):
                continue
            hostname = (urlparse(href).hostname or "").lower()
            key = href.rstrip("/")
            if key in seen:
                continue
            seen.add(key)
            results.append({
                "source": f"{item['engine']}: точное публичное упоминание",
                "name": item.get("title") or href,
                "url": href,
                "snippet": f"Найдено поисковиком {item['engine']}; страница доступна для проверки.",
                "domain": hostname,
                "site": hostname,
                "engine": item["engine"],
                "kind": "email_public",
            })
    except Exception:
        pass

    for batch_start in range(0, total, EMAIL_BATCH_SIZE):
        batch = sources[batch_start:batch_start + EMAIL_BATCH_SIZE]
        batch_results = await _search_email_catalogue_batch(batch, query, seen)

        for item in batch_results:
            key = item["url"].rstrip("/")
            if key in seen:
                continue
            seen.add(key)
            results.append(item)

        completed = min(batch_start + len(batch), total)
        if progress:
            progress(
                completed,
                total,
                f"MailAccess: обработано {completed}/{total} источников",
                results,
            )

        if completed < total:
            await asyncio.sleep(EMAIL_BATCH_PAUSE)

    if progress:
        progress(total, total, f"MailAccess: готово {total}/{total} источников", results)

    return results
