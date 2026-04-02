// src/pages/Player.jsx
// ─────────────────────────────────────────────────────────────────────────────
// NETMIRROR REAL METHOD — How it actually works:
//
// NetMirror doesn't scrape raw HTML (pages are JS-rendered, scraping gets nothing).
// It uses TWO techniques in parallel:
//
// TECHNIQUE 1 — Direct JSON API endpoints:
//   Several providers expose undocumented REST APIs that return stream sources
//   as JSON directly. These bypass JS rendering entirely:
//     • vidsrc.icu/api  → returns sources array with m3u8 URLs
//     • vidzee API      → returns direct HLS link per server
//     • VITE_STREAM_API → your own backend proxy
//
// TECHNIQUE 2 — IFRAME + postMessage interception:
//   Embed players (vidlink.pro, vidsrc.icu, etc.) post stream data to the parent
//   window via window.postMessage. By loading the embed in a hidden iframe and
//   listening for these messages, we intercept the HLS m3u8 URL + audio tracks
//   before the player even renders. This is exactly what NetMirror's webview does.
//
// The result: ad-free HLS with multi-audio (Hindi/English/Tamil) via EXT-X-MEDIA,
// quality switching via hls.js ABR, and subtitles — exactly the NetMirror UX.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, AlertCircle, ChevronLeft, Settings } from 'lucide-react'

const BASE_URL   = 'https://api.themoviedb.org/3'
const API_KEY    = import.meta.env.VITE_TMDB_API_KEY
const STREAM_API = import.meta.env.VITE_STREAM_API

// Proxy helper — routes all stream fetches through /api/proxy
// which adds Referer/Origin headers and rewrites m3u8 segment URLs
const P = (url) => `/api/proxy?url=${encodeURIComponent(url)}`

// ── Load hls.js from CDN ──────────────────────────────────────────────────────
let _hlsProm = null
const loadHls = () => {
  if (_hlsProm) return _hlsProm
  _hlsProm = new Promise(resolve => {
    if (window.Hls) return resolve(window.Hls)
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js'
    s.onload = () => resolve(window.Hls)
    s.onerror = () => resolve(null)
    document.head.appendChild(s)
  })
  return _hlsProm
}

