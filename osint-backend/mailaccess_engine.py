import asyncio
import json
import subprocess
from typing import List, Tuple

async def mailaccess_search(email: str, progress=None) -> Tuple[List[dict], int]:
    """
    Запускает MailAccess через CLI и парсит JSONL-вывод.
    Возвращает (found_results, total_estimate).
    """
    found = []
    total = 0

    try:
        # Запускаем CLI в отдельном процессе
        proc = await asyncio.create_subprocess_exec(
            "mailaccess", "investigate", email,
            "--format", "jsonl",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        checked = 0
        while True:
            line = await proc.stdout.readline()
            if not line:
                break

            line = line.decode("utf-8", errors="ignore").strip()
            if not line:
                continue

            try:
                data = json.loads(line)
            except Exception:
                continue

            checked += 1
            total = max(total, checked + 5)  # приблизительная оценка

            # Фильтруем только полезные находки
            platform = data.get("platform") or data.get("name") or data.get("module") or "unknown"
            url = data.get("url")
            severity = data.get("severity") or data.get("status") or ""

            item = {
                "name": platform,
                "source": "MailAccess",
                "exists": True,
                "url": url,
                "severity": severity,
                "data": data,
            }
            found.append(item)

            if progress:
                progress(checked, total, platform, found)

        await proc.wait()

    except FileNotFoundError:
        # mailaccess не установлен
        if progress:
            progress(0, 0, "MailAccess не найден", [])
        return [], 0
    except Exception as exc:
        if progress:
            progress(0, 0, f"Ошибка: {exc}", [])
        return [], 0

    return found, max(total, len(found))
