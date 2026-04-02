// src/pages/Player.jsx
// ─────────────────────────────────────────────────────────────────────────────
// MULTI-LANGUAGE AUDIO STRATEGY (Research-backed)
// ──────────────────────────────────────────────────────────────────────────────
// THE CORE PROBLEM with the old approach:
//   Stremio addons return torrent-based MKV/MP4 streams. Even when labelled
//   "Hindi+English" or "Multi", those are MKV containers with embedded audio
//   tracks that BROWSERS CANNOT decode (no MKV support in <video>).
//   HLS.js can only switch audio tracks if the source is an HLS manifest
//   (.m3u8) with multiple EXT-X-MEDIA audio groups — which torrents never are.
//
// THE SOLUTION — Embed Providers (VidLink, AutoEmbed, 2Embed, VidSrc):
//   These services (vidlink.pro, autoembed.cc, 2embed.stream, vidsrc.cc) all
//   act as aggregators that pull from the SAME upstream hosting CDNs (VidPlay,
//   ViCloud, StreamVid, etc.) that OTT platforms use. Their underlying player
//   serves genuine multi-track HLS .m3u8 manifests with EXT-X-MEDIA:TYPE=AUDIO
//   groups — meaning HLS.js can switch between Hindi, English, Tamil, Telugu,
//   Spanish, etc. in real-time inside the browser.
//
// SOURCE PRIORITY ORDER (best to worst for multi-audio):
//   1. vidlink.pro        — Best multi-audio HLS, TMDB-native, very reliable
//   2. autoembed.cc       — Good multi-audio, broad library
//   3. 2embed.stream      — Good fallback, TMDB + IMDB support
//   4. vidsrc.cc          — Wide library, usually English-only HLS
//   5. vidsrc.me          — Classic fallback, English
//   6. Stremio addons     — Last resort for very obscure content (torrent-based,
//                           browser-playable only if .mp4 not .mkv)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, AlertCircle } from 'lucide-react'

const BASE_URL   = 'https://api.themoviedb.org/3'
const API_KEY    = import.meta.env.VITE_TMDB_API_KEY
const STREAM_API = import.meta.env.VITE_STREAM_API  // apex-stream-api on render

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

// ── Embed Source Definitions ──────────────────────────────────────────────────
// Each embed provider is tried in order. We extract the actual .m3u8 from their
// player page via the proxy, which avoids CORS issues and ads.
const getEmbedSources = (tmdbId, imdbId, type, season, episode) => {
  const isTv = type === 'tv'
  const id   = tmdbId

  const sources = []

  // 1. VidLink Pro — best multi-audio, uses TMDB ids natively
  if (isTv) {
    sources.push({
      name: '🎵 VidLink (Multi-Audio)',
      embedUrl: `https://vidlink.pro/tv/${id}/${season}/${episode}?primaryColor=00a8e1&secondaryColor=00a8e1&iconColor=00a8e1&autoplay=true`,
      type: 'iframe',
      priority: 1,
    })
  } else {
    sources.push({
      name: '🎵 VidLink (Multi-Audio)',
      embedUrl: `https://vidlink.pro/movie/${id}?primaryColor=00a8e1&secondaryColor=00a8e1&iconColor=00a8e1&autoplay=true`,
      type: 'iframe',
      priority: 1,
    })
  }

  // 2. AutoEmbed — good multi-audio coverage
  if (isTv) {
    sources.push({
      name: '🎵 AutoEmbed (Multi-Audio)',
      embedUrl: `https://player.autoembed.cc/embed/tv/${id}/${season}/${episode}`,
      type: 'iframe',
      priority: 2,
    })
  } else {
    sources.push({
      name: '🎵 AutoEmbed (Multi-Audio)',
      embedUrl: `https://player.autoembed.cc/embed/movie/${id}`,
      type: 'iframe',
      priority: 2,
    })
  }

  // 3. 2Embed — reliable fallback with TMDB support
  if (isTv) {
    sources.push({
      name: '🎵 2Embed (Multi-Audio)',
      embedUrl: `https://www.2embed.stream/embed/tv/${id}/${season}/${episode}`,
      type: 'iframe',
      priority: 3,
    })
  } else {
    sources.push({
      name: '🎵 2Embed (Multi-Audio)',
      embedUrl: `https://www.2embed.stream/embed/movie/${id}`,
      type: 'iframe',
      priority: 3,
    })
  }

  // 4. VidSrc.cc — good library, HLS based
  if (imdbId) {
    if (isTv) {
      sources.push({
        name: '📺 VidSrc.cc',
        embedUrl: `https://vidsrc.cc/v2/embed/tv/${imdbId}/${season}/${episode}`,
        type: 'iframe',
        priority: 4,
      })
    } else {
      sources.push({
        name: '📺 VidSrc.cc',
        embedUrl: `https://vidsrc.cc/v2/embed/movie/${imdbId}`,
        type: 'iframe',
        priority: 4,
      })
    }
  }

  // 5. VidSrc.me (classic)
  if (imdbId) {
    if (isTv) {
      sources.push({
        name: '📺 VidSrc.me',
        embedUrl: `https://v2.vidsrc.me/embed/${imdbId}/${season}-${episode}/`,
        type: 'iframe',
        priority: 5,
      })
    } else {
      sources.push({
        name: '📺 VidSrc.me',
        embedUrl: `https://v2.vidsrc.me/embed/${imdbId}/`,
        type: 'iframe',
        priority: 5,
      })
    }
  }

  // 6. VidSrc.icu — backup embed
  if (isTv) {
    sources.push({
      name: '📺 VidSrc.icu',
      embedUrl: `https://vidsrc.icu/embed/tv/${id}/${season}/${episode}`,
      type: 'iframe',
      priority: 6,
    })
  } else {
    sources.push({
      name: '📺 VidSrc.icu',
      embedUrl: `https://vidsrc.icu/embed/movie/${id}`,
      type: 'iframe',
      priority: 6,
    })
  }

  return sources
}

