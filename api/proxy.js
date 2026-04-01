export default async function handler(req, res) {
  const raw = req.query?.url || new URL(req.url, 'http://x').searchParams.get('url')
  if (!raw) {
    res.status(400).end('missing url param')
    return
  }

  const target = decodeURIComponent(raw)
  const origin = target.match(/^(https?:\/\/[^/]+)/)?.[1] || 'https://vidsrc.me'

  let upstream
  try {
    upstream = await fetch(target, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: origin + '/',
        Origin: origin,
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (e) {
    res.status(502).end(`fetch error: ${e.message}`)
    return
  }

  if (!upstream.ok) {
    res.status(upstream.status).end(`upstream ${upstream.status}`)
    return
  }

  const ct = upstream.headers.get('content-type') || ''

  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')
  res.setHeader('Cache-Control', 'no-store')

  const isM3u8 = ct.includes('mpegurl') || ct.includes('x-mpegURL') || target.includes('.m3u8')

  if (isM3u8) {
    const text = await upstream.text()
    const base = target.substring(0, target.lastIndexOf('/') + 1)
    
    // FIX: Safely rewrite the manifest without destroying HLS tags
    const rewritten = text
      .split('\n')
      .map(line => {
        const trimmed = line.trim()
        if (!trimmed) return line
        
        // If it's a tag line (starts with #)
        if (trimmed.startsWith('#')) {
          // Replace ONLY the value inside the URI="" quotes, keep the rest of the line intact
          return line.replace(/URI="([^"]+)"/g, (match, uri) => {
            const abs = toAbsolute(uri, base)
            return `URI="/api/proxy?url=${encodeURIComponent(abs)}"`
          })
        }
        
        // If it's a raw URL line (video segment)
        const abs = toAbsolute(trimmed, base)
        return `/api/proxy?url=${encodeURIComponent(abs)}`
      })
      .join('\n')

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
    res.status(200).end(rewritten)
  } else {
    // Note: Do not send MP4/MKV files through this proxy to avoid Vercel memory crashes.
    // The strict filtering in Player.jsx ensures only .m3u8 and .ts files arrive here.
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('Content-Type', ct || 'video/mp2t')
    res.status(200).end(buf)
  }
}

function toAbsolute(url, base) {
  if (url.startsWith('http')) return url
  if (url.startsWith('//')) return 'https:' + url
  if (url.startsWith('/')) {
    const origin = base.match(/^(https?:\/\/[^/]+)/)?.[1] || ''
    return origin + url
  }
  return base + url
}
