import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ── Vite local dev proxy — mirrors the Vercel api/proxy function exactly ──────
const vercelProxyPlugin = () => ({
  name: 'vercel-proxy',
  configureServer(server) {
    server.middlewares.use('/api/proxy', async (req, res, next) => {
      try {
        const urlObj = new URL(req.url, `http://${req.headers.host}`)
        const target = urlObj.searchParams.get('url')

        if (!target) {
          res.statusCode = 400
          res.end('missing url param')
          return
        }

        const decoded = decodeURIComponent(target)
        const origin  = decoded.match(/^(https?:\/\/[^/]+)/)?.[1] || 'https://player.vidzee.wtf'

        // Choose Referer per host (VidZee needs core.vidzee.wtf)
        let referer = origin + '/'
        if (decoded.includes('vidzee.wtf'))   referer = 'https://core.vidzee.wtf/'
        else if (decoded.includes('vixsrc.to')) referer = 'https://vixsrc.to/'
        else if (decoded.includes('mp4hydra')) referer = urlObj.searchParams.get('referer') || 'https://mp4hydra.org/'

        const fetchHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36',
          'Referer': referer,
          'Origin': origin,
          'Accept': '*/*',
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

        const ct  = up.headers.get('content-type') || ''
        const isM = ct.includes('mpegurl') || decoded.includes('.m3u8')

        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', '*')
        res.setHeader('Content-Type', isM ? 'application/vnd.apple.mpegurl' : (ct || 'video/mp2t'))

        if (isM) {
          const text = await up.text()
          const base = decoded.substring(0, decoded.lastIndexOf('/') + 1)
          res.end(rewriteManifest(text, base))
        } else {
          const buf = Buffer.from(await up.arrayBuffer())
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

// ── Manifest rewriter (identical to api/proxy.js) ─────────────────────────────
function rewriteManifest(text, base) {
  return text.split('\n').map(line => {
    const t = line.trim()
    if (!t) return line
    if (t.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (match, uri) => {
        const abs = toAbs(uri, base)
        return `URI="/api/proxy?url=${encodeURIComponent(abs)}"`
      })
    }
    const abs = toAbs(t, base)
    return `/api/proxy?url=${encodeURIComponent(abs)}`
  }).join('\n')
}

function toAbs(url, base) {
  if (url.startsWith('http')) return url
  if (url.startsWith('//'))   return 'https:' + url
  if (url.startsWith('/'))    return (base.match(/^(https?:\/\/[^/]+)/)?.[1] || '') + url
  return base + url
}
