// src/pages/Player.jsx
// ─────────────────────────────────────────────────────────────────────────────
// NetMirror-style streaming player
// Uses VidZee → MP4Hydra → Vixsrc in priority order (no iframes!)
// All sources return direct HLS m3u8 with embedded multi-audio tracks
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
// PROVIDER ENGINES  (NetMirror's exact approach)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * VidZee — Primary provider (what NetMirror uses)
 * Queries player.vidzee.wtf/api/server with TMDB IDs
 * Returns direct HLS streams, often with multi-audio (Hindi, English, Tamil…)
 */
async function fetchVidZee(tmdbId, mediaType, season = 1, episode = 1) {
  const servers = [3, 4, 5]
  const results = []

  await Promise.allSettled(servers.map(async sr => {
    try {
      let url
      if (mediaType === 'tv') {
        url = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=${sr}&ss=${season}&ep=${episode}`
      } else {
        url = `https://player.vidzee.wtf/api/server?id=${tmdbId}&sr=${sr}`
      }

      const proxied = `/api/proxy?url=${encodeURIComponent(url)}`
      const res = await fetch(proxied, {
        signal: AbortSignal.timeout(8000),
        headers: { 'Referer': 'https://core.vidzee.wtf/' }
      })
      if (!res.ok) return

      const data = await res.json()

      // Two response shapes: { url: [...] } or { link: '...' }
      let sources = []
      if (Array.isArray(data?.url)) sources = data.url
      else if (data?.link) sources = [data]

      for (const s of sources) {
        const streamUrl = s.link || s.url
        if (!streamUrl) continue
        const label = s.name || s.type || `${s.quality || 'Auto'}`
        results.push({
          url: streamUrl,
          provider: 'VidZee',
          label: `VidZee S${sr} · ${label}`,
          headers: { 'Referer': 'https://core.vidzee.wtf/' }
        })
      }
    } catch (_) {}
  }))

  return results
}

/**
 * MP4Hydra — Secondary provider
 * Uses slug-based lookup + multipart/form-data POST
 * Returns direct mp4/m3u8 streams with subtitle support
 */
