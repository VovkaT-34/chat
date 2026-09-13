import asyncio
import json
import os
import tempfile
from pathlib import Path


MOSINT_BIN = os.getenv("MOSINT_BIN", "/usr/local/bin/mosint")
MOSINT_CONFIG = os.getenv("MOSINT_CONFIG", "/app/.mosint.yaml")

TIMEOUT_SECONDS = int(os.getenv("MOSINT_TIMEOUT", "180"))

SENSITIVE_KEYS = {
    "api_key",
    "apikey",
    "key",
    "token",
    "password",
    "secret",
    "authorization",
    "auth",
}

# Это именно внутренние проверки Mosint.
# Mosint v3 выполняет 12 модулей.
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
    """
    Удаляет потенциально чувствительные API-ключи/токены
    из результата перед отправкой на frontend.
    """
    if isinstance(value, dict):
        cleaned = {}

        for key, item in value.items():
            key_lower = str(key).lower()

            if any(secret in key_lower for secret in SENSITIVE_KEYS):
                continue

            cleaned[key] = _clean_sensitive(item)

        return cleaned

    if isinstance(value, list):
        return [_clean_sensitive(item) for item in value]

    return value


def _nonempty(value):
    """
    Проверяет, содержит ли значение реальные данные.
    """
    if value is None:
        return False

    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)):
        return value != 0

    if isinstance(value, str):
        return bool(value.strip())

    if isinstance(value, list):
        return any(_nonempty(item) for item in value)

    if isinstance(value, dict):
        return any(_nonempty(item) for item in value.values())

    return bool(value)


def _is_positive_finding(module, value):
    """
    Определяет, является ли результат реальной находкой.

    Важно:
    технические данные вроде DNS/IP не считаются находками.
    Metadata Email/Email verification тоже не считаются.
    """

    if value is None:
        return False

    # ---------------------------------------------------------
    # EmailRep
    # ---------------------------------------------------------
    if module == "emailrep":
        if not isinstance(value, dict):
            return False

        # suspicious=true — реальный сигнал
        if value.get("suspicious") is True:
            return True

        # Если есть положительные risk-флаги
        details = value.get("details")

        if isinstance(details, dict):
            risk_keys = {
                "blacklisted",
                "malicious_activity",
                "malicious_activity_recent",
                "credentials_leaked",
                "credentials_leaked_recent",
                "data_breach",
                "suspicious_tld",
                "spam",
                "free_provider",
                "disposable",
                "profiles",
            }

            for key in risk_keys:
                item = details.get(key)

                if key == "profiles":
                    if isinstance(item, list) and len(item) > 0:
                        return True
                    if isinstance(item, dict) and len(item) > 0:
                        return True
                    continue

                if item is True:
                    return True

        # Само references=0 не является находкой.
        return False

    # ---------------------------------------------------------
    # BreachDirectory
    # ---------------------------------------------------------
    if module == "breachdirectory":
        if not isinstance(value, dict):
            return False

        found = value.get("found")

        if isinstance(found, int):
            return found > 0

        if isinstance(found, str):
            try:
                return int(found) > 0
            except ValueError:
                return False

        # Иногда сервис возвращает список найденных записей
        results = value.get("results")

        if isinstance(results, list):
            return len(results) > 0

        return False

    # ---------------------------------------------------------
    # HaveIBeenPwned
    # ---------------------------------------------------------
    if module == "haveibeenpwned":
        if isinstance(value, list):
            return len(value) > 0

        if isinstance(value, dict):
            for key in ("breaches", "results", "data"):
                item = value.get(key)

                if isinstance(item, list) and len(item) > 0:
                    return True

            if value.get("found") is True:
                return True

        return False

    # ---------------------------------------------------------
    # Hunter
    # ---------------------------------------------------------
    if module == "hunter":
        if not isinstance(value, dict):
            return False

        meta = value.get("meta")

        if isinstance(meta, dict):
            results = meta.get("results")

            if isinstance(results, int) and results > 0:
                return True

        # Не считаем технические поля domain/disposable/pattern
        # находкой сами по себе.
        return False

    # ---------------------------------------------------------
    # IPApi
    # ---------------------------------------------------------
    # Геолокация/IP-информация — технические данные,
    # не OSINT-находка.
    if module == "ipapi":
        return False

    # ---------------------------------------------------------
    # DNS
    # ---------------------------------------------------------
    # DNS-записи — технические данные,
    # не OSINT-находка.
    if module == "dns_records":
        return False

    # ---------------------------------------------------------
    # Instagram / Spotify / Twitter
    # ---------------------------------------------------------
    if module in {
        "instagram_exists",
        "spotify_exists",
        "twitter_exists",
    }:
        if value is True:
            return True

        if isinstance(value, dict):
            if value.get("exists") is True:
                return True

            if value.get("found") is True:
                return True

        return False

    # ---------------------------------------------------------
    # IntelX
    # ---------------------------------------------------------
    if module == "intelx":
        if isinstance(value, list):
            return len(value) > 0

        if isinstance(value, dict):
            for key in (
                "records",
                "results",
                "matches",
                "selectors",
                "data",
            ):
                item = value.get(key)

                if isinstance(item, list) and len(item) > 0:
                    return True

                if isinstance(item, dict) and len(item) > 0:
                    return True

        return False

    # ---------------------------------------------------------
    # PsbDmp
    # ---------------------------------------------------------
    if module == "psbdmp":
        if isinstance(value, list):
            return len(value) > 0

        if isinstance(value, dict):
            for key in (
                "results",
                "matches",
                "data",
                "records",
            ):
                item = value.get(key)

                if isinstance(item, list) and len(item) > 0:
                    return True

                if isinstance(item, dict) and len(item) > 0:
                    return True

        return False

    # ---------------------------------------------------------
    # Google Search
    # ---------------------------------------------------------
    if module == "google_search":
        if isinstance(value, list):
            return len(value) > 0

        if isinstance(value, dict):
            for key in (
                "results",
                "links",
                "items",
                "matches",
            ):
                item = value.get(key)

                if isinstance(item, list) and len(item) > 0:
                    return True

        return False

    return False


