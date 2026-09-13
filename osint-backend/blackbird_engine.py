import asyncio
import json
import os
from typing import List, Tuple

async def blackbird_search(query: str, is_email: bool = True, progress=None) -> Tuple[List[dict], int]:
    """
    Запускает Blackbird через CLI.
    Поддерживает и email, и username.
    """
    found = []
    total = 0

    # Команда: --email или --username + --json для удобного парсинга
    cmd = ["python", "blackbird.py"]
    if is_email:
        cmd += ["--email", query]
    else:
        cmd += ["--username", query]
    
    cmd += ["--json"]   # пытаемся получить JSON

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=os.path.dirname(os.path.abspath(__file__))  # или путь, где лежит blackbird.py
        )

        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=90)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            if progress:
                progress(0, 0, "Blackbird: таймаут 90 сек", [])
            return [], 0

        output = stdout.decode("utf-8", errors="ignore")
        err = stderr.decode("utf-8", errors="ignore")

        # Пытаемся найти JSON в выводе
        lines = output.splitlines() + err.splitlines()
        checked = 0

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Простой парсинг (Blackbird пишет красиво)
            lower = line.lower()
            if any(x in lower for x in ["found", "exists", "account", "profile", "http"]):
                checked += 1
                # Вытаскиваем название сайта и ссылку, если есть
                name = "Blackbird result"
                url = None

                # Пытаемся вытащить URL
                if "http" in line:
                    parts = line.split()
                    for p in parts:
                        if p.startswith("http"):
                            url = p.strip(".,)")
                            break

                item = {
                    "name": name,
                    "source": "Blackbird",
                    "exists": True,
                    "url": url,
                    "data": {"raw": line[:350]}
                }
                found.append(item)

                if progress:
                    progress(checked, checked + 10, name, found)

                if len(found) >= 40:
                    break

        total = max(checked, len(found))

    except FileNotFoundError:
        if progress:
            progress(0, 0, "Blackbird не найден (нужен blackbird.py)", [])
        return [], 0
    except Exception as exc:
        if progress:
            progress(0, 0, f"Ошибка: {str(exc)[:80]}", [])
        return [], 0

    return found, total
