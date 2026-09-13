import asyncio
import httpx
import trio
from holehe.core import get_functions, import_submodules

async def _run(email: str, progress=None):
    modules = import_submodules("holehe.modules")
    websites = get_functions(modules)
    total = len(websites)
    checked = 0
    results = []
    # Жёстко ограничиваем до 3 одновременных соединений
    limiter = trio.CapacityLimiter(3)
    async with httpx.AsyncClient(timeout=2.5) as client:
        async def launch(module):
            nonlocal checked
            name = getattr(module, "__name__", "").split(".")[-1] or "unknown"
            async with limiter:
                try:
                    out = []
                    await module(email, client, out)
                    for item in out:
                        item = dict(item)
                        item.setdefault("name", name)
                        results.append(item)
                except Exception:
                    pass
                finally:
                    checked += 1
                    if progress:
                        progress(checked, total, name, [r for r in results if r.get("exists")])
        async with trio.open_nursery() as nursery:
            for website in websites:
                nursery.start_soon(launch, website)
    results = [r for r in results if r.get("exists")]
    results.sort(key=lambda item: str(item.get("name", "")))
    return results, total

async def holehe_search(email: str, progress=None):
    return await asyncio.to_thread(trio.run, _run, email, progress)
