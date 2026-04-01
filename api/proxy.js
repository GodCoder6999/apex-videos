// api/proxy.js
// ─────────────────────────────────────────────────────────────────────────────
// Universal CORS proxy for streaming media.
// Handles: .m3u8 manifests (rewrites all segment URLs), .ts segments,
//          JSON API responses, passthrough for direct video files,
//          and POST requests (for MP4Hydra multipart/form-data).
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', '*')
    res.status(200).end()
    return
  }

  // Extract target URL
  const raw = req.query?.url || new URL(req.url, 'http://x').searchParams.get('url')
  if (!raw) {
    res.status(400).end('missing url param')
    return
  }

  const target = decodeURIComponent(raw)

  // Security: block obvious local/private addresses
  if (/^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(target)) {
    res.status(403).end('forbidden')
    return
  }

  const origin = target.match(/^(https?:\/\/[^/]+)/)?.[1] || 'https://player.vidzee.wtf'

  // ── Determine Referer based on target host ────────────────────────────────
  let referer = origin + '/'
  if (target.includes('vidzee.wtf')) {
    referer = 'https://core.vidzee.wtf/'
  } else if (target.includes('mp4hydra.org')) {
    // Extract the referer from query if provided
    const url = new URL(req.url, 'http://x')
    referer = url.searchParams.get('referer') || 'https://mp4hydra.org/'
  } else if (target.includes('vixsrc.to')) {
    referer = 'https://vixsrc.to/'
  }

  // ── Build fetch options ───────────────────────────────────────────────────
  const fetchHeaders = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': referer,
    'Origin': origin,
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
  }

  const fetchOptions = {
    method: req.method === 'POST' ? 'POST' : 'GET',
    headers: fetchHeaders,
    redirect: 'follow',
  }

  // Forward POST body (for MP4Hydra multipart requests)
  if (req.method === 'POST' && req.body) {
    fetchOptions.body = req.body
    // Forward Content-Type if it's multipart
    if (req.headers['content-type']) {
      fetchHeaders['Content-Type'] = req.headers['content-type']
    }
  }

  let upstream
  try {
    upstream = await fetch(target, fetchOptions)
  } catch (e) {
    res.status(502).end(`fetch error: ${e.message}`)
    return
  }

  if (!upstream.ok) {
    const errBody = await upstream.text().catch(() => '')
    res.status(upstream.status).end(
      errBody || `upstream ${upstream.status} ${upstream.statusText}`
    )
    return
  }

  const ct = upstream.headers.get('content-type') || ''

  // Set CORS headers on all responses
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Cache-Control', 'no-store')

  // Detect content type
  const isM3u8 =
    ct.includes('mpegurl') ||
    ct.includes('x-mpegURL') ||
    ct.includes('application/vnd.apple.mpegurl') ||
    target.includes('.m3u8') ||
    decodeURIComponent(target).includes('.m3u8')

  const isJson =
    ct.includes('application/json') ||
    ct.includes('text/json')

  const isText =
    ct.includes('text/plain') ||
    ct.includes('text/html')

  // ── M3U8 manifest: rewrite all segment/key URLs ───────────────────────────
  if (isM3u8) {
    const text = await upstream.text()
    const base = target.substring(0, target.lastIndexOf('/') + 1)
    const rewritten = rewriteManifest(text, base)

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
    res.status(200).end(rewritten)
    return
  }

  // ── JSON / HTML responses: pass through as-is ─────────────────────────────
  if (isJson || isText) {
    const text = await upstream.text()
    res.setHeader('Content-Type', ct || 'application/json')
    res.status(200).end(text)
    return
  }

  // ── Binary: TS segments, VTT subtitles, MP4 chunks ───────────────────────
  const buf = Buffer.from(await upstream.arrayBuffer())
  res.setHeader('Content-Type', ct || 'application/octet-stream')
  const cl = upstream.headers.get('content-length')
  if (cl) res.setHeader('Content-Length', cl)
  res.status(200).end(buf)
}

// ─────────────────────────────────────────────────────────────────────────────
// Rewrite M3U8 manifest: replace all segment/key URLs with proxy URLs
// ─────────────────────────────────────────────────────────────────────────────
function rewriteManifest(text, base) {
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      if (!trimmed) return line

      if (trimmed.startsWith('#')) {
        // Rewrite URI="" attributes inside HLS tags (keys, maps, media playlists)
        return line.replace(/URI="([^"]+)"/g, (match, uri) => {
          const abs = toAbsolute(uri, base)
          return `URI="/api/proxy?url=${encodeURIComponent(abs)}"`
        })
      }

      // Skip comment-like lines
      if (trimmed.startsWith('//') || trimmed.startsWith('/*')) return line

      // Raw URL lines (segment references, sub-playlists)
      if (
        trimmed.startsWith('http') ||
        trimmed.startsWith('/') ||
        trimmed.includes('.ts') ||
        trimmed.includes('.m3u8') ||
        trimmed.includes('.aac') ||
        trimmed.includes('.mp4') ||
        trimmed.includes('.vtt') ||
        (/^[^\s]+\/[^\s]+$/.test(trimmed) && !trimmed.startsWith('#'))
      ) {
        const abs = toAbsolute(trimmed, base)
        return `/api/proxy?url=${encodeURIComponent(abs)}`
      }

      return line
    })
    .join('\n')
}

function toAbsolute(url, base) {
  if (!url) return url
  if (url.startsWith('http')) return url
  if (url.startsWith('//')) return 'https:' + url
  if (url.startsWith('/')) {
    const originMatch = base.match(/^(https?:\/\/[^/]+)/)
    return (originMatch?.[1] || '') + url
  }
  return base + url
}
