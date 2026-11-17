import asyncio
import json
import re

import httpx
from user_scanner.core import engine
from user_scanner.core.impersonate import get_warm_session, impersonate_request_async
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


async def _validate_deviantart_compat(email: str) -> Result:
    """Diagnose DeviantArt CSRF delivery without exposing token values."""
    show_url = "https://www.deviantart.com"
    join_page = "https://www.deviantart.com/join/"
    user_agent = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36"
    headers = {
        "User-Agent": user_agent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Encoding": "identity",
        "sec-ch-ua-platform": '"Android"',
        "upgrade-insecure-requests": "1",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.get(join_page, headers=headers)
            if response.status_code in (401, 403, 429):
                return Result.error(
                    f"DeviantArt signup page blocked/rate-limited (HTTP {response.status_code})",
                    url=show_url,
                )

            body = response.text
            body_lower = body.lower()
            csrf_patterns = (
                r"window\\.__CSRF_TOKEN__\\s*=\\s*'([^']+)'",
                r'window\\.__CSRF_TOKEN__\\s*=\\s*"([^"]+)"',
                r'"csrf[_-]?token"\\s*:\\s*"[^"]+"',
                r"'csrf[_-]?token'\\s*:\\s*'[^']+'",
            )
            matched_pattern = None
            for pattern in csrf_patterns:
                if re.search(pattern, body, re.IGNORECASE):
                    matched_pattern = pattern
                    break

            marker_names = (
                "__csrf_token__",
                "csrf-token",
                "csrf_token",
                "csrf",
            )
            marker_hits = [marker for marker in marker_names if marker in body_lower]

            form_actions = re.findall(
                r'<form[^>]+action=["\\\']([^"\\\']+)["\\\']',
                body,
                re.IGNORECASE,
            )
            input_names = re.findall(
                r'<input[^>]+name=["\\\']([^"\\\']+)["\\\']',
                body,
                re.IGNORECASE,
            )
            script_count = len(
                re.findall(r'<script\\b', body, re.IGNORECASE)
            )
            js_markers = [
                marker
                for marker in (
                    "__next_data__",
                    "__apollo_state__",
                    "recaptcha",
                    "turnstile",
                    "hcaptcha",
                    "sisu",
                    "_sisu",
                )
                if marker in body_lower
            ]

            title_match = re.search(r"<title[^>]*>(.*?)</title>", body, re.IGNORECASE | re.DOTALL)
            title_text = re.sub(r"\\s+", " ", title_match.group(1)).strip() if title_match else "none"
            body_markers = [
                marker
                for marker in (
                    "access to this page has been denied",
                    "just a moment",
                    "attention required",
                    "verify you are human",
                    "captcha",
                    "challenge",
                    "cloudflare",
                    "akamai",
                    "perimeterx",
                    "datadome",
                    "incapsula",
                    "access denied",
                )
                if marker in body_lower
            ]

            return Result.error(
                "DeviantArt CSRF diagnostic "
                f"(HTTP {response.status_code}, final URL {response.url}, "
                f"token pattern: {'found' if matched_pattern else 'not found'}, "
                f"CSRF markers: {','.join(marker_hits) or 'none'}, "
                f"forms: {len(form_actions)}, inputs: {','.join(input_names[:12]) or 'none'}, "
                f"scripts: {script_count}, JS markers: {','.join(js_markers) or 'none'}, "
                f"title: {title_text[:80]}, body markers: {','.join(body_markers) or 'none'}, "
                f"body length: {len(body)}, "
                f"content-type: {response.headers.get('content-type', 'unknown')})",
                url=show_url,
            )
    except httpx.TimeoutException:
        return Result.error("DeviantArt signup page request timed out", url=show_url)
    except Exception as exc:
        return Result.error(f"DeviantArt CSRF diagnostic failed: {exc}", url=show_url)


async def _validate_dollarfix_compat(email: str) -> Result:
    """Validate DollarFix account-state responses with safe handling of changed API output."""
    url = "https://api.dollarfix.com/core-userinfo/user_center/apkLogin"
    show_url = "https://dollarfix.com"
    payload = {
        "password": "generic_password_123",
        "verifiable_type": 1,
        "user_name": email,
    }
    import base64
    import secrets
    uuid_val = base64.urlsafe_b64encode(secrets.token_bytes(16)).decode("utf-8").rstrip("=").replace("-", "_")
    headers = {
        "User-Agent": "okhttp/4.10.0",
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "client": "1",
        "appversion": "1.8.9.1",
        "phonemodel": "Pixel 6",
        "phonesystem": "13",
        "appid": "9205",
        "appname": "DollarFix",
        "headsn": "",
        "token": "",
        "uuid": uuid_val,
        "zone": "GMT+0:00",
        "lang": "en",
        "content-type": "application/json; charset=utf-8",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0, http2=True) as client:
            response = await client.post(url, json=payload, headers=headers)
            if response.status_code == 429:
                return Result.error("DollarFix rate limited (HTTP 429)", url=show_url)
            if response.status_code != 200:
                return Result.error(
                    f"DollarFix unexpected HTTP status: {response.status_code}",
                    url=show_url,
                )
            try:
                data = response.json()
            except ValueError:
                return Result.error("DollarFix returned invalid JSON", url=show_url)
            if not isinstance(data, dict):
                return Result.error("DollarFix returned non-object JSON", url=show_url)
            msg = data.get("msg", "")
            if msg in ("Incorrect password", "not set password"):
                return Result.taken(url=show_url)
            if msg in ("The user does not exist.", "用户不存在。"):
                return Result.available(url=show_url)
            return Result.error(
                "DollarFix returned an unknown account-state response",
                url=show_url,
            )
    except httpx.TimeoutException:
        return Result.error("DollarFix request timed out", url=show_url)
    except Exception as exc:
        return Result.error(f"DollarFix validation failed: {exc}", url=show_url)


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


async def _validate_hackerone_compat(email: str) -> Result:
    """Compatibility validator for HackerOne responses with safe JSON parsing."""
    show_url = "https://hackerone.com"
    signup_url = "https://hackerone.com/sign_up"
    api_url = "https://hackerone.com/users"
    headers = {"User-Agent": "Mozilla/5.0", "Accept": "text/html,application/xhtml+xml,application/json", "Accept-Encoding": "identity"}

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            page = await client.get(signup_url, headers=headers)
            if page.status_code == 403:
                return Result.error("HackerOne WAF blocked the signup page (HTTP 403)", url=show_url)
            if page.status_code == 429:
                return Result.error("Rate limited by HackerOne during handshake", url=show_url)

            match = re.search(r'name="csrf-token" content="([^"]+)"', page.text)
            if not match:
                return Result.error(f"Failed to extract HackerOne CSRF token (HTTP {page.status_code})", url=show_url)

            response = await client.post(
                api_url,
                data={
                    "user[name]": "St33l_h3art_g3t_n0_l0v3",
                    "user[username]": "kn0wl3dg3_is_curs3",
                    "user[email]": email,
                    "user[password]": "thisw0rldwasn3v3rg00d",
                    "user[password_confirmation]": "mismatch_on_purpose",
                },
                headers={
                    **headers,
                    "Accept": "application/json, text/javascript, */*; q=0.01",
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "X-CSRF-Token": match.group(1),
                    "X-Requested-With": "XMLHttpRequest",
                    "Origin": "https://hackerone.com",
                    "Referer": signup_url,
                },
            )
            status = response.status_code
            if status == 403:
                return Result.error("HackerOne WAF blocked the validation request (HTTP 403)", url=show_url)
            if status == 429:
                return Result.error("Rate limited by HackerOne", url=show_url)

            try:
                data = response.json()
            except ValueError:
                return Result.error(f"Unexpected HackerOne response body (HTTP {status})", url=show_url)
            if not isinstance(data, dict):
                return Result.error(f"Unexpected HackerOne response structure (HTTP {status})", url=show_url)

            errors = data.get("errors", {})
            if not isinstance(errors, dict):
                return Result.error(f"Unexpected HackerOne errors structure (HTTP {status})", url=show_url)
            if "has already been taken" in str(errors.get("email", [])):
                return Result.taken(url=show_url)
            if "email" not in errors:
                return Result.available(url=show_url)
            return Result.error(f"Unexpected HackerOne validation response (HTTP {status})", url=show_url)
    except httpx.TimeoutException:
        return Result.error("HackerOne request timed out", url=show_url)
    except Exception as exc:
        return Result.error(f"HackerOne validation failed: {exc}", url=show_url)


async def _validate_letterboxd_compat(email: str) -> Result:
    """Diagnose Letterboxd CSRF delivery without exposing cookie values."""
    show_url = "https://letterboxd.com"
    home_url = "https://letterboxd.com/sign-in/"
    register_url = "https://letterboxd.com/user/standalone/register.do"
    user_agent = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36"
    headers = {
        "User-Agent": user_agent,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://letterboxd.com",
        "Referer": "https://letterboxd.com/register/standalone/",
    }

    try:
        init = await impersonate_request_async(
            home_url, headers={"User-Agent": user_agent}, allow_redirects=True
        )

        csrf_token = init.cookies.get("com.xk72.webparts.csrf")
        if not csrf_token:
            session = await asyncio.to_thread(get_warm_session)
            csrf_token = session.cookies.get("com.xk72.webparts.csrf")

        if not csrf_token:
            set_cookie_headers = []
            get_list = getattr(init.headers, "get_list", None)
            if callable(get_list):
                set_cookie_headers = get_list("set-cookie") or []

            csrf_cookie_headers = [
                header for header in set_cookie_headers
                if "com.xk72.webparts.csrf=" in str(header).lower()
            ]

            body_lower = init.text.lower()
            has_csrf_markup = (
                "com.xk72.webparts.csrf" in body_lower
                or 'name="__csrf"' in body_lower
                or "csrf" in body_lower
            )

            return Result.error(
                "Could not extract Letterboxd CSRF token "
                f"(HTTP {init.status_code}, final URL {init.url}, "
                f"Set-Cookie CSRF headers: {len(csrf_cookie_headers)}, "
                f"CSRF markers in body: {'yes' if has_csrf_markup else 'no'})",
                url=show_url,
            )

        response = await impersonate_request_async(
            register_url,
            "POST",
            data={
                "__csrf": csrf_token,
                "token": "",
                "emailAddress": email,
                "username": "th3_t3erminal_w0rri0r",
                "password": "n3v3r_F3lt_softn3ss",
                "termsAndAge": "true",
                "g-recaptcha-response": "",
                "h-captcha-response": "",
            },
            headers=headers,
        )
        try:
            data = response.json()
        except ValueError:
            return Result.error(
                f"Non-JSON response (HTTP {response.status_code}), likely a bot challenge",
                url=show_url,
            )

        messages = data.get("messages", [])
        error_fields = data.get("errorFields", [])
        if any("already associated with an account" in str(msg) for msg in messages):
            return Result.taken(url=show_url)
        if "emailAddress" in error_fields:
            return Result.taken(url=show_url)
        if "result" in data:
            return Result.available(url=show_url)
        return Result.error("Unexpected response structure", url=show_url)
    except Exception as exc:
        return Result.error(exc, url=show_url)


async def _validate_atlassian_compat(email: str) -> Result:
    """Diagnose Atlassian check-username responses without exposing response bodies."""
    url = "https://id.atlassian.com/rest/check-username"
    show_url = "https://id.atlassian.com"
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Referer": "https://id.atlassian.com/login",
        "Accept-Language": "en-US,en;q=0.9",
    }
    payload = json.dumps({"username": email})

    try:
        response = await impersonate_request_async(
            url,
            method="POST",
            data=payload,
            headers=headers,
            impersonate="chrome",
        )

        if response.status_code == 403:
            return Result.error("Atlassian validation request blocked by WAF (HTTP 403)", url=show_url)
        if response.status_code == 429:
            return Result.error("Atlassian rate limited the validation request (HTTP 429)", url=show_url)

        if response.status_code != 200:
            content_type = response.headers.get("content-type", "unknown")
            body = response.text
            body_lower = body.lower()
            json_valid = False
            json_type = "invalid"
            top_level_keys = []
            if body:
                try:
                    parsed = response.json()
                    json_valid = True
                    json_type = type(parsed).__name__
                    if isinstance(parsed, dict):
                        top_level_keys = sorted(str(key) for key in parsed.keys())[:12]
                except ValueError:
                    pass

            markers = [
                marker
                for marker in (
                    "invalid",
                    "bad request",
                    "required",
                    "missing",
                    "username",
                    "captcha",
                    "challenge",
                    "cloudflare",
                    "waf",
                    "forbidden",
                    "csrf",
                    "siteid",
                )
                if marker in body_lower
            ]

            if "captcha" in markers and "required" in markers:
                return Result.error(
                    "Atlassian CAPTCHA/required validation blocked the check "
                    f"(HTTP {response.status_code})",
                    url=show_url,
                )

            return Result.error(
                "Atlassian diagnostic "
                f"(HTTP {response.status_code}, content-type: {content_type}, "
                f"JSON: {'valid' if json_valid else 'invalid'}, type: {json_type}, "
                f"keys: {','.join(top_level_keys) or 'none'}, "
                f"markers: {','.join(markers) or 'none'}, "
                f"body length: {len(body)})",
                url=show_url,
            )

        try:
            data = response.json()
        except ValueError:
            return Result.error(
                "Atlassian returned invalid JSON (HTTP 200)",
                url=show_url,
            )

        if not isinstance(data, dict):
            return Result.error(
                f"Atlassian returned unexpected JSON type (HTTP 200: {type(data).__name__})",
                url=show_url,
            )

        action = data.get("action")
        if action == "signup":
            return Result.available(url=show_url)

        if action in ("no_action", "redirect"):
            extra = {}
            if action == "redirect":
                extra["auth_type"] = "SSO / SAML"
                if redirect_type := data.get("redirect_type"):
                    extra["sso_type"] = redirect_type
            else:
                extra["auth_type"] = "Password / Social"
            return Result.taken(extra=extra, url=show_url)

        return Result.error(
            "Atlassian unknown action response",
            url=show_url,
        )
    except httpx.TimeoutException:
        return Result.error("Atlassian validation request timed out", url=show_url)
    except Exception as exc:
        return Result.error(f"Atlassian validation failed: {exc}", url=show_url)