async function fetchMP4Hydra(tmdbId, mediaType, season = 1, episode = 1) {
  try {
    // First get title from TMDB
    const meta = await fetch(
      `/api/proxy?url=${encodeURIComponent(`${BASE_URL}/${mediaType}/${tmdbId}?api_key=${API_KEY}`)}`
    ).then(r => r.json()).catch(() => null)

    if (!meta) return []

    const title = (meta.title || meta.name || '').toLowerCase()
      .replace(/[^\w\s]/g, '').replace(/\s+/g, '-')
    const year  = (meta.release_date || meta.first_air_date || '').substring(0, 4)
    const slug  = mediaType === 'movie' ? `${title}-${year}` : title

    const form  = new FormData()
    form.append('v', '8')
    form.append('z', JSON.stringify([{ s: slug, t: mediaType, se: season, ep: episode }]))

    const proxied = `/api/proxy?url=${encodeURIComponent('https://mp4hydra.org/info2?v=8')}`
    const res = await fetch(proxied, {
      method: 'POST',
      body: form,
      headers: {
        'Referer': `https://mp4hydra.org/${mediaType}/${slug}`,
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/110.0.0.0 Mobile Safari/537.36'
      },
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return []

    const data = await res.json()
    if (!data?.playlist || !data?.servers) return []

    const servers   = data.servers
    const serverBases = [servers['Beta'], servers['Beta#3']].filter(Boolean)
    const results   = []

    let items = data.playlist
    if (mediaType === 'tv') {
      const target = `S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}`
      items = items.filter(i => i.title?.includes(target))
    }

    for (const item of items.slice(0, 3)) {
      for (const [idx, base] of serverBases.entries()) {
        if (item.src) {
          results.push({
            url: base + item.src,
            provider: 'MP4Hydra',
            label: `MP4Hydra #${idx + 1}${item.quality ? ' · ' + item.quality : ''}`,
            headers: {}
          })
        }
      }
    }
    return results
  } catch (_) {
    return []
  }
}

/**
 * Vixsrc — Tertiary provider  
 * Scrapes vixsrc.to HTML page to extract embedded master m3u8 URL
 * Often has multi-quality HLS
 */
async function fetchVixsrc(tmdbId, mediaType, season = 1, episode = 1) {
  try {
    let pageUrl
    if (mediaType === 'tv') {
      pageUrl = `https://vixsrc.to/tv/${tmdbId}/${season}/${episode}`
    } else {
      pageUrl = `https://vixsrc.to/movie/${tmdbId}`
    }

    const proxied = `/api/proxy?url=${encodeURIComponent(pageUrl)}`
    const res = await fetch(proxied, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return []

    const html = await res.text()

    // Method 1: window.masterPlaylist object
    const masterMatch = html.match(/window\.masterPlaylist\s*=\s*({[^}]+})/)
    if (masterMatch) {
      try {
        // Extract url, token, expires from the object
        const urlMatch     = masterMatch[1].match(/url\s*:\s*['"]([^'"]+)['"]/)
        const tokenMatch   = masterMatch[1].match(/token\s*:\s*['"]([^'"]+)['"]/)
        const expiresMatch = masterMatch[1].match(/expires\s*:\s*['"]?([^'",}]+)/)
        if (urlMatch) {
          let streamUrl = urlMatch[1]
          if (tokenMatch && expiresMatch) {
            const sep = streamUrl.includes('?') ? '&' : '?'
            streamUrl += `${sep}token=${tokenMatch[1]}&expires=${expiresMatch[1].trim()}&h=1&lang=en`
          }
          return [{ url: streamUrl, provider: 'Vixsrc', label: 'Vixsrc · Auto', headers: {} }]
        }
      } catch (_) {}
    }

    // Method 2: Regex match for direct .m3u8 URL
    const m3u8Match = html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i)
    if (m3u8Match) {
      return [{ url: m3u8Match[0], provider: 'Vixsrc', label: 'Vixsrc · Auto', headers: {} }]
    }

    // Method 3: Look inside script tags
    const scriptMatches = html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)
    for (const script of scriptMatches) {
      const content = script[1]
      const urlInScript = content.match(/https?:\/\/[^\s"'\\]+\.m3u8[^\s"'\\]*/i)
      if (urlInScript) {
        return [{ url: urlInScript[0], provider: 'Vixsrc', label: 'Vixsrc · Auto', headers: {} }]
      }
    }

    return []
  } catch (_) {
    return []
  }
}

/**
 * Master fetch — runs all providers in priority order, races to first result
 * Falls back progressively: VidZee → MP4Hydra → Vixsrc
 */
async function fetchAllSources(tmdbId, mediaType, season, episode, onProgress) {
  onProgress?.('Connecting to VidZee servers…', 20)

  // Race: run all 3 in parallel but return as they arrive
  const allSources = []

  // VidZee first (highest priority, most multi-audio)
  try {
    const vz = await fetchVidZee(tmdbId, mediaType, season, episode)
    allSources.push(...vz)
    if (vz.length > 0) onProgress?.(`Found ${vz.length} VidZee stream(s)…`, 50)
  } catch (_) {}

  onProgress?.('Searching MP4Hydra…', 65)

  // MP4Hydra parallel
  try {
    const mh = await fetchMP4Hydra(tmdbId, mediaType, season, episode)
    allSources.push(...mh)
  } catch (_) {}

  onProgress?.('Checking Vixsrc…', 80)

  // Vixsrc parallel
  try {
    const vx = await fetchVixsrc(tmdbId, mediaType, season, episode)
    allSources.push(...vx)
  } catch (_) {}

  return allSources
}

// ─────────────────────────────────────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────────────────────────────────────

const Ico = {
  Play: () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width={22} height={22}>
      <polygon points="6,3 20,12 6,21"/>
    </svg>
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
  const seekDragging = useRef(false)

  // Meta
  const [title,      setTitle]     = useState('')
  const [season]  = useState(1)
  const [episode] = useState(1)

  // Playback
  const [playing,     setPlaying]    = useState(false)
  const [muted,       setMuted]      = useState(false)
  const [volume,      setVolume]     = useState(0.9)
  const [current,     setCurrent]    = useState(0)
  const [duration,    setDuration]   = useState(0)
  const [buffered,    setBuffered]   = useState(0)
  const [fullscreen,  setFullscreen] = useState(false)
  const [speed,       setSpeed]      = useState(1)
  const [isBuffering, setIsBuffering]= useState(false)

  // Audio / Quality / Subs
  const [audioTracks,   setAudioTracks]  = useState([])
  const [activeAudio,   setActiveAudio]  = useState(-1)
  const [qualities,     setQualities]    = useState([])
  const [activeQuality, setActiveQuality]= useState(-1)
  const [subTracks,     setSubTracks]    = useState([])
  const [activeSub,     setActiveSub]    = useState(-1)

  // Sources & state
  const [sources,      setSources]     = useState([])
  const [activeSource, setActiveSource]= useState(0)
  const [loadState,    setLoadState]   = useState('loading') // loading | playing | error
  const [errorMsg,     setErrorMsg]    = useState('')
  const [loadStep,     setLoadStep]    = useState('Initializing…')
  const [loadPct,      setLoadPct]     = useState(0)

  // UI
  const [showUI,    setShowUI]   = useState(true)
  const [openPanel, setOpenPanel]= useState(null)  // null | settings | sources | audio | quality | subs | speed

  // ── Fetch title ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}`)
      .then(r => r.json())
      .then(d => setTitle(d.title || d.name || ''))
      .catch(() => {})
  }, [type, id])

  // ── Hide controls timer ─────────────────────────────────────────────────────
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

  // ── Fetch Sources ───────────────────────────────────────────────────────────
  const doFetchSources = useCallback(async () => {
    setLoadState('loading')
    setLoadPct(5)
    setLoadStep('Fetching external IDs…')
    setSources([])

    // Resolve IMDB id for better compatibility
    let tmdbId = id
    try {
      const ext = await fetch(
        `/api/proxy?url=${encodeURIComponent(`${BASE_URL}/${type}/${id}/external_ids?api_key=${API_KEY}`)}`
      ).then(r => r.json())
      // VidZee works best with TMDB id directly; store imdb as fallback
      if (ext.imdb_id) tmdbId = id  // keep tmdb id — vidzee needs it
    } catch (_) {}

    const streams = await fetchAllSources(
      tmdbId, type, season, episode,
      (step, pct) => { setLoadStep(step); setLoadPct(pct) }
    )

    if (!streams.length) {
      setLoadState('error')
      setErrorMsg('No streams found from VidZee, MP4Hydra, or Vixsrc. The title may not be available yet.')
      return
    }

    setLoadStep(`${streams.length} stream(s) found!`)
    setLoadPct(90)
    setSources(streams)
    setActiveSource(0)
  }, [type, id, season, episode])

  useEffect(() => { doFetchSources() }, [doFetchSources])

  // ── Load video when source changes ──────────────────────────────────────────
  const loadVideo = useCallback(async (stream) => {
    if (!stream) return

    setLoadState('loading')
    setLoadStep('Initializing video engine…')
    setLoadPct(92)
    setAudioTracks([])
    setActiveAudio(-1)
    setQualities([])
    setActiveQuality(-1)
    setSubTracks([])
    setActiveSub(-1)

    // Destroy existing HLS instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    const video = videoRef.current
    if (!video) return
    video.pause()
    video.removeAttribute('src')
    video.load()

    const Hls = await loadHls()

    // Proxy m3u8 through our CORS proxy; direct mp4/mkv passthrough
    const isM3U8 = /\.m3u8/i.test(stream.url) || stream.url.includes('m3u8')
    const playUrl = isM3U8 ? `/api/proxy?url=${encodeURIComponent(stream.url)}` : stream.url

    // Native fallback (mp4 or browser that supports HLS natively like Safari)
    if (!isM3U8 || !Hls || !Hls.isSupported()) {
      video.src = playUrl
      video.play().catch(e => { if (e.name !== 'AbortError') setPlaying(false) })
      setLoadState('playing')
      setLoadPct(100)
      return
    }

    // HLS.js path
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 60,
      maxBufferLength: 45,
      maxMaxBufferLength: 600,
      startLevel: -1,
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
      fragLoadingMaxRetry: 6,
      xhrSetup: xhr => {
        xhr.withCredentials = false
        // Forward Referer if provider needs it
        if (stream.headers?.Referer) {
          xhr.setRequestHeader('Referer', stream.headers.Referer)
        }
      },
    })

    hlsRef.current = hls
    hls.attachMedia(video)

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(playUrl)
    })

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      // Quality levels
      const qs = [
        { id: -1, label: 'Auto' },
        ...data.levels.map((l, i) => ({
          id: i,
          label: l.height ? `${l.height}p` : `Level ${i + 1}`,
          bitrate: l.bitrate
        }))
      ]
      setQualities(qs)
      setActiveQuality(-1)

      // Audio tracks (multi-language!)
      const at = hls.audioTracks || []
      if (at.length > 0) {
        const tracks = at.map(t => ({
          id: t.id,
          label: t.name || t.lang || `Track ${t.id}`,
          lang: t.lang || ''
        }))
        setAudioTracks(tracks)
        // Pick English or default
        const eng = at.find(t => /en/i.test(t.lang) || /english/i.test(t.name))
        const def = at.find(t => t.default) || at[0]
        const pick = eng || def
        if (pick) { hls.audioTrack = pick.id; setActiveAudio(pick.id) }
      }

      // Subtitle tracks
      const st = hls.subtitleTracks || []
      setSubTracks([
        { id: -1, label: 'Off' },
        ...st.map((t, i) => ({ id: i, label: t.name || t.lang || `Sub ${i + 1}` }))
      ])
      setActiveSub(-1)
      hls.subtitleDisplay = false

      setLoadState('playing')
      setLoadPct(100)
      video.play().catch(e => { if (e.name !== 'AbortError') setPlaying(false) })
    })

    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, d) => {
      setAudioTracks((d.audioTracks || []).map(t => ({
        id: t.id, label: t.name || t.lang || `Track ${t.id}`, lang: t.lang || ''
      })))
    })
    hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, d) => setActiveAudio(d.id))
    hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => {
      setActiveQuality(hls.autoLevelEnabled ? -1 : d.level)
    })

    hls.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) return
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
      else {
        setLoadState('error')
        setErrorMsg('HLS stream error. Please try another source.')
      }
    })
  }, [])

  useEffect(() => {
    if (sources.length > 0 && sources[activeSource]) {
      loadVideo(sources[activeSource])
    }
  }, [sources, activeSource, loadVideo])

  useEffect(() => () => { if (hlsRef.current) hlsRef.current.destroy() }, [])

  // ── Video event listeners ───────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onPlay      = () => setPlaying(true)
    const onPause     = () => setPlaying(false)
    const onTime      = () => {
      setCurrent(v.currentTime)
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
    }
    const onMeta      = () => { setDuration(v.duration); v.volume = volume }
    const onVol       = () => { setVolume(v.volume); setMuted(v.muted) }
    const onWait      = () => setIsBuffering(true)
    const onCan       = () => setIsBuffering(false)
    const onErr       = () => {
      if (v.error?.code === 4) {
        setLoadState('error')
        setErrorMsg('Format unsupported by browser. Try another source.')
      }
    }

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('volumechange', onVol)
    v.addEventListener('waiting', onWait)
    v.addEventListener('playing', onCan)
    v.addEventListener('canplay', onCan)
    v.addEventListener('error', onErr)

    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('volumechange', onVol)
      v.removeEventListener('waiting', onWait)
      v.removeEventListener('playing', onCan)
      v.removeEventListener('canplay', onCan)
      v.removeEventListener('error', onErr)
    }
  }, [volume])

  // ── Fullscreen listener ─────────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = e => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
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
  }, [duration, resetHide])

  // ── Control helpers ─────────────────────────────────────────────────────────
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

  const getSeekPct = e => {
    const bar = seekRef.current; if (!bar || !duration) return 0
    const { left, width } = bar.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - left) / width))
  }
  const onSeekClick = e => {
    e.stopPropagation()
    const pct = getSeekPct(e)
    if (videoRef.current) videoRef.current.currentTime = pct * duration
    resetHide()
  }

  const switchAudio = id => {
    const hls = hlsRef.current; const v = videoRef.current
    if (hls) { hls.audioTrack = id; setActiveAudio(id) }
    else if (v?.audioTracks) {
      for (let i = 0; i < v.audioTracks.length; i++) v.audioTracks[i].enabled = (i === id)
      setActiveAudio(id)
    }
    setOpenPanel(null)
  }
  const switchQuality = qid => {
    const hls = hlsRef.current; if (!hls) return
    hls.currentLevel = qid; hls.autoLevelEnabled = qid === -1
    setActiveQuality(qid); setOpenPanel(null)
  }
  const switchSub = sid => {
    const hls = hlsRef.current; if (!hls) return
    if (sid === -1) { hls.subtitleDisplay = false; hls.subtitleTrack = -1 }
    else { hls.subtitleTrack = sid; hls.subtitleDisplay = true }
    setActiveSub(sid); setOpenPanel(null)
  }
  const setSpeedFn = r => {
    if (videoRef.current) videoRef.current.playbackRate = r
    setSpeed(r); setOpenPanel(null)
  }

  // ── Derived values ──────────────────────────────────────────────────────────
  const pctPlayed   = duration ? (current  / duration) * 100 : 0
  const pctBuffered = duration ? (buffered / duration) * 100 : 0
  const volPct      = muted ? 0 : volume * 100

  const audioLabel   = audioTracks.find(t => t.id === activeAudio)?.label  || 'Auto'
  const qualityLabel = qualities.find(q => q.id === activeQuality)?.label   || 'Auto'
  const subLabel     = subTracks.find(s => s.id === activeSub)?.label       || 'Off'
  const speedLabel   = speed === 1 ? 'Normal' : `${speed}×`

  // ── Panel styles ────────────────────────────────────────────────────────────
  const panelBase = {
    position: 'absolute', top: 60, right: 16,
    width: 300,
    background: 'rgba(10,13,18,0.97)',
    borderRadius: 10,
    overflow: 'hidden',
    zIndex: 100,
    boxShadow: '0 12px 40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)',
    backdropFilter: 'blur(12px)',
  }
  const panelRow = {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '14px 18px', cursor: 'pointer',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    transition: 'background 0.15s',
  }
  const RadioDot = ({ on }) => (
    <div style={{
      width: 20, height: 20, minWidth: 20, borderRadius: '50%',
      border: `2px solid ${on ? '#00a8e1' : 'rgba(255,255,255,0.3)'}`,
      background: on ? '#00a8e1' : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
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
      onClick={() => { if (loadState === 'playing') { togglePlay(); resetHide() } }}
      style={{
        position: 'fixed', inset: 0, background: '#000', zIndex: 100,
        display: 'flex', flexDirection: 'column', userSelect: 'none',
        fontFamily: "'Amazon Ember', 'SF Pro Display', 'Segoe UI', Arial, sans-serif",
        cursor: showUI ? 'default' : 'none',
      }}
    >
      {/* ── VIDEO ── */}
      <video
        ref={videoRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
        playsInline
        autoPlay
      />

      {/* ── BUFFERING SPINNER (on top of playing video) ── */}
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
                style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  border: '3px solid transparent', borderTopColor: '#00a8e1',
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── LOADING OVERLAY ── */}
      <AnimatePresence>
        {loadState === 'loading' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 20,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 24, background: 'linear-gradient(135deg,#060b14,#0a0d1a)',
              textAlign: 'center', padding: '0 24px',
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
              {/* Play icon in center */}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" fill="#00a8e1" width={24} height={24}><polygon points="8,5 20,12 8,19"/></svg>
              </div>
            </div>

            <div>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 6, letterSpacing: '0.02em' }}>
                {title || 'Loading…'}
              </p>
              <motion.p
                key={loadStep}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
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
            <div style={{ display: 'flex', gap: 8 }}>
              {['VidZee', 'MP4Hydra', 'Vixsrc'].map(p => (
                <span key={p} style={{
                  fontSize: 11, color: 'rgba(255,255,255,0.3)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  padding: '3px 8px', borderRadius: 4, fontWeight: 600,
                }}>
                  {p}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ERROR OVERLAY ── */}
      <AnimatePresence>
        {loadState === 'error' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 20,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 20, background: 'rgba(0,0,0,0.96)', textAlign: 'center', padding: '0 24px',
            }}
          >
            <AlertCircle style={{ width: 52, height: 52, color: '#ff4455' }}/>
            <div>
              <p style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Stream Unavailable</p>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, maxWidth: 380, margin: '0 auto' }}>{errorMsg}</p>
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
                onClick={e => { e.stopPropagation(); doFetchSources() }}
                style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <RefreshCw style={{ width: 15, height: 15 }}/> Retry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CONTROLS OVERLAY ── */}
      {loadState !== 'error' && (
        <motion.div
          animate={{ opacity: showUI ? 1 : 0 }}
          transition={{ duration: 0.25 }}
          style={{ position: 'absolute', inset: 0, zIndex: 30, pointerEvents: showUI ? 'auto' : 'none' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Top gradient */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160, background: 'linear-gradient(to bottom,rgba(0,0,0,0.85),transparent)', pointerEvents: 'none' }}/>
          {/* Bottom gradient */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 200, background: 'linear-gradient(to top,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.5) 60%,transparent 100%)', pointerEvents: 'none' }}/>

          {/* ── TOP BAR ── */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', zIndex: 10 }}>
            {/* Back + Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => navigate(-1)}
                style={{ ...ICON_BTN, padding: 8 }}
              >
                <ChevronLeft style={{ width: 22, height: 22 }} />
              </button>
              <div>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 16, margin: 0, lineHeight: 1.2 }}>{title || 'Now Playing'}</p>
                {sources[activeSource] && (
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, margin: 0, marginTop: 2 }}>
                    {sources[activeSource].provider} · {sources[activeSource].label.split('·')[1]?.trim() || ''}
                  </p>
                )}
              </div>
            </div>

            {/* Right icons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
              <button style={ICON_BTN} onClick={() => setOpenPanel(p => p === 'subs' ? null : 'subs')} title="Subtitles">
                <Ico.CC/>
              </button>
              <button style={ICON_BTN} onClick={() => setOpenPanel(p => p === 'volume' ? null : 'volume')} title="Volume">
                {(muted || volume === 0) ? <Ico.VolMute/> : <Ico.Vol/>}
              </button>
              {document.pictureInPictureEnabled && (
                <button style={ICON_BTN} onClick={() => videoRef.current?.requestPictureInPicture()} title="Picture in Picture">
                  <Ico.PiP/>
                </button>
              )}
              <button style={ICON_BTN} onClick={toggleFs} title="Fullscreen">
                {fullscreen ? <Ico.FsExit/> : <Ico.Fs/>}
              </button>
              <button
                style={{ ...ICON_BTN }}
                onClick={() => setOpenPanel(p => p === 'settings' ? null : 'settings')}
                title="Settings"
              >
                <Settings style={{ width: 20, height: 20 }}/>
              </button>

              {/* ── SETTINGS PANEL ── */}
              <AnimatePresence>
                {openPanel === 'settings' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    transition={{ duration: 0.18 }}
                    style={panelBase}
                    onClick={e => e.stopPropagation()}
                  >
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', fontSize: 15, fontWeight: 700, color: '#fff' }}>
                      Settings
                    </div>
                    {[
                      { key: 'sources',  label: 'Stream Source', value: `${sources[activeSource]?.provider || '—'} · ${activeSource + 1}/${sources.length}`, icon: '📡' },
                      { key: 'audio',    label: 'Audio', value: audioLabel, icon: '🎵' },
                      { key: 'quality',  label: 'Quality', value: qualityLabel, icon: '📺' },
                      { key: 'subs',     label: 'Subtitles', value: subLabel, icon: '💬' },
                      { key: 'speed',    label: 'Playback Speed', value: speedLabel, icon: '⚡' },
                    ].map(row => (
                      <div
                        key={row.key}
                        style={panelRow}
                        onClick={() => setOpenPanel(row.key)}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontSize: 16 }}>{row.icon}</span>
                        <span style={{ flex: 1, fontSize: 14, color: '#e0e0e0', fontWeight: 500 }}>{row.label}</span>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {row.value} <Ico.ChevR/>
                        </span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── SOURCES PANEL ── */}
              <AnimatePresence>
                {openPanel === 'sources' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    style={panelBase} onClick={e => e.stopPropagation()}
                  >
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }} onClick={() => setOpenPanel('settings')}>
                        <Ico.ChevL/>
                      </button>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Stream Source</span>
                    </div>
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
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
                              {s.provider} · {s.url.includes('m3u8') ? 'HLS Multi-Audio' : 'Direct MP4'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── AUDIO PANEL ── */}
              <AnimatePresence>
                {openPanel === 'audio' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    style={panelBase} onClick={e => e.stopPropagation()}
                  >
                    <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0 }} onClick={() => setOpenPanel('settings')}>
                        <Ico.ChevL/>
                      </button>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Audio Track</span>
                    </div>
                    {audioTracks.length === 0 ? (
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '24px 20px', textAlign: 'center' }}>
                        No alternate audio tracks in this stream.<br/>
                        <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>Try a VidZee source for multi-audio.</span>
                      </p>
                    ) : audioTracks.map(t => (
                      <div
                        key={t.id} style={{ ...panelRow, gap: 12, background: t.id === activeAudio ? 'rgba(0,168,225,0.08)' : 'transparent' }}
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

              {/* ── QUALITY PANEL ── */}
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
                    {qualities.length === 0 ? (
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '24px 20px', textAlign: 'center' }}>Quality options loading…</p>
                    ) : qualities.map(q => (
                      <div
                        key={q.id} style={{ ...panelRow, gap: 12, background: q.id === activeQuality ? 'rgba(0,168,225,0.08)' : 'transparent' }}
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
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── SUBTITLES PANEL ── */}
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
                    {subTracks.length <= 1 ? (
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '24px 20px', textAlign: 'center' }}>No embedded subtitles in this stream.</p>
                    ) : subTracks.map(s => (
                      <div
                        key={s.id} style={{ ...panelRow, gap: 12, background: s.id === activeSub ? 'rgba(0,168,225,0.08)' : 'transparent' }}
                        onClick={() => switchSub(s.id)}
                        onMouseEnter={e => { if (s.id !== activeSub) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { if (s.id !== activeSub) e.currentTarget.style.background = 'transparent' }}
                      >
                        <RadioDot on={s.id === activeSub}/>
                        <div style={{ fontSize: 14, fontWeight: 500, color: s.id === activeSub ? '#00a8e1' : '#e0e0e0' }}>{s.label}</div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── SPEED PANEL ── */}
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
                        key={r} style={{ ...panelRow, gap: 12, background: r === speed ? 'rgba(0,168,225,0.08)' : 'transparent' }}
                        onClick={() => setSpeedFn(r)}
                        onMouseEnter={e => { if (r !== speed) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                        onMouseLeave={e => { if (r !== speed) e.currentTarget.style.background = 'transparent' }}
                      >
                        <RadioDot on={r === speed}/>
                        <div style={{ fontSize: 14, fontWeight: 500, color: r === speed ? '#00a8e1' : '#e0e0e0' }}>{r === 1 ? 'Normal' : `${r}×`}</div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── VOLUME POPUP ── */}
              <AnimatePresence>
                {openPanel === 'volume' && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    style={{ ...panelBase, width: 240, padding: '16px 20px' }} onClick={e => e.stopPropagation()}
                  >
                    <label style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 12 }}>
                      Volume — {Math.round(volPct)}%
                    </label>
                    <input
                      type="range" min="0" max="100" step="1" value={volPct}
                      onChange={e => setVol(parseInt(e.target.value) / 100)}
                      style={{
                        width: '100%', WebkitAppearance: 'none', appearance: 'none',
                        height: 4, borderRadius: 2, outline: 'none', cursor: 'pointer',
                        background: `linear-gradient(to right, #00a8e1 ${volPct}%, rgba(255,255,255,0.2) ${volPct}%)`
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── BOTTOM CONTROLS ── */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 0 28px 0', zIndex: 10 }}>
            {/* Seek bar */}
            <div style={{ padding: '0 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', minWidth: 42, letterSpacing: '0.02em' }}>{fmt(current)}</span>
              <div
                ref={seekRef}
                onClick={onSeekClick}
                style={{ flex: 1, position: 'relative', height: 4, background: 'rgba(255,255,255,0.2)', borderRadius: 2, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.querySelector('.seek-thumb').style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.querySelector('.seek-thumb').style.opacity = '0'}
              >
                {/* Buffered */}
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pctBuffered}%`, background: 'rgba(255,255,255,0.18)', borderRadius: 2 }}/>
                {/* Played */}
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pctPlayed}%`, background: '#00a8e1', borderRadius: 2 }}>
                  <div
                    className="seek-thumb"
                    style={{
                      position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)',
                      width: 14, height: 14, background: '#fff', borderRadius: '50%',
                      boxShadow: '0 0 6px rgba(0,0,0,0.5)', opacity: 0, transition: 'opacity 0.15s',
                    }}
                  />
                </div>
              </div>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', minWidth: 42, textAlign: 'right', letterSpacing: '0.02em' }}>{fmt(duration)}</span>
            </div>

            {/* Playback buttons */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
              <button
                style={ICON_BTN}
                onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10); resetHide() }}
              >
                <Ico.Back10/>
              </button>

              <button
                onClick={e => { e.stopPropagation(); togglePlay() }}
                style={{
                  width: 56, height: 56, background: 'rgba(255,255,255,0.95)', border: 'none',
                  borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#000', transition: 'transform 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                <AnimatePresence mode="wait">
                  {playing
                    ? <motion.div key="p" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.12 }}><Ico.Pause/></motion.div>
                    : <motion.div key="pl" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.12 }}><Ico.Play/></motion.div>
                  }
                </AnimatePresence>
              </button>

              <button
                style={ICON_BTN}
                onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10); resetHide() }}
              >
                <Ico.Fwd10/>
              </button>
            </div>

            {/* Source switcher quick pills */}
            {sources.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 12, paddingBottom: 4 }}>
                {sources.slice(0, 6).map((s, i) => (
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
                    {s.provider} {i + 1}
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
