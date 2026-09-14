"""Process-wide FastAPI access gate for the OSINT backend.

Python imports sitecustomize automatically when this directory is on sys.path.
The existing main.py stays unchanged: the gate is attached when FastAPI creates
its application, before the existing CORS middleware is added.
"""

import os

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


_original_fastapi_init = FastAPI.__init__


async def _check_approved_user(request: Request):
    auth_header = request.headers.get("authorization", "")
    if not auth_header.lower().startswith("bearer "):
        return False, 401, "Требуется авторизация"

    token = auth_header[7:].strip()
    if not token:
        return False, 401, "Требуется авторизация"

    supabase_url = os.getenv("SUPABASE_URL", "https://sxkukrqjtgkxmzuzondm.supabase.co").rstrip("/")
    supabase_key = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
    if not supabase_key:
        return False, 500, "Авторизация backend не настроена"

    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {token}",
    }

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            user_response = await client.get(
                f"{supabase_url}/auth/v1/user",
                headers=headers,
            )

            if user_response.status_code != 200:
                return False, 401, "Недействительная сессия"

            user = user_response.json()
            user_id = user.get("id")
            if not user_id:
                return False, 401, "Недействительная сессия"

            profile_response = await client.get(
                f"{supabase_url}/rest/v1/profiles",
                headers={**headers, "Accept": "application/json"},
                params={
                    "select": "approved",
                    "id": f"eq.{user_id}",
                    "approved": "eq.true",
                    "limit": "1",
                },
            )

            if profile_response.status_code != 200:
                return False, 403, "Доступ запрещён"

            profiles = profile_response.json()
            if not profiles or profiles[0].get("approved") is not True:
                return False, 403, "Пользователь не одобрен"

            return True, 200, ""

    except Exception:
        return False, 503, "Сервис авторизации временно недоступен"


def _patched_fastapi_init(self, *args, **kwargs):
    _original_fastapi_init(self, *args, **kwargs)

    @self.middleware("http")
    async def _approved_user_gate(request: Request, call_next):
        # Render health checks must remain public. CORS preflight must also be
        # allowed through so the existing browser requests keep working.
        if request.method == "OPTIONS" or request.url.path == "/health":
            return await call_next(request)

        allowed, status, message = await _check_approved_user(request)
        if not allowed:
            return JSONResponse({"error": message}, status_code=status)

        return await call_next(request)


FastAPI.__init__ = _patched_fastapi_init
