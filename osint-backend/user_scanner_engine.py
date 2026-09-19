import asyncio
import json
import re

import httpx
from user_scanner.core import engine
from user_scanner.core.helpers import load_categories, load_modules
from user_scanner.core.result import Result

BATCH_SIZE = 20
MAX_CONCURRENCY = 2
BATCH_PAUSE = 0.10


def _serialize_result(res):
    try:
        data = res.to_json() if hasattr(res, "to_json") else res
        if isinstance(data, str):
            data = json.loads(data)
        if isinstance(data, dict):
            return data
    except Exception:
        pass

    return {
        "site_name": getattr(res, "site_name", "unknown"),
        "status": str(getattr(res, "status", "")),
        "url": getattr(res, "url", None),
        "category": getattr(res, "category", None),
        "extra": getattr(res, "extra", None),
        "reason": getattr(res, "reason", None),
    }


def _diagnostic_issue(data):
    """Return a diagnostic message only for an error-like scanner response."""
    status = str(data.get("status", "")).strip()
    reason = str(data.get("reason", "")).strip()
    error = str(data.get("error", "")).strip()
    marker = " ".join(part for part in (status, reason, error) if part).lower()
    error_markers = (
        "error", "exception", "timeout", "timed out", "rate limit",
        "ratelimit", "too many", "blocked", "captcha", "failed",
        "failure", "unavailable", "connection", "network",
    )
    if any(marker_text in marker for marker_text in error_markers):
        name = data.get("site_name") or data.get("name") or "unknown"
        detail = error or reason or status or "неизвестная ошибка"
        return f"{name}: {detail[:160]}"
    return None


def _make_found_item(data):
    status = str(data.get("status", "")).lower()
    if status not in ("registered", "taken", "exists", "found"):
        return None

    return {
        "name": data.get("site_name") or data.get("name") or "unknown",
        "source": "user-scanner",
        "exists": True,
        "url": data.get("url"),
    }


async def _validate_hackerone_compat(email: str) -> Result:
    """Compatibility validator for HackerOne responses that are not JSON."""
    show_url = "https://hackerone.com"
    signup_url = "https://hackerone.com/sign_up"
    api_url = "https://hackerone.com/users"

    headers_init = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,image/apng,*/*;q=0.8,"
        "application/signed-exchange;v=b3;q=0.7",
        "Accept-Encoding": "identity",
        "referer": "https://hackerone.com/users/sign_in",
        "accept-language": "en-US,en;q=0.9",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            page = await client.get(signup_url, headers=headers_init)

            if page.status_code in (401, 403):
                return Result.error(
                    f"HackerOne blocked the validation request (HTTP {page.status_code})",
                    url=show_url,
                )
            if page.status_code == 429:
                return Result.error("Rate limited by HackerOne", url=show_url)

            csrf_match = re.search(
                r'name="csrf-token" content="([^"]+)"', page.text
            )
            if not csrf_match:
                return Result.error(
                    f"Failed to extract HackerOne CSRF token (HTTP {page.status_code})",
                    url=show_url,
                )

            csrf_token = csrf_match.group(1)
            reg_headers = {
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-CSRF-Token": csrf_token,
                "X-Requested-With": "XMLHttpRequest",
                "User-Agent": headers_init["User-Agent"],
                "Origin": "https://hackerone.com",
                "Referer": signup_url,
                "Accept-Encoding": "identity",
                "Accept-Language": "en-US,en;q=0.9",
            }
            payload = {
                "user[name]": "St33l_h3art_g3t_n0_l0v3",
                "user[username]": "kn0wl3dg3_is_curs3",
                "user[email]": email,
                "user[password]": "thisw0rldwasn3v3rg00d",
                "user[password_confirmation]": "mismatch_on_purpose",
            }

            response = await client.post(api_url, data=payload, headers=reg_headers)

            if response.status_code in (401, 403):
                return Result.error(
                    f"HackerOne blocked the validation request (HTTP {response.status_code})",
                    url=show_url,
                )
            if response.status_code == 429:
                return Result.error("Rate limited by HackerOne", url=show_url)

            try:
                data = response.json()
            except ValueError:
                content_type = response.headers.get("content-type", "").lower()
                if "json" not in content_type:
                    return Result.error(
                        f"Unexpected HackerOne response format (HTTP {response.status_code})",
                        url=show_url,
                    )
                return Result.error(
                    f"Unexpected HackerOne JSON response (HTTP {response.status_code})",
                    url=show_url,
                )

            errors = data.get("errors", {}) if isinstance(data, dict) else {}
            email_errors = str(errors.get("email", []))

            if "has already been taken" in email_errors:
                return Result.taken(url=show_url)

            if isinstance(data, dict) and "email" not in errors:
                return Result.available(url=show_url)

            return Result.error(
                f"Unexpected HackerOne response: {response.status_code}",
                url=show_url,
            )


async def _validate_stackoverflow_compat(email: str) -> Result:
    """Compatibility validator for Stack Overflow's changed login response."""
    url = "https://stackoverflow.com/users/login"
    show_url = "https://stackoverflow.com"

    payload = {
        "ssrc": "login",
        "email": email,
        "password": "Password109-grt",
        "oauth_version": "",
        "oauth_server": "",
    }
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36"
        ),
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;q=0.9,"
            "image/avif,image/webp,image/apng,*/*;q=0.8,"
            "application/signed-exchange;v=b3;q=0.7"
        ),
        "Accept-Encoding": "identity",
        "sec-ch-ua-platform": '"Linux"',
        "origin": "https://stackoverflow.com",
        "referer": "https://stackoverflow.com/users/login",
    }

    try:
        async with httpx.AsyncClient(
            timeout=15.0, http2=False, follow_redirects=True
        ) as client:
            response = await client.post(
                url, data=payload, headers=headers
            )
            body = response.text
            body_lower = body.lower()

            if response.status_code == 429:
                return Result.error("Rate limited by Stack Overflow", url=show_url)

            if response.status_code in (401, 403):
                return Result.error(
                    f"Stack Overflow blocked the validation request (HTTP {response.status_code})",
                    url=show_url,
                )

            if "no user found with matching email" in body_lower:
                return Result.available(url=show_url)

            if "the email or password is incorrect" in body_lower:
                return Result.taken(url=show_url)

            # Stack Overflow has changed the wording/HTML of its login
            # response over time. Accept only explicit negative/positive
            # account-state markers; never infer existence from a generic
            # successful HTTP response.
            unavailable_markers = (
                "no account found",
                "account doesn't exist",
                "account does not exist",
                "email isn't associated",
                "email is not associated",
                "email isn't registered",
                "email is not registered",
                "no user exists",
            )
            registered_markers = (
                "email or password is incorrect",
                "password is incorrect",
                "incorrect email or password",
                "invalid email or password",
                "email address is already registered",
                "email is already registered",
            )

            if any(marker in body_lower for marker in unavailable_markers):
                return Result.available(url=show_url)

            if any(marker in body_lower for marker in registered_markers):
                return Result.taken(url=show_url)

            content_type = response.headers.get("content-type", "").lower()
            if "text/html" not in content_type and response.status_code == 200:
                return Result.error(
                    f"Unexpected Stack Overflow response format (HTTP {response.status_code})",
                    url=show_url,
                )

            return Result.error(
                f"Unexpected Stack Overflow response body (HTTP {response.status_code})",
                url=show_url,
            )
    except httpx.TimeoutException:
        return Result.error("Stack Overflow request timed out", url=show_url)
    except Exception as exc:
        return Result.error(
            f"Stack Overflow validation failed: {exc}", url=show_url
        )


