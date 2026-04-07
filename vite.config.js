import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// This plugin perfectly mimics your Vercel /api/proxy function locally
const vercelProxyPlugin = () => ({
  name: 'vercel-proxy',
  configureServer(server) {
    server.middlewares.use('/api/proxy', async (req, res, next) => {
      try {
        // Construct full URL to easily extract query parameters
        const urlObj = new URL(req.url, `http://${req.headers.host}`)
        const target = urlObj.searchParams.get('url')

        if (!target) {
          res.statusCode = 400
          res.end('missing url param')
          return
        }

        const decoded = target // already decoded by searchParams.get
        const origin = decoded.match(/^(https?:\/\/[^/]+)/)?.[1] || 'https://vidsrc.me'

        // Fetch the target stream
        const up = await fetch(decoded, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
            Referer: origin + '/',
            Origin: origin,
            Accept: '*/*',
          },
        })

        const ct = up.headers.get('content-type') || ''
        const isM = ct.includes('mpegurl') || decoded.includes('.m3u8')

        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Content-Type', isM ? 'application/vnd.apple.mpegurl' : (ct || 'video/mp2t'))

        if (isM) {
          const text = await up.text()
          const base = decoded.substring(0, decoded.lastIndexOf('/') + 1)
          const out = rewriteManifest(text, base)
          res.end(out)
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
    vercelProxyPlugin(), // Hook in the local proxy emulator
  ],
})

// ---------------------------------------------------------------------------
// Helper functions for rewriting the M3U8 manifest
// ---------------------------------------------------------------------------
function rewriteManifest(text, base) {
  return text.split('\n').map(line => {
    const t = line.trim()
    if (!t) return line
    if (t.startsWith('#')) {
      // Safely replace URI="" attributes without destroying the tag
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
