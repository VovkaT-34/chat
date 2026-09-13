import asyncio
from user_scanner.core import engine

async def user_scanner_search(email: str, progress=None):
    """
    Запускает полную email-проверку через user-scanner.
    Возвращает (found_results, total).
    """
    try:
        # Полный скан по всем email-модулям
        results = await engine.check_all(email, is_email=True)
    except Exception as exc:
        # На случай, если библиотека упадёт
        if progress:
            progress(0, 0, "error", [])
        return [], 0

    total = len(results)
    found = []

    for i, res in enumerate(results):
        # result.to_json() обычно возвращает dict-like структуру
        try:
            data = res.to_json() if hasattr(res, "to_json") else res
            if isinstance(data, str):
                import json
                data = json.loads(data)
        except Exception:
            data = {
                "site_name": getattr(res, "site_name", "unknown"),
                "status": str(getattr(res, "status", "")),
                "url": getattr(res, "url", None),
            }

        status = str(data.get("status", "")).lower()
        is_registered = status in ("registered", "taken", "exists", "found")

        item = {
            "name": data.get("site_name") or data.get("name") or "unknown",
            "source": "user-scanner",
            "exists": is_registered,
            "status": data.get("status"),
            "url": data.get("url"),
            "category": data.get("category"),
            "extra": data.get("extra") or data.get("reason"),
            "data": data,
        }

        if is_registered:
            found.append(item)

        if progress:
            # обновляем прогресс
            progress(i + 1, total, item["name"], found)

    return found, total
