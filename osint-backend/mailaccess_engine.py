
import asyncio
import contextlib
import json
import os
import socket
from typing import List, Tuple

import httpx
import websockets


MAILACCESS_TIMEOUT = 180
MAX_FOUND = 50
MAX_CONCURRENT_MODULES = 3
MAILACCESS_HOST = "127.0.0.1"


async def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((MAILACCESS_HOST, 0))
        return int(sock.getsockname()[1])


async def _wait_health(
    base_url: str,
    timeout: float = 15.0,
) -> bool:
    deadline = (
        asyncio.get_running_loop().time()
        + timeout
    )

    async with httpx.AsyncClient(
        base_url=base_url,
        timeout=3.0,
    ) as client:

        while (
            asyncio.get_running_loop().time()
            < deadline
        ):
            try:
                response = await client.get("/health")

                if response.status_code == 200:
                    return True

            except Exception:
                pass

            await asyncio.sleep(0.5)

    return False


async def _start_mailaccess_server(
    env: dict,
    port: int,
):
    return await asyncio.create_subprocess_exec(
        "mailaccess",
        "serve",
        "--host",
        MAILACCESS_HOST,
        "--port",
        str(port),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
        env=env,
    )


async def _stop_process(proc) -> None:
    if proc is None or proc.returncode is not None:
        return

    with contextlib.suppress(ProcessLookupError):
        proc.terminate()

    try:
        await asyncio.wait_for(
            proc.wait(),
            timeout=5,
        )

    except asyncio.TimeoutError:

        with contextlib.suppress(ProcessLookupError):
            proc.kill()

        with contextlib.suppress(Exception):
            await proc.wait()