async def _validate_netflix_compat(email: str) -> Result:
    """Diagnose Netflix signup-check responses without exposing session data."""
    show_url = "https://netflix.com"
    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://www.netflix.com",
        "Referer": "https://www.netflix.com/",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            page = await client.get("https://www.netflix.com/", headers=headers)
            flwssn = client.cookies.get("flwssn")
            if not flwssn:
                body_lower = page.text.lower()
                markers = [
                    marker
                    for marker in (
                        "captcha", "challenge", "cloudflare", "verify you are human",
                        "access denied", "waf", "just a moment", "datadome",
                        "perimeterx", "incapsula",
                    )
                    if marker in body_lower
                ]
                return Result.error(
                    "Netflix session token unavailable "
                    f"(HTTP {page.status_code}, content-type: "
                    f"{page.headers.get('content-type', 'unknown')}, "
                    f"final URL: {page.url}, challenge markers: "
                    f"{','.join(markers) or 'none'}, body length: {len(page.text)})",
                    url=show_url,
                )

            graphql_url = "https://web.prod.cloud.netflix.com/graphql"
            graphql_headers = {
                **headers,
                "content-type": "application/json",
                "x-netflix.context.operation-name": "CLCSWebInitSignup",
                "x-netflix.request.clcs.bucket": "high",
            }
            payload = {
                "operationName": "CLCSWebInitSignup",
                "variables": {
                    "inputUserJourneyNode": "WELCOME",
                    "locale": "en-US",
                    "inputFields": [
                        {"name": "flwssn", "value": {"stringValue": flwssn}},
                        {"name": "email", "value": {"stringValue": email}},
                    ],
                },
                "extensions": {
                    "persistedQuery": {
                        "id": "f6e8ddc6-79fb-4ff2-8e55-893d707887a4",
                        "version": 102,
                    }
                },
            }
            response = await client.post(
                graphql_url, headers=graphql_headers, json=payload
            )
            if response.status_code != 200:
                return Result.error(
                    f"Netflix signup check returned HTTP {response.status_code} "
                    f"(content-type: {response.headers.get('content-type', 'unknown')}, "
                    f"body length: {len(response.text)})",
                    url=show_url,
                )

            body_lower = response.text.lower()
            if "welcome back!" in body_lower:
                return Result.taken(url=show_url)
            if "sign-up link" in body_lower or "create your account" in body_lower:
                return Result.available(url=show_url)
            if '"errors"' in body_lower:
                return Result.error(
                    f"Netflix GraphQL error response (HTTP {response.status_code}, "
                    f"body length: {len(response.text)})",
                    url=show_url,
                )
            return Result.error(
                f"Netflix returned an unexpected response (HTTP {response.status_code}, "
                f"body length: {len(response.text)})",
                url=show_url,
            )
    except httpx.TimeoutException:
        return Result.error("Netflix request timed out", url=show_url)
    except Exception as exc:
        return Result.error(f"Netflix validation failed: {exc}", url=show_url)