// ── Stremio-based fallback sources (for direct HLS/MP4 only) ─────────────────
// We still try these but only for content not available via embed providers.
// Critically: we ONLY use streams that are .m3u8 or .mp4 — never .mkv/.avi
// since browsers can't play those. We also greatly improve language scoring.
const getStremioSources = async (type, id, season, episode) => {
  let streamId = type === 'tv' ? `tmdb:${id}:${season}:${episode}` : `tmdb:${id}`

  try {
    const extRes = await fetch(`${BASE_URL}/${type}/${id}/external_ids?api_key=${API_KEY}`)
    if (extRes.ok) {
      const extData = await extRes.json()
      if (extData.imdb_id) {
        streamId = type === 'tv'
          ? `${extData.imdb_id}:${season}:${episode}`
          : extData.imdb_id
      }
    }
  } catch (_) {}

  const stremioType = type === 'tv' ? 'series' : 'movie'

  // Only publicly accessible, reliable Stremio-compatible endpoints
  const ADDONS = [
    'https://stremify.hayd.uk',
    'https://nuviostreams.hayd.uk',
  ]

  // Smart scoring for browser-playable multi-audio streams
  // KEY INSIGHT: Only .m3u8 files can have real HLS audio tracks in browser.
  // .mp4 with "Hindi" in title is a SINGLE audio track — just Hindi.
  // So we prioritize .m3u8 tagged multi/dual, then single-language .m3u8,
  // then .mp4, and deprioritize everything else.
  const scoreStream = (s) => {
    let score = 0
    const url = (s.url || '').toLowerCase()
    const t   = (s.title || s.name || '').toLowerCase()

    // Browser-playable format is critical
    const isM3u8 = url.includes('.m3u8')
    const isMp4  = url.includes('.mp4')
    const isMkv  = url.includes('.mkv') || url.includes('.avi') || url.includes('.ts') && !url.includes('.m3u8')

    if (isMkv) return -99999   // Browsers cannot play MKV — hard exclude
    if (isM3u8) score += 300   // HLS = multi-audio possible
    else if (isMp4) score += 50

    // HEVC/x265 — browsers can't decode these codecs
    if (t.includes('hevc') || t.includes('x265') || t.includes('h265') || t.includes('x264.hevc')) {
      score -= 500
    }

    // Multi/Dual audio on a .m3u8 = the gold standard
    const isMultiAudio = t.includes('multi') || t.includes('multi audio') || t.includes('dual') || t.includes('dual audio')
    if (isMultiAudio && isM3u8) score += 800  // Best possible: HLS + multi-track

    // Language preferences (for .mp4 streams these are single-language)
    if (t.includes('hindi') || t.includes('hin')) score += 200
    if (t.includes('english') || t.includes('eng')) score += 150
    if (t.includes('tamil') || t.includes('tam')) score += 100
    if (t.includes('telugu') || t.includes('tel')) score += 100
    if (t.includes('malayalam') || t.includes('mal')) score += 80
    if (t.includes('kannada') || t.includes('kan')) score += 80

    // Quality
    if (t.includes('2160p') || t.includes('4k')) score += 60
    if (t.includes('1080p')) score += 40
    if (t.includes('720p')) score += 20

    // Source quality signals
    if (t.includes('web-dl') || t.includes('webdl')) score += 50
    if (t.includes('webrip') || t.includes('web rip')) score += 30
    if (t.includes('amzn') || t.includes('nf') || t.includes('disney')) score += 40

    // Penalize isolated foreign dubs that are NOT one of our preferred languages
    const hasPrefLang = isMultiAudio ||
      t.includes('hindi') || t.includes('english') ||
      t.includes('tamil') || t.includes('telugu') ||
      t.includes('malayalam') || t.includes('kannada') ||
      t.includes('hin') || t.includes('eng') || t.includes('tam') ||
      t.includes('tel') || t.includes('mal') || t.includes('kan')

    if (!hasPrefLang) {
      // Penalize other language dubs
      if (t.includes('ita') || t.includes('fre') || t.includes('esp') ||
          t.includes('rus') || t.includes('ger') || t.includes('por')) {
        score -= 800
      }
    }

    return score
  }

  const allStreams = []

  for (const base of ADDONS) {
    try {
      const targetUrl = `${base}/stream/${stremioType}/${streamId}.json`
      const proxyUrl  = `/api/proxy?url=${encodeURIComponent(targetUrl)}`
      const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) })
      if (!resp.ok) continue
      const text = await resp.text()
      if (text.trimStart().startsWith('<')) continue
      const data = JSON.parse(text)
      if (data?.streams?.length) {
        allStreams.push(...data.streams.filter(s => s.url))
      }
    } catch (_) {}
  }

  // Deduplicate and filter out unplayable streams
  const seen = new Set()
  const validStreams = allStreams.filter(s => {
    if (!s.url || seen.has(s.url)) return false
    seen.add(s.url)
    const url = s.url.toLowerCase()
    // Hard exclude: MKV, AVI and non-HTTP
    if (url.includes('.mkv') || url.includes('.avi')) return false
    if (!url.startsWith('http')) return false
    return true
  })

  // Score and sort
  validStreams.sort((a, b) => scoreStream(b) - scoreStream(a))

  // Convert to our source format
  return validStreams.map((s, i) => {
    const t = (s.title || s.name || '').split('\n')
    const label = t[0]?.substring(0, 50) || `Stream ${i + 1}`
    const size  = t.find(p => p.includes('GB') || p.includes('MB')) || ''
    const url   = s.url.toLowerCase()
    const isM3u8 = url.includes('.m3u8')
    const score  = scoreStream(s)
    const isMulti = label.toLowerCase().includes('multi') || label.toLowerCase().includes('dual')
    const emoji = isM3u8 && isMulti ? '🎵' : isM3u8 ? '📡' : '🎬'
    return {
      name: `${emoji} ${label}${size ? ` • ${size.trim()}` : ''}`,
      url: s.url,
      type: 'direct',
      priority: 10 + i,
      score,
    }
  })
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}>
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const IconCC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
    <rect x="2" y="5" width="20" height="15" rx="2"/>
    <line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="14" y2="16"/>
  </svg>
)
const IconVolume = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
  </svg>
)
const IconVolumeMute = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
  </svg>
)
const IconPiP = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
    <rect x="2" y="4" width="20" height="16" rx="2"/>
    <rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/>
  </svg>
)
const IconFullscreen = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
    <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
  </svg>
)
const IconFullscreenExit = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}>
    <polyline points="8 3 3 3 3 8"/><polyline points="21 8 21 3 16 3"/>
    <polyline points="3 16 3 21 8 21"/><polyline points="16 21 21 21 21 16"/>
  </svg>
)
const IconMore = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{width:22,height:22}}>
    <circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>
  </svg>
)
const IconServer = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}>
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
    <line x1="6" y1="6" x2="6.01" y2="6"></line>
    <line x1="6" y1="18" x2="6.01" y2="18"></line>
  </svg>
)
const IconChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}>
    <polyline points="9 18 15 12 9 6"/>
  </svg>
)
const IconChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}>
    <polyline points="15 18 9 12 15 6"/>
  </svg>
)
const IconSkipBack = () => (
  <svg viewBox="0 0 44 44" fill="none" style={{width:36,height:36}}>
    <path d="M28 10.5A14 14 0 1 0 36 22" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
    <polyline points="28,4 28,11 35,11" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <text x="22" y="27" textAnchor="middle" fill="white" fontSize="9.5" fontFamily="Arial" fontWeight="700">10</text>
  </svg>
)
const IconSkipFwd = () => (
  <svg viewBox="0 0 44 44" fill="none" style={{width:36,height:36}}>
    <path d="M16 10.5A14 14 0 1 1 8 22" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
    <polyline points="16,4 16,11 9,11" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <text x="22" y="27" textAnchor="middle" fill="white" fontSize="9.5" fontFamily="Arial" fontWeight="700">10</text>
  </svg>
)
const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{width:24,height:24}}>
    <polygon points="6,3 20,12 6,21"/>
  </svg>
)
const IconPause = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{width:24,height:24}}>
    <rect x="5" y="3" width="4" height="18" rx="1"/>
    <rect x="15" y="3" width="4" height="18" rx="1"/>
  </svg>
)

