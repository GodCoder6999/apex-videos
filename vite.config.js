import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api/proxy': {
        target: 'http://localhost:5173',
        bypass(req, res) {
          const params = new URLSearchParams(req.url.replace(/^[^?]*\?/, ''))
          const target = params.get('url')
          if (!target) { res.statusCode = 400; res.end('missing url'); return }

          const decoded = decodeURIComponent(target)
          const origin  = decoded.match(/^(https?:\/\/[^/]+)/)?.[1] || 'https://vidsrc.me'

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
                
                // FIX: Safely rewrite the manifest
                const out = text
                  .split('\n')
                  .map(line => {
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
                  })
                  .join('\n')
                  
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

          return false  
        },
      },
    },
  },
})

function toAbs(url, base) {
  if (url.startsWith('http')) return url
  if (url.startsWith('//'))   return 'https:' + url
  if (url.startsWith('/'))    return (base.match(/^(https?:\/\/[^/]+)/)?.[1] || '') + url
  return base + url
}
