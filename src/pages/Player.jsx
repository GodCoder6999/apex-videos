// src/pages/Player.jsx
// ─────────────────────────────────────────────────────────────────────────────
// NetMirror-style streaming player
//
// HOW NETMIRROR ACTUALLY WORKS (from deep research):
//  1. Each OTT platform has a "provider adapter" that scrapes/reverse-engineers
//     their private embed API to get an HLS manifest URL (.m3u8)
//  2. The manifest is fetched server-side (CORS proxy) and ALL segment/key URLs
//     inside it are rewritten to go through the proxy too
//  3. The rewritten manifest is served to hls.js which parses EXT-X-MEDIA tags
//     for multiple audio language tracks (Hindi, English, Tamil, etc.)
//  4. Switching audio = hls.audioTrack = id  (zero rebuffer, pure HLS spec)
//  5. Multiple provider adapters are tried in sequence; first working stream wins
//
// PROVIDERS (what NetMirror/similar apps actually use):
//  - vidsrc.me   → /embed/movie/{tmdb} or /embed/tv/{tmdb}/{s}/{e}
//  - vidsrc.to   → /embed/movie?tmdb={id} or /embed/tv?tmdb={id}&season=&episode=
//  - 2embed.cc   → /embed/{tmdb} or /embedtv/{tmdb}&s=&e=
//  - multiembed  → /embed/?tmdb_id=&video_id=&tmdb=1&s=&e=
//  - embedsu     → /embed/movie/{tmdb} or /embed/tv/{tmdb}/{s}/{e}
//  - vidlink     → /media?tmdb={id} or /media?tmdb={id}&season=&episode=
//  - smashystream→ /e/{tmdb}
//
// Each provider's embed page contains a master .m3u8 URL (or redirects to one).
// We scrape their page HTML/JS or hit their internal JSON API to extract it.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, AlertCircle, ChevronLeft, Settings } from 'lucide-react'

const BASE_URL = 'https://api.themoviedb.org/3'
const API_KEY  = import.meta.env.VITE_TMDB_API_KEY

// ── Load hls.js from CDN ──────────────────────────────────────────────────────
let _hlsProm = null
function loadHls() {
  if (_hlsProm) return _hlsProm
  _hlsProm = new Promise(resolve => {
    if (window.Hls) return resolve(window.Hls)
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js'
    s.onload  = () => resolve(window.Hls)
    s.onerror = () => resolve(null)
    document.head.appendChild(s)
  })
  return _hlsProm
}