async def _validate_threadless_compat(email: str) -> Result:
    """Diagnose Threadless signup-form access without exposing tokens or response data."""
    show_url = "https://www.threadless.com"
    signup_url = "https://profile.threadless.com/artist/shops/"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "identity",
        "Accept-Language": "en-US,en;q=0.9",
    }

    try:
        page = await impersonate_request_async(
            signup_url, headers=headers, allow_redirects=True
        )

        body = page.text
        body_lower = body.lower()

        token_match = re.search(
            r"""name=['"]csrfmiddlewaretoken['"]\s+value=['"]([^'"]+)""",
            body,
            re.IGNORECASE,
        )

        challenge_markers = [
            marker
            for marker in (
                "cloudflare",
                "captcha",
                "challenge",
                "verify you are human",
                "access denied",
                "attention required",
                "just a moment",
                "perimeterx",
                "datadome",
                "incapsula",
                "waf",
            )
            if marker in body_lower
        ]

        if page.status_code in (401, 403, 429):
            return Result.error(
                "Threadless signup form blocked "
                f"(HTTP {page.status_code}, final URL: {page.url}, "
                f"CSRF token: {'found' if token_match else 'not found'}, "
                f"challenge markers: {','.join(challenge_markers) or 'none'}, "
                f"body length: {len(body)})",
                url=show_url,
            )

        if page.status_code != 200:
            return Result.error(
                "Threadless signup form returned "
                f"HTTP {page.status_code} (final URL: {page.url}, "
                f"CSRF token: {'found' if token_match else 'not found'}, "
                f"body length: {len(body)})",
                url=show_url,
            )

        if not token_match:
            return Result.error(
                "Threadless signup form loaded without required CSRF token "
                f"(HTTP 200, final URL: {page.url}, "
                f"challenge markers: {','.join(challenge_markers) or 'none'}, "
                f"body length: {len(body)})",
                url=show_url,
            )

        response = await impersonate_request_async(
            signup_url,
            "POST",
            headers={
                **headers,
                "x-requested-with": "XMLHttpRequest",
            },
            data={
                "validate": "true",
                "email": email,
                "csrfmiddlewaretoken": token_match.group(1),
            },
        )

        if response.status_code in (401, 403, 429):
            return Result.error(
                "Threadless validation request blocked "
                f"(HTTP {response.status_code})",
                url=show_url,
            )

        if response.status_code != 200:
            return Result.error(
                f"Unexpected Threadless response: HTTP {response.status_code}",
                url=show_url,
            )

        try:
            data = response.json()
        except ValueError:
            return Result.error(
                f"Invalid Threadless JSON response "
                f"(HTTP {response.status_code}, body length: {len(response.text)})",
                url=show_url,
            )

        if not isinstance(data, dict):
            return Result.error(
                f"Unexpected Threadless response structure "
                f"(HTTP {response.status_code}: {type(data).__name__})",
                url=show_url,
            )

        if data.get("is_valid") is False:
            return Result.taken(url=show_url)

        if data.get("is_valid") is True:
            return Result.available(url=show_url)

        return Result.error(
            "Unexpected Threadless response structure "
            f"(HTTP 200, keys: "
            f"{','.join(sorted(str(k) for k in data.keys())[:12]) or 'none'})",
            url=show_url,
        )

    except httpx.TimeoutException:
        return Result.error(
            "Threadless signup request timed out",
            url=show_url,
        )
    except Exception as exc:
        return Result.error(
            f"Threadless validation failed: {type(exc).__name__}",
            url=show_url,
        )


