import React, {
  useEffect, useRef, useState, useCallback,
} from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Play, Pause, Volume2, VolumeX,
  Maximize, Minimize, Settings, RefreshCw,
  SkipBack, SkipForward, Loader2, AlertCircle,
  Languages, Gauge, Subtitles as SubIcon,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// hls.js loaded from CDN — zero npm install needed.
// We inject the script once and resolve a promise when it's ready.
// ─────────────────────────────────────────────────────────────────────────────
let hlsReady = null
function loadHlsJs() {
  if (hlsReady) return hlsReady
  hlsReady = new Promise((resolve) => {
    if (window.Hls) { resolve(window.Hls); return }
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js'
    s.onload  = () => resolve(window.Hls)
    s.onerror = () => resolve(null)          // fallback: native HLS
    document.head.appendChild(s)
  })
  return hlsReady
}

// ─────────────────────────────────────────────────────────────────────────────
// Stream sources — each exposes a page that contains a raw .m3u8 URL.
// We scrape it via /api/proxy (our Vercel serverless fn, no CORS).
// ─────────────────────────────────────────────────────────────────────────────
const SOURCES = [
  {
    id: 'vidsrc-me',
    label: 'VidSrc',
    movie: (id) => `https://vidsrc.me/embed/movie?tmdb=${id}`,
    tv:    (id, s, e) => `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    id: 'vidsrc-xyz',
    label: 'VidSrc XYZ',
    movie: (id) => `https://vidsrc.xyz/embed/movie?tmdb=${id}`,
    tv:    (id, s, e) => `https://vidsrc.xyz/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    id: 'vidsrc-cc',
    label: 'VidSrc CC',
    movie: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
    tv:    (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: 'autoembed',
    label: 'AutoEmbed',
    movie: (id) => `https://player.autoembed.cc/embed/movie/${id}`,
    tv:    (id, s, e) => `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: 'embed-su',
    label: 'Embed.su',
    movie: (id) => `https://embed.su/embed/movie/${id}`,
    tv:    (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: '2embed',
    label: '2Embed',
    movie: (id) => `https://www.2embed.cc/embed/${id}`,
    tv:    (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Fetch embed page through our proxy and extract the best .m3u8 URL
// ─────────────────────────────────────────────────────────────────────────────
const M3U8_PATTERNS = [
  /["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)/g,
  /file\s*:\s*["'`]([^"'`]+\.m3u8[^"'`]*)/g,
  /source\s*:\s*["'`]([^"'`]+\.m3u8[^"'`]*)/g,
  /src\s*:\s*["'`]([^"'`]+\.m3u8[^"'`]*)/g,
  /url\s*:\s*["'`]([^"'`]+\.m3u8[^"'`]*)/g,
  /stream\s*:\s*["'`]([^"'`]+\.m3u8[^"'`]*)/g,
  /(https?:\/\/[^\s"'<>{}]+\.m3u8[^\s"'<>{}]*)/g,
]

async function extractM3u8(embedUrl) {
  const res = await fetch(`/api/proxy?url=${encodeURIComponent(embedUrl)}`)
  if (!res.ok) throw new Error(`proxy ${res.status}`)
  const html = await res.text()

  const seen = new Set()
  const candidates = []

  for (const pat of M3U8_PATTERNS) {
    pat.lastIndex = 0
    let m
    while ((m = pat.exec(html)) !== null) {
      const u = m[1]
      if (!u || seen.has(u)) continue
      seen.add(u)
      // Skip obvious ad/tracking URLs
      if (/ads?[_.-]|track|beacon|analytics|doubleclick/i.test(u)) continue
      candidates.push(u)
    }
  }

  if (!candidates.length) throw new Error('no m3u8 in page')

  // Prefer longer, more specific CDN URLs (usually the actual stream)
  candidates.sort((a, b) => b.length - a.length)
  return `/api/proxy?url=${encodeURIComponent(candidates[0])}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (s) => {
  if (!s || isNaN(s)) return '0:00'
  const t = Math.floor(s)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = t % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

// ─────────────────────────────────────────────────────────────────────────────
// Player component
// ─────────────────────────────────────────────────────────────────────────────
export default function Player() {
  const { type = 'movie', id } = useParams()
  const navigate = useNavigate()

  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const seekBarRef   = useRef(null)
  const hideTimer    = useRef(null)

  // ── Playback state ──────────────────────────────────────────────────────
  const [playing,    setPlaying]    = useState(false)
  const [muted,      setMuted]      = useState(false)
  const [volume,     setVolume]     = useState(1)
  const [current,    setCurrent]    = useState(0)
  const [duration,   setDuration]   = useState(0)
  const [buffered,   setBuffered]   = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [speed,      setSpeed]      = useState(1)
  const [seeking,    setSeeking]    = useState(false)

  // ── HLS track state ─────────────────────────────────────────────────────
  const [audioTracks,   setAudioTracks]   = useState([])
  const [activeAudio,   setActiveAudio]   = useState(-1)
  const [qualities,     setQualities]     = useState([])
  const [activeQuality, setActiveQuality] = useState(-1)
  const [subTracks,     setSubTracks]     = useState([])
  const [activeSub,     setActiveSub]     = useState(-1)

  // ── UI state ────────────────────────────────────────────────────────────
  const [showUI,      setShowUI]      = useState(true)
  const [showPanel,   setShowPanel]   = useState(false)
  const [panelTab,    setPanelTab]    = useState('audio')
  const [loadState,   setLoadState]   = useState('loading')   // loading | playing | error
  const [errorMsg,    setErrorMsg]    = useState('')
  const [srcIdx,      setSrcIdx]      = useState(0)
  const [srcLabel,    setSrcLabel]    = useState('')

  const [season]  = useState(1)
  const [episode] = useState(1)

  // ── Auto-hide controls ──────────────────────────────────────────────────
  const resetHide = useCallback(() => {
    setShowUI(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      setShowUI(false)
      setShowPanel(false)
    }, 3500)
  }, [])

  useEffect(() => {
    resetHide()
    return () => clearTimeout(hideTimer.current)
  }, [resetHide])

  // ── Boot HLS for a given source index ──────────────────────────────────
  const boot = useCallback(async (idx) => {
    if (idx >= SOURCES.length) {
      setLoadState('error')
      setErrorMsg('All sources failed. The title may not be available in your region.')
      return
    }

    const src = SOURCES[idx]
    setSrcIdx(idx)
    setSrcLabel(src.label)
    setLoadState('loading')
    setAudioTracks([])
    setQualities([])
    setSubTracks([])

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    try {
      const embedUrl = type === 'tv' ? src.tv(id, season, episode) : src.movie(id)
      const m3u8     = await extractM3u8(embedUrl)
      const Hls      = await loadHlsJs()

      const video = videoRef.current
      if (!video) return

      // Safari / iOS native HLS
      if (!Hls || !Hls.isSupported()) {
        video.src = m3u8
        video.play().catch(() => {})
        setLoadState('playing')
        return
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        xhrSetup(xhr) { xhr.withCredentials = false },
      })
      hlsRef.current = hls

      hls.loadSource(m3u8)
      hls.attachMedia(video)

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        // Quality levels
        setQualities([
          { id: -1, label: 'Auto' },
          ...data.levels.map((l, i) => ({
            id: i,
            label: l.height ? `${l.height}p` : `Level ${i + 1}`,
          })),
        ])
        setActiveQuality(-1)

        // Audio tracks
        const at = hls.audioTracks || []
        if (at.length) {
          setAudioTracks(at.map((t, i) => ({
            id: i,
            label: t.name || t.lang || `Track ${i + 1}`,
          })))
          setActiveAudio(hls.audioTrack)
        }

        // Subtitle tracks
        const st = hls.subtitleTracks || []
        setSubTracks([
          { id: -1, label: 'Off' },
          ...st.map((t, i) => ({
            id: i,
            label: t.name || t.lang || `Sub ${i + 1}`,
          })),
        ])
        setActiveSub(-1)

        setLoadState('playing')
        video.play().catch(() => {})
      })

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
        setAudioTracks(data.audioTracks.map((t, i) => ({
          id: i, label: t.name || t.lang || `Track ${i + 1}`,
        })))
      })
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => setActiveAudio(data.id))

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.warn('[apex] fatal HLS error → trying next source', data.type, data.details)
          boot(idx + 1)
        }
      })
    } catch (err) {
      console.warn(`[apex] ${src.label} failed:`, err.message)
      boot(idx + 1)
    }
  }, [type, id, season, episode])

  useEffect(() => {
    boot(0)
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [boot])

  // ── Video element listeners ─────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    const onPlay   = () => setPlaying(true)
    const onPause  = () => setPlaying(false)
    const onTime   = () => {
      if (!seeking) setCurrent(v.currentTime)
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
    }
    const onMeta   = () => setDuration(v.duration)
    const onVol    = () => { setVolume(v.volume); setMuted(v.muted) }
    v.addEventListener('play',           onPlay)
    v.addEventListener('pause',          onPause)
    v.addEventListener('timeupdate',     onTime)
    v.addEventListener('loadedmetadata', onMeta)
    v.addEventListener('durationchange', onMeta)
    v.addEventListener('volumechange',   onVol)
    return () => {
      v.removeEventListener('play',           onPlay)
      v.removeEventListener('pause',          onPause)
      v.removeEventListener('timeupdate',     onTime)
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('durationchange', onMeta)
      v.removeEventListener('volumechange',   onVol)
    }
  }, [seeking])

  // ── Fullscreen ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // ── Keyboard ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return
      const v = videoRef.current
      if (!v) return
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); v.paused ? v.play() : v.pause(); break
        case 'ArrowRight':  e.preventDefault(); v.currentTime = Math.min(duration, v.currentTime + 10); break
        case 'ArrowLeft':   e.preventDefault(); v.currentTime = Math.max(0,        v.currentTime - 10); break
        case 'ArrowUp':     e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); break
        case 'ArrowDown':   e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); break
        case 'm':           v.muted = !v.muted; break
        case 'f':           toggleFs(); break
        default: break
      }
      resetHide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duration, resetHide])

  // ── Actions ─────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current; if (!v) return
    v.paused ? v.play() : v.pause()
    resetHide()
  }
  const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !v.muted }
  const setVol     = (val) => { const v = videoRef.current; if (!v) return; v.volume = val; v.muted = val === 0 }
  const toggleFs   = () => {
    document.fullscreenElement
      ? document.exitFullscreen()
      : containerRef.current?.requestFullscreen()
  }
  const setSpeedFn = (r) => { if (videoRef.current) videoRef.current.playbackRate = r; setSpeed(r) }
  const switchAudio = (id) => { if (hlsRef.current) hlsRef.current.audioTrack = id; setActiveAudio(id) }
  const switchQuality = (lvl) => { if (hlsRef.current) hlsRef.current.currentLevel = lvl; setActiveQuality(lvl) }
  const switchSub = (id) => {
    if (hlsRef.current) { hlsRef.current.subtitleTrack = id; hlsRef.current.subtitleDisplay = id !== -1 }
    setActiveSub(id)
  }

  // Seek bar interaction
  const getSeekPct = (e) => {
    const bar = seekBarRef.current; if (!bar || !duration) return 0
    const { left, width } = bar.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - left) / width))
  }
  const onSeekClick = (e) => {
    const pct = getSeekPct(e)
    if (videoRef.current) videoRef.current.currentTime = pct * duration
    setCurrent(pct * duration)
  }

  const pctPlayed   = duration ? (current  / duration) * 100 : 0
  const pctBuffered = duration ? (buffered / duration) * 100 : 0

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black z-[100] flex flex-col overflow-hidden select-none"
      onMouseMove={resetHide}
      onTouchStart={resetHide}
    >
      {/* ══ VIDEO ══ */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        crossOrigin="anonymous"
        onClick={togglePlay}
      />

      {/* ══ LOADING ══ */}
      {loadState === 'loading' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/90">
          <div className="w-16 h-16 rounded-full border-4 border-[#00a8e1]/20 border-t-[#00a8e1] animate-spin" />
          <p className="text-white font-semibold text-sm">Fetching stream…</p>
          <p className="text-gray-500 text-xs">via {srcLabel}</p>
          {/* Source chips so user can skip immediately */}
          <div className="flex flex-wrap justify-center gap-2 mt-2 max-w-sm px-4">
            {SOURCES.map((s, i) => (
              <button
                key={s.id}
                onClick={() => boot(i)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all
                  ${i === srcIdx
                    ? 'border-[#00a8e1] text-[#00a8e1] bg-[#00a8e1]/10'
                    : 'border-white/15 text-gray-500 hover:border-white/30 hover:text-gray-200'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══ ERROR ══ */}
      {loadState === 'error' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black px-6 text-center">
          <AlertCircle className="w-14 h-14 text-red-500" />
          <div>
            <h2 className="text-white text-xl font-bold mb-2">Stream unavailable</h2>
            <p className="text-gray-400 text-sm max-w-sm">{errorMsg}</p>
          </div>
          <div className="flex gap-3 flex-wrap justify-center">
            <button onClick={() => boot(0)} className="flex items-center gap-2 bg-[#00a8e1] text-white px-5 py-2.5 rounded-lg font-bold hover:bg-sky-400 transition-colors">
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
            <button onClick={() => navigate(-1)} className="bg-white/10 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-white/20 transition-colors">
              Go back
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          CONTROLS OVERLAY — fades when playing
      ══════════════════════════════════════════════════════════════════ */}
      {loadState !== 'error' && (
        <div
          className={`absolute inset-0 z-30 flex flex-col justify-between
            transition-opacity duration-400
            ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          {/* ── TOP BAR ── */}
          <div className="flex items-center gap-3 px-4 md:px-6 py-4
            bg-gradient-to-b from-black/90 via-black/40 to-transparent">
            <button onClick={() => navigate(-1)} className="text-white hover:bg-white/20 p-1.5 rounded-full transition-colors flex-shrink-0">
              <ChevronLeft className="w-7 h-7" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm md:text-base uppercase tracking-widest leading-none">
                Now Playing
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Source: <span className="text-[#00a8e1] font-semibold">{srcLabel}</span>
              </p>
            </div>
            <button
              onClick={() => boot((srcIdx + 1) % SOURCES.length)}
              title="Next source"
              className="text-gray-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          {/* ── BIG CENTRE PLAY BUTTON ── */}
          <button
            onClick={togglePlay}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
              w-20 h-20 rounded-full bg-black/40 backdrop-blur-sm
              flex items-center justify-center
              hover:bg-black/60 hover:scale-110 transition-all"
          >
            {playing
              ? <Pause fill="white" className="w-9 h-9 text-white" />
              : <Play  fill="white" className="w-9 h-9 text-white ml-1" />}
          </button>

          {/* ── BOTTOM BAR ── */}
          <div className="px-4 md:px-6 pb-4 pt-2 bg-gradient-to-t from-black/95 via-black/50 to-transparent">

            {/* Seek bar */}
            <div
              ref={seekBarRef}
              className="relative h-[5px] mb-4 rounded-full bg-white/20 cursor-pointer group"
              onClick={onSeekClick}
            >
              <div className="absolute inset-y-0 left-0 rounded-full bg-white/25 pointer-events-none"
                style={{ width: `${pctBuffered}%` }} />
              <div className="absolute inset-y-0 left-0 rounded-full bg-[#00a8e1] pointer-events-none"
                style={{ width: `${pctPlayed}%` }} />
              <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white
                opacity-0 group-hover:opacity-100 transition-opacity shadow-lg pointer-events-none"
                style={{ left: `calc(${pctPlayed}% - 8px)` }} />
            </div>

            {/* Controls row */}
            <div className="flex items-center gap-2 md:gap-3">

              <button onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 10 }} className="text-white/80 hover:text-white transition-colors hidden sm:block">
                <SkipBack className="w-5 h-5" />
              </button>

              <button onClick={togglePlay} className="text-white hover:text-[#00a8e1] transition-colors">
                {playing
                  ? <Pause fill="white" className="w-6 h-6" />
                  : <Play  fill="white" className="w-6 h-6 ml-0.5" />}
              </button>

              <button onClick={() => { if (videoRef.current) videoRef.current.currentTime += 10 }} className="text-white/80 hover:text-white transition-colors hidden sm:block">
                <SkipForward className="w-5 h-5" />
              </button>

              <button onClick={toggleMute} className="text-white hover:text-[#00a8e1] transition-colors">
                {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              <input
                type="range" min="0" max="1" step="0.02"
                value={muted ? 0 : volume}
                onChange={(e) => setVol(parseFloat(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                className="w-20 md:w-28 accent-[#00a8e1] cursor-pointer"
              />

              <span className="text-white/80 text-xs font-mono tabular-nums ml-1 hidden sm:inline">
                {fmt(current)} / {fmt(duration)}
              </span>

              <div className="flex-1" />

              {/* ── SETTINGS BUTTON + PANEL ── */}
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => { setShowPanel(p => !p); resetHide() }}
                  className={`p-1.5 rounded-lg transition-colors hover:bg-white/10
                    ${showPanel ? 'text-[#00a8e1]' : 'text-white'}`}
                >
                  <Settings className="w-5 h-5" />
                </button>

                {showPanel && (
                  <div className="absolute bottom-12 right-0 w-72 rounded-2xl overflow-hidden shadow-2xl
                    bg-[#0d1620]/98 border border-white/10 backdrop-blur-xl z-40">

                    {/* Tabs */}
                    <div className="flex border-b border-white/10">
                      {[
                        { id: 'audio',   icon: <Languages className="w-4 h-4" />, label: 'Audio'   },
                        { id: 'quality', icon: <Gauge      className="w-4 h-4" />, label: 'Quality' },
                        { id: 'speed',   icon: <Gauge      className="w-4 h-4" />, label: 'Speed'   },
                        { id: 'subs',    icon: <SubIcon    className="w-4 h-4" />, label: 'Subs'    },
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setPanelTab(tab.id)}
                          className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors
                            ${panelTab === tab.id
                              ? 'text-[#00a8e1] border-b-2 border-[#00a8e1]'
                              : 'text-gray-500 hover:text-gray-300'}`}
                        >
                          {tab.icon}
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* ─ Audio ─ */}
                    {panelTab === 'audio' && (
                      <div className="max-h-56 overflow-y-auto py-1">
                        {audioTracks.length === 0
                          ? <p className="text-gray-600 text-xs text-center py-8">No alternate audio tracks found.<br/>Try a different source.</p>
                          : audioTracks.map(t => (
                            <button key={t.id} onClick={() => switchAudio(t.id)}
                              className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium
                                transition-colors hover:bg-white/8
                                ${t.id === activeAudio ? 'text-[#00a8e1] bg-[#00a8e1]/8' : 'text-gray-300'}`}>
                              <span>{t.label}</span>
                              {t.id === activeAudio && <span className="w-2 h-2 rounded-full bg-[#00a8e1]" />}
                            </button>
                          ))
                        }
                      </div>
                    )}

                    {/* ─ Quality ─ */}
                    {panelTab === 'quality' && (
                      <div className="max-h-56 overflow-y-auto py-1">
                        {qualities.length === 0
                          ? <p className="text-gray-600 text-xs text-center py-8">Loading quality levels…</p>
                          : qualities.map(q => (
                            <button key={q.id} onClick={() => switchQuality(q.id)}
                              className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium
                                transition-colors hover:bg-white/8
                                ${q.id === activeQuality ? 'text-[#00a8e1] bg-[#00a8e1]/8' : 'text-gray-300'}`}>
                              <span>{q.label}</span>
                              {q.id === activeQuality && <span className="w-2 h-2 rounded-full bg-[#00a8e1]" />}
                            </button>
                          ))
                        }
                      </div>
                    )}

                    {/* ─ Speed ─ */}
                    {panelTab === 'speed' && (
                      <div className="py-1">
                        {SPEEDS.map(r => (
                          <button key={r} onClick={() => setSpeedFn(r)}
                            className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium
                              transition-colors hover:bg-white/8
                              ${r === speed ? 'text-[#00a8e1] bg-[#00a8e1]/8' : 'text-gray-300'}`}>
                            <span>{r === 1 ? 'Normal' : `${r}×`}</span>
                            {r === speed && <span className="w-2 h-2 rounded-full bg-[#00a8e1]" />}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* ─ Subtitles ─ */}
                    {panelTab === 'subs' && (
                      <div className="max-h-56 overflow-y-auto py-1">
                        {subTracks.length <= 1
                          ? <p className="text-gray-600 text-xs text-center py-8">No subtitles in this stream.</p>
                          : subTracks.map(t => (
                            <button key={t.id} onClick={() => switchSub(t.id)}
                              className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium
                                transition-colors hover:bg-white/8
                                ${t.id === activeSub ? 'text-[#00a8e1] bg-[#00a8e1]/8' : 'text-gray-300'}`}>
                              <span>{t.label}</span>
                              {t.id === activeSub && <span className="w-2 h-2 rounded-full bg-[#00a8e1]" />}
                            </button>
                          ))
                        }
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Fullscreen */}
              <button onClick={toggleFs} className="text-white hover:text-[#00a8e1] transition-colors ml-1">
                {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}
