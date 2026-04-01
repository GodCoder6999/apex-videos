import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ── Vite local dev proxy — mirrors api/proxy.js exactly ──────────────────────
const vercelProxyPlugin = () => ({
  name: 'vercel-proxy',
  configureServer(server) {
    server.middlewares.use('/api/proxy', async (req, res) => {
      try {
        const urlObj = new URL(req.url, `http://${req.headers.host}`)
        const target = urlObj.searchParams.get('url')

        if (!target) {
          res.statusCode = 400
          res.end('missing url param')
          return
        }

        const decoded = decodeURIComponent(target)
        const origin  = decoded.match(/^(https?:\/\/[^/]+)/)?.[1] || 'https://vidsrc.to'

        // ── Referer routing (same logic as api/proxy.js) ──────────────────
        let referer = origin + '/'
        if (decoded.includes('vidzee.wtf'))           referer = 'https://core.vidzee.wtf/'
        else if (decoded.includes('vidsrc.me'))       referer = 'https://vidsrc.me/'
        else if (decoded.includes('vidsrc.to'))       referer = 'https://vidsrc.to/'
        else if (decoded.includes('2embed.cc'))       referer = 'https://www.2embed.cc/'
        else if (decoded.includes('multiembed.mov'))  referer = 'https://multiembed.mov/'
        else if (decoded.includes('embed.su'))        referer = 'https://embed.su/'
        else if (decoded.includes('vidlink.pro'))     referer = 'https://vidlink.pro/'
        else if (decoded.includes('smashy.stream'))   referer = 'https://player.smashy.stream/'
        else if (decoded.includes('superembed'))      referer = 'https://www.superembed.stream/'
        else if (decoded.includes('nontongo'))        referer = 'https://www.nontongo.win/'
        else if (decoded.includes('filemoon') || decoded.includes('vidplay')) referer = 'https://vidsrc.me/'
        else if (decoded.includes('vixsrc.to'))       referer = 'https://vixsrc.to/'
        else if (decoded.includes('mp4hydra'))        referer = urlObj.searchParams.get('referer') || 'https://mp4hydra.org/'

        const fetchHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': referer,
          'Origin': origin,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
        }

        const fetchOptions = {
          method: req.method === 'POST' ? 'POST' : 'GET',
          headers: fetchHeaders,
          redirect: 'follow',
        }

        // Forward POST body
        if (req.method === 'POST') {
          const chunks = []
          for await (const chunk of req) chunks.push(chunk)
          fetchOptions.body = Buffer.concat(chunks)
          if (req.headers['content-type']) {
            fetchHeaders['Content-Type'] = req.headers['content-type']
          }
        }

        const up = await fetch(decoded, fetchOptions)
        const ct = up.headers.get('content-type') || ''

        const isM3u8 =
          ct.includes('mpegurl') || ct.includes('x-mpegURL') ||
          decoded.includes('.m3u8')

        const isJson = ct.includes('application/json')
        const isHtml = ct.includes('text/html')
        const isText = ct.includes('text/plain') || ct.includes('text/vtt')

        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', '*')
        res.setHeader('Cache-Control', 'no-store')

        if (isM3u8) {
          const text = await up.text()
          const base = decoded.substring(0, decoded.lastIndexOf('/') + 1)
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
          res.end(rewriteManifest(text, base))
        } else if (isJson || isHtml || isText) {
          const text = await up.text()
          res.setHeader('Content-Type', ct || 'text/plain')
          res.end(text)
        } else {
          const buf = Buffer.from(await up.arrayBuffer())
          res.setHeader('Content-Type', ct || 'application/octet-stream')
          res.end(buf)
        }
      } catch (e) {
        res.statusCode = 500
        res.end(String(e))
      }
    })
  }
})

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    vercelProxyPlugin(),
  ],
})

// ── Manifest rewriter (identical to api/proxy.js) ────────────────────────────
function rewriteManifest(text, base) {
  return text.split('\n').map(line => {
    const t = line.trim()
    if (!t) return line
    if (t.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        return `URI="/api/proxy?url=${encodeURIComponent(toAbs(uri, base))}"`
      })
    }
    if (t.startsWith('//') || t.startsWith('/*')) return line
    if (
      t.startsWith('http') || t.startsWith('/') ||
      t.includes('.ts') || t.includes('.m3u8') || t.includes('.aac') ||
      t.includes('.mp4') || t.includes('.m4s') || t.includes('.vtt') ||
      (/^[^\s#]+\/[^\s#]+$/.test(t))
    ) {
      return `/api/proxy?url=${encodeURIComponent(toAbs(t, base))}`
    }
    return line
  }).join('\n')
}

function toAbs(url, base) {
  if (!url) return url
  if (url.startsWith('http')) return url
  if (url.startsWith('//')) return 'https:' + url
  if (url.startsWith('/')) return (base.match(/^(https?:\/\/[^/]+)/)?.[1] || '') + url
  return base + url
}