async def _validate_payhip_compat(email: str) -> Result:
    """Diagnose Payhip password-reset responses without exposing response bodies."""
    url = "https://payhip.com/auth/forgot_password_buyer_ajax"
    show_url = "https://payhip.com"
    headers = {
        "origin": show_url,
        "referer": f"{show_url}/auth/forgot_password",
        "x-requested-with": "XMLHttpRequest",
        "User-Agent": (
            "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36"
        ),
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
    }

    try:
        async with httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
        ) as client:
            response = await client.post(
                url,
                data={"login": email},
                headers=headers,
            )

        body = response.text
        body_lower = body.lower()
        content_type = response.headers.get("content-type", "unknown")

        challenge_markers = [
            marker
            for marker in (
                "cloudflare",
                "captcha",
                "challenge",
                "verify you are human",
                "access denied",
                "attention required",
                "just a moment",
                "perimeterx",
                "datadome",
                "incapsula",
                "waf",
                "bot detection",
            )
            if marker in body_lower
        ]

        if response.status_code in (401, 403, 429):
            return Result.error(
                "Payhip password-reset request blocked "
                f"(HTTP {response.status_code}, final URL: {response.url}, "
                f"content-type: {content_type}, "
                f"challenge markers: {','.join(challenge_markers) or 'none'}, "
                f"body length: {len(body)})",
                url=show_url,
            )

        if response.status_code != 200:
            return Result.error(
                "Payhip password-reset request returned "
                f"HTTP {response.status_code} "
                f"(final URL: {response.url}, content-type: {content_type}, "
                f"body length: {len(body)})",
                url=show_url,
            )

        try:
            data = response.json()
        except ValueError:
            return Result.error(
                "Payhip returned an unexpected non-JSON response "
                f"(HTTP 200, content-type: {content_type}, "
                f"body length: {len(body)}, "
                f"challenge markers: {','.join(challenge_markers) or 'none'})",
                url=show_url,
            )

        if not isinstance(data, dict):
            return Result.error(
                "Payhip returned an unexpected JSON structure "
                f"(HTTP 200, type: {type(data).__name__})",
                url=show_url,
            )

        if data.get("success") is True:
            return Result.taken(url=show_url)

        if (
            data.get("success") is False
            and data.get("error_message_public")
            == "Login or email doesn't exist"
        ):
            return Result.available(url=show_url)

        keys = sorted(str(key) for key in data.keys())[:12]
        return Result.error(
            "Unexpected Payhip password-reset response "
            f"(HTTP 200, keys: {','.join(keys) or 'none'})",
            url=show_url,
        )

    except httpx.ConnectTimeout:
        return Result.error(
            "Payhip connection timed out",
            url=show_url,
        )
    except httpx.ReadTimeout:
        return Result.error(
            "Payhip response timed out",
            url=show_url,
        )
    except httpx.TimeoutException:
        return Result.error(
            "Payhip request timed out",
            url=show_url,
        )
    except Exception as exc:
        return Result.error(
            f"Payhip validation failed: {type(exc).__name__}",
            url=show_url,
        )


