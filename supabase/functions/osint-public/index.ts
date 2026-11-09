const C = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json; charset=utf-8"
};

const J = (x: any, s = 200) =>
  new Response(JSON.stringify(x), { status: s, headers: C });

const ok = (v: string) =>
  v.length > 0 && v.length <= 120 && !/[\u0000-\u001f]/.test(v);

const clean = (s: string) =>
  s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const dec = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const b64 = (s: string) => {
  try {
    const p = s.replace(/-/g, "+").replace(/_/g, "/");
    return atob(p + "=".repeat((4 - (p.length % 4)) % 4));
  } catch {
    return "";
  }
};

const out = (v: string, b: string) => {
  try {
    v = dec(v);
    const x = new URL(v, b);
    const u = x.searchParams.get("u");

    if (u) {
      const d = b64(u.startsWith("a1") ? u.slice(2) : u);
      if (/^https?:\/\//i.test(d)) return new URL(d).href;
    }

    const q = x.searchParams.get("q");
    if (x.pathname === "/url" && q)
      return new URL(decodeURIComponent(q)).href;

    const uddg = x.searchParams.get("uddg");
    if (uddg)
      return new URL(decodeURIComponent(uddg)).href;

    return /^https?:$/.test(x.protocol) ? x.href : "";
  } catch {
    return "";
  }
};

const phrase = (q: string) => {
  const m = q.match(/\"([^\"]+)\"/);
  return (m
    ? m[1]
    : q.replace(/\b(site:|filetype:|intitle:|inurl:)[^\s]+/gi, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
};

const relevant = (q: string, t: string, s: string, u: string) => {
  const p = phrase(q).toLocaleLowerCase("ru-RU");
  if (!p) return true;

  const hay = (t + " " + s + " " + u).toLocaleLowerCase("ru-RU");
  const words = p.split(/\s+/).filter(x => x.length > 1);

  return words.every(w => hay.includes(w)) || hay.includes(p);
};

const parsers: any = {
  Google: (h: string, q: string) => {
    const a: any[] = [];
    const r =
      /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/a>/gi;
    let m;

    while ((m = r.exec(h)) && a.length < 30) {
      const u = out(m[1], "https://www.google.com/");
      const t = clean(m[2]);

      if (
        u &&
        t &&
        !/google\./i.test(new URL(u).hostname) &&
        relevant(q, t, "", u)
      ) {
        a.push({ title: t, url: u, source: "Google" });
      }
    }

    return a;
  },

  Bing: (h: string, q: string) => {
    const a: any[] = [];
    const r =
      /<li[^>]*class=["'][^"']*b_algo[^"']*[\s\S]*?<h2[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>[\s\S]*?<\/li>/gi;
    let m;

    while ((m = r.exec(h)) && a.length < 30) {
      const u = out(m[1], "https://www.bing.com/");
      const t = clean(m[2]);
      const s = clean(m[3]);

      if (u && t && relevant(q, t, s, u)) {
        a.push({ title: t, url: u, source: "Bing" });
      }
    }

    return a;
  },

  Yandex: (h: string, q: string) => {
    const a: any[] = [];
    const r =
      /(?:<li|<div)[^>]*class=["'][^"']*serp-item[^"']*[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*(?:organic__url|Link)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<div[^>]*class=["'][^"']*organic__content-wrapper[^"']*["'][^>]*>([\s\S]*?)<\/div>)?[\s\S]*?(?:<\/li>|<\/div>)/gi;
    let m;

    while ((m = r.exec(h)) && a.length < 30) {
      const u = out(m[1], "https://yandex.ru/");
      const t = clean(m[2]);
      const s = clean(m[3] || "");

      if (u && t && relevant(q, t, s, u)) {
        a.push({ title: t, url: u, source: "Yandex" });
      }
    }

    return a;
  },

  DuckDuckGo: (h: string, q: string) => {
    const a: any[] = [];
    const r =
      /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;

    while ((m = r.exec(h)) && a.length < 30) {
      const u = out(m[1], "https://html.duckduckgo.com/");
      const t = clean(m[2]);

      if (u && t && relevant(q, t, "", u)) {
        a.push({ title: t, url: u, source: "DuckDuckGo" });
      }
    }

    return a;
  },

  Mojeek: (h: string, q: string) => {
    const a: any[] = [];
    const r =
      /<a[^>]+href=["']([^"']+)["'][^>]*class=["'][^"']*(?:ob|title)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;

    while ((m = r.exec(h)) && a.length < 30) {
      const u = out(m[1], "https://www.mojeek.com/");
      const t = clean(m[2]);

      if (u && t && relevant(q, t, "", u)) {
        a.push({ title: t, url: u, source: "Mojeek" });
      }
    }

    return a;
  },

  Jina: (h: string, q: string) => {
    const a: any[] = [];
    const blocks =
      h.match(/Title:\s*(.+?)\nURL Source:\s*(https?:\/\/\S+)/g) || [];

    for (const b of blocks.slice(0, 10)) {
      const m = b.match(
        /Title:\s*(.+?)\nURL Source:\s*(https?:\/\/\S+)/
      );

      if (!m) continue;

      const t = clean(m[1]);
      const u = out(m[2], "https://s.jina.ai/");

      if (u && t && relevant(q, t, "", u)) {
        a.push({
          title: t,
          url: u,
          source: "Jina Search"
        });
      }
    }

    if (!a.length) {
      const r = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
      let m;

      while ((m = r.exec(h)) && a.length < 10) {
        const t = clean(m[1]);
        const u = out(m[2], "https://s.jina.ai/");

        if (u && t && relevant(q, t, "", u)) {
          a.push({
            title: t,
            url: u,
            source: "Jina Search"
          });
        }
      }
    }

    return a;
  }
};

async function E(url: string, source: string, q: string) {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:157.0) Gecko/20100101 Firefox/157.0",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.7",
        "Accept":
          "text/html,application/xhtml+xml"
      }
    });

    if (!r.ok)
      return { source, results: [], ok: false };

    const h = await r.text();
    const results = parsers[source](h, q);

    return {
      source,
      results,
      ok: results.length > 0
    };
  } catch {
    return {
      source,
      results: [],
      ok: false
    };
  }
}

async function EJ(q: string) {
  try {
    const r = await fetch(
      "https://s.jina.ai/" + encodeURIComponent(q),
      {
        headers: {
          "Accept": "text/plain",
          "User-Agent": "Mozilla/5.0"
        }
      }
    );

    if (!r.ok)
      return {
        source: "Jina Search",
        results: [],
        ok: false
      };

    const h = await r.text();
    const results = parsers.Jina(h, q);

    return {
      source: "Jina Search",
      results,
      ok: results.length > 0
    };
  } catch {
    return {
      source: "Jina Search",
      results: [],
      ok: false
    };
  }
}


/* ===== АВТОРИЗАЦИЯ ===== */

async function checkAuth(req: Request) {
  const auth = req.headers.get("Authorization") || "";

  if (!auth.startsWith("Bearer ")) {
    return false;
  }

  const token = auth.slice(7).trim();

  if (!token) {
    return false;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");

  const supabaseKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    console.error("Supabase environment variables are missing");
    return false;
  }

  try {
    const r = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "apikey": supabaseKey
        }
      }
    );

    if (!r.ok) {
      return false;
    }

    const user = await r.json();

    if (!user?.id) {
      return false;
    }

    // Authenticate and require an approved account for OSINT access.
    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=approved`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "apikey": supabaseKey,
          "Accept": "application/json"
        }
      }
    );

    if (!profileResponse.ok) {
      console.error("Could not verify approved OSINT profile");
      return false;
    }

    const profiles = await profileResponse.json();
    const profile = Array.isArray(profiles) ? profiles[0] : null;

    if (!profile || profile.approved !== true) return false;

    const permissionResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/has_app_access`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "apikey": supabaseKey,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ p_app_id: "glaz-boga" })
      }
    );

    if (!permissionResponse.ok) return false;
    return (await permissionResponse.json()) === true;
  } catch {
    return false;
  }
}


