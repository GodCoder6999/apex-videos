// src/pages/Player.jsx
// ─────────────────────────────────────────────────────────────────────────────
// STREAM ENGINE: Multi-Provider HLS Waterfall (NO iframes, NO embeds)
//
// Provider waterfall (in order):
//  1. vidlink.pro  → /api/vidlink/watch → JSON {stream.playlist, captions}
//  2. vidsrc.net   → /api/stream/movie|tv/{id} → JSON {stream}
//  3. vidsrc.rip   → /api/stream/{id} → JSON {stream}
//  4. Stremio addon waterfall (apex-stream-api / nuvio) → filtered HLS/MP4
//
// All HLS m3u8 streams pass through the local /api/proxy for CORS rewriting.
// Direct MP4 URLs are played natively (no proxy needed).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, AlertCircle } from 'lucide-react'

const BASE_URL  = 'https://api.themoviedb.org/3'
const API_KEY   = import.meta.env.VITE_TMDB_API_KEY

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

// ── PROVIDER ENGINE ───────────────────────────────────────────────────────────
// Returns { url, label, captions[] } or throws

async function fetchVidlink(id, type, season, episode) {
  // vidlink.pro has a documented JSON API — no scraping needed
  const isMovie = type === 'movie'
  const params = isMovie
    ? `isMovie=true&id=${id}`
    : `isMovie=false&id=${id}&season=${season}&episode=${episode}`

  // Must proxy to bypass CORS
  const apiUrl = `https://vidlink.pro/api/vidlink/watch?${params}`
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(apiUrl)}`

  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`vidlink HTTP ${res.status}`)
  const text = await res.text()
  if (text.trimStart().startsWith('<')) throw new Error('vidlink returned HTML')

  const data = JSON.parse(text)
  const playlist = data?.stream?.playlist
  if (!playlist) throw new Error('vidlink: no playlist in response')

  // vidlink flags cors-allowed streams — use direct if flagged, else proxy
  const corsAllowed = data?.stream?.flags?.includes('cors-allowed')
  const finalUrl = corsAllowed ? playlist : `/api/proxy?url=${encodeURIComponent(playlist)}`

  const captions = (data?.stream?.captions || [])
    .filter(c => c.url && !c.hasCorsRestrictions)
    .map(c => ({ url: c.url, label: c.language || 'Unknown', lang: c.language }))

  return { url: finalUrl, label: 'VidLink · HLS', captions, source: 'vidlink' }
}

async function fetchVidsrcNet(id, type, season, episode) {
  // vidsrc.net has a public JSON stream API
  const path = type === 'movie'
    ? `/api/stream/movie/${id}`
    : `/api/stream/tv/${id}/${season}/${episode}`

  const apiUrl = `https://vidsrc.net${path}`
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(apiUrl)}`

  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`vidsrc.net HTTP ${res.status}`)
  const text = await res.text()
  if (text.trimStart().startsWith('<')) throw new Error('vidsrc.net returned HTML')

  const data = JSON.parse(text)
  // vidsrc.net response: { stream: "m3u8_url" } or { stream: { hls: "url" } }
  let streamUrl = null
  if (typeof data?.stream === 'string') streamUrl = data.stream
  else if (data?.stream?.hls) streamUrl = data.stream.hls
  else if (data?.stream?.url) streamUrl = data.stream.url
  else if (data?.streams?.[0]?.url) streamUrl = data.streams[0].url

  if (!streamUrl) throw new Error('vidsrc.net: no stream URL')

  const finalUrl = `/api/proxy?url=${encodeURIComponent(streamUrl)}`
  return { url: finalUrl, label: 'VidSrc · HLS', captions: [], source: 'vidsrc.net' }
}

async function fetchVidsrcRip(id, type, season, episode) {
  // vidsrc.rip public API
  const path = type === 'movie'
    ? `/api/stream/${id}`
    : `/api/stream/${id}/${season}/${episode}`

  const apiUrl = `https://vidsrc.rip${path}`
  const proxyUrl = `/api/proxy?url=${encodeURIComponent(apiUrl)}`

  const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`vidsrc.rip HTTP ${res.status}`)
  const text = await res.text()
  if (text.trimStart().startsWith('<')) throw new Error('vidsrc.rip returned HTML')

  const data = JSON.parse(text)
  let streamUrl = null
  if (typeof data?.stream === 'string') streamUrl = data.stream
  else if (data?.stream?.hls) streamUrl = data.stream.hls
  else if (data?.stream?.url) streamUrl = data.stream.url
  else if (data?.url) streamUrl = data.url

  if (!streamUrl) throw new Error('vidsrc.rip: no stream URL')

  const finalUrl = `/api/proxy?url=${encodeURIComponent(streamUrl)}`
  return { url: finalUrl, label: 'VidSrc.rip · HLS', captions: [], source: 'vidsrc.rip' }
}