async def _validate_emirates_compat(email: str) -> Result:
    """Diagnose Emirates validation transport failures without exposing response data."""
    show_url = "https://emirates.com"
    url = "https://www.emirates.com/service/ekl/validate-email"
    params = {"data": "null"}
    payload = {"emailAddress": email}
    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/145.0.0.0 Mobile Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Accept-Encoding": "identity",
        "Content-Type": "application/json",
        "Origin": "https://www.emirates.com",
        "Referer": "https://www.emirates.com/",
        "Accept-Language": "en-US,en;q=0.9",
    }

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            response = await client.post(
                url, params=params, json=payload, headers=headers
            )
            status = response.status_code
            if status == 403:
                return Result.error(
                    "Emirates validation blocked by WAF/IP protection (HTTP 403)",
                    url=show_url,
                )
            if status == 429:
                return Result.error(
                    "Emirates validation rate limited (HTTP 429)",
                    url=show_url,
                )
            if status != 200:
                return Result.error(
                    f"Emirates validation returned HTTP {status} "
                    f"(content-type: {response.headers.get('content-type', 'unknown')}, "
                    f"body length: {len(response.text)})",
                    url=show_url,
                )

            try:
                data = response.json()
            except ValueError:
                return Result.error(
                    "Emirates validation returned invalid JSON (HTTP 200)",
                    url=show_url,
                )

            if not isinstance(data, dict):
                return Result.error(
                    f"Emirates validation returned unexpected JSON type: "
                    f"{type(data).__name__}",
                    url=show_url,
                )

            body = data.get("body")
            errors = body.get("errors", []) if isinstance(body, dict) else []
            if isinstance(errors, list) and any(
                isinstance(err, dict)
                and err.get("code") == "program.member.EmailExistsForAnotherMember"
                for err in errors
            ):
                return Result.taken(url=show_url)

            if data.get("status") is True:
                return Result.available(url=show_url)

            return Result.available(url=show_url)
    except httpx.ConnectTimeout:
        return Result.error(
            "Emirates connection timed out (possible network or regional block)",
            url=show_url,
        )
    except httpx.ReadTimeout:
        return Result.error(
            "Emirates response timed out (server/network did not complete the request)",
            url=show_url,
        )
    except httpx.TimeoutException:
        return Result.error(
            "Emirates request timed out",
            url=show_url,
        )
    except Exception as exc:
        return Result.error(
            f"Emirates validation failed: {type(exc).__name__}",
            url=show_url,
        )


