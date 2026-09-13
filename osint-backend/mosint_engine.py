import asyncio
import json
import os
import tempfile
from pathlib import Path


MOSINT_BIN = os.getenv("MOSINT_BIN", "/usr/local/bin/mosint")
MOSINT_CONFIG = os.getenv("MOSINT_CONFIG", "/app/.mosint.yaml")
MOSINT_TIMEOUT = int(os.getenv("MOSINT_TIMEOUT", "180"))

SENSITIVE_KEYS = {
    "password",
    "passwd",
    "pass",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "api_key",
    "apikey",
    "authorization",
    "cookie",
    "session",
    "private_key",
}


def _clean_sensitive(value):
    if isinstance(value, dict):
        cleaned = {}

        for key, item in value.items():
            key_lower = str(key).lower()

            if (
                key_lower in SENSITIVE_KEYS
                or any(
                    part in key_lower
                    for part in (
                        "password",
                        "access_token",
                        "refresh_token",
                        "private_key",
                    )
                )
            ):
                continue

            cleaned[key] = _clean_sensitive(item)

        return cleaned

    if isinstance(value, list):
        return [_clean_sensitive(item) for item in value]

    return value


def _normalize_results(data):
    data = _clean_sensitive(data)

    if isinstance(data, list):
        return data

    if isinstance(data, dict):
        for key in (
            "results",
            "result",
            "findings",
            "data",
            "services",
            "accounts",
            "social_accounts",
        ):
            value = data.get(key)

            if isinstance(value, list):
                return value

        return [data]

    return [
        {
            "value": str(data),
        }
    ]


async def mosint_search(query: str, progress=None):
    query = query.strip()

    if not query:
        raise ValueError("Email не указан")

    if not Path(MOSINT_BIN).exists():
        raise RuntimeError(
            f"Mosint не найден: {MOSINT_BIN}"
        )

    if not Path(MOSINT_CONFIG).exists():
        raise RuntimeError(
            f"Конфигурация Mosint не найдена: {MOSINT_CONFIG}"
        )

    if progress:
        progress(
            0,
            1,
            "Mosint: запуск",
            [],
        )

    with tempfile.TemporaryDirectory() as tmp_dir:
        output_file = os.path.join(
            tmp_dir,
            "mosint-output.json",
        )

        command = [
            MOSINT_BIN,
            "--config",
            MOSINT_CONFIG,
            "--output",
            output_file,
            "--silent",
            query,
        ]

        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=MOSINT_TIMEOUT,
            )

        except asyncio.CancelledError:
            if process.returncode is None:
                process.terminate()

                try:
                    await asyncio.wait_for(
                        process.wait(),
                        timeout=5,
                    )
                except asyncio.TimeoutError:
                    process.kill()
                    await process.wait()

            raise

        except asyncio.TimeoutError:
            if process.returncode is None:
                process.kill()
                await process.wait()

            raise RuntimeError(
                f"Mosint превысил лимит {MOSINT_TIMEOUT} секунд"
            )

        if process.returncode != 0:
            error_text = stderr.decode(
                "utf-8",
                errors="replace",
            ).strip()

            if not error_text:
                error_text = stdout.decode(
                    "utf-8",
                    errors="replace",
                ).strip()

            raise RuntimeError(
                f"Mosint завершился с кодом "
                f"{process.returncode}: {error_text[:1000]}"
            )

        if not os.path.exists(output_file):
            raise RuntimeError(
                "Mosint не создал JSON-файл результата"
            )

        try:
            with open(
                output_file,
                "r",
                encoding="utf-8",
            ) as file:
                data = json.load(file)

        except (OSError, json.JSONDecodeError) as exc:
            raise RuntimeError(
                f"Не удалось прочитать JSON Mosint: {exc}"
            ) from exc

    results = _normalize_results(data)

    normalized = []

    for item in results:
        if isinstance(item, dict):
            normalized.append(
                {
                    "source": "Mosint",
                    "name": (
                        item.get("name")
                        or item.get("service")
                        or item.get("source")
                        or "Mosint"
                    ),
                    "data": item,
                }
            )
        else:
            normalized.append(
                {
                    "source": "Mosint",
                    "name": "Mosint",
                    "data": item,
                }
            )

    if progress:
        progress(
            1,
            1,
            f"Mosint: готово ({len(normalized)} результатов)",
            normalized,
        )

    return normalized, 1