const fmt = s => {
  if (!s || isNaN(s) || s === Infinity) return '0:00'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${m}:${String(sec).padStart(2,'0')}`
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

// ─────────────────────────────────────────────────────────────────────────────
// PROXY HELPER
// Wraps any URL through our /api/proxy to bypass CORS
// ─────────────────────────────────────────────────────────────────────────────
const P = url => `/api/proxy?url=${encodeURIComponent(url)}`

// ─────────────────────────────────────────────────────────────────────────────
// M3U8 EXTRACTOR UTILITIES
// Multiple regex patterns used by different providers to embed stream URLs
// ─────────────────────────────────────────────────────────────────────────────
function extractM3U8(html) {
  if (!html) return null

  const patterns = [
    // Direct .m3u8 URL in JSON / JS variable
    /['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i,
    // file: or source: assignments
    /(?:file|source|src|url|stream)\s*[:=]\s*['"]([^'"]+\.m3u8[^'"]*)['"]/i,
    // HLS manifest in script
    /hls[^'"]*['"]([^'"]+\.m3u8[^'"]*)['"]/i,
    // window.masterPlaylist pattern (Vixsrc/vidzee style)
    /masterPlaylist[^'"]*['"]([^'"]+\.m3u8[^'"]*)['"]/i,
    // jwplayer file
    /jwplayer[^}]*file[^'"]*['"]([^'"]+\.m3u8[^'"]*)['"]/i,
    // video.js src
    /videojs[^}]*src[^'"]*['"]([^'"]+\.m3u8[^'"]*)['"]/i,
    // Plyr / html5 video src
    /<source[^>]+src=["']([^'"]+\.m3u8[^'"]*)/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

// Extract window.masterPlaylist object with token+expires (vidzee/vixsrc pattern)
function extractMasterPlaylist(html) {
  if (!html) return null
  const m = html.match(/window\.masterPlaylist\s*=\s*({[\s\S]*?})\s*[;\n]/)
  if (!m) return null
  try {
    // Parse loose JS object (not valid JSON, so manual extract)
    const urlM     = m[1].match(/url\s*:\s*['"]([^'"]+)['"]/)
    const tokenM   = m[1].match(/token\s*:\s*['"]([^'"]+)['"]/)
    const expiresM = m[1].match(/expires\s*:\s*['"]?([^'",}\s]+)/)
    if (!urlM) return null
    let url = urlM[1]
    if (tokenM && expiresM) {
      const sep = url.includes('?') ? '&' : '?'
      url += `${sep}token=${tokenM[1]}&expires=${expiresM[1].trim()}`
    }
    return url
  } catch (_) { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER ADAPTERS
// Each returns: { url, label, provider, headers } or null
// These scrape the exact same embed pages NetMirror's adapters target
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VidSrc.me — one of the primary sources NetMirror reverse-engineered
 * Embeds are at /embed/movie/{tmdb} and /embed/tv/{tmdb}/{s}/{e}
 * Their internal Vidplay/Filemoon iframes contain direct m3u8 streams
 */
async function scrapeVidSrcMe(tmdbId, mediaType, season, episode) {
  const embedUrl = mediaType === 'tv'
    ? `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`
    : `https://vidsrc.me/embed/movie?tmdb=${tmdbId}`

  try {
    const res = await fetch(P(embedUrl), { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const html = await res.text()

    // VidSrc.me uses Vidplay sub-embed — look for it
    const vidplayMatch = html.match(/src=["'](https?:\/\/[^'"]*(?:vidplay|filemoon|vidsrc)[^'"]+)["']/i)
    if (vidplayMatch) {
      // Fetch the sub-embed page
      const sub = await fetch(P(vidplayMatch[1]), { signal: AbortSignal.timeout(8000) })
      if (sub.ok) {
        const subHtml = await sub.text()
        const m3u8 = extractM3U8(subHtml)
        if (m3u8) return { url: m3u8, label: 'VidSrc.me · Vidplay', provider: 'VidSrc.me', headers: { Referer: 'https://vidsrc.me/' } }
      }
    }

    // Try direct extraction from main page
    const m3u8 = extractM3U8(html)
    if (m3u8) return { url: m3u8, label: 'VidSrc.me · Direct', provider: 'VidSrc.me', headers: { Referer: 'https://vidsrc.me/' } }
    return null
  } catch (_) { return null }
}

/**
 * VidSrc.to — another major provider in NetMirror's chain
 * Has a public-ish API: /ajax/embed/episode/{id}/sources returns source list
 * Each source has a link endpoint that returns the actual stream URL
 */
async function scrapeVidSrcTo(tmdbId, mediaType, season, episode) {
  const embedUrl = mediaType === 'tv'
    ? `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`
    : `https://vidsrc.to/embed/movie/${tmdbId}`

  try {
    // Get the embed page to find the episode/movie ID used in their internal API
    const pageRes = await fetch(P(embedUrl), { signal: AbortSignal.timeout(10000) })
    if (!pageRes.ok) return null
    const html = await pageRes.text()

    // Their pages have data-id attribute with internal ID
    const idMatch = html.match(/data-id=["']([^"']+)["']/)
    if (!idMatch) {
      const m3u8 = extractM3U8(html)
      if (m3u8) return { url: m3u8, label: 'VidSrc.to · Direct', provider: 'VidSrc.to', headers: { Referer: 'https://vidsrc.to/' } }
      return null
    }

    const mediaId = idMatch[1]

    // Fetch the sources list from their AJAX endpoint
    const sourcesRes = await fetch(
      P(`https://vidsrc.to/ajax/embed/episode/${mediaId}/sources`),
      { signal: AbortSignal.timeout(8000) }
    )
    if (!sourcesRes.ok) return null
    const sourcesData = await sourcesRes.json()
    if (!sourcesData?.status === 200 || !sourcesData?.result) return null

    const results = []
    for (const source of (sourcesData.result || [])) {
      try {
        const streamRes = await fetch(
          P(`https://vidsrc.to/ajax/embed/source/${source.id}`),
          { signal: AbortSignal.timeout(8000) }
        )
        if (!streamRes.ok) continue
        const streamData = await streamRes.json()
        const streamUrl = streamData?.result?.url
        if (!streamUrl) continue

        // Decode if base64-ish (vidsrc.to sometimes obfuscates)
        const finalUrl = streamUrl.startsWith('http') ? streamUrl : atob(streamUrl)
        if (finalUrl.includes('m3u8') || finalUrl.includes('mp4')) {
          results.push({
            url: finalUrl,
            label: `VidSrc.to · ${source.title || 'Server'}`,
            provider: 'VidSrc.to',
            headers: { Referer: 'https://vidsrc.to/' }
          })
        }
      } catch (_) {}
    }
    return results.length > 0 ? results : null
  } catch (_) { return null }
}

/**
 * 2embed.cc — widely used by mirror sites including NetMirror clones
 * Clean embed pages with Vidmoly/Streamtape/Doodstream sources
 */
async function scrape2Embed(tmdbId, mediaType, season, episode) {
  const embedUrl = mediaType === 'tv'
    ? `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}`
    : `https://www.2embed.cc/embed/${tmdbId}`

  try {
    const res = await fetch(P(embedUrl), { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const html = await res.text()

    // 2embed wraps a sub-iframe — find it
    const iframeMatch = html.match(/iframe[^>]+src=["'](https?:\/\/[^'"]+)["']/i)
    if (iframeMatch) {
      const subRes = await fetch(P(iframeMatch[1]), { signal: AbortSignal.timeout(8000) })
      if (subRes.ok) {
        const subHtml = await subRes.text()
        const m3u8 = extractM3U8(subHtml) || extractMasterPlaylist(subHtml)
        if (m3u8) return { url: m3u8, label: '2Embed · Server 1', provider: '2Embed', headers: { Referer: 'https://www.2embed.cc/' } }
      }
    }

    const m3u8 = extractM3U8(html)
    if (m3u8) return { url: m3u8, label: '2Embed · Direct', provider: '2Embed', headers: { Referer: 'https://www.2embed.cc/' } }
    return null
  } catch (_) { return null }
}

/**
 * MultiEmbed — primary NetMirror-adjacent provider with multi-audio HLS
 * Known for having Hindi/English/Tamil audio tracks in single manifest
 */
async function scrapeMultiEmbed(tmdbId, mediaType, season, episode) {
  const embedUrl = mediaType === 'tv'
    ? `https://multiembed.mov/embed/?tmdb_id=${tmdbId}&video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`
    : `https://multiembed.mov/embed/?tmdb_id=${tmdbId}&video_id=${tmdbId}&tmdb=1`

  try {
    const res = await fetch(P(embedUrl), { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const html = await res.text()

    // MultiEmbed often has direct m3u8 in JS
    const m3u8 = extractM3U8(html) || extractMasterPlaylist(html)
    if (m3u8) return { url: m3u8, label: 'MultiEmbed · HLS', provider: 'MultiEmbed', headers: { Referer: 'https://multiembed.mov/' } }

    // Check for sub-iframes
    const iframes = [...html.matchAll(/iframe[^>]+src=["'](https?:\/\/[^'"]+)["']/gi)]
    for (const [, src] of iframes) {
      try {
        const subRes = await fetch(P(src), { signal: AbortSignal.timeout(6000) })
        if (!subRes.ok) continue
        const subHtml = await subRes.text()
        const sm3u8 = extractM3U8(subHtml)
        if (sm3u8) return { url: sm3u8, label: 'MultiEmbed · Sub', provider: 'MultiEmbed', headers: { Referer: src } }
      } catch (_) {}
    }

    return null
  } catch (_) { return null }
}

/**
 * EmbedSu (embed.su) — popular NetMirror-style multi-source provider
 * Has a well-structured AJAX API for sources
 */
async function scrapeEmbedSu(tmdbId, mediaType, season, episode) {
  const embedUrl = mediaType === 'tv'
    ? `https://embed.su/embed/tv/${tmdbId}/${season}/${episode}`
    : `https://embed.su/embed/movie/${tmdbId}`

  try {
    const res = await fetch(P(embedUrl), { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const html = await res.text()

    const m3u8 = extractM3U8(html)
    if (m3u8) return { url: m3u8, label: 'EmbedSu · HLS', provider: 'EmbedSu', headers: { Referer: 'https://embed.su/' } }

    // EmbedSu has JSON config in page
    const configMatch = html.match(/var\s+config\s*=\s*({[\s\S]*?})\s*;/)
    if (configMatch) {
      try {
        const cfg = JSON.parse(configMatch[1])
        const streamUrl = cfg?.file || cfg?.url || cfg?.src
        if (streamUrl) return { url: streamUrl, label: 'EmbedSu · Config', provider: 'EmbedSu', headers: { Referer: 'https://embed.su/' } }
      } catch (_) {}
    }

    return null
  } catch (_) { return null }
}

/**
 * VidLink.pro — another provider in the NetMirror ecosystem
 * Simple TMDB-based embed with decent multi-quality HLS
 */
async function scrapeVidLink(tmdbId, mediaType, season, episode) {
  const embedUrl = mediaType === 'tv'
    ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}`
    : `https://vidlink.pro/movie/${tmdbId}`

  try {
    const res = await fetch(P(embedUrl), { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const html = await res.text()

    // VidLink stores stream config in window.__CONFIG__ or similar
    const configPatterns = [
      /window\.__(?:CONFIG|STREAM|PLAYER)__\s*=\s*({[\s\S]*?})\s*;/,
      /playerConfig\s*=\s*({[\s\S]*?})\s*;/,
      /initPlayer\s*\(\s*({[\s\S]*?})\s*\)/,
    ]

    for (const pat of configPatterns) {
      const m = html.match(pat)
      if (m) {
        try {
          const cfg = JSON.parse(m[1])
          const url = cfg?.url || cfg?.src || cfg?.file || cfg?.hls
          if (url) return { url, label: 'VidLink · HLS', provider: 'VidLink', headers: { Referer: 'https://vidlink.pro/' } }
        } catch (_) {}
      }
    }

    const m3u8 = extractM3U8(html)
    if (m3u8) return { url: m3u8, label: 'VidLink · Direct', provider: 'VidLink', headers: { Referer: 'https://vidlink.pro/' } }
    return null
  } catch (_) { return null }
}

/**
 * NontonGo / NineAnime style providers — used by several NetMirror variants
 * These expose a /api/film/{tmdb} endpoint returning direct HLS
 */
async function scrapeFilmApiProviders(tmdbId, mediaType, season, episode) {
  const apiEndpoints = [
    {
      url: mediaType === 'tv'
        ? `https://api.nontongo.win/api/v2/embed/getSources?id=${tmdbId}&s=${season}&e=${episode}&isM3U8=true`
        : `https://api.nontongo.win/api/v2/embed/getSources?id=${tmdbId}&isM3U8=true`,
      label: 'NontonGo API',
      provider: 'NontonGo',
    },
  ]

  const results = []
  for (const ep of apiEndpoints) {
    try {
      const res = await fetch(P(ep.url), { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const data = await res.json()

      // Common response shapes from film API providers
      const sources = data?.sources || data?.data?.sources || data?.result?.sources || []
      for (const src of (Array.isArray(sources) ? sources : [])) {
        const url = src?.file || src?.url || src?.src
        if (url && (url.includes('m3u8') || url.includes('mp4'))) {
          results.push({
            url,
            label: `${ep.label} · ${src?.quality || 'Auto'}`,
            provider: ep.provider,
            headers: {}
          })
        }
      }

      // Also check direct URL in response
      const directUrl = data?.url || data?.link || data?.hls
      if (directUrl) {
        results.push({ url: directUrl, label: ep.label, provider: ep.provider, headers: {} })
      }
    } catch (_) {}
  }

  return results.length > 0 ? results : null
}

/**
 * Smashystream — another NetMirror-adjacent embed provider
 * Uses TMDB ID directly in URL, has decent multi-audio support
 */
async function scrapeSmashyStream(tmdbId, mediaType, season, episode) {
  const embedUrl = mediaType === 'tv'
    ? `https://player.smashy.stream/tv/${tmdbId}?s=${season}&e=${episode}`
    : `https://player.smashy.stream/movie/${tmdbId}`

  try {
    const res = await fetch(P(embedUrl), { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const html = await res.text()

    // Smashy stores config in a script tag as JSON
    const jsonMatch = html.match(/\bplayerConfig\s*=\s*({[\s\S]*?})\s*(?:;|<\/script>)/)
    if (jsonMatch) {
      try {
        const cfg = JSON.parse(jsonMatch[1])
        const url = cfg?.file || cfg?.url
        if (url) return { url, label: 'SmashyStream · HLS', provider: 'SmashyStream', headers: { Referer: 'https://player.smashy.stream/' } }
      } catch (_) {}
    }

    const m3u8 = extractM3U8(html)
    if (m3u8) return { url: m3u8, label: 'SmashyStream · Direct', provider: 'SmashyStream', headers: { Referer: 'https://player.smashy.stream/' } }
    return null
  } catch (_) { return null }
}

/**
 * SuperEmbed / SuperStream — used heavily by iosmirror/netmirror variants
 * TMDB-based, returns HLS with multiple quality levels
 */
async function scrapeSuperEmbed(tmdbId, mediaType, season, episode) {
  const embedUrl = mediaType === 'tv'
    ? `https://www.superembed.stream/embed/series?tmdb=${tmdbId}&season=${season}&episode=${episode}`
    : `https://www.superembed.stream/embed/movie?tmdb=${tmdbId}`

  try {
    const res = await fetch(P(embedUrl), { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const html = await res.text()
    const m3u8 = extractM3U8(html) || extractMasterPlaylist(html)
    if (m3u8) return { url: m3u8, label: 'SuperEmbed · HLS', provider: 'SuperEmbed', headers: { Referer: 'https://www.superembed.stream/' } }
    return null
  } catch (_) { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER SCRAPER ENGINE
// Runs all provider adapters in parallel, returns as each resolves
// First successful HLS stream is auto-played; others shown as alternatives
// This is exactly what NetMirror's "provider adapters" layer does
// ─────────────────────────────────────────────────────────────────────────────
async function scrapeAllProviders(tmdbId, mediaType, season, episode, onFound, onProgress) {
  const providers = [
    // Priority 1 — most reliable multi-audio sources (NetMirror's top picks)
    { fn: scrapeVidSrcTo,       name: 'VidSrc.to',     priority: 1 },
    { fn: scrapeMultiEmbed,     name: 'MultiEmbed',    priority: 1 },
    { fn: scrapeVidLink,        name: 'VidLink',       priority: 1 },
    // Priority 2 — solid backups
    { fn: scrapeVidSrcMe,       name: 'VidSrc.me',     priority: 2 },
    { fn: scrape2Embed,         name: '2Embed',        priority: 2 },
    { fn: scrapeEmbedSu,        name: 'EmbedSu',       priority: 2 },
    // Priority 3 — tertiary fallbacks
    { fn: scrapeSmashyStream,   name: 'SmashyStream',  priority: 3 },
    { fn: scrapeSuperEmbed,     name: 'SuperEmbed',    priority: 3 },
    { fn: scrapeFilmApiProviders,name: 'FilmAPI',      priority: 3 },
  ]

  const allSources = []
  let found = 0
  const total = providers.length

  // Run all providers concurrently — first result triggers playback
  const promises = providers.map(async ({ fn, name }) => {
    try {
      onProgress?.(`Trying ${name}…`, Math.round((found / total) * 80) + 10)
      const result = await fn(tmdbId, mediaType, season, episode)
      if (!result) return

      const sources = Array.isArray(result) ? result : [result]
      for (const src of sources) {
        if (!src?.url) continue
        // Validate URL looks like a real stream
        if (!src.url.match(/\.(m3u8|mp4|mkv|webm)/i) && !src.url.includes('stream') && !src.url.includes('play')) continue
        allSources.push(src)
        found++
        onFound?.(src, allSources.length === 1) // true = first result, trigger autoplay
      }
    } catch (_) {}
  })

  await Promise.allSettled(promises)
  onProgress?.(`${allSources.length} stream(s) ready`, 100)
  return allSources
}

// ─────────────────────────────────────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────────────────────────────────────
const Ico = {
  Play: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width={22} height={22}><polygon points="6,3 20,12 6,21"/></svg>
  ),
  Pause: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width={22} height={22}>
      <rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/>
    </svg>
  ),
  Back10: () => (
    <svg viewBox="0 0 44 44" fill="none" width={32} height={32}>
      <path d="M28 10.5A14 14 0 1 0 36 22" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
      <polyline points="28,4 28,11 35,11" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="22" y="27" textAnchor="middle" fill="white" fontSize="9.5" fontFamily="Arial" fontWeight="700">10</text>
    </svg>
  ),
  Fwd10: () => (
    <svg viewBox="0 0 44 44" fill="none" width={32} height={32}>
      <path d="M16 10.5A14 14 0 1 1 8 22" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
      <polyline points="16,4 16,11 9,11" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="22" y="27" textAnchor="middle" fill="white" fontSize="9.5" fontFamily="Arial" fontWeight="700">10</text>
    </svg>
  ),
  Vol: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width={20} height={20}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    </svg>
  ),
  VolMute: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width={20} height={20}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
    </svg>
  ),
  Fs: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width={20} height={20}>
      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  ),
  FsExit: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width={20} height={20}>
      <polyline points="8 3 3 3 3 8"/><polyline points="21 8 21 3 16 3"/>
      <polyline points="3 16 3 21 8 21"/><polyline points="16 21 21 21 21 16"/>
    </svg>
  ),
  PiP: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width={20} height={20}>
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/>
    </svg>
  ),
  CC: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width={20} height={20}>
      <rect x="2" y="5" width="20" height="15" rx="2"/>
      <line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="14" y2="16"/>
    </svg>
  ),
  ChevR: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width={13} height={13}>
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  ChevL: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width={17} height={17}>
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
}

const ICON_BTN = {
  background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer',
  padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center',
  justifyContent: 'center', transition: 'all 0.15s',
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PLAYER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Player() {
  const { type = 'movie', id } = useParams()
  const navigate = useNavigate()

  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const seekRef      = useRef(null)
  const hideTimer    = useRef(null)

  // Meta
  const [title, setTitle]     = useState('')
  const [season]  = useState(1)
  const [episode] = useState(1)

  // Playback state
  const [playing,     setPlaying]    = useState(false)
  const [muted,       setMuted]      = useState(false)
  const [volume,      setVolume]     = useState(0.9)
  const [current,     setCurrent]    = useState(0)
  const [duration,    setDuration]   = useState(0)
  const [buffered,    setBuffered]   = useState(0)
  const [fullscreen,  setFullscreen] = useState(false)
  const [speed,       setSpeed]      = useState(1)
  const [isBuffering, setIsBuffering]= useState(false)

  // Audio / Quality / Subs — the NetMirror premium UX layer
  const [audioTracks,   setAudioTracks]  = useState([])
  const [activeAudio,   setActiveAudio]  = useState(-1)
  const [qualities,     setQualities]    = useState([])
  const [activeQuality, setActiveQuality]= useState(-1)
  const [subTracks,     setSubTracks]    = useState([])
  const [activeSub,     setActiveSub]    = useState(-1)

  // Sources & engine state
  const [sources,      setSources]     = useState([])
  const [activeSource, setActiveSource]= useState(0)
  const [loadState,    setLoadState]   = useState('loading')
  const [errorMsg,     setErrorMsg]    = useState('')
  const [loadStep,     setLoadStep]    = useState('Starting scraper engine…')
  const [loadPct,      setLoadPct]     = useState(0)

  // UI
  const [showUI,    setShowUI]    = useState(true)
  const [openPanel, setOpenPanel] = useState(null)

  // ── Fetch TMDB title ─────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}`)
      .then(r => r.json())
      .then(d => setTitle(d.title || d.name || ''))
      .catch(() => {})
  }, [type, id])

  // ── Hide controls timer ──────────────────────────────────────────────────────
  const resetHide = useCallback(() => {
    setShowUI(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      setShowUI(false)
      setOpenPanel(null)
    }, 4000)
  }, [])

  useEffect(() => {
    resetHide()
    return () => clearTimeout(hideTimer.current)
  }, [resetHide])

  // ── NetMirror scraper engine — runs on mount ─────────────────────────────────
  const runScraper = useCallback(async () => {
    setLoadState('loading')
    setLoadPct(5)
    setLoadStep('Initializing provider adapters…')
    setSources([])
    setActiveSource(0)

    const discovered = []
    let firstLoaded = false

    await scrapeAllProviders(
      id, type, season, episode,
      // onFound callback — called each time a provider returns a stream
      (src, isFirst) => {
        discovered.push(src)
        setSources([...discovered])

        // Auto-load first successful stream immediately
        if (isFirst && !firstLoaded) {
          firstLoaded = true
          setActiveSource(0)
        }
      },
      // onProgress callback
      (step, pct) => {
        setLoadStep(step)
        setLoadPct(pct)
      }
    )

    if (discovered.length === 0) {
      setLoadState('error')
      setErrorMsg(
        'No streams found across all providers. This title may not be indexed yet, or all providers are currently rate-limited. Try again in a few minutes.'
      )
    }
  }, [type, id, season, episode])

  useEffect(() => { runScraper() }, [runScraper])

  // ── Load video via hls.js when source changes ────────────────────────────────
  const loadVideo = useCallback(async (stream) => {
    if (!stream?.url) return

    setLoadState('loading')
    setLoadStep('Attaching HLS engine…')
    setLoadPct(90)
    setAudioTracks([])
    setActiveAudio(-1)
    setQualities([])
    setActiveQuality(-1)
    setSubTracks([])
    setActiveSub(-1)

    // Tear down previous HLS instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    const video = videoRef.current
    if (!video) return
    video.pause()
    video.removeAttribute('src')
    video.load()

    const Hls = await loadHls()

    // All HLS streams go through our proxy — this is the core NetMirror technique:
    // The proxy rewrites all segment/key URLs in the manifest so the browser
    // never needs to hit the origin CDN directly (bypassing CORS and Referer checks)
    const isHLS = /\.m3u8/i.test(stream.url) || stream.url.includes('m3u8')
    const playUrl = isHLS ? P(stream.url) : stream.url

    // Safari / native HLS support (iOS, macOS Safari)
    if (!Hls || !Hls.isSupported()) {
      video.src = playUrl
      video.play().catch(() => setPlaying(false))
      setLoadState('playing')
      setLoadPct(100)
      return
    }

    // hls.js path — this is where multi-audio magic happens
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 90,
      maxBufferLength: 60,
      maxMaxBufferLength: 600,
      startLevel: -1,             // Auto quality start
      manifestLoadingMaxRetry: 5,
      levelLoadingMaxRetry: 4,
      fragLoadingMaxRetry: 6,
      // The proxy handles CORS so we don't need credentials
      xhrSetup: xhr => { xhr.withCredentials = false },
    })

    hlsRef.current = hls
    hls.attachMedia(video)

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(playUrl)
    })

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      // ── QUALITY LEVELS ──────────────────────────────────────────────────
      const qs = [
        { id: -1, label: 'Auto' },
        ...data.levels.map((l, i) => ({
          id: i,
          label: l.height ? `${l.height}p` : `Level ${i + 1}`,
          bitrate: l.bitrate,
          width: l.width,
        })).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
      ]
      setQualities(qs)
      setActiveQuality(-1)

      // ── AUDIO TRACKS (EXT-X-MEDIA — the NetMirror multi-language feature) ──
      // When provider has Hindi, English, Tamil etc. as separate audio streams,
      // hls.js exposes them here. Switching = hls.audioTrack = id
      const at = hls.audioTracks || []
      if (at.length > 0) {
        const tracks = at.map(t => ({
          id: t.id,
          label: t.name || t.lang || `Track ${t.id + 1}`,
          lang: t.lang || '',
        }))
        setAudioTracks(tracks)

        // Default: prefer English, then whatever is default
        const eng = at.find(t => /^en/i.test(t.lang) || /english/i.test(t.name))
        const def = at.find(t => t.default) || at[0]
        const pick = eng || def
        if (pick) { hls.audioTrack = pick.id; setActiveAudio(pick.id) }
      }

      // ── SUBTITLE TRACKS (EXT-X-MEDIA TYPE=SUBTITLES) ────────────────────
      const st = hls.subtitleTracks || []
      setSubTracks([
        { id: -1, label: 'Off' },
        ...st.map((t, i) => ({ id: i, label: t.name || t.lang || `Sub ${i + 1}` }))
      ])
      setActiveSub(-1)
      if (hls.subtitleDisplay !== undefined) hls.subtitleDisplay = false

      setLoadState('playing')
      setLoadPct(100)
      video.volume = volume
      video.play().catch(() => setPlaying(false))
    })

    // Keep audio state in sync
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, d) => {
      setAudioTracks((d.audioTracks || []).map(t => ({
        id: t.id, label: t.name || t.lang || `Track ${t.id + 1}`, lang: t.lang || ''
      })))
    })
    hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, d) => setActiveAudio(d.id))
    hls.on(Hls.Events.LEVEL_SWITCHED,       (_, d) => {
      setActiveQuality(hls.autoLevelEnabled ? -1 : d.level)
    })

    // Error handling with fallback
    hls.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) return
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad()
      } else {
        setLoadState('error')
        setErrorMsg(`HLS fatal error (${d.details}). Try a different source.`)
      }
    })
  }, [volume])

  // Load video when active source changes
  useEffect(() => {
    if (sources.length > 0 && sources[activeSource]) {
      loadVideo(sources[activeSource])
    }
  }, [sources, activeSource, loadVideo])

  // Cleanup
  useEffect(() => () => { if (hlsRef.current) hlsRef.current.destroy() }, [])

  // ── Video event listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const handlers = {
      play:     () => setPlaying(true),
      pause:    () => setPlaying(false),
      timeupdate: () => {
        setCurrent(v.currentTime)
        if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
      },
      loadedmetadata: () => { setDuration(v.duration); v.volume = volume },
      volumechange:   () => { setVolume(v.volume); setMuted(v.muted) },
      waiting:  () => setIsBuffering(true),
      playing:  () => setIsBuffering(false),
      canplay:  () => setIsBuffering(false),
      error:    () => {
        if (v.error?.code === 4) {
          setLoadState('error')
          setErrorMsg('Format not supported. Try another source.')
        }
      },
    }
    Object.entries(handlers).forEach(([e, fn]) => v.addEventListener(e, fn))
    return () => Object.entries(handlers).forEach(([e, fn]) => v.removeEventListener(e, fn))
  }, [volume])

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = e => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      const v = videoRef.current; if (!v) return
      const actions = {
        ' ': () => { e.preventDefault(); v.paused ? v.play() : v.pause() },
        'k': () => { v.paused ? v.play() : v.pause() },
        'ArrowRight': () => { e.preventDefault(); v.currentTime = Math.min(duration, v.currentTime + 10) },
        'ArrowLeft':  () => { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10) },
        'ArrowUp':    () => { e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1) },
        'ArrowDown':  () => { e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1) },
        'm': () => { v.muted = !v.muted },
        'f': () => toggleFs(),
      }
      actions[e.key]?.()
      resetHide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duration, resetHide])

  // ── Control helpers ──────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current; if (!v) return
    v.paused ? v.play() : v.pause()
    resetHide()
  }
  const toggleFs = () => {
    document.fullscreenElement
      ? document.exitFullscreen()
      : containerRef.current?.requestFullscreen()
  }
  const setVol = val => {
    const v = videoRef.current; if (!v) return
    const n = Math.max(0, Math.min(1, val))
    v.volume = n
    if (n === 0) v.muted = true
    else if (v.muted) v.muted = false
  }
  const onSeekClick = e => {
    e.stopPropagation()
    const bar = seekRef.current; if (!bar || !duration) return
    const { left, width } = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - left) / width))
    if (videoRef.current) videoRef.current.currentTime = pct * duration
    resetHide()
  }

  // Audio track switch — the core multi-language feature
  const switchAudio = id => {
    const hls = hlsRef.current
    if (hls) { hls.audioTrack = id; setActiveAudio(id) }
    setOpenPanel(null)
    resetHide()
  }

  const switchQuality = qid => {
    const hls = hlsRef.current; if (!hls) return
    hls.currentLevel = qid
    hls.autoLevelEnabled = qid === -1
    setActiveQuality(qid)
    setOpenPanel(null)
  }

  const switchSub = sid => {
    const hls = hlsRef.current; if (!hls) return
    if (sid === -1) { hls.subtitleDisplay = false; hls.subtitleTrack = -1 }
    else { hls.subtitleTrack = sid; hls.subtitleDisplay = true }
    setActiveSub(sid)
    setOpenPanel(null)
  }

  const setSpeedFn = r => {
    if (videoRef.current) videoRef.current.playbackRate = r
    setSpeed(r)
    setOpenPanel(null)
  }

  // ── Derived UI values ────────────────────────────────────────────────────────
  const pctPlayed   = duration ? (current  / duration) * 100 : 0
  const pctBuffered = duration ? (buffered / duration) * 100 : 0
  const volPct      = muted ? 0 : volume * 100
  const audioLabel  = audioTracks.find(t => t.id === activeAudio)?.label  || 'Default'
  const qualLabel   = qualities.find(q => q.id === activeQuality)?.label   || 'Auto'
  const subLabel    = subTracks.find(s => s.id === activeSub)?.label       || 'Off'
  const speedLabel  = speed === 1 ? 'Normal' : `${speed}×`

  const panelBase = {
    position: 'absolute', top: 60, right: 16, width: 300,
    background: 'rgba(10,13,18,0.97)', borderRadius: 10, overflow: 'hidden',
    zIndex: 100, boxShadow: '0 12px 40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)',
    backdropFilter: 'blur(12px)',
  }
  const panelRow = {
    display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
    cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)',
    transition: 'background 0.15s',
  }
  const RadioDot = ({ on }) => (
    <div style={{
      width: 20, height: 20, minWidth: 20, borderRadius: '50%',
      border: `2px solid ${on ? '#00a8e1' : 'rgba(255,255,255,0.3)'}`,
      background: on ? '#00a8e1' : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {on && <div style={{ width: 7, height: 7, background: '#fff', borderRadius: '50%' }}/>}
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      onMouseMove={resetHide}
      onTouchStart={resetHide}
      onClick={() => { if (loadState === 'playing') togglePlay() }}
      style={{
        position: 'fixed', inset: 0, background: '#000', zIndex: 100,
        display: 'flex', flexDirection: 'column', userSelect: 'none',
        fontFamily: "'Amazon Ember', 'SF Pro Display', 'Segoe UI', Arial, sans-serif",
        cursor: showUI ? 'default' : 'none',
      }}
    >
      {/* VIDEO ELEMENT */}
      <video
        ref={videoRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
        playsInline
        autoPlay
      />

      {/* BUFFERING SPINNER */}
      <AnimatePresence>
        {isBuffering && loadState === 'playing' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
          >
            <div style={{ position: 'relative', width: 56, height: 56 }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid transparent', borderTopColor: '#00a8e1' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LOADING OVERLAY */}
      <AnimatePresence>
        {loadState === 'loading' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 24,
              background: 'linear-gradient(135deg,#060b14,#0a0d1a)', textAlign: 'center', padding: '0 24px',
            }}
          >
            {/* Animated logo */}
            <div style={{ position: 'relative', width: 80, height: 80 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(0,168,225,0.12)' }}/>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid transparent', borderTopColor: '#00a8e1' }}
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 1.7, repeat: Infinity, ease: 'linear' }}
                style={{ position: 'absolute', inset: 10, borderRadius: '50%', border: '2px solid transparent', borderTopColor: 'rgba(0,168,225,0.35)' }}
              />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="#00a8e1" width={24} height={24}><polygon points="8,5 20,12 8,19"/></svg>
              </div>
            </div>

            <div>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
                {title || 'Finding streams…'}
              </p>
              <motion.p
                key={loadStep}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0 }}
              >
                {loadStep}
              </motion.p>
            </div>

            {/* Progress bar */}
            <div style={{ width: 220, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <motion.div
                animate={{ width: `${loadPct}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                style={{ height: '100%', background: 'linear-gradient(90deg,#00a8e1,#007fbf)', borderRadius: 2 }}
              />
            </div>

            {/* Provider badges */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 340 }}>
              {['VidSrc.to', 'MultiEmbed', 'VidLink', 'VidSrc.me', '2Embed', 'EmbedSu', 'SmashyStream'].map(p => (
                <span key={p} style={{
                  fontSize: 10, color: 'rgba(255,255,255,0.3)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: '3px 8px', borderRadius: 4, fontWeight: 600,
                }}>
                  {p}
                </span>
              ))}
            </div>

            {/* Live discovery counter */}
            {sources.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                style={{
                  background: 'rgba(0,168,225,0.1)', border: '1px solid rgba(0,168,225,0.2)',
                  borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#00a8e1', fontWeight: 600,
                }}
              >
                ✓ {sources.length} stream{sources.length !== 1 ? 's' : ''} found — loading best source…
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ERROR OVERLAY */}
      <AnimatePresence>
        {loadState === 'error' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 20,
              background: 'rgba(0,0,0,0.96)', textAlign: 'center', padding: '0 24px',
            }}
          >
            <AlertCircle style={{ width: 52, height: 52, color: '#ff4455' }}/>
            <div>
              <p style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Stream Unavailable</p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, maxWidth: 400, margin: '0 auto' }}>{errorMsg}</p>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              {sources.length > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); setOpenPanel('sources'); setLoadState('playing') }}
                  style={{ background: '#00a8e1', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                >
                  Try Another Source
                </button>
              )}
              <button
                onClick={e => { e.stopPropagation(); runScraper() }}
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <RefreshCw style={{ width: 15, height: 15 }}/> Retry All Providers
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONTROLS OVERLAY */}
      {loadState !== 'error' && (
        <motion.div
          animate={{ opacity: showUI ? 1 : 0 }}
          transition={{ duration: 0.25 }}
          style={{ position: 'absolute', inset: 0, zIndex: 30, pointerEvents: showUI ? 'auto' : 'none' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160, background: 'linear-gradient(to bottom,rgba(0,0,0,0.85),transparent)', pointerEvents: 'none' }}/>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 200, background: 'linear-gradient(to top,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.5) 60%,transparent 100%)', pointerEvents: 'none' }}/>

          {/* TOP BAR */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => navigate(-1)} style={{ ...ICON_BTN, padding: 8 }}>
                <ChevronLeft style={{ width: 22, height: 22 }} />
              </button>
              <div>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0, lineHeight: 1.2 }}>{title || 'Now Playing'}</p>
                {sources[activeSource] && (
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, margin: 0, marginTop: 2 }}>
                    {sources[activeSource].provider} · {sources.length} source{sources.length !== 1 ? 's' : ''} available
                    {audioTracks.length > 1 && ` · ${audioTracks.length} audio languages`}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
              {/* Audio language button — shown prominently when multi-audio available */}
              {audioTracks.length > 1 && (
                <button
                  style={{ ...ICON_BTN, fontSize: 11, fontWeight: 700, color: '#00a8e1', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(0,168,225,0.3)', background: 'rgba(0,168,225,0.08)' }}
                  onClick={() => setOpenPanel(p => p === 'audio' ? null : 'audio')}
                  title="Audio Language"
                >
                  🎵 {audioLabel}
                </button>
              )}

              <button style={ICON_BTN} onClick={() => setOpenPanel(p => p === 'subs' ? null : 'subs')} title="Subtitles"><Ico.CC/></button>
              {document.pictureInPictureEnabled && (
                <button style={ICON_BTN} onClick={() => videoRef.current?.requestPictureInPicture()} title="PiP"><Ico.PiP/></button>
              )}
              <button style={ICON_BTN} onClick={toggleFs} title="Fullscreen">
                {fullscreen ? <Ico.FsExit/> : <Ico.Fs/>}
              </button>
              <button style={ICON_BTN} onClick={() => setOpenPanel(p => p === 'settings' ? null : 'settings')} title="Settings">
                <Settings style={{ width: 20, height: 20 }}/>
              </button>

              {/* SETTINGS PANEL */}
              <AnimatePresence>
                {openPanel === 'settings' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.18 }} style={panelBase} onClick={e => e.stopPropagation()}
                  >
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 15, fontWeight: 700, color: '#fff' }}>Settings</div>
                    {[
                      { key: 'sources',  label: 'Stream Source',   value: `${sources[activeSource]?.provider || '—'} (${activeSource + 1}/${sources.length})`, icon: '📡' },
                      { key: 'audio',    label: 'Audio Language',  value: audioLabel,  icon: '🎵', badge: audioTracks.length > 1 ? `${audioTracks.length} langs` : null },
                      { key: 'quality',  label: 'Video Quality',   value: qualLabel,   icon: '📺' },
                      { key: 'subs',     label: 'Subtitles',       value: subLabel,    icon: '💬' },
                      { key: 'speed',    label: 'Playback Speed',  value: speedLabel,  icon: '⚡' },
                    ].map(row => (
                      <div
                        key={row.key} style={panelRow}
                        onClick={() => setOpenPanel(row.key)}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontSize: 16 }}>{row.icon}</span>
                        <span style={{ flex: 1, fontSize: 14, color: '#e0e0e0', fontWeight: 500 }}>{row.label}</span>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {row.badge && <span style={{ fontSize: 10, background: 'rgba(0,168,225,0.2)', color: '#00a8e1', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>{row.badge}</span>}
                          {row.value} <Ico.ChevR/>
                        </span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* SOURCES PANEL */}
              <AnimatePresence>
                {openPanel === 'sources' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    style={panelBase} onClick={e => e.stopPropagation()}
                  >
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }} onClick={() => setOpenPanel('settings')}><Ico.ChevL/></button>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Stream Source</span>
                    </div>
                    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                      {sources.map((s, i) => (
                        <div
                          key={i}
                          style={{ ...panelRow, gap: 12, background: i === activeSource ? 'rgba(0,168,225,0.08)' : 'transparent' }}
                          onClick={() => { setActiveSource(i); setOpenPanel(null) }}
                          onMouseEnter={e => { if (i !== activeSource) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                          onMouseLeave={e => { if (i !== activeSource) e.currentTarget.style.background = 'transparent' }}
                        >
                          <RadioDot on={i === activeSource}/>
                          <div style={{ overflow: 'hidden', flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: i === activeSource ? '#00a8e1' : '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.label}
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                              {s.url.includes('m3u8') ? 'HLS · Multi-Audio' : 'Direct MP4'} · {s.provider}
                            </div>
                          </div>
                        </div>
                      ))}
                      {sources.length === 0 && (
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '24px 20px', textAlign: 'center' }}>Searching for sources…</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* AUDIO LANGUAGE PANEL — NetMirror's signature feature */}
              <AnimatePresence>
                {openPanel === 'audio' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    style={panelBase} onClick={e => e.stopPropagation()}
                  >
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }} onClick={() => setOpenPanel('settings')}><Ico.ChevL/></button>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Audio Language</span>
                    </div>
                    {audioTracks.length === 0 ? (
                      <div style={{ padding: '24px 20px', textAlign: 'center' }}>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '0 0 8px' }}>
                          No alternate audio tracks in this stream.
                        </p>
                        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, margin: 0 }}>
                          Try a MultiEmbed or VidSrc source — those tend to have Hindi, English, Tamil multi-audio.
                        </p>
                      </div>
                    ) : audioTracks.map(t => (
                      <div
                        key={t.id}
                        style={{ ...panelRow, gap: 12, background: t.id === activeAudio ? 'rgba(0,168,225,0.08)' : 'transparent' }}
                        onClick={() => switchAudio(t.id)}
                        onMouseEnter={e => { if (t.id !== activeAudio) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { if (t.id !== activeAudio) e.currentTarget.style.background = 'transparent' }}
                      >
                        <RadioDot on={t.id === activeAudio}/>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: t.id === activeAudio ? '#00a8e1' : '#e0e0e0' }}>{t.label}</div>
                          {t.lang && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{t.lang.toUpperCase()}</div>}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* QUALITY PANEL */}
              <AnimatePresence>
                {openPanel === 'quality' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    style={panelBase} onClick={e => e.stopPropagation()}
                  >
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }} onClick={() => setOpenPanel('settings')}><Ico.ChevL/></button>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Video Quality</span>
                    </div>
                    {qualities.length === 0
                      ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '24px 20px', textAlign: 'center' }}>Quality levels loading…</p>
                      : qualities.map(q => (
                        <div
                          key={q.id}
                          style={{ ...panelRow, gap: 12, background: q.id === activeQuality ? 'rgba(0,168,225,0.08)' : 'transparent' }}
                          onClick={() => switchQuality(q.id)}
                          onMouseEnter={e => { if (q.id !== activeQuality) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                          onMouseLeave={e => { if (q.id !== activeQuality) e.currentTarget.style.background = 'transparent' }}
                        >
                          <RadioDot on={q.id === activeQuality}/>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: q.id === activeQuality ? '#00a8e1' : '#e0e0e0' }}>{q.label}</div>
                            {q.bitrate && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>~{(q.bitrate / 1e6).toFixed(1)} Mbps</div>}
                          </div>
                        </div>
                      ))
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* SUBTITLES PANEL */}
              <AnimatePresence>
                {openPanel === 'subs' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    style={panelBase} onClick={e => e.stopPropagation()}
                  >
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }} onClick={() => setOpenPanel('settings')}><Ico.ChevL/></button>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Subtitles</span>
                    </div>
                    {subTracks.length <= 1
                      ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '24px 20px', textAlign: 'center' }}>No embedded subtitles in this stream.</p>
                      : subTracks.map(s => (
                        <div
                          key={s.id}
                          style={{ ...panelRow, gap: 12, background: s.id === activeSub ? 'rgba(0,168,225,0.08)' : 'transparent' }}
                          onClick={() => switchSub(s.id)}
                          onMouseEnter={e => { if (s.id !== activeSub) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                          onMouseLeave={e => { if (s.id !== activeSub) e.currentTarget.style.background = 'transparent' }}
                        >
                          <RadioDot on={s.id === activeSub}/>
                          <div style={{ fontSize: 14, fontWeight: 500, color: s.id === activeSub ? '#00a8e1' : '#e0e0e0' }}>{s.label}</div>
                        </div>
                      ))
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* SPEED PANEL */}
              <AnimatePresence>
                {openPanel === 'speed' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    style={panelBase} onClick={e => e.stopPropagation()}
                  >
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }} onClick={() => setOpenPanel('settings')}><Ico.ChevL/></button>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Playback Speed</span>
                    </div>
                    {SPEEDS.map(r => (
                      <div
                        key={r}
                        style={{ ...panelRow, gap: 12, background: r === speed ? 'rgba(0,168,225,0.08)' : 'transparent' }}
                        onClick={() => setSpeedFn(r)}
                        onMouseEnter={e => { if (r !== speed) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { if (r !== speed) e.currentTarget.style.background = 'transparent' }}
                      >
                        <RadioDot on={r === speed}/>
                        <div style={{ fontSize: 14, fontWeight: 500, color: r === speed ? '#00a8e1' : '#e0e0e0' }}>
                          {r === 1 ? 'Normal' : `${r}×`}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* BOTTOM CONTROLS */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 0 28px 0', zIndex: 10 }}>
            {/* Seek bar */}
            <div style={{ padding: '0 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', minWidth: 42, letterSpacing: '0.02em' }}>{fmt(current)}</span>
              <div
                ref={seekRef}
                onClick={onSeekClick}
                style={{ flex: 1, position: 'relative', height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, cursor: 'pointer' }}
                onMouseEnter={e => { const t = e.currentTarget.querySelector('.seek-thumb'); if (t) t.style.opacity = '1' }}
                onMouseLeave={e => { const t = e.currentTarget.querySelector('.seek-thumb'); if (t) t.style.opacity = '0' }}
              >
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pctBuffered}%`, background: 'rgba(255,255,255,0.18)', borderRadius: 2 }}/>
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pctPlayed}%`, background: '#00a8e1', borderRadius: 2 }}>
                  <div
                    className="seek-thumb"
                    style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, background: '#fff', borderRadius: '50%', boxShadow: '0 0 6px rgba(0,0,0,0.5)', opacity: 0, transition: 'opacity 0.15s' }}
                  />
                </div>
              </div>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', minWidth: 42, textAlign: 'right', letterSpacing: '0.02em' }}>{fmt(duration)}</span>
            </div>

            {/* Playback buttons */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <button style={ICON_BTN} onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10); resetHide() }}>
                <Ico.Back10/>
              </button>

              <button
                onClick={e => { e.stopPropagation(); togglePlay() }}
                style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#000', transition: 'transform 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <AnimatePresence mode="wait">
                  {playing
                    ? <motion.div key="p"  initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.12 }}><Ico.Pause/></motion.div>
                    : <motion.div key="pl" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.12 }}><Ico.Play/></motion.div>
                  }
                </AnimatePresence>
              </button>

              <button style={ICON_BTN} onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10); resetHide() }}>
                <Ico.Fwd10/>
              </button>

              {/* Volume inline control */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                <button style={ICON_BTN} onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.muted = !videoRef.current.muted }}>
                  {(muted || volume === 0) ? <Ico.VolMute/> : <Ico.Vol/>}
                </button>
                <input
                  type="range" min="0" max="100" step="1" value={Math.round(volPct)}
                  onChange={e => { e.stopPropagation(); setVol(parseInt(e.target.value) / 100) }}
                  style={{ width: 70, WebkitAppearance: 'none', appearance: 'none', height: 3, borderRadius: 2, outline: 'none', cursor: 'pointer', background: `linear-gradient(to right, #00a8e1 ${volPct}%, rgba(255,255,255,0.2) ${volPct}%)` }}
                />
              </div>
            </div>

            {/* Source quick-switcher pills */}
            {sources.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap', padding: '0 16px' }}>
                {sources.slice(0, 8).map((s, i) => (
                  <button
                    key={i}
                    onClick={e => { e.stopPropagation(); setActiveSource(i) }}
                    style={{
                      fontSize: 10, padding: '3px 10px', borderRadius: 20,
                      border: `1px solid ${i === activeSource ? '#00a8e1' : 'rgba(255,255,255,0.15)'}`,
                      background: i === activeSource ? 'rgba(0,168,225,0.15)' : 'rgba(0,0,0,0.5)',
                      color: i === activeSource ? '#00a8e1' : 'rgba(255,255,255,0.5)',
                      cursor: 'pointer', fontWeight: 600, backdropFilter: 'blur(4px)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {s.provider}
                  </button>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  )
}
