import asyncio
import json
from typing import List, Tuple

async def h8mail_search(email: str, progress=None) -> Tuple[List[dict], int]:
    """
    Запускает h8mail через CLI.
    Без API-ключей результаты будут очень скудными.
    """
    found = []
    total = 0

    proc = None
    try:
        proc = await asyncio.create_subprocess_exec(
            "h8mail",
            "-t", email,
            "-j", "h8mail_out.json",   # пытаемся получить JSON
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            if progress:
                progress(0, 0, "h8mail: таймаут 60 сек", [])
            return [], 0

        # h8mail пишет результаты в файл или в stdout
        output = stdout.decode("utf-8", errors="ignore") + stderr.decode("utf-8", errors="ignore")

        # Простой парсинг текстового вывода (без ключей мало что есть)
        lines = output.splitlines()
        checked = 0

        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Ищем строки, которые выглядят как находки
            lower = line.lower()
            if any(x in lower for x in ["breach", "leak", "found", "password", "pwned", "compromised"]):
                checked += 1
                item = {
                    "name": "h8mail finding",
                    "source": "h8mail",
                    "exists": True,
                    "data": {"raw": line[:300]},
                }
                found.append(item)

                if progress:
                    progress(checked, checked + 5, "h8mail", found)

        total = max(checked, len(found))

    except FileNotFoundError:
        if progress:
            progress(0, 0, "h8mail не установлен", [])
        return [], 0
    except Exception as exc:
        if progress:
            progress(0, 0, f"Ошибка: {str(exc)[:80]}", [])
        return [], 0
    finally:
        if proc is not None and proc.returncode is None:
            try:
                proc.terminate()
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(proc.wait(), timeout=5)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()

    return found, total
