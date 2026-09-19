import asyncio
import os
from collections import defaultdict
from contextlib import suppress

import httpx
import uvicorn
import websockets
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

PUBLIC_PORT = int(os.getenv("PORT", "10000"))
CHILD_PORT = 10001
CHILD_HOST = "127.0.0.1"
CHILD_BASE = f"http://{CHILD_HOST}:{CHILD_PORT}"
CHILD_WS = f"ws://{CHILD_HOST}:{CHILD_PORT}"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

child = None
child_lock = asyncio.Lock()


def _rss_bytes(pid: int) -> int:
    try:
        with open(f"/proc/{pid}/status", "r", encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) * 1024
    except (FileNotFoundError, PermissionError, ValueError):
        pass
    return 0


def _process_tree_rss(root_pid: int) -> int:
    children = defaultdict(list)
    try:
        pids = [int(name) for name in os.listdir("/proc") if name.isdigit()]
    except OSError:
        pids = []

    for pid in pids:
        try:
            with open(f"/proc/{pid}/status", "r", encoding="utf-8") as handle:
                ppid = None
                for line in handle:
                    if line.startswith("PPid:"):
                        ppid = int(line.split()[1])
                        break
                if ppid is not None:
                    children[ppid].append(pid)
        except (FileNotFoundError, PermissionError, ValueError):
            continue

    total = 0
    stack = [root_pid]
    seen = set()
    while stack:
        pid = stack.pop()
        if pid in seen:
            continue
        seen.add(pid)
        total += _rss_bytes(pid)
        stack.extend(children.get(pid, []))
    return total


async def _start_child():
    global child
    async with child_lock:
        if child is not None and child.returncode is None:
            return
        child = await asyncio.create_subprocess_exec(
            "mailaccess",
            "serve",
            "--host",
            CHILD_HOST,
            "--port",
            str(CHILD_PORT),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
            env=os.environ.copy(),
        )


async def _watch_child():
    global child
    while True:
        if child is None or child.returncode is not None:
            await _start_child()
        await asyncio.sleep(1)


@app.on_event("startup")
async def startup():
    await _start_child()
    asyncio.create_task(_watch_child())


@app.get("/memory")
async def memory():
    root_pid = os.getpid()
    rss = _process_tree_rss(root_pid)
    return {
        "ram_mb": round(rss / (1024 * 1024), 1),
        "unit": "MB",
        "service": "glaz-boga-mailaccess",
    }


@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy_http(path: str, request: Request):
    await _start_child()
    target = f"{CHILD_BASE}/{path}"
    if request.url.query:
        target += f"?{request.url.query}"

    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("content-length", None)

    body = await request.body()

    async with httpx.AsyncClient(timeout=60.0) as client:
        upstream = await client.request(
            request.method,
            target,
            headers=headers,
            content=body,
        )

    response_headers = {}
    for key, value in upstream.headers.items():
        if key.lower() not in {
            "content-length",
            "transfer-encoding",
            "connection",
            "content-encoding",
        }:
            response_headers[key] = value

    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=response_headers,
    )


@app.websocket("/ws/{path:path}")
async def proxy_websocket(path: str, websocket: WebSocket):
    await websocket.accept()
    await _start_child()

    headers = {}
    api_key = websocket.headers.get("x-api-key")
    if api_key:
        headers["X-API-Key"] = api_key

    upstream = None
    try:
        upstream = await websockets.connect(
            f"{CHILD_WS}/ws/{path}",
            additional_headers=headers,
            open_timeout=15,
            close_timeout=5,
            max_size=1024 * 1024,
        )

        async def client_to_upstream():
            while True:
                message = await websocket.receive()
                if message.get("type") == "websocket.disconnect":
                    break
                if message.get("text") is not None:
                    await upstream.send(message["text"])
                elif message.get("bytes") is not None:
                    await upstream.send(message["bytes"])

        async def upstream_to_client():
            while True:
                message = await upstream.recv()
                if isinstance(message, bytes):
                    await websocket.send_bytes(message)
                else:
                    await websocket.send_text(message)

        tasks = [
            asyncio.create_task(client_to_upstream()),
            asyncio.create_task(upstream_to_client()),
        ]
        done, pending = await asyncio.wait(
            tasks,
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
        for task in done:
            with suppress(Exception):
                task.result()

    except Exception:
        with suppress(Exception):
            await websocket.close(code=1011)
    finally:
        if upstream is not None:
            with suppress(Exception):
                await upstream.close()
