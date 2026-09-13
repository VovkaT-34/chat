```python
import asyncio
import json
import os
import re
from typing import List, Tuple


MAILACCESS_TIMEOUT = 180
MAX_FOUND = 50

# Нагрузка на Render.
MAX_CONCURRENT_MODULES = 3

# Текущий MailAccess содержит около 64 основных модулей.
# Это используется как отображаемое общее количество,
# пока сам CLI не отдаёт отдельный счётчик.
MAILACCESS_MODULES_TOTAL = 64


async def mailaccess_search(
    email: str,
    progress=None
) -> Tuple[List[dict], int]:
    """
    Запускает MailAccess через CLI.

    Ограничения:
    - максимум 3 параллельных модуля;
    - общий таймаут 180 секунд;
    - максимум 50 найденных результатов;
    - потоковый JSONL;
    - онлайн-передача найденных результатов.
    """

    found = []

    # Количество реально полученных результатов.
    checked = 0

    # Количество модулей, по которым уже пришли данные.
    completed_modules = 0

    # Общее отображаемое количество модулей.
    total = MAILACCESS_MODULES_TOTAL

    # Последнее имя проверяемого объекта.
    last_module = "запуск MailAccess"

    # Настройки MailAccess для Render.
    env = os.environ.copy()

    env.update(
        {
            # ВАЖНО: было 6.
            # Снижаем нагрузку до 3.
            "MAX_CONCURRENT_MODULES": str(
                MAX_CONCURRENT_MODULES
            ),

            # Базовый таймаут одного модуля.
            "MODULE_TIMEOUT_SECONDS": "30",

            # Таймауты отдельных медленных модулей.
            "MODULE_TIMEOUT_OVERRIDES": json.dumps(
                {
                    "whatsmyname": 120,
                    "account_discovery": 90,
                    "username_pivot": 180,
                    "user_scanner": 180,
                }
            ),

            # Maigret Wave 1 включён.
            "ENABLE_MAIGRET_PLATFORMS": "true",

            # Тяжёлая Wave 2 выключена.
            "ENABLE_MAIGRET_WAVE2": "false",

            # Глубокая проверка утечек выключена.
            "ENABLE_BREACH_DEEP": "false",

            # Без SERPAPI.
            "ENABLE_EMAIL_DISCOVERY": "false",

            # Ограничение нагрузки.
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

        # Общий таймаут всего MailAccess.
        deadline = (
            asyncio.get_running_loop().time()
            + MAILACCESS_TIMEOUT
        )

        # Сообщаем интерфейсу, что MailAccess действительно стартовал.
        if progress:
            progress(
                0,
                total,
                (
                    "MailAccess запущен • "
                    f"модулей всего: {total} • "
                    f"потоков: {MAX_CONCURRENT_MODULES}"
                ),
                found,
            )

        # stderr читаем отдельно.
        # Некоторые версии MailAccess пишут туда
        # названия текущих модулей/платформ.
        stderr_lines = []

        async def read_stderr():
            nonlocal last_module

            if proc.stderr is None:
                return

            while True:
                line = await proc.stderr.readline()

                if not line:
                    break

                text = line.decode(
                    "utf-8",
                    errors="ignore",
                ).strip()

                if not text:
                    continue

                stderr_lines.append(text)

                # Пытаемся извлечь понятное название модуля.
                patterns = (
                    r"(?:module|модуль)\s*[:=]\s*([A-Za-z0-9_.-]+)",
                    r"(?:checking|проверя(?:ется|ем))\s+([A-Za-z0-9_.-]+)",
                    r"(?:running|запуск)\s+([A-Za-z0-9_.-]+)",
                )

                for pattern in patterns:
                    match = re.search(
                        pattern,
                        text,
                        flags=re.IGNORECASE,
                    )

                    if match:
                        last_module = match.group(1)

                        if progress:
                            progress(
                                completed_modules,
                                total,
                                (
                                    "Проверяется: "
                                    f"{last_module} • "
                                    f"модули "
                                    f"{completed_modules}/"
                                    f"{total}"
                                ),
                                found,
                            )

                        break

        stderr_task = asyncio.create_task(
            read_stderr()
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
                    # Не JSON — пропускаем.
                    continue

                if not isinstance(data, dict):
                    continue

                # Иногда JSONL может содержать техническое
                # сообщение с именем модуля.
                module_name = (
                    data.get("module")
                    or data.get("module_name")
                    or data.get("engine")
                )

                if module_name:
                    last_module = str(
                        module_name
                    )

                # Возможный служебный счётчик.
                reported_total = (
                    data.get("total_modules")
                    or data.get("modules_total")
                )

                if isinstance(
                    reported_total,
                    int,
                ) and reported_total > 0:
                    total = reported_total

                reported_checked = (
                    data.get("completed_modules")
                    or data.get("modules_checked")
                )

                if isinstance(
                    reported_checked,
                    int,
                ) and reported_checked >= 0:
                    completed_modules = max(
                        completed_modules,
                        reported_checked,
                    )

                # Пытаемся получить платформу.
                platform = (
                    data.get("platform")
                    or data.get("name")
                    or data.get("module")
                    or data.get("site")
                    or last_module
                    or "MailAccess"
                )

                url = (
                    data.get("profile_url")
                    or data.get("url")
                    or data.get("link")
                )

                # Реальный результат.
                if url or data.get("finding") is True:

                    checked += 1

                    item = {
                        "name": str(platform),
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

                    # Не допускаем больше 50 результатов.
                    if len(found) > MAX_FOUND:
                        found = found[:MAX_FOUND]

                    # Результат показываем сразу.
                    if progress:
                        progress(
                            completed_modules,
                            total,
                            (
                                "Проверяется: "
                                f"{platform} • "
                                f"модули "
                                f"{completed_modules}/"
                                f"{total} • "
                                f"найдено {len(found)}"
                            ),
                            found,
                        )

                    if len(found) >= MAX_FOUND:
                        if progress:
                            progress(
                                completed_modules,
                                total,
                                (
                                    "Достигнут лимит "
                                    f"{MAX_FOUND} результатов"
                                ),
                                found,
                            )

                        break

                # Если пришёл явный статус модуля.
                status = str(
                    data.get("status")
                    or ""
                ).lower()

                if status in {
                    "success",
                    "completed",
                    "failed",
                    "error",
                } and module_name:

                    completed_modules = min(
                        total,
                        completed_modules + 1,
                    )

                    if progress:
                        progress(
                            completed_modules,
                            total,
                            (
                                "Модуль завершён: "
                                f"{module_name} • "
                                f"{completed_modules}/"
                                f"{total} • "
                                f"найдено {len(found)}"
                            ),
                            found,
                        )

            # Ждём завершения stderr.
            try:
                await asyncio.wait_for(
                    stderr_task,
                    timeout=2,
                )
            except asyncio.TimeoutError:
                stderr_task.cancel()

            # Даём MailAccess нормально завершиться.
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

            if not stderr_task.done():
                stderr_task.cancel()

            if progress:
                progress(
                    completed_modules,
                    total,
                    (
                        f"MailAccess: таймаут "
                        f"{MAILACCESS_TIMEOUT} сек • "
                        f"модули "
                        f"{completed_modules}/"
                        f"{total} • "
                        f"найдено {len(found)}"
                    ),
                    found,
                )

            return found, completed_modules

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
                completed_modules,
                total,
                (
                    "Ошибка MailAccess: "
                    f"{str(exc)[:120]}"
                ),
                found,
            )

        return found, completed_modules

    # Финальный статус.
    if progress:
        progress(
            completed_modules,
            total,
            (
                "MailAccess: готово • "
                f"модули "
                f"{completed_modules}/"
                f"{total} • "
                f"найдено {len(found)}"
            ),
            found,
        )

    return found, completed_modules
```
