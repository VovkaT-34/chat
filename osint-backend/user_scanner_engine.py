import asyncio
import json

from user_scanner.core import engine
from user_scanner.core.helpers import load_categories, load_modules

BATCH_SIZE = 20
MAX_CONCURRENCY = 2
BATCH_PAUSE = 0.10


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


def _diagnostic_issue(data):
    """Return a diagnostic message only for an error-like scanner response."""
    status = str(data.get("status", "")).strip()
    reason = str(data.get("reason", "")).strip()
    error = str(data.get("error", "")).strip()
    marker = " ".join(part for part in (status, reason, error) if part).lower()
    error_markers = (
        "error", "exception", "timeout", "timed out", "rate limit",
        "ratelimit", "too many", "blocked", "captcha", "failed",
        "failure", "unavailable", "connection", "network",
    )
    if any(marker_text in marker for marker_text in error_markers):
        name = data.get("site_name") or data.get("name") or "unknown"
        detail = error or reason or status or "неизвестная ошибка"
        return f"{name}: {detail[:160]}"
    return None


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


def _prepare_module(module):
    """Apply only known compatibility aliases before calling user-scanner."""
    module_name = getattr(module, "__name__", "").split(".")[-1].lower()
    if module_name == "besoccer" and not hasattr(module, "validate_besoccer"):
        validator = getattr(module, "validate_okcats", None)
        if validator is not None:
            setattr(module, "validate_besoccer", validator)
    return module


async def user_scanner_search(email: str, progress=None):
    try:
        categories = load_categories(is_email=True)
        modules = []

        for cat_path in categories.values():
            modules.extend(load_modules(cat_path))

        modules = [_prepare_module(module) for module in modules]
        total = len(modules)
        found = []
        checked = 0
        errors = 0
        error_details = []
        batch_total = (total + BATCH_SIZE - 1) // BATCH_SIZE

        if progress:
            progress(0, total, f"Пакет 0/{batch_total} • подготовка", found)

        for batch_start in range(0, total, BATCH_SIZE):
            batch = modules[batch_start:batch_start + BATCH_SIZE]
            batch_number = batch_start // BATCH_SIZE + 1

            pending = set()
            task_modules = {}
            batch_index = 0

            while batch_index < len(batch) or pending:
                while batch_index < len(batch) and len(pending) < MAX_CONCURRENCY:
                    module = batch[batch_index]
                    task = asyncio.create_task(engine.check(module, email))
                    pending.add(task)
                    task_modules[task] = module
                    batch_index += 1

                done, pending = await asyncio.wait(
                    pending,
                    return_when=asyncio.FIRST_COMPLETED,
                )

                for task in done:
                    module = task_modules.pop(task, None)
                    try:
                        res = task.result()
                        data = _serialize_result(res)
                        item = _make_found_item(data)
                        diagnostic_issue = _diagnostic_issue(data)

                        if item is not None:
                            found.append(item)
                        if diagnostic_issue:
                            errors += 1
                            error_details.append(diagnostic_issue)

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
                        errors += 1
                        module_name = (
                            getattr(module, "name", None)
                            or getattr(module, "site_name", None)
                            or str(module)
                        )
                        error_details.append(
                            f"{module_name}: {str(exc)[:120]}"
                        )
                        if progress:
                            progress(
                                checked,
                                total,
                                f"Пакет {batch_number}/{batch_total} • ошибка: {str(exc)[:120]}",
                                found,
                            )

            if batch_start + BATCH_SIZE < total:
                await asyncio.sleep(BATCH_PAUSE)

        return found, total, errors, error_details

    except Exception:
        if progress:
            progress(0, 0, "error", [])
        return [], 0, 1, ["User Scanner: внутренняя ошибка запуска"]