async def _validate_gumroad_compat(email: str) -> Result:
    """Diagnose Gumroad signup responses without exposing response bodies."""
    show_url = "https://gumroad.com"
    signup_url = "https://gumroad.com/signup"

    try:
        page = await impersonate_request_async(
            signup_url, allow_redirects=True
        )

        if page.status_code in (401, 403, 429):
            return Result.error(
                "Gumroad signup page blocked/rate-limited "
                f"(HTTP {page.status_code}, final URL: {page.url}, "
                f"body length: {len(page.text)})",
                url=show_url,
            )

        if page.status_code != 200:
            return Result.error(
                "Gumroad signup page returned "
                f"HTTP {page.status_code} (final URL: {page.url}, "
                f"body length: {len(page.text)})",
                url=show_url,
            )

        token = re.search(
            r'<meta name="csrf-token" content="([^"]+)"',
            page.text,
        )
        if not token or "Signup/New" not in page.text:
            return Result.error(
                "Could not read Gumroad signup form "
                f"(HTTP 200, final URL: {page.url}, "
                f"CSRF token: {'found' if token else 'not found'}, "
                f"signup marker: {'found' if 'Signup/New' in page.text else 'not found'}, "
                f"body length: {len(page.text)})",
                url=show_url,
            )

        response = await impersonate_request_async(
            signup_url,
            "POST",
            json={
                "user": {
                    "email": email,
                    "password": "Q7~",
                },
            },
            headers={
                "accept": "text/html, application/xhtml+xml",
                "origin": "https://gumroad.com",
                "referer": signup_url,
                "x-csrf-token": token.group(1),
                "x-inertia": "true",
                "x-requested-with": "XMLHttpRequest",
            },
            allow_redirects=True,
        )

        if response.status_code in (401, 403, 429):
            if response.status_code == 429:
                message = "Gumroad rate limited the signup validation"
            else:
                message = "Gumroad blocked the signup validation"
            return Result.error(
                f"{message} (HTTP {response.status_code}, "
                f"final URL: {response.url}, body length: {len(response.text)})",
                url=show_url,
            )

        if response.status_code != 200:
            return Result.error(
                f"Unexpected Gumroad signup response: {response.status_code} "
                f"(final URL: {response.url}, body length: {len(response.text)})",
                url=show_url,
            )

        try:
            data = response.json()
        except ValueError:
            return Result.error(
                "Gumroad returned an unexpected non-JSON signup response "
                f"(HTTP 200, body length: {len(response.text)})",
                url=show_url,
            )

        if not isinstance(data, dict):
            return Result.error(
                "Gumroad returned an unexpected signup response structure "
                f"(HTTP 200, type: {type(data).__name__})",
                url=show_url,
            )

        if data.get("component") != "Signup/New":
            return Result.error(
                "Unexpected Gumroad signup page "
                f"(HTTP 200, component: {data.get('component')!r})",
                url=show_url,
            )

        flash = data.get("props", {}).get("flash") or {}
        if not isinstance(flash, dict):
            return Result.error(
                "Unexpected Gumroad flash response structure (HTTP 200)",
                url=show_url,
            )

        message = flash.get("message")
        if message == "An account already exists with this email.":
            return Result.taken(url=show_url)
        if message == "Password is too short (minimum is 4 characters)":
            return Result.available(url=show_url)

        return Result.error(
            "Unexpected Gumroad signup result "
            f"(HTTP 200, flash keys: "
            f"{','.join(sorted(str(k) for k in flash.keys())[:12]) or 'none'})",
            url=show_url,
        )
    except httpx.TimeoutException:
        return Result.error(
            "Gumroad signup validation timed out",
            url=show_url,
        )
    except Exception as exc:
        return Result.error(
            f"Gumroad validation failed: {type(exc).__name__}",
            url=show_url,
        )


