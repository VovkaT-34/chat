import asyncio
import json

from user_scanner.core import engine
from user_scanner.core.helpers import load_categories, load_modules

BATCH_SIZE = 20
MAX_CONCURRENCY = 1
BATCH_PAUSE = 0.20


def _serialize_result(res):
    try:
        data = res.to_json() if hasattr(res, "to_json") else res
        if isinstance(data, str):
            data = json.loads(data)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    return {
        "site_name": getattr(res, "site_name", "unknown"),
        "status": str(getattr(res, "status", "")),
        "url": getattr(res, "url", None),
        "category": getattr(res, "category", None),
        "extra": getattr(res, "extra", None),
        "reason": getattr(res, "reason", None),
    }


def _make_found_item(data):
    status = str(data.get("status", "")).lower()
    if status not in ("registered", "taken", "exists", "found"):
        return None

    return {
        "name": data.get("site_name") or data.get("name") or "unknown",
        "source": "user-scanner",
        "exists": True,
        "url": data.get("url"),
    }


async def user_scanner_search(email: str, progress=None):
    try:
        categories = load_categories(is_email=True)
        modules = []

        for cat_path in categories.values():
            modules.extend(load_modules(cat_path))

        total = len(modules)
        found = []
        checked = 0
        batch_total = (total + BATCH_SIZE - 1) // BATCH_SIZE

        if progress:
            progress(0, total, f"Пакет 0/{batch_total} • подготовка", found)

        for batch_start in range(0, total, BATCH_SIZE):
            batch = modules[batch_start:batch_start + BATCH_SIZE]
            batch_number = batch_start // BATCH_SIZE + 1

            pending = set()
            batch_index = 0

            while batch_index < len(batch) or pending:
                while batch_index < len(batch) and len(pending) < MAX_CONCURRENCY:
                    pending.add(asyncio.create_task(engine.check(batch[batch_index], email)))
                    batch_index += 1

                done, pending = await asyncio.wait(
                    pending,
                    return_when=asyncio.FIRST_COMPLETED,
                )

                for task in done:
                    try:
                        res = task.result()
                        data = _serialize_result(res)
                        item = _make_found_item(data)

                        if item is not None:
                            found.append(item)

                        checked += 1
                        site_name = data.get("site_name") or data.get("name") or "unknown"
                        status = data.get("status") or "unknown"

                        if progress:
                            progress(
                                checked,
                                total,
                                f"Пакет {batch_number}/{batch_total} • {site_name} • {status}",
                                found,
                            )
                    except Exception as exc:
                        checked += 1
                        if progress:
                            progress(
                                checked,
                                total,
                                f"Пакет {batch_number}/{batch_total} • ошибка: {str(exc)[:120]}",
                                found,
                            )

            if batch_start + BATCH_SIZE < total:
                await asyncio.sleep(BATCH_PAUSE)

        return found, total

    except Exception:
        if progress:
            progress(0, 0, "error", [])
        return [], 0
