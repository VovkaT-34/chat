"""Russian-first public indexed search for extended Glaz Boga modules."""

import asyncio
import html
import re
from urllib.parse import parse_qs, quote_plus, unquote, urlparse

from ddgs import DDGS
import httpx

TIMEOUT = 8
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; GlazBogaOSINT/1.0)"}

# Only public/indexed web pages. No private accounts, leaked databases or restricted sources.
SOURCES_RU = {
    "email": [
        ("Яндекс", "yandex.ru"), ("Mail.ru", "mail.ru"), ("VK", "vk.com"), ("VK RU", "vk.ru"),
        ("Одноклассники", "ok.ru"), ("Дзен", "dzen.ru"), ("Пикабу", "pikabu.ru"),
        ("Habr", "habr.com"), ("VC.ru", "vc.ru"), ("ЯПлакалъ", "yaplakal.com"),
        ("Fishki", "fishki.net"), ("LiveJournal", "livejournal.com"), ("4PDA", "4pda.to"),
        ("iXBT", "ixbt.com"), ("ForumHouse", "forumhouse.ru"), ("CyberForum", "cyberforum.ru"),
        ("Отзовик", "otzovik.com"), ("IRecommend", "irecommend.ru"), ("Drive2", "drive2.ru"),
        ("Proza.ru", "proza.ru"), ("Стихи.ру", "stihi.ru"), ("Author.Today", "author.today"),
        ("LiveLib", "livelib.ru"), ("Q&A Mail.ru", "otvet.mail.ru"), ("Q&A Habr", "qna.habr.com"),
        ("Avito", "avito.ru"), ("Юла", "youla.ru"), ("Из рук в руки", "irr.ru"),
        ("FarPost", "farpost.ru"), ("Народные страницы", "stranicy.ru"),
        ("Tiu.ru", "tiu.ru"), ("PulsCen", "pulscen.ru"), ("PromPortal", "promportal.su"),
        ("Яндекс Недвижимость", "realty.yandex.ru"), ("ЦИАН", "cian.ru"), ("Домклик", "domclick.ru"),
        ("Домофонд", "domofond.ru"), ("2ГИС", "2gis.ru"), ("Zoon", "zoon.ru"),
        ("Yell", "yell.ru"), ("Flamp", "flamp.ru"), ("Справочник", "spr.ru"),
        ("ProDoctorov", "prodoctorov.ru"), ("DocDoc", "docdoc.ru"),
        ("HeadHunter", "hh.ru"), ("SuperJob", "superjob.ru"), ("Rabota.ru", "rabota.ru"),
        ("Зарплата.ру", "zarplata.ru"), ("Работа России", "trudvsem.ru"),
        ("ГородРабот", "gorodrabot.ru"), ("Geekjob", "geekjob.ru"), ("Профи", "profi.ru"),
        ("YouDo", "youdo.com"), ("Ремонтник", "remontnik.ru"), ("Помогатель", "pomogatel.ru"),
        ("Auto.ru", "auto.ru"), ("Drom", "drom.ru"), ("AM.ru", "am.ru"),
        ("Ozon", "ozon.ru"), ("Wildberries", "wildberries.ru"), ("Мегамаркет", "megamarket.ru"),
        ("Яндекс Маркет", "market.yandex.ru"), ("Яндекс Карты", "yandex.ru"),
        ("Telegram Public", "t.me"), ("Rutube", "rutube.ru"), ("YouTube RU", "youtube.com"),
        ("Российские форумы", "forumavia.ru"), ("RuTracker Forum", "rutracker.org"),
    ],
    "phone": [
        ("Яндекс", "yandex.ru"), ("Mail.ru", "mail.ru"), ("VK", "vk.com"), ("VK RU", "vk.ru"),
        ("Одноклассники", "ok.ru"), ("Дзен", "dzen.ru"), ("Пикабу", "pikabu.ru"),
        ("Habr", "habr.com"), ("VC.ru", "vc.ru"), ("ЯПлакалъ", "yaplakal.com"),
        ("Fishki", "fishki.net"), ("LiveJournal", "livejournal.com"), ("4PDA", "4pda.to"),
        ("iXBT", "ixbt.com"), ("ForumHouse", "forumhouse.ru"), ("CyberForum", "cyberforum.ru"),
        ("Отзовик", "otzovik.com"), ("IRecommend", "irecommend.ru"), ("Drive2", "drive2.ru"),
        ("Proza.ru", "proza.ru"), ("Стихи.ру", "stihi.ru"), ("Q&A Mail.ru", "otvet.mail.ru"),
        ("Avito", "avito.ru"), ("Юла", "youla.ru"), ("Из рук в руки", "irr.ru"),
        ("FarPost", "farpost.ru"), ("Народные страницы", "stranicy.ru"),
        ("Tiu.ru", "tiu.ru"), ("PulsCen", "pulscen.ru"), ("PromPortal", "promportal.su"),
        ("Яндекс Недвижимость", "realty.yandex.ru"), ("ЦИАН", "cian.ru"), ("Домклик", "domclick.ru"),
        ("Домофонд", "domofond.ru"), ("2ГИС", "2gis.ru"), ("Zoon", "zoon.ru"),
        ("Yell", "yell.ru"), ("Flamp", "flamp.ru"), ("Справочник", "spr.ru"),
        ("ProDoctorov", "prodoctorov.ru"), ("DocDoc", "docdoc.ru"),
        ("HeadHunter", "hh.ru"), ("SuperJob", "superjob.ru"), ("Rabota.ru", "rabota.ru"),
        ("Зарплата.ру", "zarplata.ru"), ("Работа России", "trudvsem.ru"),
        ("ГородРабот", "gorodrabot.ru"), ("Geekjob", "geekjob.ru"), ("Профи", "profi.ru"),
        ("YouDo", "youdo.com"), ("Ремонтник", "remontnik.ru"), ("Помогатель", "pomogatel.ru"),
        ("Auto.ru", "auto.ru"), ("Drom", "drom.ru"), ("AM.ru", "am.ru"),
        ("Ozon", "ozon.ru"), ("Wildberries", "wildberries.ru"), ("Мегамаркет", "megamarket.ru"),
        ("Яндекс Маркет", "market.yandex.ru"), ("Яндекс Карты", "yandex.ru"),
        ("Telegram Public", "t.me"), ("Rutube", "rutube.ru"), ("YouTube RU", "youtube.com"),
    ],
}