async def mailaccess_search(
    email: str,
    progress=None,
) -> Tuple[List[dict], int]:

    """
    MailAccess с ограничением в 3 параллельных модуля
    и онлайн-прогрессом через WebSocket.
    """

    found: List[dict] = []

    checked_modules = 0
    total_modules = 0

    server = None

    env = os.environ.copy()

    env.update(
        {
            # Ограничение нагрузки.
            "MAX_CONCURRENT_MODULES": str(
                MAX_CONCURRENT_MODULES
            ),

            # Базовый таймаут модуля.
            "MODULE_TIMEOUT_SECONDS": "30",

            # Более медленные модули.
            "MODULE_TIMEOUT_OVERRIDES": json.dumps(
                {
                    "whatsmyname": 120,
                    "account_discovery": 90,
                    "username_pivot": 180,
                    "user_scanner": 180,
                }
            ),

            # Maigret Wave 1 включена.
            "ENABLE_MAIGRET_PLATFORMS": "true",

            # Wave 2 выключена.
            "ENABLE_MAIGRET_WAVE2": "false",

            # Глубокий поиск утечек выключен.
            "ENABLE_BREACH_DEEP": "false",

            # Email Discovery требует SERPAPI_KEY.
            "ENABLE_EMAIL_DISCOVERY": "false",

            # Ограничение частоты запросов.
            "RATE_LIMIT_ENABLED": "true",
            "REQUEST_DELAY_MS": "1000",

            # Brief не нужен.
            "SHOW_DEFENDERS_BRIEF": "false",
        }
    )

    try:

        # Получаем свободный локальный порт.
        port = await _free_port()

        base_url = (
            f"http://{MAILACCESS_HOST}:{port}"
        )

        ws_base = (
            f"ws://{MAILACCESS_HOST}:{port}"
        )

        # Запускаем MailAccess API-сервер.
        server = await _start_mailaccess_server(
            env,
            port,
        )

        # Ждём фактического запуска.
        if not await _wait_health(base_url):

            if progress:
                progress(
                    0,
                    0,
                    "MailAccess: сервер не запустился",
                    found,
                )

            return [], 0

        async with httpx.AsyncClient(
            base_url=base_url,
            timeout=10.0,
        ) as client:

            # Получаем список модулей.
            modules_response = await client.get(
                "/api/modules/"
            )

            if modules_response.status_code == 200:

                modules = modules_response.json()

                if isinstance(modules, list):
                    total_modules = len(modules)

                elif isinstance(modules, dict):
                    # На случай если API возвращает
                    # объект с массивом модулей.
                    possible_modules = (
                        modules.get("modules")
                        or modules.get("items")
                        or []
                    )

                    if isinstance(
                        possible_modules,
                        list,
                    ):
                        total_modules = len(
                            possible_modules
                        )

            if progress:
                progress(
                    0,
                    total_modules,
                    (
                        "MailAccess: запущен • "
                        f"модулей всего "
                        f"{total_modules}"
                    ),
                    found,
                )

            # Запускаем расследование.
            response = await client.post(
                "/api/investigate",
                json={
                    "email": email,
                    "force": True,
                },
            )

            response.raise_for_status()

            response_data = response.json()

            investigation_id = (
                response_data.get("id")
                or response_data.get("investigation_id")
            )

            if not investigation_id:
                raise RuntimeError(
                    "MailAccess не вернул ID расследования"
                )

        # Подключаемся к WebSocket.
        async with websockets.connect(
            (
                f"{ws_base}/ws/investigate/"
                f"{investigation_id}"
            ),
            open_timeout=10,
            close_timeout=5,
            max_size=1024 * 1024,
        ) as websocket:

            deadline = (
                asyncio.get_running_loop().time()
                + MAILACCESS_TIMEOUT
            )

            while True:

                remaining = (
                    deadline
                    - asyncio.get_running_loop().time()
                )

                if remaining <= 0:
                    raise asyncio.TimeoutError

                raw = await asyncio.wait_for(
                    websocket.recv(),
                    timeout=remaining,
                )

                if isinstance(raw, bytes):
                    raw = raw.decode(
                        "utf-8",
                        errors="ignore",
                    )

                try:
                    event = json.loads(raw)

                except json.JSONDecodeError:
                    continue

                if not isinstance(event, dict):
                    continue

                event_type = event.get("type")

                module = str(
                    event.get("module")
                    or "MailAccess"
                )

                # ─────────────────────────────
                # МОДУЛЬ НАЧАЛ РАБОТУ
                # ─────────────────────────────

                if event_type == "module_start":

                    if progress:
                        progress(
                            checked_modules,
                            total_modules,
                            (
                                "Проверяется модуль: "
                                f"{module} • "
                                f"{checked_modules}/"
                                f"{total_modules}"
                            ),
                            found,
                        )

                # ─────────────────────────────
                # МОДУЛЬ ЗАВЕРШИЛСЯ
                # ─────────────────────────────

                elif event_type in {
                    "module_result",
                    "module_error",
                }:

                    checked_modules += 1

                    if event_type == "module_result":

                        findings = (
                            event.get("findings")
                            or []
                        )

                        if isinstance(
                            findings,
                            list,
                        ):

                            for data in findings:

                                if not isinstance(
                                    data,
                                    dict,
                                ):
                                    continue

                                platform = (
                                    data.get("platform")
                                    or data.get("name")
                                    or data.get("module")
                                    or "MailAccess"
                                )

                                url = (
                                    data.get("profile_url")
                                    or data.get("url")
                                    or data.get("link")
                                )

                                metadata = (
                                    data.get("metadata")
                                    or {}
                                )

                                if not isinstance(
                                    metadata,
                                    dict,
                                ):
                                    metadata = {}

                                item = {
                                    "name": str(
                                        platform
                                    ),
                                    "source": "MailAccess",
                                    "exists": True,
                                    "url": url,
                                    "severity": (
                                        data.get(
                                            "severity"
                                        )
                                        or metadata.get(
                                            "severity"
                                        )
                                        or data.get(
                                            "status"
                                        )
                                        or ""
                                    ),
                                    "data": data,
                                }

                                found.append(item)

                                if (
                                    len(found)
                                    >= MAX_FOUND
                                ):
                                    found = found[
                                        :MAX_FOUND
                                    ]
                                    break

                    if event_type == "module_error":

                        status_text = (
                            f"Модуль: {module} • "
                            f"ошибка • проверено "
                            f"{checked_modules}/"
                            f"{total_modules}"
                        )

                    else:

                        status_text = (
                            "Модуль завершён: "
                            f"{module} • "
                            f"проверено "
                            f"{checked_modules}/"
                            f"{total_modules} • "
                            f"найдено "
                            f"{len(found)}"
                        )

                    if progress:
                        progress(
                            checked_modules,
                            total_modules,
                            status_text,
                            found,
                        )

                # ─────────────────────────────
                # РАССЛЕДОВАНИЕ ЗАВЕРШЕНО
                # ─────────────────────────────

                elif (
                    event_type
                    == "investigation_complete"
                ):

                    if progress:
                        progress(
                            checked_modules,
                            total_modules,
                            (
                                "MailAccess: готово • "
                                f"модулей "
                                f"{checked_modules}/"
                                f"{total_modules} • "
                                f"найдено "
                                f"{len(found)}"
                            ),
                            found,
                        )

                    break

                # ─────────────────────────────
                # РАССЛЕДОВАНИЕ НЕУДАЧНО
                # ─────────────────────────────

                elif (
                    event_type
                    == "investigation_failed"
                ):

                    if progress:
                        progress(
                            checked_modules,
                            total_modules,
                            (
                                "MailAccess: ошибка • "
                                f"модулей "
                                f"{checked_modules}/"
                                f"{total_modules} • "
                                f"{event.get('error', '')}"
                            ),
                            found,
                        )

                    break

                # ─────────────────────────────
                # ОБЩАЯ WS-ОШИБКА
                # ─────────────────────────────

                elif event_type == "error":

                    if progress:
                        progress(
                            checked_modules,
                            total_modules,
                            (
                                "MailAccess: "
                                "WebSocket ошибка • "
                                f"{event.get('error', '')}"
                            ),
                            found,
                        )

                    break

        return found, checked_modules

    except asyncio.TimeoutError:

        if progress:
            progress(
                checked_modules,
                total_modules,
                (
                    f"MailAccess: таймаут "
                    f"{MAILACCESS_TIMEOUT} сек • "
                    f"проверено "
                    f"{checked_modules}/"
                    f"{total_modules}"
                ),
                found,
            )

        return found, checked_modules

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
                checked_modules,
                total_modules,
                (
                    "Ошибка MailAccess: "
                    f"{str(exc)[:120]}"
                ),
                found,
            )

        return found, checked_modules

    finally:

        # В любом случае выключаем
        # дочерний MailAccess.
        await _stop_process(server)

