import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // Only used during local dev — Vercel uses api/proxy.js instead
  server: {
    proxy: {
      '/api/proxy': {
        target: 'http://localhost:5173',
        bypass(req, res) {
          // In dev, inline the same proxy logic so you don't need the
          // Vercel CLI running locally. Just run `vite dev` as normal.
          const params = new URLSearchParams(req.url.replace(/^[^?]*\?/, ''))
          const target = params.get('url')
          if (!target) { res.statusCode = 400; res.end('missing url'); return }

          const decoded = decodeURIComponent(target)
          const origin  = decoded.match(/^(https?:\/\/[^/]+)/)?.[1] || 'https://vidsrc.me'

          // Async handler — attach to res so Vite knows we're handling it
          ;(async () => {
            try {
              const up = await fetch(decoded, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124',
                  Referer:  origin + '/',
                  Origin:   origin,
                  Accept:   '*/*',
                },
              })
              const ct  = up.headers.get('content-type') || ''
              const isM = ct.includes('mpegurl') || decoded.includes('.m3u8')

              res.setHeader('Access-Control-Allow-Origin', '*')
              res.setHeader('Content-Type', isM ? 'application/vnd.apple.mpegurl' : (ct || 'video/mp2t'))

              if (isM) {
                const text = await up.text()
                const base = decoded.substring(0, decoded.lastIndexOf('/') + 1)
                const out  = rewriteManifest(text, base)
                res.end(out)
              } else {
                const buf = await up.arrayBuffer()
                res.end(Buffer.from(buf))
              }
            } catch (e) {
              res.statusCode = 500
              res.end(String(e))
            }
          })()

          return false  // tells Vite we handled it
        },
      },
    },
  },
})

function rewriteManifest(text, base) {
  return text.split('\n').map(line => {
    const t = line.trim()
    if (!t) return line
    if (t.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_, uri) => {
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