SOURCES_FOREIGN = {
    "email": [
        ("GitHub", "github.com"), ("GitLab", "gitlab.com"), ("Reddit", "reddit.com"),
        ("LinkedIn", "linkedin.com"), ("Stack Overflow", "stackoverflow.com"),
        ("Stack Exchange", "stackexchange.com"), ("SourceForge", "sourceforge.net"),
        ("Medium", "medium.com"), ("Dev.to", "dev.to"), ("WordPress", "wordpress.com"),
        ("Blogger", "blogspot.com"), ("Pastebin", "pastebin.com"), ("Gist", "gist.github.com"),
        ("GitBook", "gitbook.io"), ("Bitbucket", "bitbucket.org"), ("CodePen", "codepen.io"),
        ("Discourse", "discourse.org"), ("Quora", "quora.com"), ("Facebook", "facebook.com"),
        ("X", "x.com"),
    ],
    "phone": [
        ("GitHub", "github.com"), ("GitLab", "gitlab.com"), ("Reddit", "reddit.com"),
        ("LinkedIn", "linkedin.com"), ("Stack Overflow", "stackoverflow.com"),
        ("Stack Exchange", "stackexchange.com"), ("SourceForge", "sourceforge.net"),
        ("Medium", "medium.com"), ("Dev.to", "dev.to"), ("WordPress", "wordpress.com"),
        ("Blogger", "blogspot.com"), ("Pastebin", "pastebin.com"), ("Gist", "gist.github.com"),
        ("GitBook", "gitbook.io"), ("Bitbucket", "bitbucket.org"), ("CodePen", "codepen.io"),
        ("Quora", "quora.com"), ("Facebook", "facebook.com"), ("X", "x.com"),
    ],
}

# Independent public search engines. They run before the catalogue.
SEARCH_ENGINES = [
    ("Google", "https://www.google.com/search?q={query}"),
    ("Яндекс", "https://yandex.ru/search/?text={query}"),
    ("Bing", "https://www.bing.com/search?q={query}"),
    ("DuckDuckGo", "https://html.duckduckgo.com/html/?q={query}"),
    ("Mail.ru", "https://go.mail.ru/search?q={query}"),
]


