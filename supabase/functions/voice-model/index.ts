const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Expose-Headers': 'content-length, content-type, content-range, accept-ranges',
}

const SOURCES: Record<string, string[]> = {
  ru: [
    'https://plan98.org/public/cdn/cache/alphacephei.com/models/vosk-model-small-ru-0.22.tar.gz',
    'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-ru-0.22.tar.gz',
  ],
  en: [
    'https://plan98.org/public/cdn/cache/alphacephei.com/models/vosk-model-small-en-us-0.15.tar.gz',
    'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz',
  ],
  cn: [
    'https://plan98.org/public/cdn/cache/alphacephei.com/models/vosk-model-small-cn-0.22.tar.gz',
    'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-cn-0.22.tar.gz',
  ],
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })

  const code = new URL(req.url).searchParams.get('lang') || 'ru'
  const sources = SOURCES[code]
  if (!sources) return new Response('Unknown language', { status: 400, headers: corsHeaders })

  let lastError = 'No source available'
  for (const source of sources) {
    try {
      const upstream = await fetch(source, { redirect: 'follow' })
      if (!upstream.ok || !upstream.body) {
        lastError = `Upstream HTTP ${upstream.status}`
        continue
      }
      const headers = new Headers(corsHeaders)
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/gzip')
      const length = upstream.headers.get('Content-Length')
      if (length) headers.set('Content-Length', length)
      const range = upstream.headers.get('Content-Range')
      if (range) headers.set('Content-Range', range)
      const accepts = upstream.headers.get('Accept-Ranges')
      if (accepts) headers.set('Accept-Ranges', accepts)
      headers.set('Cache-Control', 'no-store')
      return new Response(upstream.body, { status: 200, headers })
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  console.error('voice-model upstream failure:', code, lastError)
  return new Response(JSON.stringify({ error: 'Не удалось получить языковой пакет', detail: lastError }), {
    status: 502,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
