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


# Это внутренние проверки именно Mosint v3.0.0.
# Это НЕ список всех движков проекта «Глаз Бога».
MODULES = [
    ("emailrep", "EmailRep"),
    ("breachdirectory", "BreachDirectory"),
    ("haveibeenpwned", "HaveIBeenPwned"),
    ("hunter", "Hunter"),
    ("ipapi", "IPApi"),
    ("intelx", "IntelX"),
    ("psbdmp", "PsbDmp"),
    ("instagram_exists", "Instagram"),
    ("spotify_exists", "Spotify"),
    ("twitter_exists", "Twitter"),
    ("google_search", "Google Search"),
    ("dns_records", "DNS"),
]


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


def _has_value(value):
    if value is None:
        return False

    if value is False:
        return False

    if isinstance(value, str):
        return bool(value.strip())

    if isinstance(value, (list, tuple, set)):
        return len(value) > 0

    if isinstance(value, dict):
        return any(
            _has_value(item)
            for item in value.values()
        )

    return True


def _is_positive_finding(key, value):
    """
    Определяет именно найденную информацию.

    IPApi и DNS являются информационными результатами,
    но сами по себе не считаются найденными аккаунтами,
    утечками или совпадениями.
    """

    if key in {
        "ipapi",
        "dns_records",
    }:
        return False

    if key in {
        "instagram_exists",
        "spotify_exists",
        "twitter_exists",
    }:
        return value is True

    if key == "breachdirectory":
        if isinstance(value, dict):
            found = value.get("found")

            if isinstance(found, (int, float)):
                return found > 0

        return _has_value(value)

    if key == "haveibeenpwned":
        if isinstance(value, dict):
            for field in (
                "found",
                "count",
                "breaches",
            ):
                found = value.get(field)

                if isinstance(found, (int, float)):
                    if found > 0:
                        return True

                if isinstance(found, list):
                    if len(found) > 0:
                        return True

        return _has_value(value)

    return _has_value(value)


def _normalize_results(data):
    """
    Mosint возвращает один большой JSON-объект.

    Старый код воспринимал этот объект как один результат,
    поэтому интерфейс показывал 1 / 1.

    Здесь каждый внутренний модуль Mosint превращается
    в отдельный результат.
    """

    data = _clean_sensitive(data)

    if not isinstance(data, dict):
        if isinstance(data, list):
            results = []

            for item in data:
                results.append(
                    {
                        "source": "Mosint",
                        "name": "Mosint",
                        "data": item,
                        "finding": _has_value(item),
                    }
                )

            findings = sum(
                1
                for item in results
                if item.get("finding")
            )

            return results, findings

        result = {
            "source": "Mosint",
            "name": "Mosint",
            "data": data,
            "finding": _has_value(data),
        }

        return [result], 1 if result["finding"] else 0

    normalized = []
    findings = 0

    # Email — метаданные, не находка.
    if "email" in data:
        normalized.append(
            {
                "source": "Mosint",
                "name": "Email",
                "module": "email",
                "data": data["email"],
                "finding": False,
            }
        )

    # Проверка валидности email — тоже метаданные.
    if "verified" in data:
        normalized.append(
            {
                "source": "Mosint",
                "name": "Email verification",
                "module": "verified",
                "data": data["verified"],
                "finding": False,
            }
        )

    # Каждый внутренний модуль Mosint — отдельный результат.
    for key, name in MODULES:
        if key not in data:
            continue

        value = data.get(key)

        positive = _is_positive_finding(
            key,
            value,
        )

        normalized.append(
            {
                "source": "Mosint",
                "name": name,
                "module": key,
                "data": value,
                "finding": positive,
            }
        )

        if positive:
            findings += 1

    return normalized, findings


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
            f"Конфигурация Mosint не найдена: "
            f"{MOSINT_CONFIG}"
        )

    total_modules = len(MODULES)

    if progress:
        progress(
            0,
            total_modules,
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
                f"Mosint превысил лимит "
                f"{MOSINT_TIMEOUT} секунд"
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
                f"{process.returncode}: "
                f"{error_text[:1000]}"
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
                f"Не удалось прочитать JSON Mosint: "
                f"{exc}"
            ) from exc

    normalized, findings = _normalize_results(data)

    if progress:
        progress(
            total_modules,
            total_modules,
            (
                f"Mosint: готово "
                f"({total_modules} проверок, "
                f"найдено {findings})"
            ),
            normalized,
        )

    return normalized, findings