def _phone_variants(value: str) -> list[str]:
    digits = re.sub(r"\D", "", value)
    variants = [value.strip()]
    if digits:
        variants += [digits, "+" + digits]
        if digits.startswith("7") and len(digits) == 11:
            variants += [
                "8" + digits[1:],
                "+7 " + digits[1:4] + " " + digits[4:7] + "-" + digits[7:9] + "-" + digits[9:],
            ]
    return list(dict.fromkeys(x for x in variants if x))


def _query_for(kind: str, value: str, domain: str | None = None) -> str:
    if kind == "email":
        base = f'"{value.lower()}"'
    else:
        variants = _phone_variants(value)
        base = " OR ".join(f'"{variant}"' for variant in variants[:4])
    return f'{base} site:{domain}' if domain else base


def _engine_queries(kind: str, value: str) -> list[str]:
    if kind == "email":
        return [f'"{value.strip().lower()}"']
    return [f'"{v}"' for v in _phone_variants(value)[:4]]


def _strip_html(value: str) -> str:
    value = re.sub(r"<script[^>]*>.*?</script>|<style[^>]*>.*?</style>", " ", value, flags=re.I | re.S)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def _result_urls(page: str) -> list[tuple[str, str]]:
    found = []
    seen = set()
    pattern = re.compile(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', re.I | re.S)
    search_hosts = {"google.com", "yandex.ru", "bing.com", "duckduckgo.com", "mail.ru"}
    for href, anchor in pattern.findall(page):
        href = html.unescape(href).strip()
        if href.startswith("//"):
            href = "https:" + href
        if href.startswith("/"):
            continue
        parsed = urlparse(href)
        if parsed.scheme not in ("http", "https"):
            continue
        host = (parsed.hostname or "").lower()
        if any(host == h or host.endswith("." + h) for h in search_hosts):
            qs = parse_qs(parsed.query)
            href = (qs.get("q") or qs.get("url") or qs.get("u") or [href])[0]
            href = unquote(href)
            parsed = urlparse(href)
            host = (parsed.hostname or "").lower()
        if parsed.scheme not in ("http", "https") or not host:
            continue
        if any(host == h or host.endswith("." + h) for h in search_hosts):
            continue
        if href.rstrip("/") in seen:
            continue
        seen.add(href.rstrip("/"))
        found.append((href, _strip_html(anchor)))
    return found


async def _direct_engine_search(engine_name: str, template: str, query: str) -> list[dict]:
    url = template.format(query=quote_plus(query))
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, headers=HEADERS) as client:
            response = await client.get(url)
        if not response.is_success:
            return []
        return [
            {"engine": engine_name, "url": href, "title": title}
            for href, title in _result_urls(response.text)[:10]
        ]
    except Exception:
        return []


async def _multi_engine_search(kind: str, value: str) -> list[dict]:
    tasks = [
        _direct_engine_search(engine_name, template, query)
        for engine_name, template in SEARCH_ENGINES
        for query in _engine_queries(kind, value)
    ]
    groups = await asyncio.gather(*tasks, return_exceptions=True)
    results, seen = [], set()
    for group in groups:
        if isinstance(group, Exception):
            continue
        for item in group:
            key = item["url"].rstrip("/")
            if key in seen:
                continue
            seen.add(key)
            results.append(item)
    return results


def _relevant(kind: str, query: str, title: str, body: str, href: str) -> bool:
    haystack = " ".join((title, body, href)).lower()
    if kind == "email":
        return query.strip().lower() in haystack
    wanted = re.sub(r"\D", "", query)
    found = re.sub(r"\D", "", haystack)
    return bool(wanted and wanted in found)


async def _verify_page(kind: str, query: str, url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5, follow_redirects=True, headers=HEADERS) as client:
            response = await client.get(url)
        if not response.is_success:
            return False
        text = response.text[:2_000_000].lower()
        if kind == "email":
            return query.strip().lower() in text
        wanted = re.sub(r"\D", "", query)
        compact = re.sub(r"\D", "", text)
        if wanted and wanted in compact:
            return True
        return any(
            (digits := re.sub(r"\D", "", variant)) and digits in compact
            for variant in _phone_variants(query)
        )
    except Exception:
        return False