def _prepare_module(module):
    """Apply only known compatibility aliases before calling user-scanner."""
    module_name = getattr(module, "__name__", "").split(".")[-1].lower()
    if module_name == "besoccer" and not hasattr(module, "validate_besoccer"):
        validator = getattr(module, "validate_okcats", None)
        if validator is not None:
            setattr(module, "validate_besoccer", validator)
    elif module_name == "stackoverflow":
        setattr(module, "validate_stackoverflow", _validate_stackoverflow_compat)
    elif module_name == "hackerone":
        setattr(module, "validate_hackerone", _validate_hackerone_compat)
    return module


async def user_scanner_search(email: str, progress=None):
    try:
        categories = load_categories(is_email=True)
        modules = []

        for cat_path in categories.values():
            modules.extend(load_modules(cat_path))

        modules = [_prepare_module(module) for module in modules]
        total = len(modules)
        found = []
        checked = 0
        errors = 0
        error_details = []
        batch_total = (total + BATCH_SIZE - 1) // BATCH_SIZE

        if progress:
            progress(0, total, f"Пакет 0/{batch_total} • подготовка", found)

        for batch_start in range(0, total, BATCH_SIZE):
            batch = modules[batch_start:batch_start + BATCH_SIZE]
            batch_number = batch_start // BATCH_SIZE + 1

            pending = set()
            task_modules = {}
            batch_index = 0

            while batch_index < len(batch) or pending:
                while batch_index < len(batch) and len(pending) < MAX_CONCURRENCY:
                    module = batch[batch_index]
                    task = asyncio.create_task(engine.check(module, email))
                    pending.add(task)
                    task_modules[task] = module
                    batch_index += 1

                done, pending = await asyncio.wait(
                    pending,
                    return_when=asyncio.FIRST_COMPLETED,
                )

                for task in done:
                    module = task_modules.pop(task, None)
                    try:
                        res = task.result()
                        data = _serialize_result(res)
                        item = _make_found_item(data)
                        diagnostic_issue = _diagnostic_issue(data)

                        if item is not None:
                            found.append(item)
                        if diagnostic_issue:
                            errors += 1
                            error_details.append(diagnostic_issue)

                        checked += 1
                        site_name = data.get("site_name") or data.get("name") or "unknown"
                        status = data.get("status") or "unknown"

                        if progress:
                            progress(
                                checked,
                                total,
                                f"Пакет {batch_number}/{batch_total} • {site_name} • {status}",
                                found,
                            )
                    except Exception as exc:
                        checked += 1
                        errors += 1
                        module_name = (
                            getattr(module, "name", None)
                            or getattr(module, "site_name", None)
                            or str(module)
                        )
                        error_details.append(
                            f"{module_name}: {str(exc)[:120]}"
                        )
                        if progress:
                            progress(
                                checked,
                                total,
                                f"Пакет {batch_number}/{batch_total} • ошибка: {str(exc)[:120]}",
                                found,
                            )

            if batch_start + BATCH_SIZE < total:
                await asyncio.sleep(BATCH_PAUSE)

        return found, total, errors, error_details

    except Exception:
        if progress:
            progress(0, 0, "error", [])
        return [], 0, 1, ["User Scanner: внутренняя ошибка запуска"]
