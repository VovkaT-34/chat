import asyncio
import contextlib
import json
import os
import socket
from typing import List, Tuple

import httpx
import websockets


MAILACCESS_TIMEOUT = 240
MAX_CONCURRENT_MODULES = 1
MAILACCESS_HOST = "127.0.0.1"


async def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((MAILACCESS_HOST, 0))
        return int(sock.getsockname()[1])


async def _wait_health(
    base_url: str,
    timeout: float = 20.0,
) -> bool:
    deadline = asyncio.get_running_loop().time() + timeout

    async with httpx.AsyncClient(
        base_url=base_url,
        timeout=3.0,
    ) as client:

        while asyncio.get_running_loop().time() < deadline:
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
        stderr=asyncio.subprocess.DEVNULL,
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


def _make_finding(data: dict) -> dict:
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

    metadata = data.get("metadata") or {}

    if not isinstance(metadata, dict):
        metadata = {}

    return {
        "name": str(platform),
        "source": "MailAccess",
        "exists": True,
        "url": url,
        "severity": (
            data.get("severity")
            or metadata.get("severity")
            or data.get("status")
            or ""
        ),
        "data": data,
    }


async def mailaccess_search(
    email: str,
    progress=None,
) -> Tuple[List[dict], int]:

    found: List[dict] = []

    checked_modules = 0
    total_modules = 0

    active_modules = set()
    errors = 0
    error_details = []

    server = None

    env = os.environ.copy()

    env.update(
        {
            "MAX_CONCURRENT_MODULES": str(
                MAX_CONCURRENT_MODULES
            ),

            "MODULE_TIMEOUT_SECONDS": "30",

            "MODULE_TIMEOUT_OVERRIDES": json.dumps(
                {
                    "whatsmyname": 120,
                    "account_discovery": 90,
                    "username_pivot": 180,
                    "user_scanner": 180,
                }
            ),

            "ENABLE_MAIGRET_PLATFORMS": "true",
            "ENABLE_MAIGRET_WAVE2": "false",

            "ENABLE_BREACH_DEEP": "false",
            "ENABLE_EMAIL_DISCOVERY": "false",

            "RATE_LIMIT_ENABLED": "true",
            "REQUEST_DELAY_MS": "1000",

            "SHOW_DEFENDERS_BRIEF": "false",
        }
    )

    def send_progress(
        checked: int,
        total: int,
        status: str,
    ) -> None:
        if progress:
            progress(
                checked,
                total,
                status,
                found,
            )

    try:

        port = await _free_port()

        base_url = (
            f"http://{MAILACCESS_HOST}:{port}"
        )

        ws_url_base = (
            f"ws://{MAILACCESS_HOST}:{port}"
        )

        send_progress(
            0,
            0,
            "MailAccess: запуск сервера...",
        )

        server = await _start_mailaccess_server(
            env,
            port,
        )

        healthy = await _wait_health(
            base_url,
            timeout=20.0,
        )

        if not healthy:

            send_progress(
                0,
                0,
                "MailAccess: API-сервер не запустился",
            )

            return [], 0

        send_progress(
            0,
            0,
            "MailAccess: API-сервер запущен",
        )

        # Получаем реальное количество модулей.
        async with httpx.AsyncClient(
            base_url=base_url,
            timeout=10.0,
        ) as client:

            modules_response = await client.get(
                "/api/modules/"
            )

            modules_response.raise_for_status()

            try:
                modules_data = modules_response.json()
            except Exception:
                raise RuntimeError(
                    "MailAccess вернул некорректный список модулей"
                )

            if isinstance(modules_data, list):
                total_modules = len(modules_data)

            elif isinstance(modules_data, dict):
                modules_list = (
                    modules_data.get("modules")
                    or modules_data.get("data")
                    or []
                )

                if isinstance(modules_list, list):
                    total_modules = len(modules_list)

            if total_modules <= 0:
                raise RuntimeError(
                    "MailAccess не вернул список модулей"
                )

        send_progress(
            0,
            total_modules,
            (
                "MailAccess: загружено модулей: "
                f"{total_modules}"
            ),
        )

        async with httpx.AsyncClient(
            base_url=base_url,
            timeout=15.0,
        ) as client:

            response = await client.post(
                "/api/investigate",
                json={
                    "email": email,
                    "force": True,
                },
            )

            response.raise_for_status()

            try:
                response_data = response.json()
            except Exception:
                raise RuntimeError(
                    "MailAccess вернул некорректный JSON"
                )

            if not isinstance(
                response_data,
                dict,
            ):
                raise RuntimeError(
                    "MailAccess вернул неожиданный ответ"
                )

            investigation_id = (
                response_data.get("id")
                or response_data.get(
                    "investigation_id"
                )
            )

            if not investigation_id:
                raise RuntimeError(
                    "MailAccess не вернул ID расследования"
                )

        send_progress(
            0,
            total_modules,
            (
                "MailAccess: расследование запущено • "
                f"ID {investigation_id}"
            ),
        )

        websocket_url = (
            f"{ws_url_base}/ws/investigate/"
            f"{investigation_id}"
        )

        async with websockets.connect(
            websocket_url,
            open_timeout=15,
            close_timeout=5,
            max_size=1024 * 1024,
        ) as websocket:

            send_progress(
                checked_modules,
                total_modules,
                "MailAccess: получаем онлайн-прогресс...",
            )

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

                try:

                    raw = await asyncio.wait_for(
                        websocket.recv(),
                        timeout=remaining,
                    )

                except websockets.exceptions.ConnectionClosedOK:
                    break

                except websockets.exceptions.ConnectionClosed:

                    send_progress(
                        checked_modules,
                        total_modules,
                        (
                            "MailAccess: WebSocket "
                            "соединение закрыто"
                        ),
                    )

                    break

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
                    or event.get("name")
                    or "MailAccess"
                )

                if event_type == "module_start":

                    active_modules.add(module)

                    send_progress(
                        checked_modules,
                        total_modules,
                        (
                            "Проверяется модуль: "
                            f"{module} • "
                            f"активно {len(active_modules)}"
                        ),
                    )

                    continue

                if event_type in {
                    "module_result",
                    "module_error",
                }:

                    active_modules.discard(module)

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

                                item = _make_finding(
                                    data
                                )

                                found.append(item)

                    if event_type == "module_error":

                        errors += 1
                        error_text = str(
                            event.get("error")
                            or event.get("message")
                            or "unknown error"
                        )
                        error_details.append(
                            f"{module}: {error_text[:160]}"
                        )

                        send_progress(
                            checked_modules,
                            total_modules,
                            (
                                f"Модуль {module}: "
                                f"ошибка • "
                                f"{checked_modules}/"
                                f"{total_modules} • "
                                f"{error_text[:100]}"
                            ),
                        )

                    else:

                        send_progress(
                            checked_modules,
                            total_modules,
                            (
                                f"Модуль завершён: "
                                f"{module} • "
                                f"{checked_modules}/"
                                f"{total_modules} • "
                                f"найдено "
                                f"{len(found)}"
                            ),
                        )

                    continue

                if event_type == "investigation_complete":

                    reported_total = (
                        event.get("total_modules")
                        or event.get("modules_total")
                    )

                    if isinstance(
                        reported_total,
                        int,
                    ) and reported_total > 0:

                        total_modules = reported_total

                    if checked_modules > total_modules:
                        total_modules = checked_modules

                    send_progress(
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
                    )

                    break

                if event_type == "investigation_failed":

                    error_text = str(
                        event.get("error")
                        or event.get("message")
                        or "неизвестная ошибка"
                    )

                    send_progress(
                        checked_modules,
                        total_modules,
                        (
                            "MailAccess: ошибка • "
                            f"{error_text[:150]}"
                        ),
                    )

                    break

                if event_type == "error":

                    error_text = str(
                        event.get("error")
                        or event.get("message")
                        or "неизвестная ошибка"
                    )

                    send_progress(
                        checked_modules,
                        total_modules,
                        (
                            "MailAccess: WebSocket ошибка • "
                            f"{error_text[:150]}"
                        ),
                    )

                    break

        if checked_modules > total_modules:
            total_modules = checked_modules

        return found, checked_modules, errors, error_details

    except asyncio.TimeoutError:

        send_progress(
            checked_modules,
            total_modules,
            (
                f"MailAccess: таймаут "
                f"{MAILACCESS_TIMEOUT} сек • "
                f"проверено "
                f"{checked_modules}/"
                f"{total_modules} • "
                f"найдено "
                f"{len(found)}"
            ),
        )

        return found, checked_modules, errors, error_details

    except FileNotFoundError:

        if progress:
            progress(
                0,
                0,
                "MailAccess не установлен",
                [],
            )

        return [], 0, 1, ["MailAccess: not installed"]

    except Exception as exc:

        error_text = str(exc)

        if not error_text:
            error_text = type(exc).__name__

        errors += 1
        error_details.append(f"MailAccess: {error_text[:160]}")
        send_progress(
            checked_modules,
            total_modules,
            (
                "Ошибка MailAccess: "
                f"{error_text[:180]}"
            ),
        )

        return found, checked_modules, errors, error_details

    finally:

        await _stop_process(server)
