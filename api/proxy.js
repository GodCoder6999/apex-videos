// api/proxy.js
// ─────────────────────────────────────────────────────────────────────────────
// Universal CORS proxy for streaming media.
// Handles: .m3u8 manifests (rewrites ALL segment/key/subtitle URLs),
//          .ts segments, .vtt subtitles, JSON API responses,
//          HTML embed pages (for scraping), passthrough for direct MP4,
//          and POST requests.
//
// Provider coverage (NetMirror-style):
//   vidsrc.me / vidsrc.to / 2embed.cc / multiembed.mov / embed.su
//   vidlink.pro / smashystream / superembed.stream / nontongo.win
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

  // Block local/private addresses
  if (/^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(target)) {
    res.status(403).end('forbidden')
    return
  }

  const origin = target.match(/^(https?:\/\/[^/]+)/)?.[1] || 'https://vidsrc.to'

  // ── Referer routing — each provider needs its own referer to work ─────────
  let referer = origin + '/'

  if (target.includes('vidzee.wtf')) {
    referer = 'https://core.vidzee.wtf/'
  } else if (target.includes('vidsrc.me') || target.includes('vidsrc.to')) {
    referer = origin + '/'
  } else if (target.includes('2embed.cc')) {
    referer = 'https://www.2embed.cc/'
  } else if (target.includes('multiembed.mov')) {
    referer = 'https://multiembed.mov/'
  } else if (target.includes('embed.su')) {
    referer = 'https://embed.su/'
  } else if (target.includes('vidlink.pro')) {
    referer = 'https://vidlink.pro/'
  } else if (target.includes('smashy.stream')) {
    referer = 'https://player.smashy.stream/'
  } else if (target.includes('superembed.stream')) {
    referer = 'https://www.superembed.stream/'
  } else if (target.includes('nontongo.win')) {
    referer = 'https://www.nontongo.win/'
  } else if (target.includes('mp4hydra.org')) {
    const url = new URL(req.url, 'http://x')
    referer = url.searchParams.get('referer') || 'https://mp4hydra.org/'
  } else if (target.includes('vixsrc.to')) {
    referer = 'https://vixsrc.to/'
  } else if (target.includes('vidmoly') || target.includes('streamtape') || target.includes('doodstream')) {
    referer = origin + '/'
  } else if (target.includes('filemoon') || target.includes('vidplay')) {
    referer = 'https://vidsrc.me/'
  }

  // ── Build fetch headers ───────────────────────────────────────────────────
  const fetchHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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

  // Forward POST body
  if (req.method === 'POST' && req.body) {
    fetchOptions.body = req.body
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
    res.status(upstream.status).end(errBody || `upstream ${upstream.status}`)
    return
  }

  const ct = upstream.headers.get('content-type') || ''

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Cache-Control', 'no-store')

  // ── Content type detection ────────────────────────────────────────────────
  const isM3u8 =
    ct.includes('mpegurl') ||
    ct.includes('x-mpegURL') ||
    ct.includes('application/vnd.apple.mpegurl') ||
    target.includes('.m3u8') ||
    decodeURIComponent(target).includes('.m3u8')

  const isJson   = ct.includes('application/json') || ct.includes('text/json')
  const isHtml   = ct.includes('text/html')
  const isText   = ct.includes('text/plain')
  const isVtt    = target.includes('.vtt') || ct.includes('text/vtt')

  // ── M3U8 manifest — rewrite ALL internal URLs through this proxy ──────────
  // This is the CORE of how NetMirror works:
  // Every segment (.ts), encryption key (#EXT-X-KEY URI), sub-playlist (.m3u8),
  // and subtitle (.vtt) URL inside the manifest gets rewritten to go through
  // /api/proxy?url=<encoded>, so the browser never hits the CDN directly.
  // This defeats CORS restrictions and Referer-based access controls.
  if (isM3u8) {
    const text = await upstream.text()
    const base = target.substring(0, target.lastIndexOf('/') + 1)
    const rewritten = rewriteManifest(text, base)

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
    res.status(200).end(rewritten)
    return
  }

  // ── JSON / HTML / Text — pass through as-is (for scraping embed pages) ────
  if (isJson || isHtml || isText || isVtt) {
    const text = await upstream.text()
    res.setHeader('Content-Type', ct || 'text/plain')
    res.status(200).end(text)
    return
  }

  // ── Binary: .ts segments, encrypted chunks, MP4 fragments ────────────────
  const buf = Buffer.from(await upstream.arrayBuffer())
  res.setHeader('Content-Type', ct || 'application/octet-stream')
  const cl = upstream.headers.get('content-length')
  if (cl) res.setHeader('Content-Length', cl)
  res.status(200).end(buf)
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifest rewriter — the technical heart of the NetMirror approach
//
// Processes every line of an HLS manifest (.m3u8) and rewrites:
//  - Segment file references (.ts, .mp4, .m4s, .aac, .vtt)
//  - Sub-playlist references (alternate quality/audio/subtitle streams)
//  - #EXT-X-KEY URI (AES-128 decryption key URL)
//  - #EXT-X-MAP URI (initialization segment)
//  - #EXT-X-MEDIA URI (alternate audio/subtitle stream manifests)
//
// After rewriting, the browser's hls.js fetches every resource through
// our proxy, which adds the correct Referer/Origin headers each time.
// The CDN sees legitimate requests and serves the content.
// ─────────────────────────────────────────────────────────────────────────────
function rewriteManifest(text, base) {
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      if (!trimmed) return line

      if (trimmed.startsWith('#')) {
        // Rewrite all URI="..." attributes inside HLS tags
        return line.replace(/URI="([^"]+)"/g, (match, uri) => {
          const abs = toAbsolute(uri, base)
          return `URI="/api/proxy?url=${encodeURIComponent(abs)}"`
        })
      }

      // Skip comment-like non-URL content
      if (trimmed.startsWith('//') || trimmed.startsWith('/*')) return line

      // Rewrite raw URL lines (segment references, sub-playlists, etc.)
      if (
        trimmed.startsWith('http') ||
        trimmed.startsWith('/') ||
        trimmed.includes('.ts') ||
        trimmed.includes('.m3u8') ||
        trimmed.includes('.aac') ||
        trimmed.includes('.mp4') ||
        trimmed.includes('.m4s') ||
        trimmed.includes('.vtt') ||
        trimmed.includes('.cmfv') ||
        trimmed.includes('.cmfa') ||
        (/^[^\s#]+\/[^\s#]+$/.test(trimmed))
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