def _prepare_module(module):
    """Apply only known compatibility aliases before calling user-scanner."""
    module_name = getattr(module, "__name__", "").split(".")[-1].lower()
    if module_name == "besoccer" and not hasattr(module, "validate_besoccer"):
        validator = getattr(module, "validate_okcats", None)
        if validator is not None:
            setattr(module, "validate_besoccer", validator)
    elif module_name == "deviantart":
        setattr(module, "validate_deviantart", _validate_deviantart_compat)
    elif module_name == "dollarfix":
        setattr(module, "validate_dollarfix", _validate_dollarfix_compat)
    elif module_name == "stackoverflow":
        setattr(module, "validate_stackoverflow", _validate_stackoverflow_compat)
    elif module_name == "hackerone":
        setattr(module, "validate_hackerone", _validate_hackerone_compat)
    elif module_name == "letterboxd":
        setattr(module, "validate_letterboxd", _validate_letterboxd_compat)
    elif module_name == "atlassian":
        setattr(module, "validate_atlassian", _validate_atlassian_compat)
    elif module_name == "netflix":
        setattr(module, "validate_netflix", _validate_netflix_compat)
    elif module_name == "threadless":
        setattr(module, "validate_threadless", _validate_threadless_compat)
    elif module_name == "payhip":
        setattr(module, "validate_payhip", _validate_payhip_compat)
    elif module_name == "emirates":
        setattr(module, "validate_emirates", _validate_emirates_compat)
    elif module_name == "gumroad":
        setattr(module, "validate_gumroad", _validate_gumroad_compat)
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

        active_tasks = set()
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
                    active_tasks.add(task)
                    task_modules[task] = module
                    batch_index += 1

                try:
                    done, pending = await asyncio.wait(
                        pending,
                        return_when=asyncio.FIRST_COMPLETED,
                    )
                except asyncio.CancelledError:
                    for task in active_tasks:
                        if not task.done():
                            task.cancel()
                    if active_tasks:
                        await asyncio.gather(*active_tasks, return_exceptions=True)
                    raise

                for task in done:
                    active_tasks.discard(task)
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