async function fetchStremioWaterfall(imdbId, type, season, episode) {
  // Stremio-protocol addons (our proxy rewrites HLS manifests)
  const stremioType = type === 'tv' ? 'series' : 'movie'
  const streamId = type === 'tv'
    ? (imdbId ? `${imdbId}:${season}:${episode}` : `tmdb:${/* id is tmdb */ 0}:${season}:${episode}`)
    : (imdbId || '')

  const ADDONS = [
    'https://stremify.hayd.uk',
    'https://webstreamr.hayd.uk',
    'https://nuviostreams.hayd.uk',
  ]

  for (const base of ADDONS) {
    try {
      const targetUrl = `${base}/stream/${stremioType}/${streamId}.json`
      const proxyUrl  = `/api/proxy?url=${encodeURIComponent(targetUrl)}`
      const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) })
      if (!resp.ok) continue
      const text = await resp.text()
      if (text.trimStart().startsWith('<')) continue

      const data = JSON.parse(text)
      const streams = (data?.streams || []).filter(s => {
        if (!s.url) return false
        const u = s.url.toLowerCase()
        const t = (s.title || '').toLowerCase()
        if (u.includes('.mkv') || t.includes('mkv')) return false
        if (t.includes('hevc') || t.includes('x265') || t.includes('h265')) return false
        return true
      })

      // Prefer HLS
      streams.sort((a, b) => {
        const aM = a.url.toLowerCase().includes('.m3u8') ? 1 : 0
        const bM = b.url.toLowerCase().includes('.m3u8') ? 1 : 0
        return bM - aM
      })

      if (!streams.length) continue
      const stream = streams[0]
      const isHls = /\.m3u8/i.test(stream.url)
      const finalUrl = isHls
        ? `/api/proxy?url=${encodeURIComponent(stream.url)}`
        : stream.url

      const label = stream.name
        ? `${stream.name.split('\n')[0]} · ${isHls ? 'HLS' : 'MP4'}`
        : `Stremio · ${isHls ? 'HLS' : 'MP4'}`

      return { url: finalUrl, label, captions: [], source: 'stremio' }
    } catch (_) {}
  }
  throw new Error('All stream providers unavailable. Please try again later.')
}

// Master resolver — tries providers in order
async function resolveStream({ tmdbId, imdbId, type, season, episode, onStep }) {
  const steps = [
    { name: 'VidLink', fn: () => fetchVidlink(tmdbId, type, season, episode) },
    { name: 'VidSrc', fn: () => fetchVidsrcNet(imdbId || tmdbId, type, season, episode) },
    { name: 'VidSrc.rip', fn: () => fetchVidsrcRip(imdbId || tmdbId, type, season, episode) },
    { name: 'Stremio Network', fn: () => fetchStremioWaterfall(imdbId, type, season, episode) },
  ]

  for (const step of steps) {
    onStep?.(`Trying ${step.name}…`)
    try {
      const result = await step.fn()
      if (result?.url) return result
    } catch (e) {
      console.warn(`[${step.name}] failed:`, e.message)
    }
  }
  throw new Error('All providers failed. Please try again later.')
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const Ic = {
  Close: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  CC: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><rect x="2" y="5" width="20" height="15" rx="2"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="14" y2="16"/></svg>,
  Vol: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
  Mute: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>,
  PiP: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/></svg>,
  FS: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>,
  FSExit: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><polyline points="8 3 3 3 3 8"/><polyline points="21 8 21 3 16 3"/><polyline points="3 16 3 21 8 21"/><polyline points="16 21 21 21 21 16"/></svg>,
  More: () => <svg viewBox="0 0 24 24" fill="currentColor" style={{width:22,height:22}}><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>,
  ChR: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}><polyline points="9 18 15 12 9 6"/></svg>,
  ChL: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><polyline points="15 18 9 12 15 6"/></svg>,
  SkipB: () => <svg viewBox="0 0 44 44" fill="none" style={{width:36,height:36}}><path d="M28 10.5A14 14 0 1 0 36 22" stroke="white" strokeWidth="2.2" strokeLinecap="round"/><polyline points="28,4 28,11 35,11" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/><text x="22" y="27" textAnchor="middle" fill="white" fontSize="9.5" fontFamily="Arial" fontWeight="700">10</text></svg>,
  SkipF: () => <svg viewBox="0 0 44 44" fill="none" style={{width:36,height:36}}><path d="M16 10.5A14 14 0 1 1 8 22" stroke="white" strokeWidth="2.2" strokeLinecap="round"/><polyline points="16,4 16,11 9,11" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/><text x="22" y="27" textAnchor="middle" fill="white" fontSize="9.5" fontFamily="Arial" fontWeight="700">10</text></svg>,
  Play: () => <svg viewBox="0 0 24 24" fill="currentColor" style={{width:24,height:24}}><polygon points="6,3 20,12 6,21"/></svg>,
  Pause: () => <svg viewBox="0 0 24 24" fill="currentColor" style={{width:24,height:24}}><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>,
}

const ICON_BTN = {
  background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
  padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center',
  justifyContent: 'center', transition: 'background 0.15s', position: 'relative',
}

const C = {
  bg: '#000', panelBg: '#1a1d21', panelBorder: '#2e3239',
  accent: '#1a98ff', textSec: '#8b8f97', hover: 'rgba(255,255,255,0.08)',
  active: 'rgba(255,255,255,0.12)',
}