/* ===== ОСНОВНАЯ ФУНКЦИЯ ===== */

Deno.serve(async req => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: C
    });
  }

  const authenticated = await checkAuth(req);

  if (!authenticated) {
    return J(
      {
        error: "Unauthorized"
      },
      401
    );
  }

  const u = new URL(req.url);
  const t = u.searchParams.get("type") || "";
  const v = (u.searchParams.get("q") || "").trim();

  if (!ok(v))
    return J(
      {
        error: "Invalid query"
      },
      400
    );

  if (t !== "search")
    return J(
      {
        error: "Unsupported type"
      },
      400
    );

  const q = encodeURIComponent(v);

  const jobs = await Promise.all([
    E(
      `https://www.google.com/search?hl=ru&num=20&q=${q}`,
      "Google",
      v
    ),
    E(
      `https://www.bing.com/search?cc=ru&setlang=ru&count=20&q=${q}`,
      "Bing",
      v
    ),
    E(
      `https://yandex.ru/search/?lr=213&text=${q}`,
      "Yandex",
      v
    ),
    E(
      `https://html.duckduckgo.com/html/?kl=ru-ru&q=${q}`,
      "DuckDuckGo",
      v
    ),
    E(
      `https://www.mojeek.com/search?q=${q}`,
      "Mojeek",
      v
    ),
    EJ(v)
  ]);

  const seen = new Set<string>();

  const all = jobs
    .flatMap(x => x.results)
    .filter(
      x =>
        x.url &&
        !seen.has(x.url) &&
        seen.add(x.url)
    )
    .slice(0, 100);

  return J({
    type: "search",
    query: v,
    count: all.length,
    engines: jobs.map(x => ({
      engine: x.source,
      working: x.ok,
      count: x.results.length
    })),
    results: all
  });
});