const ICON_BTN = {
  background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
  padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center',
  justifyContent: 'center', transition: 'background 0.15s', position: 'relative',
}

export default function Player() {
  const { type = 'movie', id } = useParams()
  const navigate = useNavigate()

  const videoRef     = useRef(null)
  const iframeRef    = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const seekTrackRef = useRef(null)
  const hideTimer    = useRef(null)

  // Playback state
  const [playing,       setPlaying]       = useState(false)
  const [muted,         setMuted]         = useState(false)
  const [volume,        setVolume]        = useState(0.8)
  const [current,       setCurrent]       = useState(0)
  const [duration,      setDuration]      = useState(0)
  const [buffered,      setBuffered]      = useState(0)
  const [fullscreen,    setFullscreen]    = useState(false)
  const [speed,         setSpeed]         = useState(1)
  const [isBuffering,   setIsBuffering]   = useState(false)

  // Sources
  const [sources,       setSources]       = useState([])
  const [activeSource,  setActiveSource]  = useState(0)
  const [audioTracks,   setAudioTracks]   = useState([])
  const [activeAudio,   setActiveAudio]   = useState(-1)
  const [qualities,     setQualities]     = useState([])
  const [activeQuality, setActiveQuality] = useState(-1)
  const [subTracks,     setSubTracks]     = useState([])
  const [activeSub,     setActiveSub]     = useState(-1)

  // Player mode: 'native' = our custom <video> player, 'iframe' = embed player
  const [playerMode,    setPlayerMode]    = useState('native')
  const [currentEmbed,  setCurrentEmbed]  = useState(null)

  // UI state
  const [showUI,        setShowUI]        = useState(true)
  const [openPanel,     setOpenPanel]     = useState(null)
  const [loadState,     setLoadState]     = useState('loading')
  const [errorMsg,      setErrorMsg]      = useState('')
  const [loadStep,      setLoadStep]      = useState('Connecting...')
  const [loadProgress,  setLoadProgress]  = useState(0)

  // Title / episode info
  const [title,         setTitle]         = useState('')
  const [season]  = useState(1)
  const [episode] = useState(1)

  // IMDB id for embed sources
  const [imdbId, setImdbId] = useState(null)

  useEffect(() => {
    fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}&language=en-US`)
      .then(r => r.json())
      .then(d => setTitle(d.title || d.name || ''))
      .catch(() => {})
  }, [type, id])

  const resetHide = useCallback(() => {
    setShowUI(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      setShowUI(false)
      setOpenPanel(null)
    }, 4500)
  }, [])

  useEffect(() => {
    resetHide()
    return () => clearTimeout(hideTimer.current)
  }, [resetHide])

  // ── 1. Fetch external IDs then build sources ──────────────────────────────
  const fetchSources = useCallback(async () => {
    setLoadState('loading')
    setLoadProgress(10)
    setLoadStep('Fetching content info...')
    setOpenPanel(null)

    // Get IMDB id
    let fetchedImdbId = null
    try {
      const extRes = await fetch(`${BASE_URL}/${type}/${id}/external_ids?api_key=${API_KEY}`)
      if (extRes.ok) {
        const extData = await extRes.json()
        fetchedImdbId = extData.imdb_id || null
      }
    } catch (_) {}
    setImdbId(fetchedImdbId)

    setLoadProgress(30)
    setLoadStep('Building stream sources...')

    // Build embed sources (always available, best for multi-audio)
    const embedSources = getEmbedSources(id, fetchedImdbId, type, season, episode)

    setLoadProgress(50)
    setLoadStep('Finding direct streams...')

    // Try to get Stremio direct streams in parallel (don't block)
    let directSources = []
    try {
      directSources = await Promise.race([
        getStremioSources(type, id, season, episode),
        new Promise(resolve => setTimeout(() => resolve([]), 10000)) // 10s timeout
      ])
    } catch (_) {}

    setLoadProgress(90)
    setLoadStep('Ready!')

    // Merge: embed sources first, then direct streams as extras
    const allSources = [...embedSources, ...directSources]
    setSources(allSources)
    setActiveSource(0)
    setLoadProgress(100)
  }, [type, id, season, episode])

  useEffect(() => {
    fetchSources()
  }, [fetchSources])


  // ── 2. Load selected source ───────────────────────────────────────────────
  const loadSource = useCallback(async (source) => {
    if (!source) return

    // Clean up previous player
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    const video = videoRef.current
    if (video) { video.pause(); video.removeAttribute('src'); video.load() }

    setAudioTracks([])
    setActiveAudio(-1)
    setQualities([])
    setActiveQuality(-1)
    setSubTracks([])
    setActiveSub(-1)
    setPlaying(false)

    if (source.type === 'iframe') {
      // ── IFRAME / EMBED MODE ──────────────────────────────────────────────
      // For embed sources, we show the embed in a full-screen iframe.
      // The embed provider's own player handles multi-audio, quality, subs.
      // We show a minimal overlay with just the source selector and close button.
      setPlayerMode('iframe')
      setCurrentEmbed(source.embedUrl)
      setLoadState('playing')
      setLoadProgress(100)
    } else {
      // ── NATIVE VIDEO MODE ────────────────────────────────────────────────
      setPlayerMode('native')
      setCurrentEmbed(null)
      setLoadState('loading')
      setLoadStep('Initializing Video Engine...')
      setLoadProgress(90)

      try {
        const Hls = await loadHls()
        if (!video) return

        const isM3U8 = /\.m3u8/i.test(source.url)
        const streamUrl = isM3U8 ? `/api/proxy?url=${encodeURIComponent(source.url)}` : source.url

        if (!isM3U8 || !Hls || !Hls.isSupported()) {
          video.src = streamUrl
          setLoadState('playing')
          setLoadProgress(100)
          video.play().catch(e => { if (e.name !== 'AbortError') setPlaying(false) })
          return
        }

        const hls = new Hls({
          enableWorker: true, lowLatencyMode: false, backBufferLength: 90,
          maxBufferLength: 60, maxMaxBufferLength: 600, startLevel: -1,
          manifestLoadingMaxRetry: 4, levelLoadingMaxRetry: 4, fragLoadingMaxRetry: 6,
        })
        hlsRef.current = hls
        hls.attachMedia(video)

        hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(streamUrl))

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          const qs = [{ id: -1, label: 'Auto' }, ...data.levels.map((l, i) => ({
            id: i, label: l.height ? `${l.height}p` : `Level ${i+1}`, bitrate: l.bitrate
          }))]
          setQualities(qs); setActiveQuality(-1)

          const at = hls.audioTracks || []
          if (at.length > 0) {
            setAudioTracks(at.map(t => ({ id: t.id, label: t.name || t.lang || `Track ${t.id}`, lang: t.lang || '' })))
            const defTrack = at.find(t => t.default) || at[0]
            setActiveAudio(defTrack ? defTrack.id : 0)
            hls.audioTrack = defTrack ? defTrack.id : 0
          }

          const st = hls.subtitleTracks || []
          setSubTracks([{ id: -1, label: 'Off' }, ...st.map((t, i) => ({ id: i, label: t.name || t.lang || `Sub ${i+1}` }))])
          setActiveSub(-1); hls.subtitleDisplay = false

          setLoadState('playing')
          setLoadProgress(100)
          video.play().catch(e => { if (e.name !== 'AbortError') setPlaying(false) })
        })

        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, d) => {
          setAudioTracks((d.audioTracks || []).map(t => ({ id: t.id, label: t.name || t.lang || `Track ${t.id}`, lang: t.lang || '' })))
        })
        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, d) => setActiveAudio(d.id))
        hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => setActiveQuality(hls.autoLevelEnabled ? -1 : d.level))
        hls.on(Hls.Events.ERROR, (_, d) => {
          if (!d.fatal) return
          if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
          else { setLoadState('error'); setErrorMsg('Fatal stream error. Try a different source.') }
        })
      } catch (e) {
        setLoadState('error')
        setErrorMsg(e.message)
      }
    }
  }, [])

  useEffect(() => {
    if (sources.length > 0 && sources[activeSource]) {
      loadSource(sources[activeSource])
    }
  }, [sources, activeSource, loadSource])

  useEffect(() => {
    return () => { if (hlsRef.current) hlsRef.current.destroy() }
  }, [])

  // ── Video event listeners (native mode only) ──────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay        = () => setPlaying(true)
    const onPause       = () => setPlaying(false)
    const onTimeUpdate  = () => {
      setCurrent(v.currentTime)
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
    }
    const onLoadedMeta  = () => {
      setDuration(v.duration); v.volume = volume
      if (!hlsRef.current && v.audioTracks?.length > 0) {
        setAudioTracks(Array.from(v.audioTracks).map((t, i) => ({ id: i, label: t.label || t.language || `Track ${i+1}`, lang: t.language || '' })))
        const defIdx = Array.from(v.audioTracks).findIndex(t => t.enabled)
        setActiveAudio(defIdx !== -1 ? defIdx : 0)
      }
    }
    const onDurationChange = () => setDuration(v.duration)
    const onVolumeChange   = () => { setVolume(v.volume); setMuted(v.muted) }
    const onWaiting        = () => setIsBuffering(true)
    const onPlayingE       = () => setIsBuffering(false)
    const onCanPlay        = () => setIsBuffering(false)
    const onError          = () => {
      if (v.error?.code === 4) {
        setLoadState('error')
        setErrorMsg('Format unsupported by browser. Please try a different source — the 🎵 embed sources support all languages.')
      }
    }
    v.addEventListener('play', onPlay);               v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTimeUpdate);   v.addEventListener('loadedmetadata', onLoadedMeta)
    v.addEventListener('durationchange', onDurationChange); v.addEventListener('volumechange', onVolumeChange)
    v.addEventListener('waiting', onWaiting);         v.addEventListener('playing', onPlayingE)
    v.addEventListener('canplay', onCanPlay);         v.addEventListener('error', onError)
    return () => {
      v.removeEventListener('play', onPlay);               v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTimeUpdate);   v.removeEventListener('loadedmetadata', onLoadedMeta)
      v.removeEventListener('durationchange', onDurationChange); v.removeEventListener('volumechange', onVolumeChange)
      v.removeEventListener('waiting', onWaiting);         v.removeEventListener('playing', onPlayingE)
      v.removeEventListener('canplay', onCanPlay);         v.removeEventListener('error', onError)
    }
  }, [volume])

  // Fullscreen
  useEffect(() => {
    const fn = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // Keyboard shortcuts (native mode only)
  useEffect(() => {
    const onKey = e => {
      if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return
      if (playerMode === 'iframe') return  // iframe handles its own keys
      const v = videoRef.current; if (!v) return
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); v.paused ? v.play() : v.pause() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); v.currentTime = Math.min(duration, v.currentTime + 10) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1) }
      else if (e.key === 'm') v.muted = !v.muted
      else if (e.key === 'f') toggleFs()
      resetHide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duration, playerMode, resetHide])

  // ── Controls ───────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current; if (!v || playerMode === 'iframe') return
    v.paused ? v.play() : v.pause(); resetHide()
  }
  const setVol = val => {
    const v = videoRef.current; if (!v) return
    const n = Math.max(0, Math.min(1, val)); v.volume = n
    if (n === 0) v.muted = true; else if (v.muted) v.muted = false
  }
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else containerRef.current?.requestFullscreen()
  }
  const seekTo = e => {
    if (playerMode === 'iframe') return
    const bar = seekTrackRef.current; if (!bar || !duration) return
    const { left, width } = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - left) / width))
    if (videoRef.current) videoRef.current.currentTime = pct * duration
    resetHide()
  }
  const switchAudio = aId => {
    const hls = hlsRef.current; const v = videoRef.current
    if (hls) { hls.audioTrack = aId; setActiveAudio(aId) }
    else if (v?.audioTracks) { for (let i = 0; i < v.audioTracks.length; i++) v.audioTracks[i].enabled = (i === aId); setActiveAudio(aId) }
  }
  const switchQuality = qId => {
    const hls = hlsRef.current; if (!hls) return
    hls.currentLevel = qId; hls.autoLevelEnabled = qId === -1; setActiveQuality(qId)
  }
  const switchSub = sId => {
    const hls = hlsRef.current; if (!hls) return
    if (sId === -1) { hls.subtitleDisplay = false; hls.subtitleTrack = -1 }
    else { hls.subtitleTrack = sId; hls.subtitleDisplay = true }
    setActiveSub(sId)
  }
  const setSpeedFn = r => { if (videoRef.current) videoRef.current.playbackRate = r; setSpeed(r) }

  const pctPlayed   = duration ? (current  / duration) * 100 : 0
  const pctBuffered = duration ? (buffered / duration) * 100 : 0
  const volPct      = muted ? 0 : volume * 100

  // ── UI Styles ──────────────────────────────────────────────────────────────
  const C = { bg: '#000', panelBg: '#1a1d21', panelBorder: '#2e3239', accent: '#1a98ff', textSec: '#8b8f97', hover: 'rgba(255,255,255,0.08)', active: 'rgba(255,255,255,0.12)' }
  const RadioCircle = ({ selected }) => (
    <div style={{ width:24, height:24, minWidth:24, border: `2px solid ${selected ? C.accent : C.textSec}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: selected ? C.accent : 'transparent', flexShrink: 0 }}>
      {selected && <div style={{width:8,height:8,background:'#fff',borderRadius:'50%'}}/>}
    </div>
  )
  const panelStyle = { position:'absolute', top:56, right:16, width:340, background:C.panelBg, borderRadius:8, overflow:'hidden', zIndex:100, boxShadow:'0 8px 32px rgba(0,0,0,0.8)' }
  const panelHeaderStyle = { display:'flex', alignItems:'center', padding:'16px 20px', borderBottom:`1px solid ${C.panelBorder}`, fontSize:16, fontWeight:600, gap:12 }
  const settingsRowStyle = { display:'flex', alignItems:'center', padding:'16px 20px', cursor:'pointer', borderBottom:`1px solid ${C.panelBorder}`, gap:16 }
  const rowLabelStyle = { flex:1, fontSize:15, fontWeight:500 }
  const rowValueStyle = { fontSize:14, color:C.textSec, display:'flex', alignItems:'center', gap:4 }
  const radioOptionStyle = { display:'flex', alignItems:'flex-start', padding:'14px 20px', cursor:'pointer', borderBottom:`1px solid ${C.panelBorder}`, gap:14 }

  const audioLabel   = audioTracks.find(t => t.id === activeAudio)?.label  || 'Auto'
  const qualityLabel = qualities.find(q => q.id === activeQuality)?.label  || 'Auto'
  const subLabel     = subTracks.find(s => s.id === activeSub)?.label      || 'Off'
  const speedLabel   = speed === 1 ? 'Normal' : `${speed}×`

  // Embed sources = those with type 'iframe', direct = native
  const embedSourceList  = sources.filter(s => s.type === 'iframe')
  const directSourceList = sources.filter(s => s.type === 'direct')
  const currentSrc = sources[activeSource]
  const isIframeMode = playerMode === 'iframe'

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHide}
      onTouchStart={resetHide}
      onClick={() => { if (!isIframeMode && loadState === 'playing') { togglePlay(); resetHide() } }}
      style={{ position:'fixed', inset:0, background:'#000', zIndex:100, display:'flex', flexDirection:'column', userSelect:'none', fontFamily:"'Amazon Ember','Arial',sans-serif" }}
    >
      {/* ── NATIVE VIDEO ── */}
      <video
        ref={videoRef}
        style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'contain', display: isIframeMode ? 'none' : 'block' }}
        playsInline
        autoPlay
      />

      {/* ── IFRAME EMBED (for multi-audio embed providers) ── */}
      {isIframeMode && currentEmbed && (
        <iframe
          ref={iframeRef}
          src={currentEmbed}
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', border:'none', zIndex:1 }}
          allowFullScreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          title="stream"
        />
      )}

      {/* ── LOADING OVERLAY ── */}
      <AnimatePresence>
        {loadState === 'loading' && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} style={{ position:'absolute', inset:0, zIndex:20, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:28, background:'#0a0d12', textAlign:'center', padding:'0 24px' }}>
            <div style={{position:'relative', width:72, height:72}}>
              <div style={{position:'absolute',inset:0,borderRadius:'50%',border:'3px solid rgba(255,255,255,0.05)'}}/>
              <motion.div animate={{ rotate: 360 }} transition={{ duration:0.9, repeat:Infinity, ease:'linear' }} style={{position:'absolute',inset:0,borderRadius:'50%',border:'3px solid transparent',borderTopColor:'#1a98ff'}}/>
              <motion.div animate={{ rotate: -360 }} transition={{ duration:1.5, repeat:Infinity, ease:'linear' }} style={{position:'absolute',inset:8,borderRadius:'50%',border:'2px solid transparent',borderTopColor:'rgba(255,255,255,0.15)'}}/>
            </div>
            <motion.div key={loadStep} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}>
              <p style={{color:'#fff', fontWeight:600, fontSize:14, letterSpacing:'0.02em'}}>{loadStep}</p>
            </motion.div>
            <div style={{width:200, height:3, background:'rgba(255,255,255,0.08)', borderRadius:2, overflow:'hidden'}}>
              <motion.div animate={{ width:`${loadProgress}%` }} style={{height:'100%', background:'linear-gradient(90deg,#1a98ff,#0070cc)', borderRadius:2}}/>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ERROR OVERLAY ── */}
      <AnimatePresence>
        {loadState === 'error' && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} style={{ position:'absolute', inset:0, zIndex:20, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20, background:'rgba(0,0,0,0.96)', textAlign:'center', padding:'0 24px' }}>
            <AlertCircle style={{width:52,height:52,color:'#ff4444'}}/>
            <div>
              <p style={{color:'#fff', fontSize:20, fontWeight:700, marginBottom:8}}>Stream Error</p>
              <p style={{color:'#888', fontSize:14, maxWidth:400}}>{errorMsg}</p>
            </div>
            <div style={{display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center'}}>
              {sources.length > 0 && (
                <button onClick={e => { e.stopPropagation(); setOpenPanel('sources'); setLoadState('playing') }} style={{ display:'flex', alignItems:'center', gap:8, background:'#1a98ff', color:'#fff', border:'none', padding:'10px 24px', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer' }}>
                  Try Different Source
                </button>
              )}
              <button onClick={e => { e.stopPropagation(); fetchSources() }} style={{ background:'rgba(255,255,255,0.1)', color:'#fff', border:'none', padding:'10px 24px', borderRadius:8, fontSize:14, fontWeight:700, cursor:'pointer' }}>
                <RefreshCw style={{width:16,height:16,display:'inline',marginRight:6}}/> Retry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CONTROLS OVERLAY ── */}
      {loadState !== 'error' && (
        <motion.div
          animate={{ opacity: showUI ? 1 : 0 }}
          style={{ position:'absolute', inset:0, zIndex:30, pointerEvents: showUI ? 'auto' : 'none' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Top gradient (only for native) */}
          {!isIframeMode && (
            <div style={{ position:'absolute', top:0, left:0, right:0, height:160, background:'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)', pointerEvents:'none' }}/>
          )}
          {/* Bottom gradient (only for native) */}
          {!isIframeMode && (
            <div style={{ position:'absolute', bottom:0, left:0, right:0, height:220, background:'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)', pointerEvents:'none' }}/>
          )}

          {/* Top bar */}
          <div style={{ position:'absolute', top:0, left:0, right:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', zIndex:10 }}>
            <div style={{display:'flex', alignItems:'center', gap:14}}>
              <button onClick={() => navigate(-1)} style={ICON_BTN}><IconClose/></button>
              <div>
                <p style={{fontSize:18, fontWeight:700, color:'#fff'}}>{title || 'Now Playing'}</p>
                {isIframeMode && (
                  <p style={{fontSize:11, color:'#00a8e1', marginTop:2, fontWeight:600}}>
                    🎵 Multi-Language Audio Available — Use player controls below
                  </p>
                )}
              </div>
            </div>

            <div style={{display:'flex', alignItems:'center', gap:4, position:'relative'}}>
              {/* CC and volume only for native mode */}
              {!isIframeMode && (
                <>
                  <button style={ICON_BTN} onClick={() => setOpenPanel(p => p === 'subtitles' ? null : 'subtitles')}><IconCC/></button>
                  <button style={ICON_BTN} onClick={() => setOpenPanel(p => p === 'volume' ? null : 'volume')}>
                    {(muted || volume === 0) ? <IconVolumeMute/> : <IconVolume/>}
                  </button>
                  <button style={ICON_BTN} onClick={() => { if (document.pictureInPictureEnabled && videoRef.current) videoRef.current.requestPictureInPicture() }}><IconPiP/></button>
                </>
              )}
              <button style={ICON_BTN} onClick={toggleFs}>{fullscreen ? <IconFullscreenExit/> : <IconFullscreen/>}</button>
              <button style={ICON_BTN} onClick={() => setOpenPanel(p => p === 'settings' ? null : 'settings')}><IconMore/></button>

              {/* ── SETTINGS PANEL ── */}
              <AnimatePresence>
                {openPanel === 'settings' && (
                  <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} style={panelStyle} onClick={e => e.stopPropagation()}>
                    <div style={panelHeaderStyle}>Settings</div>
                    <div style={settingsRowStyle} onClick={() => setOpenPanel('sources')}>
                      <IconServer/>
                      <span style={rowLabelStyle}>Stream Source</span>
                      <span style={rowValueStyle}>{currentSrc?.name?.substring(0,20) || 'Auto'} <IconChevronRight/></span>
                    </div>
                    {!isIframeMode && (
                      <>
                        <div style={settingsRowStyle} onClick={() => setOpenPanel('audio')}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:20,height:20}}><rect x="2" y="6" width="4" height="12" rx="1"/><rect x="8" y="3" width="4" height="18" rx="1"/><rect x="14" y="8" width="4" height="10" rx="1"/></svg>
                          <span style={rowLabelStyle}>Audio Language</span>
                          <span style={rowValueStyle}>{audioLabel} <IconChevronRight/></span>
                        </div>
                        <div style={settingsRowStyle} onClick={() => setOpenPanel('subtitles')}>
                          <IconCC/>
                          <span style={rowLabelStyle}>Subtitles</span>
                          <span style={rowValueStyle}>{subLabel} <IconChevronRight/></span>
                        </div>
                        <div style={settingsRowStyle} onClick={() => setOpenPanel('quality')}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:20,height:20}}><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="8" y1="20" x2="8" y2="22"/><line x1="16" y1="20" x2="16" y2="22"/><line x1="5" y1="22" x2="19" y2="22"/></svg>
                          <span style={rowLabelStyle}>Video Quality</span>
                          <span style={rowValueStyle}>{qualityLabel} <IconChevronRight/></span>
                        </div>
                        <div style={{...settingsRowStyle, borderBottom:'none'}} onClick={() => setOpenPanel('speed')}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:20,height:20}}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          <span style={rowLabelStyle}>Playback Speed</span>
                          <span style={rowValueStyle}>{speedLabel} <IconChevronRight/></span>
                        </div>
                      </>
                    )}
                    {isIframeMode && (
                      <div style={{padding:'16px 20px', borderBottom:'none'}}>
                        <p style={{fontSize:13, color:C.textSec, lineHeight:1.6}}>
                          🎵 <strong style={{color:'#fff'}}>Multi-language audio</strong> is available in the player below.<br/>
                          Use the audio/language button inside the video player to switch between Hindi, English, Tamil, Telugu, and more.
                        </p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── SOURCES PANEL ── */}
              <AnimatePresence>
                {openPanel === 'sources' && (
                  <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} style={panelStyle} onClick={e => e.stopPropagation()}>
                    <div style={panelHeaderStyle}>
                      <button style={{background:'none',border:'none',color:'#fff',cursor:'pointer'}} onClick={() => setOpenPanel('settings')}><IconChevronLeft/></button>
                      Select Source
                    </div>
                    <div style={{maxHeight:400, overflowY:'auto'}}>
                      {/* Embed sources section */}
                      {embedSourceList.length > 0 && (
                        <>
                          <div style={{padding:'10px 20px 6px', fontSize:11, fontWeight:700, color:C.textSec, letterSpacing:'0.08em', textTransform:'uppercase', background:'rgba(0,168,225,0.08)'}}>
                            🎵 Multi-Language Audio (Recommended)
                          </div>
                          {embedSourceList.map((s, i) => {
                            const globalIdx = sources.indexOf(s)
                            return (
                              <div key={i} style={{...radioOptionStyle, background: globalIdx === activeSource ? 'rgba(0,168,225,0.12)' : 'transparent'}} onClick={() => { setActiveSource(globalIdx); setOpenPanel(null) }}>
                                <RadioCircle selected={globalIdx === activeSource}/>
                                <div>
                                  <div style={{fontSize:14, fontWeight:600, color: globalIdx === activeSource ? '#00a8e1' : '#fff'}}>{s.name}</div>
                                  <div style={{fontSize:11, color:C.textSec, marginTop:2}}>Hindi · English · Tamil · Telugu + more</div>
                                </div>
                              </div>
                            )
                          })}
                        </>
                      )}
                      {/* Direct streams section */}
                      {directSourceList.length > 0 && (
                        <>
                          <div style={{padding:'10px 20px 6px', fontSize:11, fontWeight:700, color:C.textSec, letterSpacing:'0.08em', textTransform:'uppercase', borderTop:`1px solid ${C.panelBorder}`, background:'rgba(255,255,255,0.03)'}}>
                            📡 Direct Streams (Single Language)
                          </div>
                          {directSourceList.slice(0, 15).map((s, i) => {
                            const globalIdx = sources.indexOf(s)
                            return (
                              <div key={i} style={radioOptionStyle} onClick={() => { setActiveSource(globalIdx); setOpenPanel(null) }}>
                                <RadioCircle selected={globalIdx === activeSource}/>
                                <div style={{overflow:'hidden', flex:1}}>
                                  <div style={{fontSize:13, fontWeight:500, whiteSpace:'nowrap', textOverflow:'ellipsis', overflow:'hidden', color: globalIdx === activeSource ? '#fff' : '#ccc'}}>{s.name}</div>
                                </div>
                              </div>
                            )
                          })}
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── AUDIO SUB-PANEL ── */}
              <AnimatePresence>
                {openPanel === 'audio' && !isIframeMode && (
                  <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} style={panelStyle} onClick={e => e.stopPropagation()}>
                    <div style={panelHeaderStyle}><button style={{background:'none',border:'none',color:'#fff',cursor:'pointer'}} onClick={() => setOpenPanel('settings')}><IconChevronLeft/></button> Audio Language</div>
                    {audioTracks.length === 0
                      ? (
                        <div style={{padding:'20px'}}>
                          <p style={{color:C.textSec, fontSize:13, textAlign:'center', marginBottom:12}}>No alternate audio tracks in this stream.</p>
                          <p style={{color:'#00a8e1', fontSize:12, textAlign:'center'}}>💡 Switch to a 🎵 Multi-Language source above to get Hindi, Tamil, Telugu, and more!</p>
                        </div>
                      )
                      : audioTracks.map(t => (
                          <div key={t.id} style={radioOptionStyle} onClick={() => switchAudio(t.id)}>
                            <RadioCircle selected={t.id === activeAudio}/>
                            <div>
                              <div style={{fontSize:15, fontWeight:500}}>{t.label}</div>
                              {t.lang && <div style={{fontSize:12, color:C.textSec, marginTop:2}}>{t.lang.toUpperCase()}</div>}
                            </div>
                          </div>
                        ))
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── SUBTITLES SUB-PANEL ── */}
              <AnimatePresence>
                {openPanel === 'subtitles' && !isIframeMode && (
                  <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} style={panelStyle} onClick={e => e.stopPropagation()}>
                    <div style={panelHeaderStyle}><button style={{background:'none',border:'none',color:'#fff',cursor:'pointer'}} onClick={() => setOpenPanel('settings')}><IconChevronLeft/></button> Subtitles</div>
                    {subTracks.length <= 1
                      ? <p style={{color:C.textSec, fontSize:13, textAlign:'center', padding:'28px 20px'}}>No subtitles in this stream</p>
                      : subTracks.map(s => (
                          <div key={s.id} style={radioOptionStyle} onClick={() => switchSub(s.id)}>
                            <RadioCircle selected={s.id === activeSub}/><div style={{fontSize:15, fontWeight:500}}>{s.label}</div>
                          </div>
                        ))
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── QUALITY SUB-PANEL ── */}
              <AnimatePresence>
                {openPanel === 'quality' && !isIframeMode && (
                  <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} style={panelStyle} onClick={e => e.stopPropagation()}>
                    <div style={panelHeaderStyle}><button style={{background:'none',border:'none',color:'#fff',cursor:'pointer'}} onClick={() => setOpenPanel('settings')}><IconChevronLeft/></button> Video Quality</div>
                    {qualities.length === 0
                      ? <p style={{color:C.textSec, fontSize:13, textAlign:'center', padding:'28px 20px'}}>Quality options unavailable</p>
                      : qualities.map(q => (
                          <div key={q.id} style={radioOptionStyle} onClick={() => switchQuality(q.id)}>
                            <RadioCircle selected={q.id === activeQuality}/>
                            <div>
                              <div style={{fontSize:15, fontWeight:500}}>{q.label}</div>
                              {q.bitrate && <div style={{fontSize:12, color:C.textSec, marginTop:2}}>~{(q.bitrate / 1e6).toFixed(1)} Mbps</div>}
                            </div>
                          </div>
                        ))
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── SPEED SUB-PANEL ── */}
              <AnimatePresence>
                {openPanel === 'speed' && !isIframeMode && (
                  <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} style={panelStyle} onClick={e => e.stopPropagation()}>
                    <div style={panelHeaderStyle}><button style={{background:'none',border:'none',color:'#fff',cursor:'pointer'}} onClick={() => setOpenPanel('settings')}><IconChevronLeft/></button> Playback Speed</div>
                    {SPEEDS.map(r => (
                      <div key={r} style={radioOptionStyle} onClick={() => setSpeedFn(r)}>
                        <RadioCircle selected={r === speed}/><div style={{fontSize:15, fontWeight:500}}>{r === 1 ? 'Normal' : `${r}×`}</div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── VOLUME POPUP ── */}
              <AnimatePresence>
                {openPanel === 'volume' && !isIframeMode && (
                  <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }} style={{...panelStyle, width:240, padding:'16px 20px'}} onClick={e => e.stopPropagation()}>
                    <label style={{fontSize:14, color:C.textSec, display:'block', marginBottom:14}}>Volume</label>
                    <input type="range" min="0" max="100" step="1" value={volPct} onChange={e => setVol(parseInt(e.target.value) / 100)} style={{ width:'100%', WebkitAppearance:'none', appearance:'none', height:4, borderRadius:2, outline:'none', cursor:'pointer', background:`linear-gradient(to right, #fff ${volPct}%, rgba(255,255,255,0.3) ${volPct}%)` }}/>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── BOTTOM CONTROLS (native mode only) ── */}
          {!isIframeMode && (
            <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'0 0 28px 0', zIndex:10 }}>
              <div style={{ padding:'0 16px', marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
                <span style={{fontSize:13, color:'#fff', minWidth:45, letterSpacing:'0.02em'}}>{fmt(current)}</span>
                <div ref={seekTrackRef} onClick={e => { e.stopPropagation(); seekTo(e) }} style={{ flex:1, position:'relative', height:3, background:'rgba(255,255,255,0.3)', borderRadius:2, cursor:'pointer' }}>
                  <div style={{ position:'absolute', inset:'0 auto 0 0', width:`${pctBuffered}%`, background:'rgba(255,255,255,0.2)', borderRadius:2 }}/>
                  <div style={{ position:'absolute', inset:'0 auto 0 0', width:`${pctPlayed}%`, background:'#fff', borderRadius:2 }}>
                    <div style={{ position:'absolute', right:-5, top:'50%', transform:'translateY(-50%)', width:10, height:10, background:'#fff', borderRadius:'50%', boxShadow:'0 0 4px rgba(0,0,0,0.5)' }}/>
                  </div>
                </div>
                <span style={{fontSize:13, color:'#fff', minWidth:45, textAlign:'right', letterSpacing:'0.02em'}}>{fmt(duration)}</span>
              </div>
              <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:20}}>
                <button style={ICON_BTN} onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10); resetHide() }}><IconSkipBack/></button>
                <button onClick={e => { e.stopPropagation(); togglePlay() }} style={{ width:56, height:56, background:'rgba(255,255,255,0.95)', border:'none', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#000' }}>
                  <AnimatePresence mode="wait">
                    {playing
                      ? <motion.div key="p"  initial={{scale:0}} animate={{scale:1}} exit={{scale:0}} transition={{duration:0.15}}><IconPause/></motion.div>
                      : <motion.div key="pl" initial={{scale:0}} animate={{scale:1}} exit={{scale:0}} transition={{duration:0.15}}><IconPlay/></motion.div>
                    }
                  </AnimatePresence>
                </button>
                <button style={ICON_BTN} onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10); resetHide() }}><IconSkipFwd/></button>
              </div>
            </div>
          )}

          {/* ── IFRAME MODE: minimal bottom bar with source switcher hint ── */}
          {isIframeMode && (
            <div style={{ position:'absolute', bottom:0, left:0, right:0, padding:'12px 20px', zIndex:10, display:'flex', alignItems:'center', justifyContent:'center', gap:16 }}>
              <span style={{fontSize:12, color:'rgba(255,255,255,0.5)', background:'rgba(0,0,0,0.6)', padding:'6px 14px', borderRadius:20}}>
                🎵 Use the player's audio button to switch languages
              </span>
            </div>
          )}
        </motion.div>
      )}

      {/* ── Buffering spinner (native only) ── */}
      <AnimatePresence>
        {isBuffering && !isIframeMode && loadState === 'playing' && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} style={{ position:'absolute', inset:0, zIndex:15, display:'flex', alignItems:'center', justifyContent:'center', pointerEvents:'none' }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration:0.8, repeat:Infinity, ease:'linear' }} style={{ width:48, height:48, border:'3px solid rgba(255,255,255,0.1)', borderTopColor:'#fff', borderRadius:'50%' }}/>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