const fmt = s => {
  if (!s || isNaN(s) || s === Infinity) return '0:00'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

// ─────────────────────────────────────────────────────────────────────────────
// TECHNIQUE 1: JSON API Sources
// These providers have REST endpoints returning JSON — no JS rendering needed
// ─────────────────────────────────────────────────────────────────────────────
async function fetchJsonAPISources(tmdbId, mediaType, season, episode) {
  const isTV = mediaType === 'tv'
  const sources = []

  // ── VidZee API (fastest, reliable, multi-server) ──────────────────────────
  const vidzeeServers = [3, 4, 5, 1, 2]
  const vidzeeResults = await Promise.allSettled(
    vidzeeServers.map(async sr => {
      const url = isTV
        ? `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=${sr}&ss=${season}&ep=${episode}`
        : `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=${sr}`
      const res = await fetch(P(url), { signal: AbortSignal.timeout(7000) })
      if (!res.ok) return []
      const data = await res.json()
      const list = Array.isArray(data?.url) ? data.url : (data?.link ? [data] : [])
      return list.map(s => ({
        url: s?.link || s?.url,
        label: `VidZee S${sr} · ${s?.name || s?.quality || 'Auto'}`,
        provider: 'VidZee',
        headers: { Referer: 'https://core.vidzee.wtf/' }
      })).filter(s => s.url)
    })
  )
  for (const r of vidzeeResults) {
    if (r.status === 'fulfilled') sources.push(...r.value)
  }

  // ── VITE_STREAM_API backend (your apex-stream-api.onrender.com) ───────────
  if (STREAM_API) {
    try {
      const url = isTV
        ? `${STREAM_API}/api/stream?type=tv&id=${tmdbId}&season=${season}&episode=${episode}`
        : `${STREAM_API}/api/stream?type=movie&id=${tmdbId}`
      const res = await fetch(url, { signal: AbortSignal.timeout(12000) })
      if (res.ok) {
        const data = await res.json()
        const direct = data?.url || data?.stream || data?.m3u8 || data?.link
        if (direct) sources.push({ url: direct, label: 'Apex API · Primary', provider: 'ApexAPI', headers: {} })
        const list = data?.sources || data?.streams || []
        for (const src of (Array.isArray(list) ? list : [])) {
          const u = src?.url || src?.file || src?.stream
          if (u) sources.push({ url: u, label: `Apex API · ${src.quality || 'Auto'}`, provider: 'ApexAPI', headers: {} })
        }
      }
    } catch (_) {}
  }

  // ── vidsrc.icu AJAX API ───────────────────────────────────────────────────
  try {
    const apiUrl = isTV
      ? `https://vidsrc.icu/ajax/tv/sources/${tmdbId}/${season}/${episode}`
      : `https://vidsrc.icu/ajax/movie/sources/${tmdbId}`
    const res = await fetch(P(apiUrl), { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const text = await res.text()
      try {
        const data = JSON.parse(text)
        const list = data?.sources || data?.data || []
        for (const src of (Array.isArray(list) ? list : [])) {
          const url = src?.file || src?.url || src?.src
          if (url) sources.push({ url, label: `VidSrc ICU · ${src.quality || 'Auto'}`, provider: 'VidSrc ICU', headers: { Referer: 'https://vidsrc.icu/' } })
        }
      } catch (_) {}
    }
  } catch (_) {}

  return sources
}

// ─────────────────────────────────────────────────────────────────────────────
// TECHNIQUE 2: Embed URLs for iframe postMessage harvesting
// NetMirror loads these in a hidden webview and intercepts MEDIA_DATA events
// ─────────────────────────────────────────────────────────────────────────────
const getEmbedUrls = (tmdbId, mediaType, season, episode) => {
  const isTV = mediaType === 'tv'
  return [
    {
      name: 'VidLink',
      url: isTV
        ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}?multiLang=1&primaryColor=00a8e1`
        : `https://vidlink.pro/movie/${tmdbId}?multiLang=1&primaryColor=00a8e1`,
    },
    {
      name: 'VidSrc ICU',
      url: isTV
        ? `https://vidsrc.icu/embed/tv/${tmdbId}/${season}/${episode}`
        : `https://vidsrc.icu/embed/movie/${tmdbId}`,
    },
    {
      name: 'VidSrc XYZ',
      url: isTV
        ? `https://vidsrc.xyz/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`
        : `https://vidsrc.xyz/embed/movie?tmdb=${tmdbId}`,
    },
    {
      name: 'AutoEmbed',
      url: isTV
        ? `https://autoembed.cc/tv/tmdb/${tmdbId}-${season}-${episode}`
        : `https://autoembed.cc/movie/tmdb/${tmdbId}`,
    },
    {
      name: '2Embed',
      url: isTV
        ? `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}`
        : `https://www.2embed.cc/embed/${tmdbId}`,
    },
    {
      name: 'MultiEmbed',
      url: isTV
        ? `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`
        : `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
    },
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// IFRAME HARVESTER COMPONENT
// Loads embed iframes invisibly, listens for postMessage stream data
// This mimics what NetMirror's Android WebView does to intercept streams
// ─────────────────────────────────────────────────────────────────────────────
function IframeHarvester({ embedUrls, onSource, onDone }) {
  const seenRef = useRef(new Set())
  const timerRef = useRef(null)

  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const data = event.data
        if (!data || typeof data !== 'object') return

        // vidlink.pro: { type: 'MEDIA_DATA', data: { sources: [{file, label}], tracks: [...] } }
        if (data.type === 'MEDIA_DATA' || data.type === 'sourceData' || data.type === 'stream') {
          const payload = data.data || data
          const srcList = payload?.sources || payload?.streams || payload?.stream || []
          const items = Array.isArray(srcList) ? srcList : [srcList]
          for (const src of items) {
            if (!src) continue
            const url = src?.file || src?.url || src?.src || src?.stream || (typeof src === 'string' ? src : null)
            if (url && !seenRef.current.has(url) && (url.includes('m3u8') || url.includes('mp4'))) {
              seenRef.current.add(url)
              onSource({ url, label: `${data.type === 'MEDIA_DATA' ? 'VidLink' : 'Embed'} · ${src.label || src.quality || 'HLS'}`, provider: data.type === 'MEDIA_DATA' ? 'VidLink' : 'Embed', headers: {} })
            }
          }
          // Also check for direct url in payload
          const direct = payload?.url || payload?.m3u8 || payload?.hls
          if (direct && !seenRef.current.has(direct)) {
            seenRef.current.add(direct)
            onSource({ url: direct, label: 'Embed · Direct', provider: 'Embed', headers: {} })
          }
        }

        // Generic stream data shapes used by various players
        const candidates = [data.stream, data.url, data.m3u8, data.file, data.src, data.link]
        for (const url of candidates) {
          if (url && typeof url === 'string' && !seenRef.current.has(url) && (url.includes('m3u8') || url.includes('mp4'))) {
            seenRef.current.add(url)
            onSource({ url, label: 'Embed · Stream', provider: 'Embed', headers: {} })
          }
        }
      } catch (_) {}
    }

    window.addEventListener('message', handleMessage)
    timerRef.current = setTimeout(() => { onDone?.() }, 22000)
    return () => {
      window.removeEventListener('message', handleMessage)
      clearTimeout(timerRef.current)
    }
  }, [onSource, onDone])

  return (
    <div aria-hidden="true" style={{ position: 'fixed', left: -9999, top: -9999, width: 1, height: 1, overflow: 'hidden', pointerEvents: 'none', opacity: 0 }}>
      {embedUrls.map((embed, i) => (
        <iframe
          key={`${embed.name}-${i}`}
          src={embed.url}
          title={embed.name}
          allow="autoplay; fullscreen; encrypted-media"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
          style={{ width: 640, height: 360, border: 'none' }}
        />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────────────────────────────────────
const Ico = {
  Play:   () => <svg viewBox="0 0 24 24" fill="currentColor" width={22} height={22}><polygon points="6,3 20,12 6,21"/></svg>,
  Pause:  () => <svg viewBox="0 0 24 24" fill="currentColor" width={22} height={22}><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>,
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
  Vol:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width={20} height={20}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
  VolX: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width={20} height={20}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>,
  Fs:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width={20} height={20}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>,
  FsX:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width={20} height={20}><polyline points="8 3 3 3 3 8"/><polyline points="21 8 21 3 16 3"/><polyline points="3 16 3 21 8 21"/><polyline points="16 21 21 21 21 16"/></svg>,
  PiP:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" width={20} height={20}><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/></svg>,
  ChevR:() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width={13} height={13}><polyline points="9 18 15 12 9 6"/></svg>,
  ChevL:() => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width={17} height={17}><polyline points="15 18 9 12 15 6"/></svg>,
}

const BTN = { background: 'none', border: 'none', color: 'rgba(255,255,255,0.85)', cursor: 'pointer', padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PLAYER
// ─────────────────────────────────────────────────────────────────────────────
export default function Player() {
  const { type = 'movie', id } = useParams()
  const navigate = useNavigate()

  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const seekRef      = useRef(null)
  const hideTimer    = useRef(null)
  const sourcesRef   = useRef([])

  const [title,       setTitle]       = useState('')
  const [season]  = useState(1)
  const [episode] = useState(1)
  const [playing,     setPlaying]     = useState(false)
  const [muted,       setMuted]       = useState(false)
  const [volume,      setVolume]      = useState(0.9)
  const [current,     setCurrent]     = useState(0)
  const [duration,    setDuration]    = useState(0)
  const [buffered,    setBuffered]    = useState(0)
  const [fullscreen,  setFullscreen]  = useState(false)
  const [speed,       setSpeed]       = useState(1)
  const [isBuffering, setIsBuffering] = useState(false)
  const [audioTracks, setAudioTracks] = useState([])
  const [activeAudio, setActiveAudio] = useState(-1)
  const [qualities,   setQualities]   = useState([])
  const [activeQuality,setActiveQuality]=useState(-1)
  const [subTracks,   setSubTracks]   = useState([])
  const [activeSub,   setActiveSub]   = useState(-1)
  const [sources,     setSources]     = useState([])
  const [activeSource,setActiveSource]= useState(0)
  const [loadState,   setLoadState]   = useState('loading')
  const [errorMsg,    setErrorMsg]    = useState('')
  const [loadStep,    setLoadStep]    = useState('Initializing…')
  const [loadPct,     setLoadPct]     = useState(0)
  const [embedUrls,   setEmbedUrls]   = useState([])
  const [harvesting,  setHarvesting]  = useState(false)
  const [showUI,      setShowUI]      = useState(true)
  const [openPanel,   setOpenPanel]   = useState(null)

  // Fetch title
  useEffect(() => {
    fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}`)
      .then(r => r.json()).then(d => setTitle(d.title || d.name || ''))
      .catch(() => {})
  }, [type, id])

  // Hide controls timer
  const resetHide = useCallback(() => {
    setShowUI(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { setShowUI(false); setOpenPanel(null) }, 4000)
  }, [])
  useEffect(() => { resetHide(); return () => clearTimeout(hideTimer.current) }, [resetHide])

  // Add source (deduped)
  const addSource = useCallback((src) => {
    if (!src?.url) return
    if (sourcesRef.current.some(s => s.url === src.url)) return
    sourcesRef.current = [...sourcesRef.current, src]
    setSources([...sourcesRef.current])
    // Switch to playing state on very first source
    if (sourcesRef.current.length === 1) {
      setLoadState('playing')
      setLoadPct(100)
    }
  }, [])

  // ── Main discovery engine ──────────────────────────────────────────────────
  const discover = useCallback(async () => {
    setLoadState('loading')
    setLoadPct(5)
    setLoadStep('Starting stream discovery…')
    setSources([])
    sourcesRef.current = []
    setActiveSource(0)
    setHarvesting(false)
    setEmbedUrls([])

    // STEP 1 — JSON APIs (fastest, no browser needed)
    setLoadStep('Querying stream APIs…')
    setLoadPct(20)
    try {
      const apiSources = await fetchJsonAPISources(id, type, season, episode)
      for (const src of apiSources) addSource(src)
      if (apiSources.length > 0) setLoadStep(`${apiSources.length} stream(s) via API — loading…`)
    } catch (_) {}

    setLoadPct(60)

    // STEP 2 — Iframe postMessage harvesting (runs in parallel)
    const urls = getEmbedUrls(id, type, season, episode)
    setEmbedUrls(urls)
    setHarvesting(true)
    setLoadStep(sourcesRef.current.length > 0 ? 'Background: harvesting more sources…' : 'Harvesting from embed players…')
    setLoadPct(75)

    // If Step 1 gave us sources, show player now
    if (sourcesRef.current.length > 0) {
      setLoadState('playing')
      setLoadPct(100)
    }

    // Timeout: if still nothing after 28 seconds total, show error
    const failTimer = setTimeout(() => {
      setHarvesting(false)
      if (sourcesRef.current.length === 0) {
        setLoadState('error')
        setErrorMsg('No streams found across all providers. All sources may be rate-limited or unavailable. Please retry in a moment.')
      }
    }, 28000)

    return () => clearTimeout(failTimer)
  }, [id, type, season, episode, addSource])

  useEffect(() => { discover() }, [discover])

  // ── HLS playback ──────────────────────────────────────────────────────────
  const loadVideo = useCallback(async (stream) => {
    if (!stream?.url) return
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    const video = videoRef.current
    if (!video) return
    video.pause(); video.removeAttribute('src'); video.load()
    setIsBuffering(true)
    setAudioTracks([]); setActiveAudio(-1)
    setQualities([]);   setActiveQuality(-1)
    setSubTracks([]);   setActiveSub(-1)

    const Hls = await loadHls()
    const isHLS = /\.m3u8/i.test(stream.url) || stream.url.includes('m3u8')
    // All HLS goes through proxy — this ensures the proxy rewrites ALL
    // segment/key/subtitle URLs inside the manifest with correct Referer headers
    const playUrl = isHLS ? P(stream.url) : stream.url

    if (!Hls || !Hls.isSupported()) {
      video.src = playUrl
      video.play().catch(() => {})
      return
    }

    const hls = new Hls({
      enableWorker: true,
      startLevel: -1,
      backBufferLength: 90,
      maxBufferLength: 60,
      maxMaxBufferLength: 600,
      manifestLoadingMaxRetry: 5,
      levelLoadingMaxRetry: 4,
      fragLoadingMaxRetry: 6,
      xhrSetup: xhr => { xhr.withCredentials = false },
    })
    hlsRef.current = hls
    hls.attachMedia(video)
    hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(playUrl))

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      // Quality levels
      setQualities([
        { id: -1, label: 'Auto' },
        ...data.levels
          .map((l, i) => ({ id: i, label: l.height ? `${l.height}p` : `Level ${i + 1}`, bitrate: l.bitrate }))
          .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
      ])
      setActiveQuality(-1)

      // Audio tracks — the NetMirror multi-language feature
      // HLS EXT-X-MEDIA TYPE=AUDIO gives us Hindi / English / Tamil etc.
      const at = hls.audioTracks || []
      if (at.length > 0) {
        const tracks = at.map(t => ({ id: t.id, label: t.name || t.lang || `Track ${t.id + 1}`, lang: t.lang || '' }))
        setAudioTracks(tracks)
        const eng = at.find(t => /^en/i.test(t.lang) || /english/i.test(t.name))
        const pick = eng || at.find(t => t.default) || at[0]
        if (pick) { hls.audioTrack = pick.id; setActiveAudio(pick.id) }
      }

      // Subtitle tracks
      const st = hls.subtitleTracks || []
      setSubTracks([{ id: -1, label: 'Off' }, ...st.map((t, i) => ({ id: i, label: t.name || t.lang || `Sub ${i + 1}` }))])
      setActiveSub(-1)
      if (hls.subtitleDisplay !== undefined) hls.subtitleDisplay = false

      video.volume = volume
      video.play().catch(() => {})
    })

    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, d) =>
      setAudioTracks((d.audioTracks || []).map(t => ({ id: t.id, label: t.name || t.lang || `Track ${t.id + 1}`, lang: t.lang || '' })))
    )
    hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, d) => setActiveAudio(d.id))
    hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => setActiveQuality(hls.autoLevelEnabled ? -1 : d.level))

    hls.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) return
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad()
      } else {
        // Auto-try next source
        const next = activeSource + 1
        if (next < sourcesRef.current.length) setActiveSource(next)
      }
    })
  }, [volume, activeSource])

  useEffect(() => {
    if (sources.length > 0 && sources[activeSource] && loadState === 'playing') {
      loadVideo(sources[activeSource])
    }
  }, [sources, activeSource, loadState, loadVideo])

  useEffect(() => () => { if (hlsRef.current) hlsRef.current.destroy() }, [])

  // Video events
  useEffect(() => {
    const v = videoRef.current; if (!v) return
    const h = {
      play:           () => setPlaying(true),
      pause:          () => setPlaying(false),
      timeupdate:     () => { setCurrent(v.currentTime); if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1)) },
      loadedmetadata: () => { setDuration(v.duration); v.volume = volume },
      volumechange:   () => { setVolume(v.volume); setMuted(v.muted) },
      waiting:        () => setIsBuffering(true),
      playing:        () => setIsBuffering(false),
      canplay:        () => setIsBuffering(false),
      error:          () => { const next = activeSource + 1; if (next < sourcesRef.current.length) setActiveSource(next) },
    }
    Object.entries(h).forEach(([e, fn]) => v.addEventListener(e, fn))
    return () => Object.entries(h).forEach(([e, fn]) => v.removeEventListener(e, fn))
  }, [volume, activeSource])

  // Fullscreen
  useEffect(() => {
    const fn = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // Keyboard
  useEffect(() => {
    const onKey = e => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      const v = videoRef.current; if (!v) return
      const map = {
        ' ':          () => { e.preventDefault(); v.paused ? v.play() : v.pause() },
        'k':          () => { v.paused ? v.play() : v.pause() },
        'ArrowRight': () => { e.preventDefault(); v.currentTime = Math.min(duration, v.currentTime + 10) },
        'ArrowLeft':  () => { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10) },
        'ArrowUp':    () => { e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1) },
        'ArrowDown':  () => { e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1) },
        'm':          () => { v.muted = !v.muted },
        'f':          () => { document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.requestFullscreen() },
      }
      map[e.key]?.(); resetHide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duration, resetHide])

  // Controls
  const togglePlay = () => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); resetHide() }
  const toggleFs   = () => document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.requestFullscreen()
  const setVol     = val => {
    const v = videoRef.current; if (!v) return
    const n = Math.max(0, Math.min(1, val)); v.volume = n
    if (n === 0) v.muted = true; else if (v.muted) v.muted = false
  }
  const onSeek = e => {
    e.stopPropagation()
    const bar = seekRef.current; if (!bar || !duration) return
    const { left, width } = bar.getBoundingClientRect()
    if (videoRef.current) videoRef.current.currentTime = Math.max(0, Math.min(1, (e.clientX - left) / width)) * duration
    resetHide()
  }
  const switchAudio   = id  => { const h = hlsRef.current; if (h) { h.audioTrack = id; setActiveAudio(id) } setOpenPanel(null) }
  const switchQuality = qid => { const h = hlsRef.current; if (!h) return; h.currentLevel = qid; h.autoLevelEnabled = qid === -1; setActiveQuality(qid); setOpenPanel(null) }
  const switchSub     = sid => {
    const h = hlsRef.current; if (!h) return
    if (sid === -1) { h.subtitleDisplay = false; h.subtitleTrack = -1 } else { h.subtitleTrack = sid; h.subtitleDisplay = true }
    setActiveSub(sid); setOpenPanel(null)
  }
  const setSpeedFn = r => { if (videoRef.current) videoRef.current.playbackRate = r; setSpeed(r); setOpenPanel(null) }

  // Derived
  const pctPlayed   = duration ? (current  / duration) * 100 : 0
  const pctBuffered = duration ? (buffered / duration) * 100 : 0
  const volPct      = muted ? 0 : volume * 100
  const audioLabel  = audioTracks.find(t => t.id === activeAudio)?.label  || 'Default'
  const qualLabel   = qualities.find(q => q.id === activeQuality)?.label   || 'Auto'
  const subLabel    = subTracks.find(s => s.id === activeSub)?.label       || 'Off'
  const speedLabel  = speed === 1 ? 'Normal' : `${speed}×`

  const panelBase = { position: 'absolute', top: 60, right: 16, width: 300, background: 'rgba(10,13,18,0.97)', borderRadius: 10, overflow: 'hidden', zIndex: 100, boxShadow: '0 12px 40px rgba(0,0,0,0.9),0 0 0 1px rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }
  const rowStyle  = { display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.15s' }
  const Dot = ({ on }) => (
    <div style={{ width: 20, height: 20, minWidth: 20, borderRadius: '50%', border: `2px solid ${on ? '#00a8e1' : 'rgba(255,255,255,0.3)'}`, background: on ? '#00a8e1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {on && <div style={{ width: 7, height: 7, background: '#fff', borderRadius: '50%' }}/>}
    </div>
  )
  const PanelHead = ({ label, back }) => (
    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }} onClick={() => setOpenPanel(back)}><Ico.ChevL/></button>
      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{label}</span>
    </div>
  )

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHide}
      onTouchStart={resetHide}
      onClick={() => { if (loadState === 'playing') togglePlay() }}
      style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 100, display: 'flex', flexDirection: 'column', userSelect: 'none', fontFamily: "'Amazon Ember','SF Pro Display','Segoe UI',Arial,sans-serif", cursor: showUI ? 'default' : 'none' }}
    >
      {/* Hidden iframe harvester (postMessage interception) */}
      {harvesting && embedUrls.length > 0 && (
        <IframeHarvester
          embedUrls={embedUrls}
          onSource={addSource}
          onDone={() => setHarvesting(false)}
        />
      )}

      {/* VIDEO ELEMENT */}
      <video
        ref={videoRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
        playsInline autoPlay
      />

      {/* BUFFERING */}
      <AnimatePresence>
        {isBuffering && loadState === 'playing' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              style={{ width: 48, height: 48, borderRadius: '50%', border: '3px solid transparent', borderTopColor: '#00a8e1' }}/>
          </motion.div>
        )}
      </AnimatePresence>

      {/* LOADING OVERLAY */}
      <AnimatePresence>
        {loadState === 'loading' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, background: 'linear-gradient(135deg,#060b14,#0a0d1a)', textAlign: 'center', padding: '0 24px' }}>
            <div style={{ position: 'relative', width: 80, height: 80 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid rgba(0,168,225,0.12)' }}/>
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid transparent', borderTopColor: '#00a8e1' }}/>
              <motion.div animate={{ rotate: -360 }} transition={{ duration: 1.7, repeat: Infinity, ease: 'linear' }}
                style={{ position: 'absolute', inset: 10, borderRadius: '50%', border: '2px solid transparent', borderTopColor: 'rgba(0,168,225,0.35)' }}/>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="#00a8e1" width={24} height={24}><polygon points="8,5 20,12 8,19"/></svg>
              </div>
            </div>
            <div>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{title || 'Finding streams…'}</p>
              <motion.p key={loadStep} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0 }}>{loadStep}</motion.p>
            </div>
            <div style={{ width: 220, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <motion.div animate={{ width: `${loadPct}%` }} transition={{ duration: 0.4, ease: 'easeOut' }}
                style={{ height: '100%', background: 'linear-gradient(90deg,#00a8e1,#007fbf)', borderRadius: 2 }}/>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', maxWidth: 340 }}>
              {['VidZee API', 'VidLink', 'VidSrc ICU', 'AutoEmbed', '2Embed', 'MultiEmbed'].map(p => (
                <span key={p} style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255,255,255,0.08)', padding: '3px 8px', borderRadius: 4, fontWeight: 600 }}>{p}</span>
              ))}
            </div>
            {sources.length > 0 && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                style={{ background: 'rgba(0,168,225,0.1)', border: '1px solid rgba(0,168,225,0.2)', borderRadius: 8, padding: '8px 16px', fontSize: 13, color: '#00a8e1', fontWeight: 600 }}>
                ✓ {sources.length} stream{sources.length !== 1 ? 's' : ''} found
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ERROR OVERLAY */}
      <AnimatePresence>
        {loadState === 'error' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, background: 'rgba(0,0,0,0.96)', textAlign: 'center', padding: '0 24px' }}>
            <AlertCircle style={{ width: 52, height: 52, color: '#ff4455' }}/>
            <div>
              <p style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Stream Unavailable</p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, maxWidth: 400, margin: '0 auto' }}>{errorMsg}</p>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              {sources.length > 0 && (
                <button onClick={e => { e.stopPropagation(); setOpenPanel('sources'); setLoadState('playing') }}
                  style={{ background: '#00a8e1', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Try Another Source
                </button>
              )}
              <button onClick={e => { e.stopPropagation(); discover() }}
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                <RefreshCw style={{ width: 15, height: 15 }}/> Retry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONTROLS OVERLAY */}
      {loadState !== 'error' && (
        <motion.div animate={{ opacity: showUI ? 1 : 0 }} transition={{ duration: 0.25 }}
          style={{ position: 'absolute', inset: 0, zIndex: 30, pointerEvents: showUI ? 'auto' : 'none' }}
          onClick={e => e.stopPropagation()}>

          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160, background: 'linear-gradient(to bottom,rgba(0,0,0,0.85),transparent)', pointerEvents: 'none' }}/>
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 200, background: 'linear-gradient(to top,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.5) 60%,transparent 100%)', pointerEvents: 'none' }}/>

          {/* TOP BAR */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => navigate(-1)} style={{ ...BTN, padding: 8 }}><ChevronLeft style={{ width: 22, height: 22 }}/></button>
              <div>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0, lineHeight: 1.2 }}>{title || 'Now Playing'}</p>
                {sources[activeSource] && (
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, margin: 0, marginTop: 2 }}>
                    {sources[activeSource].provider} · {sources.length} source{sources.length !== 1 ? 's' : ''}
                    {audioTracks.length > 1 && ` · ${audioTracks.length} audio`}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
              {audioTracks.length > 1 && (
                <button style={{ ...BTN, fontSize: 11, fontWeight: 700, color: '#00a8e1', padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(0,168,225,0.3)', background: 'rgba(0,168,225,0.08)' }}
                  onClick={() => setOpenPanel(p => p === 'audio' ? null : 'audio')}>
                  🎵 {audioLabel}
                </button>
              )}
              {document.pictureInPictureEnabled && <button style={BTN} onClick={() => videoRef.current?.requestPictureInPicture()}><Ico.PiP/></button>}
              <button style={BTN} onClick={toggleFs}>{fullscreen ? <Ico.FsX/> : <Ico.Fs/>}</button>
              <button style={BTN} onClick={() => setOpenPanel(p => p === 'settings' ? null : 'settings')}><Settings style={{ width: 20, height: 20 }}/></button>

              {/* SETTINGS */}
              <AnimatePresence>
                {openPanel === 'settings' && (
                  <motion.div initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ duration: 0.18 }} style={panelBase} onClick={e => e.stopPropagation()}>
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 15, fontWeight: 700, color: '#fff' }}>Settings</div>
                    {[
                      { key: 'sources',  label: 'Source',   value: `${sources[activeSource]?.provider || '—'} (${activeSource+1}/${sources.length})`, icon: '📡', badge: sources.length > 1 ? `${sources.length}` : null },
                      { key: 'audio',    label: 'Audio',    value: audioLabel,  icon: '🎵', badge: audioTracks.length > 1 ? `${audioTracks.length} langs` : null },
                      { key: 'quality',  label: 'Quality',  value: qualLabel,   icon: '📺' },
                      { key: 'subs',     label: 'Subtitles',value: subLabel,    icon: '💬' },
                      { key: 'speed',    label: 'Speed',    value: speedLabel,  icon: '⚡' },
                    ].map(row => (
                      <div key={row.key} style={rowStyle} onClick={() => setOpenPanel(row.key)}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
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

              {/* SOURCES */}
              <AnimatePresence>
                {openPanel === 'sources' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={panelBase} onClick={e => e.stopPropagation()}>
                    <PanelHead label="Stream Source" back="settings"/>
                    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                      {sources.map((s, i) => (
                        <div key={i} style={{ ...rowStyle, gap: 12, background: i === activeSource ? 'rgba(0,168,225,0.08)' : 'transparent' }}
                          onClick={() => { setActiveSource(i); setOpenPanel(null) }}
                          onMouseEnter={e => { if (i !== activeSource) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                          onMouseLeave={e => { if (i !== activeSource) e.currentTarget.style.background = 'transparent' }}>
                          <Dot on={i === activeSource}/>
                          <div style={{ overflow: 'hidden', flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: i === activeSource ? '#00a8e1' : '#ddd', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{s.url.includes('m3u8') ? 'HLS · Multi-Audio' : 'Direct'} · {s.provider}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* AUDIO */}
              <AnimatePresence>
                {openPanel === 'audio' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={panelBase} onClick={e => e.stopPropagation()}>
                    <PanelHead label="Audio Language" back="settings"/>
                    {audioTracks.length === 0
                      ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '24px 20px', textAlign: 'center' }}>No alternate audio tracks.<br/><span style={{ fontSize: 11, display: 'block', marginTop: 6 }}>Try switching to a VidZee or MultiEmbed source.</span></p>
                      : audioTracks.map(t => (
                        <div key={t.id} style={{ ...rowStyle, gap: 12, background: t.id === activeAudio ? 'rgba(0,168,225,0.08)' : 'transparent' }}
                          onClick={() => switchAudio(t.id)}
                          onMouseEnter={e => { if (t.id !== activeAudio) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                          onMouseLeave={e => { if (t.id !== activeAudio) e.currentTarget.style.background = 'transparent' }}>
                          <Dot on={t.id === activeAudio}/>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: t.id === activeAudio ? '#00a8e1' : '#e0e0e0' }}>{t.label}</div>
                            {t.lang && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{t.lang.toUpperCase()}</div>}
                          </div>
                        </div>
                      ))
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* QUALITY */}
              <AnimatePresence>
                {openPanel === 'quality' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={panelBase} onClick={e => e.stopPropagation()}>
                    <PanelHead label="Video Quality" back="settings"/>
                    {qualities.length === 0
                      ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '24px 20px', textAlign: 'center' }}>Quality levels loading…</p>
                      : qualities.map(q => (
                        <div key={q.id} style={{ ...rowStyle, gap: 12, background: q.id === activeQuality ? 'rgba(0,168,225,0.08)' : 'transparent' }}
                          onClick={() => switchQuality(q.id)}
                          onMouseEnter={e => { if (q.id !== activeQuality) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                          onMouseLeave={e => { if (q.id !== activeQuality) e.currentTarget.style.background = 'transparent' }}>
                          <Dot on={q.id === activeQuality}/>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: q.id === activeQuality ? '#00a8e1' : '#e0e0e0' }}>{q.label}</div>
                            {q.bitrate && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>~{(q.bitrate/1e6).toFixed(1)} Mbps</div>}
                          </div>
                        </div>
                      ))
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* SUBTITLES */}
              <AnimatePresence>
                {openPanel === 'subs' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={panelBase} onClick={e => e.stopPropagation()}>
                    <PanelHead label="Subtitles" back="settings"/>
                    {subTracks.length <= 1
                      ? <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '24px 20px', textAlign: 'center' }}>No embedded subtitles in this stream.</p>
                      : subTracks.map(s => (
                        <div key={s.id} style={{ ...rowStyle, gap: 12, background: s.id === activeSub ? 'rgba(0,168,225,0.08)' : 'transparent' }}
                          onClick={() => switchSub(s.id)}
                          onMouseEnter={e => { if (s.id !== activeSub) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                          onMouseLeave={e => { if (s.id !== activeSub) e.currentTarget.style.background = 'transparent' }}>
                          <Dot on={s.id === activeSub}/>
                          <div style={{ fontSize: 14, fontWeight: 500, color: s.id === activeSub ? '#00a8e1' : '#e0e0e0' }}>{s.label}</div>
                        </div>
                      ))
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* SPEED */}
              <AnimatePresence>
                {openPanel === 'speed' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={panelBase} onClick={e => e.stopPropagation()}>
                    <PanelHead label="Playback Speed" back="settings"/>
                    {SPEEDS.map(r => (
                      <div key={r} style={{ ...rowStyle, gap: 12, background: r === speed ? 'rgba(0,168,225,0.08)' : 'transparent' }}
                        onClick={() => setSpeedFn(r)}
                        onMouseEnter={e => { if (r !== speed) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { if (r !== speed) e.currentTarget.style.background = 'transparent' }}>
                        <Dot on={r === speed}/>
                        <div style={{ fontSize: 14, fontWeight: 500, color: r === speed ? '#00a8e1' : '#e0e0e0' }}>{r === 1 ? 'Normal' : `${r}×`}</div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* BOTTOM CONTROLS */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 0 28px 0', zIndex: 10 }}>
            {/* Seek */}
            <div style={{ padding: '0 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', minWidth: 42 }}>{fmt(current)}</span>
              <div ref={seekRef} onClick={onSeek}
                style={{ flex: 1, position: 'relative', height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, cursor: 'pointer' }}
                onMouseEnter={e => { const t = e.currentTarget.querySelector('.tk'); if (t) t.style.opacity = '1' }}
                onMouseLeave={e => { const t = e.currentTarget.querySelector('.tk'); if (t) t.style.opacity = '0' }}>
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pctBuffered}%`, background: 'rgba(255,255,255,0.18)', borderRadius: 2 }}/>
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pctPlayed}%`, background: '#00a8e1', borderRadius: 2 }}>
                  <div className="tk" style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, background: '#fff', borderRadius: '50%', boxShadow: '0 0 6px rgba(0,0,0,0.5)', opacity: 0, transition: 'opacity 0.15s' }}/>
                </div>
              </div>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', minWidth: 42, textAlign: 'right' }}>{fmt(duration)}</span>
            </div>

            {/* Playback */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <button style={BTN} onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10) }}><Ico.Back10/></button>
              <button onClick={e => { e.stopPropagation(); togglePlay() }}
                style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#000', transition: 'transform 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                <AnimatePresence mode="wait">
                  {playing
                    ? <motion.div key="p" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.12 }}><Ico.Pause/></motion.div>
                    : <motion.div key="pl" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.12 }}><Ico.Play/></motion.div>
                  }
                </AnimatePresence>
              </button>
              <button style={BTN} onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10) }}><Ico.Fwd10/></button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
                <button style={BTN} onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.muted = !videoRef.current.muted }}>
                  {(muted || volume === 0) ? <Ico.VolX/> : <Ico.Vol/>}
                </button>
                <input type="range" min="0" max="100" step="1" value={Math.round(volPct)}
                  onChange={e => { e.stopPropagation(); setVol(parseInt(e.target.value) / 100) }}
                  style={{ width: 70, WebkitAppearance: 'none', appearance: 'none', height: 3, borderRadius: 2, outline: 'none', cursor: 'pointer', background: `linear-gradient(to right, #00a8e1 ${volPct}%, rgba(255,255,255,0.2) ${volPct}%)` }}/>
              </div>
            </div>

            {/* Source pills */}
            {sources.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap', padding: '0 16px' }}>
                {sources.slice(0, 8).map((s, i) => (
                  <button key={i} onClick={e => { e.stopPropagation(); setActiveSource(i) }}
                    style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, border: `1px solid ${i === activeSource ? '#00a8e1' : 'rgba(255,255,255,0.15)'}`, background: i === activeSource ? 'rgba(0,168,225,0.15)' : 'rgba(0,0,0,0.5)', color: i === activeSource ? '#00a8e1' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s' }}>
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
