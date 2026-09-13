import asyncio
import json
import os
from typing import List, Tuple


MAILACCESS_TIMEOUT = 180
MAX_FOUND = 50


async def mailaccess_search(
    email: str,
    progress=None
) -> Tuple[List[dict], int]:
    """
    Запускает MailAccess через CLI с жёсткими ограничениями.
    """

    found = []
    total = 0

    # Настройки MailAccess для Render.
    env = os.environ.copy()
    env.update(
        {
            # Максимум 6 одновременно работающих модулей.
            "MAX_CONCURRENT_MODULES": "6",

            # Базовый таймаут одного модуля.
            "MODULE_TIMEOUT_SECONDS": "30",

            # Увеличенные таймауты для более медленных модулей.
            "MODULE_TIMEOUT_OVERRIDES": json.dumps(
                {
                    "whatsmyname": 120,
                    "account_discovery": 90,
                    "username_pivot": 180,
                    "user_scanner": 180,
                }
            ),

            # Maigret: основная волна включена.
            "ENABLE_MAIGRET_PLATFORMS": "true",

            # Вторая, более тяжёлая волна отключена.
            "ENABLE_MAIGRET_WAVE2": "false",

            # Глубокую проверку 100+ утечек пока не включаем.
            "ENABLE_BREACH_DEEP": "false",

            # Требует SERPAPI_KEY, которого у нас нет.
            "ENABLE_EMAIL_DISCOVERY": "false",

            # Защита от слишком большого количества запросов.
            "RATE_LIMIT_ENABLED": "true",
            "REQUEST_DELAY_MS": "1000",
        }
    )

    try:
        proc = await asyncio.create_subprocess_exec(
            "mailaccess",
            "investigate",
            email,
            "--format",
            "jsonl",
            "--no-brief",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )

        # Общий таймаут всего запуска MailAccess — 180 секунд.
        deadline = (
            asyncio.get_running_loop().time()
            + MAILACCESS_TIMEOUT
        )

        try:
            while proc.stdout is not None:

                remaining = (
                    deadline
                    - asyncio.get_running_loop().time()
                )

                if remaining <= 0:
                    raise asyncio.TimeoutError

                raw_line = await asyncio.wait_for(
                    proc.stdout.readline(),
                    timeout=remaining,
                )

                if not raw_line:
                    break

                line = raw_line.decode(
                    "utf-8",
                    errors="ignore",
                ).strip()

                if not line:
                    continue

                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if not isinstance(data, dict):
                    continue

                platform = (
                    data.get("platform")
                    or data.get("name")
                    or data.get("module")
                    or data.get("site")
                    or "MailAccess"
                )

                url = (
                    data.get("profile_url")
                    or data.get("url")
                    or data.get("link")
                )

                # JSONL может содержать технические записи.
                # Берём только реальные результаты.
                if url or data.get("finding") is True:

                    checked += 1
                    total = max(total, checked)

                    item = {
                        "name": platform,
                        "source": "MailAccess",
                        "exists": True,
                        "url": url,
                        "severity": (
                            data.get("severity")
                            or data.get("status")
                            or ""
                        ),
                        "data": data,
                    }

                    found.append(item)

                    # Передаём результат сразу, не дожидаясь
                    # окончания всего MailAccess.
                    if progress:
                        progress(
                            checked,
                            total,
                            str(platform),
                            found,
                        )

                    # Максимум 50 найденных результатов.
                    if len(found) >= MAX_FOUND:
                        break

            # Даём процессу нормально завершиться.
            try:
                await asyncio.wait_for(
                    proc.wait(),
                    timeout=5,
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()

        except asyncio.TimeoutError:

            proc.kill()
            await proc.wait()

            if progress:
                progress(
                    checked,
                    total,
                    f"MailAccess: таймаут "
                    f"{MAILACCESS_TIMEOUT} сек",
                    found,
                )

            return found, max(total, len(found))

    except FileNotFoundError:

        if progress:
            progress(
                0,
                0,
                "MailAccess не установлен",
                [],
            )

        return [], 0

    except Exception as exc:

        if progress:
            progress(
                checked,
                total,
                f"Ошибка MailAccess: "
                f"{str(exc)[:120]}",
                found,
            )

        return found, max(total, len(found))

    # Финальный статус.
    if progress:
        progress(
            checked,
            total,
            f"MailAccess: готово "
            f"(найдено {len(found)})",
            found,
        )

    return found, max(total, len(found))
