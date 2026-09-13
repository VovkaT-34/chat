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

# Внутренние проверки Mosint v3.0.0.

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

```
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
```

def _is_nonempty(value):
if value is None:
return False

```
if isinstance(value, bool):
    return value

if isinstance(value, str):
    return bool(value.strip())

if isinstance(value, (list, tuple, set)):
    return len(value) > 0

if isinstance(value, dict):
    return len(value) > 0

return True
```

def _is_positive_finding(module, value):
"""
Определяет только реальные OSINT-находки.

```
Технические данные IPApi и DNS не считаются находками.
Email и Email verification также не считаются находками.
"""

# ---------------------------------------------------------
# Техническая информация — не finding
# ---------------------------------------------------------

if module in {
    "ipapi",
    "dns_records",
}:
    return False

# ---------------------------------------------------------
# Социальные сети
# ---------------------------------------------------------

if module in {
    "instagram_exists",
    "spotify_exists",
    "twitter_exists",
}:
    if value is True:
        return True

    if isinstance(value, dict):
        return (
            value.get("exists") is True
            or value.get("found") is True
        )

    return False

# ---------------------------------------------------------
# EmailRep
# ---------------------------------------------------------

if module == "emailrep":
    if not isinstance(value, dict):
        return False

    # Явно подозрительный email
    if value.get("suspicious") is True:
        return True

    details = value.get("details")

    if not isinstance(details, dict):
        return False

    # Реальные risk-флаги
    risk_flags = {
        "blacklisted",
        "malicious_activity",
        "malicious_activity_recent",
        "credentials_leaked",
        "credentials_leaked_recent",
        "data_breach",
        "suspicious_tld",
        "spam",
    }

    for flag in risk_flags:
        if details.get(flag) is True:
            return True

    # Наличие профилей действительно является находкой.
    profiles = details.get("profiles")

    if isinstance(profiles, list) and profiles:
        return True

    if isinstance(profiles, dict) and profiles:
        return True

    return False

# ---------------------------------------------------------
# BreachDirectory
# ---------------------------------------------------------

if module == "breachdirectory":
    if not isinstance(value, dict):
        return False

    found = value.get("found")

    if isinstance(found, (int, float)):
        return found > 0

    if isinstance(found, str):
        try:
            return int(found) > 0
        except ValueError:
            return False

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
        found = value.get("found")

        if isinstance(found, bool):
            if found:
                return True

        if isinstance(found, (int, float)):
            if found > 0:
                return True

        count = value.get("count")

        if isinstance(count, (int, float)):
            if count > 0:
                return True

        breaches = value.get("breaches")

        if isinstance(breaches, list) and breaches:
            return True

        results = value.get("results")

        if isinstance(results, list) and results:
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

        if isinstance(results, (int, float)):
            return results > 0

    return False

# ---------------------------------------------------------
# IntelX
# ---------------------------------------------------------

if module == "intelx":
    if isinstance(value, list):
        return len(value) > 0

    if isinstance(value, dict):
        for field in (
            "results",
            "records",
            "matches",
            "selectors",
        ):
            item = value.get(field)

            if isinstance(item, list) and item:
                return True

            if isinstance(item, dict) and item:
                return True

    return False

# ---------------------------------------------------------
# PsbDmp
# ---------------------------------------------------------

if module == "psbdmp":
    if isinstance(value, list):
        return len(value) > 0

    if isinstance(value, dict):
        for field in (
            "results",
            "records",
            "matches",
            "data",
        ):
            item = value.get(field)

            if isinstance(item, list) and item:
                return True

            if isinstance(item, dict) and item:
                return True

    return False

# ---------------------------------------------------------
# Google Search
# ---------------------------------------------------------

if module == "google_search":
    if isinstance(value, list):
        return len(value) > 0

    if isinstance(value, dict):
        for field in (
            "results",
            "links",
            "items",
            "matches",
        ):
            item = value.get(field)

            if isinstance(item, list) and item:
                return True

    return False

return False
```

def _normalize_results(data):
"""
Преобразует единый JSON Mosint
в отдельные результаты по модулям.
"""

```
data = _clean_sensitive(data)

if not isinstance(data, dict):
    return [], 0

normalized = []
findings = 0

# Email — только исходный запрос.
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

# Проверка email — технический статус.
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

# Отдельно обрабатываем каждый внутренний модуль.
for module, name in MODULES:
    if module not in data:
        continue

    value = data.get(module)

    positive = _is_positive_finding(
        module,
        value,
    )

    normalized.append(
        {
            "source": "Mosint",
            "name": name,
            "module": module,
            "data": value,
            "finding": positive,
        }
    )

    if positive:
        findings += 1

return normalized, findings
```

async def mosint_search(query: str, progress=None):
query = str(query or "").strip()

```
if not query:
    raise ValueError("Email не указан")

binary = Path(MOSINT_BIN)
config = Path(MOSINT_CONFIG)

if not binary.exists():
    raise RuntimeError(
        f"Mosint не найден: {MOSINT_BIN}"
    )

if not config.exists():
    raise RuntimeError(
        f"Конфигурация Mosint не найдена: {MOSINT_CONFIG}"
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

    # Фактический CLI Mosint v3.0.0:
    # email передаётся как позиционный аргумент.
    # Форматы -e и -f в этой версии отсутствуют.
    command = [
        MOSINT_BIN,
        "--config",
        MOSINT_CONFIG,
        "--output",
        output_file,
        "--silent",
        query,
    ]

    process = None

    try:
        process = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(config.parent),
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

    finally:
        if process is not None:
            try:
                if process.returncode is None:
                    process.terminate()
            except ProcessLookupError:
                pass

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
```