const RadioCircle = ({ selected }) => (
  <div style={{
    width:30, height:30, minWidth:30,
    border: `2px solid ${selected ? C.accent : C.textSec}`,
    borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: selected ? C.accent : 'transparent',
    transition: 'border-color 0.15s, background 0.15s', flexShrink: 0,
  }}>
    {selected && <div style={{width:10,height:10,background:'#fff',borderRadius:'50%'}}/>}
  </div>
)

// ── Player Component ──────────────────────────────────────────────────────────
export default function Player() {
  const { type = 'movie', id } = useParams()
  const navigate = useNavigate()

  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const seekTrackRef = useRef(null)
  const hideTimer    = useRef(null)
  const subtitleRef  = useRef(null) // <track> element ref

  // Playback state
  const [playing,      setPlaying]      = useState(false)
  const [muted,        setMuted]        = useState(false)
  const [volume,       setVolume]       = useState(0.8)
  const [current,      setCurrent]      = useState(0)
  const [duration,     setDuration]     = useState(0)
  const [buffered,     setBuffered]     = useState(0)
  const [fullscreen,   setFullscreen]   = useState(false)
  const [speed,        setSpeed]        = useState(1)
  const [isBuffering,  setIsBuffering]  = useState(false)

  // Track lists
  const [audioTracks,  setAudioTracks]  = useState([])
  const [activeAudio,  setActiveAudio]  = useState(-1)
  const [qualities,    setQualities]    = useState([])
  const [activeQuality,setActiveQuality]= useState(-1)
  const [captions,     setCaptions]     = useState([])  // from provider
  const [activeCap,    setActiveCap]    = useState(-1)  // -1 = off

  // UI state
  const [showUI,       setShowUI]       = useState(true)
  const [openPanel,    setOpenPanel]    = useState(null)
  const [loadState,    setLoadState]    = useState('loading')
  const [errorMsg,     setErrorMsg]     = useState('')
  const [srcLabel,     setSrcLabel]     = useState('')
  const [loadStep,     setLoadStep]     = useState('Connecting to stream providers…')
  const [loadProgress, setLoadProgress] = useState(0)

  // Title
  const [title, setTitle] = useState('')
  const [season]  = useState(1)
  const [episode] = useState(1)

  // IDs
  const [imdbId, setImdbId] = useState('')

  useEffect(() => {
    // Fetch title + IMDB ID in parallel
    fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}&language=en-US`)
      .then(r => r.json())
      .then(d => setTitle(d.title || d.name || ''))
      .catch(() => {})
    fetch(`${BASE_URL}/${type}/${id}/external_ids?api_key=${API_KEY}`)
      .then(r => r.json())
      .then(d => { if (d.imdb_id) setImdbId(d.imdb_id) })
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

  useEffect(() => { resetHide(); return () => clearTimeout(hideTimer.current) }, [resetHide])

  // ── Boot: resolve stream then setup HLS ────────────────────────────────────
  const boot = useCallback(async () => {
    setLoadState('loading')
    setSrcLabel('')
    setLoadStep('Connecting to stream providers…')
    setLoadProgress(5)
    setOpenPanel(null)

    setAudioTracks([]); setActiveAudio(-1)
    setQualities([]);   setActiveQuality(-1)
    setCaptions([]);    setActiveCap(-1)

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    const video = videoRef.current
    if (video) { video.removeAttribute('src'); video.load() }

    let streamData
    try {
      streamData = await resolveStream({
        tmdbId: id,
        imdbId,
        type,
        season,
        episode,
        onStep: msg => setLoadStep(msg),
      })
    } catch (e) {
      setLoadState('error')
      setErrorMsg(e.message)
      return
    }

    setSrcLabel(streamData.label)
    setCaptions(streamData.captions || [])
    setLoadProgress(80)
    setLoadStep('Initializing player…')

    const Hls    = await loadHls()
    const video2 = videoRef.current
    if (!video2) return

    const isM3U8 = /\.m3u8/i.test(streamData.url) || decodeURIComponent(streamData.url).includes('.m3u8')

    // ── Native / direct MP4 path ──────────────────────────────────────────
    if (!isM3U8 || !Hls || !Hls.isSupported()) {
      video2.src = streamData.url
      setLoadState('playing')
      setLoadProgress(100)
      video2.play().catch(() => setPlaying(false))
      return
    }

    // ── HLS.js path ───────────────────────────────────────────────────────
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 90,
      maxBufferLength: 60,
      maxMaxBufferLength: 600,
      startLevel: -1,
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
      fragLoadingMaxRetry: 6,
    })

    hlsRef.current = hls
    hls.attachMedia(video2)
    hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(streamData.url))

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      // Quality levels
      setQualities([
        { id: -1, label: 'Auto' },
        ...data.levels.map((l, i) => ({
          id: i,
          label: l.height ? `${l.height}p` : `Level ${i + 1}`,
          bitrate: l.bitrate,
        })),
      ])
      setActiveQuality(-1)

      // Audio tracks from HLS manifest
      const at = hls.audioTracks || []
      if (at.length > 0) {
        setAudioTracks(at.map(t => ({ id: t.id, label: t.name || t.lang || `Track ${t.id}`, lang: t.lang || '' })))
        const def = at.find(t => t.default) || at[0]
        setActiveAudio(def ? def.id : 0)
        hls.audioTrack = def ? def.id : 0
      }

      setLoadState('playing')
      setLoadProgress(100)
      video2.play().catch(() => setPlaying(false))
    })

    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, d) => {
      setAudioTracks((d.audioTracks || []).map(t => ({
        id: t.id, label: t.name || t.lang || `Track ${t.id}`, lang: t.lang || '',
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
        setErrorMsg('A fatal stream error occurred. Please retry.')
      }
    })
  }, [id, imdbId, type, season, episode])

  useEffect(() => {
    boot()
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [boot])

  // ── Video event listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current; if (!v) return
    const onPlay      = () => setPlaying(true)
    const onPause     = () => setPlaying(false)
    const onTime      = () => {
      setCurrent(v.currentTime)
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
    }
    const onMeta      = () => { setDuration(v.duration); v.volume = volume }
    const onDurChange = () => setDuration(v.duration)
    const onVolChange = () => { setVolume(v.volume); setMuted(v.muted) }
    const onWaiting   = () => setIsBuffering(true)
    const onPlaying   = () => setIsBuffering(false)
    const onCanPlay   = () => setIsBuffering(false)
    const onError     = () => {
      if (v.error?.code === 4) {
        setLoadState('error')
        setErrorMsg('Browser does not support this video format. Retrying with next provider…')
        setTimeout(() => boot(), 1500)
      }
    }

    v.addEventListener('play',           onPlay)
    v.addEventListener('pause',          onPause)
    v.addEventListener('timeupdate',     onTime)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('durationchange', onDurChange)
    v.addEventListener('volumechange',   onVolChange)
    v.addEventListener('waiting',        onWaiting)
    v.addEventListener('playing',        onPlaying)
    v.addEventListener('canplay',        onCanPlay)
    v.addEventListener('error',          onError)
    return () => {
      v.removeEventListener('play',           onPlay)
      v.removeEventListener('pause',          onPause)
      v.removeEventListener('timeupdate',     onTime)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('durationchange', onDurChange)
      v.removeEventListener('volumechange',   onVolChange)
      v.removeEventListener('waiting',        onWaiting)
      v.removeEventListener('playing',        onPlaying)
      v.removeEventListener('canplay',        onCanPlay)
      v.removeEventListener('error',          onError)
    }
  }, [boot, volume]) // eslint-disable-line

  // Fullscreen change listener
  useEffect(() => {
    const fn = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // Subtitle track switching via <track> elements
  useEffect(() => {
    const v = videoRef.current; if (!v) return
    // Remove old tracks
    Array.from(v.querySelectorAll('track')).forEach(t => t.remove())
    if (activeCap === -1 || !captions[activeCap]) return

    const track = document.createElement('track')
    track.kind = 'subtitles'
    track.src  = captions[activeCap].url
    track.label = captions[activeCap].label
    track.srclang = captions[activeCap].lang?.substring(0, 2) || 'en'
    track.default = true
    v.appendChild(track)
    subtitleRef.current = track

    // Must wait a tick for TextTrack to appear
    const timer = setTimeout(() => {
      if (v.textTracks.length > 0) {
        for (let i = 0; i < v.textTracks.length; i++) {
          v.textTracks[i].mode = 'showing'
        }
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [activeCap, captions])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = e => {
      if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return
      const v = videoRef.current; if (!v) return
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); v.paused ? v.play() : v.pause() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); v.currentTime = Math.min(duration, v.currentTime + 10) }
      else if (e.key === 'ArrowLeft')  { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10) }
      else if (e.key === 'ArrowUp')    { e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1) }
      else if (e.key === 'ArrowDown')  { e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1) }
      else if (e.key === 'm')          { v.muted = !v.muted }
      else if (e.key === 'f')          { toggleFs() }
      resetHide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duration, resetHide]) // eslint-disable-line

  // ── Controls ───────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current; if (!v) return
    v.paused ? v.play() : v.pause()
    resetHide()
  }
  const toggleFs = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else containerRef.current?.requestFullscreen()
  }
  const seekTo = e => {
    const bar = seekTrackRef.current; if (!bar || !duration) return
    const { left, width } = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - left) / width))
    if (videoRef.current) videoRef.current.currentTime = pct * duration
    resetHide()
  }
  const setVol = val => {
    const v = videoRef.current; if (!v) return
    const n = Math.max(0, Math.min(1, val))
    v.volume = n
    if (n === 0) v.muted = true
    else if (v.muted) v.muted = false
  }
  const switchAudio = aid => {
    const hls = hlsRef.current; const v = videoRef.current
    if (hls) { hls.audioTrack = aid; setActiveAudio(aid) }
    else if (v?.audioTracks) {
      for (let i = 0; i < v.audioTracks.length; i++) v.audioTracks[i].enabled = (i === aid)
      setActiveAudio(aid)
    }
  }
  const switchQuality = qid => {
    const hls = hlsRef.current; if (!hls) return
    hls.currentLevel = qid; hls.autoLevelEnabled = qid === -1
    setActiveQuality(qid)
  }
  const switchCaption = cid => {
    setActiveCap(cid)
    // Also handle HLS embedded subs if present
    const hls = hlsRef.current
    if (hls) {
      if (cid === -1) { hls.subtitleDisplay = false; hls.subtitleTrack = -1 }
      else { hls.subtitleTrack = cid; hls.subtitleDisplay = true }
    }
  }
  const setSpeedFn = r => {
    if (videoRef.current) videoRef.current.playbackRate = r
    setSpeed(r)
  }

  const pctPlayed   = duration ? (current  / duration) * 100 : 0
  const pctBuffered = duration ? (buffered / duration) * 100 : 0
  const volPct      = muted ? 0 : volume * 100

  // Panel labels
  const audioLabel   = audioTracks.find(t => t.id === activeAudio)?.label || 'Auto'
  const qualityLabel = qualities.find(q => q.id === activeQuality)?.label || 'Auto'
  const captionLabel = activeCap === -1 ? 'Off' : (captions[activeCap]?.label || 'On')
  const speedLabel   = speed === 1 ? 'Normal' : `${speed}×`

  // Panel shared styles
  const panelStyle = {
    position:'absolute', top:56, right:16,
    width:320, background:C.panelBg, borderRadius:8, overflow:'hidden',
    zIndex:100, boxShadow:'0 8px 32px rgba(0,0,0,0.8)',
  }
  const panelHdrStyle = {
    display:'flex', alignItems:'center', padding:'16px 20px',
    borderBottom:`1px solid ${C.panelBorder}`, fontSize:16, fontWeight:600, gap:12,
  }
  const rowStyle = {
    display:'flex', alignItems:'center', padding:'16px 20px', cursor:'pointer',
    transition:'background 0.12s', borderBottom:`1px solid ${C.panelBorder}`, gap:16,
  }
  const radioRowStyle = {
    display:'flex', alignItems:'flex-start', padding:'14px 20px', cursor:'pointer',
    transition:'background 0.12s', borderBottom:`1px solid ${C.panelBorder}`, gap:14,
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHide}
      onTouchStart={resetHide}
      onClick={() => { if (loadState === 'playing') { togglePlay(); resetHide() } }}
      style={{
        position:'fixed', inset:0, background:'#000', zIndex:100,
        display:'flex', flexDirection:'column',
        userSelect:'none', fontFamily:"'Amazon Ember','Arial',sans-serif",
      }}
    >
      {/* ── VIDEO ELEMENT ── */}
      <video
        ref={videoRef}
        style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'contain' }}
        playsInline
        autoPlay
        crossOrigin="anonymous"
      />

      {/* ── LOADING OVERLAY ── */}
      <AnimatePresence>
        {loadState === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            transition={{ duration:0.35 }}
            style={{
              position:'absolute', inset:0, zIndex:20,
              display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center', gap:28,
              background:'#0a0d12', textAlign:'center', padding:'0 24px',
            }}
          >
            {/* Spinner */}
            <div style={{position:'relative', width:72, height:72}}>
              <div style={{position:'absolute',inset:0,borderRadius:'50%',border:'3px solid rgba(255,255,255,0.05)'}}/>
              <motion.div
                animate={{ rotate:360 }} transition={{ duration:0.9, repeat:Infinity, ease:'linear' }}
                style={{position:'absolute',inset:0,borderRadius:'50%',border:'3px solid transparent',borderTopColor:'#1a98ff'}}
              />
              <motion.div
                animate={{ rotate:-360 }} transition={{ duration:1.5, repeat:Infinity, ease:'linear' }}
                style={{position:'absolute',inset:8,borderRadius:'50%',border:'2px solid transparent',borderTopColor:'rgba(255,255,255,0.15)'}}
              />
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={loadStep} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.28}}>
                <p style={{color:'#fff',fontWeight:600,fontSize:14,letterSpacing:'0.02em'}}>{loadStep}</p>
                <p style={{color:'#555',fontSize:12,marginTop:4}}>Resolving best stream source…</p>
              </motion.div>
            </AnimatePresence>

            {/* Progress bar */}
            <div style={{width:200,height:3,background:'rgba(255,255,255,0.08)',borderRadius:2,overflow:'hidden'}}>
              <motion.div
                animate={{ width:`${loadProgress}%` }}
                transition={{ duration:0.7, ease:'easeOut' }}
                style={{height:'100%',background:'linear-gradient(90deg,#1a98ff,#0070cc)',borderRadius:2}}
              />
            </div>

            {srcLabel && (
              <p style={{color:'#444',fontSize:11}}>
                via <span style={{color:'#1a98ff',fontWeight:600}}>{srcLabel}</span>
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ERROR OVERLAY ── */}
      <AnimatePresence>
        {loadState === 'error' && (
          <motion.div
            key="error"
            initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            style={{
              position:'absolute',inset:0,zIndex:20,
              display:'flex',flexDirection:'column',
              alignItems:'center',justifyContent:'center',gap:20,
              background:'rgba(0,0,0,0.96)',textAlign:'center',padding:'0 24px',
            }}
          >
            <AlertCircle style={{width:52,height:52,color:'#ff4444'}}/>
            <div>
              <p style={{color:'#fff',fontSize:20,fontWeight:700,marginBottom:8}}>Stream Unavailable</p>
              <p style={{color:'#888',fontSize:14,lineHeight:1.6,maxWidth:380}}>{errorMsg}</p>
            </div>
            <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'center'}}>
              <button onClick={e => { e.stopPropagation(); boot() }} style={{display:'flex',alignItems:'center',gap:8,background:'#1a98ff',color:'#fff',border:'none',padding:'10px 24px',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer'}}>
                <RefreshCw style={{width:16,height:16}}/> Try Again
              </button>
              <button onClick={e => { e.stopPropagation(); navigate(-1) }} style={{background:'rgba(255,255,255,0.1)',color:'#fff',border:'none',padding:'10px 24px',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer'}}>
                Go Back
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BUFFERING SPINNER ── */}
      <AnimatePresence>
        {loadState === 'playing' && isBuffering && (
          <motion.div key="buf" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            style={{position:'absolute',inset:0,zIndex:10,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
            <motion.div
              animate={{ rotate:360 }} transition={{ duration:0.85, repeat:Infinity, ease:'linear' }}
              style={{width:52,height:52,borderRadius:'50%',border:'3px solid rgba(255,255,255,0.15)',borderTopColor:'#fff'}}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── PLAYER CONTROLS UI ── */}
      {loadState !== 'error' && (
        <motion.div
          animate={{ opacity: showUI ? 1 : 0 }}
          transition={{ duration:0.25 }}
          style={{ position:'absolute', inset:0, zIndex:30, pointerEvents: showUI ? 'auto' : 'none' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Gradient overlays */}
          <div style={{position:'absolute',top:0,left:0,right:0,height:160,background:'linear-gradient(to bottom,rgba(0,0,0,0.85),transparent)',pointerEvents:'none'}}/>
          <div style={{position:'absolute',bottom:0,left:0,right:0,height:220,background:'linear-gradient(to top,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.6) 60%,transparent 100%)',pointerEvents:'none'}}/>

          {/* ── TOP BAR ── */}
          <div style={{position:'absolute',top:0,left:0,right:0,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',zIndex:10}}>
            {/* Left: close + title */}
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <button onClick={() => navigate(-1)} style={{...ICON_BTN,padding:4,borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                <Ic.Close/>
              </button>
              <div>
                <p style={{fontSize:20,fontWeight:700,letterSpacing:'-0.3px',color:'#fff'}}>{title || 'Now Playing'}</p>
                {srcLabel && <p style={{fontSize:11,color:'#555',marginTop:1}}>via <span style={{color:'#1a98ff',fontWeight:600}}>{srcLabel}</span></p>}
              </div>
            </div>

            {/* Right: controls + panels */}
            <div style={{display:'flex',alignItems:'center',gap:4,position:'relative'}}>

              {/* Captions button */}
              <button style={{...ICON_BTN, background: openPanel==='captions' ? C.active : 'none'}}
                onClick={e=>{e.stopPropagation();setOpenPanel(p=>p==='captions'?null:'captions')}}
                onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                onMouseLeave={e=>e.currentTarget.style.background=openPanel==='captions'?C.active:'none'}
                title="Subtitles/Captions">
                <Ic.CC/>
              </button>

              {/* Volume button */}
              <button style={{...ICON_BTN, background: openPanel==='volume' ? C.active : 'none'}}
                onClick={e=>{e.stopPropagation();setOpenPanel(p=>p==='volume'?null:'volume')}}
                onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                onMouseLeave={e=>e.currentTarget.style.background=openPanel==='volume'?C.active:'none'}
                title="Volume">
                {(muted || volume===0) ? <Ic.Mute/> : <Ic.Vol/>}
              </button>

              {/* PiP */}
              <button style={ICON_BTN}
                onClick={e=>{e.stopPropagation(); videoRef.current?.requestPictureInPicture?.().catch(()=>{})}}
                onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                onMouseLeave={e=>e.currentTarget.style.background='none'}
                title="Picture in Picture">
                <Ic.PiP/>
              </button>

              {/* Fullscreen */}
              <button style={ICON_BTN} onClick={e=>{e.stopPropagation();toggleFs()}}
                onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                onMouseLeave={e=>e.currentTarget.style.background='none'}
                title="Fullscreen">
                {fullscreen ? <Ic.FSExit/> : <Ic.FS/>}
              </button>

              {/* Settings */}
              <button style={{...ICON_BTN, background: openPanel==='settings' ? C.active : 'none'}}
                onClick={e=>{e.stopPropagation();setOpenPanel(p=>p==='settings'?null:'settings')}}
                onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                onMouseLeave={e=>e.currentTarget.style.background=openPanel==='settings'?C.active:'none'}
                title="Settings">
                <Ic.More/>
              </button>

              {/* ── SETTINGS PANEL ── */}
              <AnimatePresence>
                {openPanel === 'settings' && (
                  <motion.div key="settings" initial={{opacity:0,y:-8,scale:0.95}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:0.95}} transition={{duration:0.18}} style={panelStyle} onClick={e=>e.stopPropagation()}>
                    <div style={panelHdrStyle}>Settings</div>
                    {[
                      { id:'captions', icon:<Ic.CC/>, label:'Subtitles', value: captionLabel },
                      { id:'audio',    icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}><rect x="2" y="6" width="4" height="12" rx="1"/><rect x="8" y="3" width="4" height="18" rx="1"/><rect x="14" y="8" width="4" height="10" rx="1"/></svg>, label:'Audio', value: audioLabel },
                      { id:'quality',  icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="8" y1="20" x2="8" y2="22"/><line x1="16" y1="20" x2="16" y2="22"/><line x1="5" y1="22" x2="19" y2="22"/></svg>, label:'Quality', value: qualityLabel },
                      { id:'speed',    icon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label:'Speed', value: speedLabel },
                    ].map((item, idx, arr) => (
                      <div key={item.id} style={{...rowStyle, borderBottom: idx === arr.length-1 ? 'none' : `1px solid ${C.panelBorder}`}}
                        onClick={()=>setOpenPanel(item.id)}
                        onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        {item.icon}
                        <span style={{flex:1,fontSize:15,fontWeight:500}}>{item.label}</span>
                        <span style={{fontSize:14,color:C.textSec,display:'flex',alignItems:'center',gap:4}}>{item.value} <Ic.ChR/></span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── CAPTIONS PANEL ── */}
              <AnimatePresence>
                {openPanel === 'captions' && (
                  <motion.div key="captions" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.18}} style={panelStyle} onClick={e=>e.stopPropagation()}>
                    <div style={panelHdrStyle}>
                      <button style={{background:'none',border:'none',color:'#fff',cursor:'pointer',padding:2,borderRadius:4,display:'flex',alignItems:'center'}} onClick={()=>setOpenPanel('settings')}><Ic.ChL/></button>
                      Subtitles & Captions
                    </div>
                    {/* Off option */}
                    <div style={radioRowStyle} onClick={()=>switchCaption(-1)}
                      onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <RadioCircle selected={activeCap === -1}/>
                      <div style={{fontSize:15,fontWeight:500}}>Off</div>
                    </div>
                    {captions.length === 0 ? (
                      <p style={{color:C.textSec,fontSize:13,textAlign:'center',padding:'20px'}}>No subtitles available for this stream</p>
                    ) : captions.map((cap, idx) => (
                      <div key={idx} style={radioRowStyle} onClick={()=>switchCaption(idx)}
                        onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <RadioCircle selected={activeCap === idx}/>
                        <div>
                          <div style={{fontSize:15,fontWeight:500}}>{cap.label}</div>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── AUDIO PANEL ── */}
              <AnimatePresence>
                {openPanel === 'audio' && (
                  <motion.div key="audio" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.18}} style={panelStyle} onClick={e=>e.stopPropagation()}>
                    <div style={panelHdrStyle}>
                      <button style={{background:'none',border:'none',color:'#fff',cursor:'pointer',padding:2,borderRadius:4,display:'flex',alignItems:'center'}} onClick={()=>setOpenPanel('settings')}><Ic.ChL/></button>
                      Audio
                    </div>
                    {audioTracks.length === 0 ? (
                      <p style={{color:C.textSec,fontSize:13,textAlign:'center',padding:'28px 20px'}}>No alternate audio tracks available</p>
                    ) : audioTracks.map(t => (
                      <div key={t.id} style={radioRowStyle} onClick={()=>switchAudio(t.id)}
                        onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <RadioCircle selected={t.id === activeAudio}/>
                        <div>
                          <div style={{fontSize:15,fontWeight:500}}>{t.label}</div>
                          {t.lang && <div style={{fontSize:12,color:C.textSec,marginTop:2}}>{t.lang.toUpperCase()}</div>}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── QUALITY PANEL ── */}
              <AnimatePresence>
                {openPanel === 'quality' && (
                  <motion.div key="quality" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.18}} style={panelStyle} onClick={e=>e.stopPropagation()}>
                    <div style={panelHdrStyle}>
                      <button style={{background:'none',border:'none',color:'#fff',cursor:'pointer',padding:2,borderRadius:4,display:'flex',alignItems:'center'}} onClick={()=>setOpenPanel('settings')}><Ic.ChL/></button>
                      Video Quality
                    </div>
                    {qualities.length === 0 ? (
                      <p style={{color:C.textSec,fontSize:13,textAlign:'center',padding:'28px 20px'}}>Quality options not available</p>
                    ) : qualities.map(q => (
                      <div key={q.id} style={{...radioRowStyle, background: q.id === activeQuality ? 'rgba(255,255,255,0.95)' : 'transparent', borderRadius: q.id===activeQuality ? 6 : 0}}
                        onClick={()=>switchQuality(q.id)}
                        onMouseEnter={e=>{ if(q.id!==activeQuality) e.currentTarget.style.background=C.hover }}
                        onMouseLeave={e=>{ e.currentTarget.style.background = q.id===activeQuality ? 'rgba(255,255,255,0.95)' : 'transparent' }}>
                        <div style={{width:20,height:20,minWidth:20,border:`2px solid ${q.id===activeQuality?'#000':C.textSec}`,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:q.id===activeQuality?'#000':'transparent',flexShrink:0}}>
                          {q.id===activeQuality && <div style={{width:8,height:8,background:'#fff',borderRadius:'50%'}}/>}
                        </div>
                        <div>
                          <div style={{fontSize:15,fontWeight:500,color:q.id===activeQuality?'#000':'#fff'}}>{q.label}</div>
                          {q.bitrate && <div style={{fontSize:12,color:q.id===activeQuality?'#444':C.textSec,marginTop:2}}>~{(q.bitrate/1e6).toFixed(1)} Mbps</div>}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── SPEED PANEL ── */}
              <AnimatePresence>
                {openPanel === 'speed' && (
                  <motion.div key="speed" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.18}} style={panelStyle} onClick={e=>e.stopPropagation()}>
                    <div style={panelHdrStyle}>
                      <button style={{background:'none',border:'none',color:'#fff',cursor:'pointer',padding:2,borderRadius:4,display:'flex',alignItems:'center'}} onClick={()=>setOpenPanel('settings')}><Ic.ChL/></button>
                      Playback Speed
                    </div>
                    {SPEEDS.map(r => (
                      <div key={r} style={radioRowStyle} onClick={()=>setSpeedFn(r)}
                        onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <RadioCircle selected={r === speed}/>
                        <div style={{fontSize:15,fontWeight:500}}>{r===1?'Normal':`${r}×`}</div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── VOLUME POPUP ── */}
              <AnimatePresence>
                {openPanel === 'volume' && (
                  <motion.div key="volume" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.18}} style={{...panelStyle,width:240,padding:'16px 20px'}} onClick={e=>e.stopPropagation()}>
                    <label style={{fontSize:14,color:C.textSec,display:'block',marginBottom:14}}>Volume</label>
                    <input type="range" min="0" max="100" step="1" value={volPct}
                      onChange={e=>setVol(parseInt(e.target.value)/100)}
                      style={{width:'100%',WebkitAppearance:'none',appearance:'none',height:4,borderRadius:2,outline:'none',cursor:'pointer',
                        background:`linear-gradient(to right,#fff ${volPct}%,rgba(255,255,255,0.3) ${volPct}%)`}}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>

          {/* ── BOTTOM CONTROLS ── */}
          <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'0 0 28px 0',zIndex:10}}>
            {/* Seek bar */}
            <div style={{padding:'0 16px',marginBottom:16,display:'flex',alignItems:'center',gap:12}}>
              <span style={{fontSize:13,color:'#fff',minWidth:45,letterSpacing:'0.02em'}}>{fmt(current)}</span>

              <div ref={seekTrackRef} onClick={e=>{e.stopPropagation();seekTo(e)}}
                style={{flex:1,position:'relative',height:3,background:'rgba(255,255,255,0.3)',borderRadius:2,cursor:'pointer',transition:'height 0.15s'}}
                onMouseEnter={e=>{e.currentTarget.style.height='5px'}}
                onMouseLeave={e=>{e.currentTarget.style.height='3px'}}>
                <div style={{position:'absolute',inset:'0 auto 0 0',width:`${pctBuffered}%`,background:'rgba(255,255,255,0.2)',borderRadius:2}}/>
                <div style={{position:'absolute',inset:'0 auto 0 0',width:`${pctPlayed}%`,background:'#fff',borderRadius:2}}>
                  <div style={{position:'absolute',right:-5,top:'50%',transform:'translateY(-50%)',width:10,height:10,background:'#fff',borderRadius:'50%',boxShadow:'0 0 4px rgba(0,0,0,0.5)'}}/>
                </div>
              </div>

              <span style={{fontSize:13,color:'#fff',minWidth:45,textAlign:'right',letterSpacing:'0.02em'}}>{fmt(duration)}</span>
            </div>

            {/* Playback buttons */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:20}}>
              <button style={{background:'none',border:'none',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',transition:'background 0.15s',padding:6}}
                onClick={e=>{e.stopPropagation();if(videoRef.current)videoRef.current.currentTime=Math.max(0,videoRef.current.currentTime-10);resetHide()}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'}
                onMouseLeave={e=>e.currentTarget.style.background='none'}
                title="Back 10s">
                <Ic.SkipB/>
              </button>

              <button onClick={e=>{e.stopPropagation();togglePlay()}}
                style={{width:56,height:56,background:'rgba(255,255,255,0.95)',border:'none',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#000',transition:'background 0.15s'}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,1)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.95)'}>
                <AnimatePresence mode="wait">
                  {playing
                    ? <motion.div key="p" initial={{scale:0}} animate={{scale:1}} exit={{scale:0}} transition={{duration:0.15}}><Ic.Pause/></motion.div>
                    : <motion.div key="pl" initial={{scale:0}} animate={{scale:1}} exit={{scale:0}} transition={{duration:0.15}}><Ic.Play/></motion.div>
                  }
                </AnimatePresence>
              </button>

              <button style={{background:'none',border:'none',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',transition:'background 0.15s',padding:6}}
                onClick={e=>{e.stopPropagation();if(videoRef.current)videoRef.current.currentTime=Math.min(duration,videoRef.current.currentTime+10);resetHide()}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'}
                onMouseLeave={e=>e.currentTarget.style.background='none'}
                title="Forward 10s">
                <Ic.SkipF/>
              </button>
            </div>
          </div>

        </motion.div>
      )}
    </div>
  )
}