async def _search_items(search_query: str) -> list[dict]:
    return await asyncio.to_thread(
        lambda q=search_query: DDGS(timeout=TIMEOUT).text(
            q, region="ru-ru", safesearch="off", max_results=5, backend="auto"
        )
    )


async def extended_public_search(query: str, kind: str, max_results: int = 30, progress=None) -> list[dict]:
    """Search public pages: direct engines first, then Russian catalogue, then foreign catalogue."""
    ru_sources = SOURCES_RU.get(kind, [])
    foreign_sources = SOURCES_FOREIGN.get(kind, [])
    sources = ru_sources + foreign_sources
    if not sources:
        return []

    results, seen = [], set()
    engine_queries = _engine_queries(kind, query)
    engine_count = len(SEARCH_ENGINES) * len(engine_queries)
    total = engine_count + len(sources)
    if progress:
        progress(0, total, "Поисковики: подготовка", results)

    # 1) Google, Yandex, Bing, DuckDuckGo and Mail.ru, independently.
    engine_items = await _multi_engine_search(kind, query)
    for item in engine_items:
        href = item["url"]
        if not href.startswith(("http://", "https://")):
            continue
        if not await _verify_page(kind, query, href):
            continue
        hostname = (urlparse(href).hostname or "").lower()
        key = href.rstrip("/")
        if key in seen:
            continue
        seen.add(key)
        results.append({
            "source": f"{item['engine']}: точное публичное упоминание",
            "name": item["title"] or href,
            "url": href,
            "snippet": f"Найдено поисковиком {item['engine']}; страница доступна для проверки.",
            "domain": hostname,
            "site": hostname,
            "engine": item["engine"],
            "kind": f"{kind}_public",
        })
        if len(results) >= max_results:
            return results

    if progress:
        progress(engine_count, total, "Поисковики: Google → Яндекс → Bing → DuckDuckGo → Mail.ru завершены", results)

    # 2) Russian catalogue.
    for index, (name, domain) in enumerate(ru_sources, engine_count + 1):
        current = f"Россия: {name} ({domain})"
        try:
            items = await _search_items(_query_for(kind, query, domain))
            for item in items:
                href = str(item.get("href") or "").strip()
                title = str(item.get("title") or "").strip()
                body = str(item.get("body") or "").strip()
                hostname = (urlparse(href).hostname or "").lower()
                if not href.startswith(("http://", "https://")) or not (hostname == domain or hostname.endswith("." + domain)):
                    continue
                if not _relevant(kind, query, title, body, href):
                    continue
                key = href.rstrip("/")
                if key in seen or not await _verify_page(kind, query, href):
                    continue
                seen.add(key)
                results.append({"source": f"{name}: точное публичное упоминание", "name": title or href, "url": href, "snippet": body, "domain": domain, "site": name, "kind": f"{kind}_public"})
                if len(results) >= max_results:
                    break
        except Exception:
            pass
        if progress:
            progress(index, total, current, results)
        if len(results) >= max_results:
            break

    if len(results) >= max_results:
        return results

    # 3) Foreign catalogue.
    start = engine_count + len(ru_sources) + 1
    for index, (name, domain) in enumerate(foreign_sources, start):
        current = f"Иностранные: {name} ({domain})"
        try:
            items = await _search_items(_query_for(kind, query, domain))
            for item in items:
                href = str(item.get("href") or "").strip()
                title = str(item.get("title") or "").strip()
                body = str(item.get("body") or "").strip()
                hostname = (urlparse(href).hostname or "").lower()
                if not href.startswith(("http://", "https://")) or not (hostname == domain or hostname.endswith("." + domain)):
                    continue
                if not _relevant(kind, query, title, body, href):
                    continue
                key = href.rstrip("/")
                if key in seen or not await _verify_page(kind, query, href):
                    continue
                seen.add(key)
                results.append({"source": f"{name}: точное публичное упоминание", "name": title or href, "url": href, "snippet": body, "domain": domain, "site": name, "kind": f"{kind}_public"})
                if len(results) >= max_results:
                    break
        except Exception:
            pass
        if progress:
            progress(index, total, current, results)
        if len(results) >= max_results:
            break

    return results
