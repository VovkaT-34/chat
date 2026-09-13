import asyncio
import json
from typing import List, Tuple

async def mailaccess_search(email: str, progress=None) -> Tuple[List[dict], int]:
    """
    Запускает MailAccess через CLI с жёсткими ограничениями.
    """
    found = []
    total = 0

    try:
        # Жёсткий таймаут 90 секунд на весь процесс
        proc = await asyncio.create_subprocess_exec(
            "mailaccess", "investigate", email,
            "--format", "jsonl",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            # Ждём максимум 90 секунд
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=90)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            if progress:
                progress(0, 0, "MailAccess: таймаут 90 сек", [])
            return [], 0

        lines = stdout.decode("utf-8", errors="ignore").splitlines()
        checked = 0

        for line in lines:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except Exception:
                continue

            checked += 1
            total = max(total, checked)

            platform = (
                data.get("platform")
                or data.get("name")
                or data.get("module")
                or data.get("site")
                or "unknown"
            )
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

            # Ограничиваем количество результатов
            if len(found) >= 40:
                break

    except FileNotFoundError:
        if progress:
            progress(0, 0, "MailAccess не установлен", [])
        return [], 0
    except Exception as exc:
        if progress:
            progress(0, 0, f"Ошибка: {str(exc)[:80]}", [])
        return [], 0

    return found, max(total, len(found))
