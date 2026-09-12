"""Apply the module-9 email search without changing other OSINT searches."""

try:
    import deep_sources
    from email_extended_search import email_extended_public_search

    _original_public_search = deep_sources.public_search

    async def _public_search(query: str, kind: str, max_results: int = 20) -> list[dict]:
        if kind == "email" and max_results == 30:
            return await email_extended_public_search(query, max_results=max_results)
        return await _original_public_search(query, kind, max_results=max_results)

    deep_sources.public_search = _public_search
except Exception:
    pass
