import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// ─────────────────────────────────────────────────────────────────────────────
// Vite CORS proxy — every request to /api/proxy?url=<encoded> is forwarded
// server-side, so the browser never touches the foreign CDN directly.
// This completely eliminates every CORS / Referer block.
// ─────────────────────────────────────────────────────────────────────────────
function hlsProxyPlugin() {
  return {
    name: 'hls-proxy',
    configureServer(server) {
      server.middlewares.use('/api/proxy', async (req, res) => {
        try {
          const params = new URLSearchParams(req.url.replace(/^\?/, '').replace(/^.*\?/, ''))
          const target = params.get('url')
          if (!target) { res.statusCode = 400; res.end('missing url'); return }

          const decoded = decodeURIComponent(target)
          const referer = decoded.match(/^(https?:\/\/[^/]+)/)?.[1] || 'https://vidsrc.me'

          const upstream = await fetch(decoded, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
              'Referer': referer,
              'Origin': referer,
              'Accept': '*/*',
            },
          })

          if (!upstream.ok) {
            res.statusCode = upstream.status
            res.end(`upstream error ${upstream.status}`)
            return
          }

          const ct = upstream.headers.get('content-type') || ''
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Access-Control-Allow-Headers', '*')
          res.setHeader('Content-Type', ct)

          // If this is an m3u8 manifest we must rewrite every URL inside it
          // so that segment requests also go through our proxy.
          if (ct.includes('mpegurl') || decoded.includes('.m3u8')) {
            const text = await upstream.text()
            const base = decoded.substring(0, decoded.lastIndexOf('/') + 1)
            const rewritten = rewriteManifest(text, base)
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
            res.end(rewritten)
          } else {
            // Binary segment — stream straight through
            const buf = await upstream.arrayBuffer()
            res.end(Buffer.from(buf))
          }
        } catch (e) {
          res.statusCode = 500
          res.end(String(e))
        }
      })
    },
  }
}

// Rewrite every URL line in the manifest to go through the proxy
function rewriteManifest(text, base) {
  return text.split('\n').map(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      // Also rewrite URI="…" attributes inside tag lines
      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
        const abs = toAbsolute(uri, base)
        return `URI="/api/proxy?url=${encodeURIComponent(abs)}"`
      })
    }
    const abs = toAbsolute(trimmed, base)
    return `/api/proxy?url=${encodeURIComponent(abs)}`
  }).join('\n')
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

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    hlsProxyPlugin(),
  ],
})