def _normalize_results(raw):
    """
    Приводит JSON Mosint к единому формату для frontend.

    Возвращает:
        normalized_results
        findings
    """

    if not isinstance(raw, dict):
        return [], []

    normalized = []
    findings = []

    for module, display_name in MODULES:
        if module not in raw:
            continue

        value = _clean_sensitive(raw.get(module))

        finding = _is_positive_finding(module, value)

        item = {
            "source": "Mosint",
            "name": display_name,
            "module": module,
            "data": value,
            "finding": finding,
        }

        normalized.append(item)

        if finding:
            findings.append(item)

    return normalized, findings


async def mosint_search(query, progress=None):
    """
    Асинхронный запуск Mosint.

    Архитектура сохраняется:
    - asyncio subprocess
    - timeout
    - отмена процесса
    - временный JSON
    - progress callback
    - возврат (results, findings)
    """

    query = str(query or "").strip()

    if not query:
        raise ValueError("Пустой email")

    binary = Path(MOSINT_BIN)

    if not binary.exists():
        raise FileNotFoundError(
            f"Mosint binary not found: {MOSINT_BIN}"
        )

    if not os.access(binary, os.X_OK):
        raise PermissionError(
            f"Mosint binary is not executable: {MOSINT_BIN}"
        )

    config = Path(MOSINT_CONFIG)

    if not config.exists():
        raise FileNotFoundError(
            f"Mosint config not found: {MOSINT_CONFIG}"
        )

    with tempfile.TemporaryDirectory(prefix="mosint-") as tmpdir:
        output_file = Path(tmpdir) / "result.json"

        cmd = [
            str(binary),
            "-e",
            query,
            "-o",
            str(output_file),
            "-f",
            "json",
        ]

        process = None

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=str(config.parent),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=TIMEOUT_SECONDS,
                )

            except asyncio.CancelledError:
                if process.returncode is None:
                    try:
                        process.terminate()
                    except ProcessLookupError:
                        pass

                    try:
                        await asyncio.wait_for(
                            process.wait(),
                            timeout=5,
                        )
                    except asyncio.TimeoutError:
                        try:
                            process.kill()
                        except ProcessLookupError:
                            pass

                raise

            except asyncio.TimeoutError:
                if process.returncode is None:
                    try:
                        process.terminate()
                    except ProcessLookupError:
                        pass

                    try:
                        await asyncio.wait_for(
                            process.wait(),
                            timeout=5,
                        )
                    except asyncio.TimeoutError:
                        try:
                            process.kill()
                        except ProcessLookupError:
                            pass

                raise TimeoutError(
                    f"Mosint timeout after {TIMEOUT_SECONDS} seconds"
                )

            if process.returncode != 0:
                error_text = (
                    stderr.decode("utf-8", errors="replace").strip()
                    if stderr
                    else ""
                )

                output_text = (
                    stdout.decode("utf-8", errors="replace").strip()
                    if stdout
                    else ""
                )

                details = error_text or output_text or "unknown error"

                raise RuntimeError(
                    f"Mosint exited with code "
                    f"{process.returncode}: {details}"
                )

            # -------------------------------------------------
            # Читаем JSON
            # -------------------------------------------------

            if not output_file.exists():
                raise RuntimeError(
                    "Mosint finished successfully, "
                    "but result.json was not created"
                )

            raw_text = output_file.read_text(
                encoding="utf-8",
                errors="replace",
            ).strip()

            if not raw_text:
                raise RuntimeError(
                    "Mosint returned an empty result"
                )

            try:
                raw = json.loads(raw_text)

            except json.JSONDecodeError as exc:
                raise RuntimeError(
                    f"Invalid Mosint JSON: {exc}"
                ) from exc

            # -------------------------------------------------
            # Нормализация
            # -------------------------------------------------

            normalized, findings = _normalize_results(raw)

            # -------------------------------------------------
            # Progress
            # -------------------------------------------------

            if progress is not None:
                try:
                    progress(
                        len(MODULES),
                        len(MODULES),
                        "Mosint: проверки завершены",
                        normalized,
                    )
                except Exception:
                    # Callback не должен ломать сам поиск.
                    pass

            return normalized, findings

        finally:
            if process is not None:
                try:
                    if process.returncode is None:
                        process.terminate()
                except ProcessLookupError:
                    pass
