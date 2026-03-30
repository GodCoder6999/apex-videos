import React, {
  useEffect, useRef, useState, useCallback,
} from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ChevronLeft, Play, Pause, Volume2, VolumeX,
  Maximize, Minimize, Settings, Subtitles,
  Languages, Gauge, SkipBack, SkipForward,
  Loader2, AlertCircle, RefreshCw,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Stream sources — ordered by reliability.
// Each one returns a raw .m3u8 when loaded in a browser context.
// Our Vite proxy injects the correct Referer so CORS is never an issue.
// ─────────────────────────────────────────────────────────────────────────────
const STREAM_SOURCES = [
  {
    id: 'vidsrc-me',
    label: 'VidSrc ME',
    movie: (id) => `https://vidsrc.me/embed/movie?tmdb=${id}`,
    tv:    (id, s, e) => `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
    // VidSrc ME exposes the raw m3u8 in a script tag — we scrape it via proxy
    isScraped: true,
  },
  {
    id: 'vidsrc-xyz',
    label: 'VidSrc XYZ',
    movie: (id) => `https://vidsrc.xyz/embed/movie?tmdb=${id}`,
    tv:    (id, s, e) => `https://vidsrc.xyz/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
    isScraped: true,
  },
  {
    id: 'vidsrc-cc',
    label: 'VidSrc CC',
    movie: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
    tv:    (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`,
    isScraped: true,
  },
  {
    id: 'autoembed',
    label: 'AutoEmbed',
    movie: (id) => `https://player.autoembed.cc/embed/movie/${id}`,
    tv:    (id, s, e) => `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`,
    isScraped: true,
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Fetch an embed page via our CORS proxy and extract the m3u8 URL from it.
// The m3u8 URL is reliably embedded in a <script> or as a direct link.
// ─────────────────────────────────────────────────────────────────────────────
async function extractM3u8(embedUrl) {
  const proxied = `/api/proxy?url=${encodeURIComponent(embedUrl)}`
  const res = await fetch(proxied)
  if (!res.ok) throw new Error(`proxy ${res.status}`)
  const html = await res.text()

  // Pattern 1 — direct m3u8 URL in HTML / JS
  const patterns = [
    /["']([^"']*\.m3u8[^"']*)/g,
    /file\s*:\s*["']([^"']+\.m3u8[^"']*)/g,
    /src\s*:\s*["']([^"']+\.m3u8[^"']*)/g,
    /source\s*:\s*["']([^"']+\.m3u8[^"']*)/g,
    /url\s*:\s*["']([^"']+\.m3u8[^"']*)/g,
    /hls\s*:\s*["']([^"']+\.m3u8[^"']*)/g,
    /stream\s*:\s*["']([^"']+\.m3u8[^"']*)/g,
    /(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/g,
  ]

  const seen = new Set()
  const candidates = []

  for (const pattern of patterns) {
    let m
    pattern.lastIndex = 0
    while ((m = pattern.exec(html)) !== null) {
      const raw = m[1]
      if (!raw || seen.has(raw)) continue
      seen.add(raw)
      // Prefer URLs that look like real CDN streams (not ad networks)
      if (!raw.includes('ads') && !raw.includes('track') && !raw.includes('beacon')) {
        candidates.push(raw)
      }
    }
  }

  if (candidates.length === 0) throw new Error('no m3u8 found in page')

  // Pick the longest / most specific candidate (usually the right one)
  const best = candidates.sort((a, b) => b.length - a.length)[0]
  // Return it wrapped through our proxy
  return `/api/proxy?url=${encodeURIComponent(best)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmt = (s) => {
  const t = Math.floor(s)
  const h = Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const sec = t % 60
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  return `${m}:${String(sec).padStart(2,'0')}`
}

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Player() {
  const { type = 'movie', id } = useParams()
  const navigate = useNavigate()

  const videoRef    = useRef(null)
  const hlsRef      = useRef(null)
  const containerRef = useRef(null)
  const hideTimer   = useRef(null)
  const seekRef     = useRef(null)

  // Playback state
  const [playing,   setPlaying]   = useState(false)
  const [muted,     setMuted]     = useState(false)
  const [volume,    setVolume]    = useState(1)
  const [current,   setCurrent]   = useState(0)
  const [duration,  setDuration]  = useState(0)
  const [buffered,  setBuffered]  = useState(0)
  const [fullscreen, setFullscreen] = useState(false)
  const [rate,      setRate]      = useState(1)

  // HLS track state
  const [audioTracks,    setAudioTracks]    = useState([])
  const [activeAudio,    setActiveAudio]    = useState(-1)
  const [qualities,      setQualities]      = useState([])
  const [activeQuality,  setActiveQuality]  = useState(-1)
  const [subtitleTracks, setSubtitleTracks] = useState([])
  const [activeSub,      setActiveSub]      = useState(-1)

  // UI state
  const [showControls, setShowControls] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab,  setSettingsTab]  = useState('audio') // audio | quality | speed | subs
  const [loadState,    setLoadState]    = useState('loading') // loading | ready | error
  const [errorMsg,     setErrorMsg]     = useState('')
  const [sourceIdx,    setSourceIdx]    = useState(0)
  const [sourceName,   setSourceName]   = useState('')
  const [season]  = useState(1)
  const [episode] = useState(1)

  // ── Reset show-controls timer ──────────────────────────────────────────────
  const resetHide = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideTimer.current)
    if (playing) {
      hideTimer.current = setTimeout(() => {
        setShowControls(false)
        setShowSettings(false)
      }, 3500)
    }
  }, [playing])

  // ── Initialise / reinitialise hls.js ──────────────────────────────────────
  const initHls = useCallback(async (srcIndex) => {
    const source = STREAM_SOURCES[srcIndex]
    if (!source) { setLoadState('error'); setErrorMsg('All sources exhausted.'); return }

    setLoadState('loading')
    setSourceName(source.label)
    setAudioTracks([])
    setQualities([])
    setSubtitleTracks([])

    // Destroy previous instance
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }

    try {
      const embedUrl = type === 'tv'
        ? source.tv(id, season, episode)
        : source.movie(id)

      const m3u8 = await extractM3u8(embedUrl)

      if (!Hls.isSupported()) {
        // Safari native HLS
        videoRef.current.src = m3u8
        videoRef.current.play().catch(() => {})
        setLoadState('ready')
        return
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
        xhrSetup(xhr) {
          xhr.withCredentials = false
        },
      })
      hlsRef.current = hls

      hls.loadSource(m3u8)
      hls.attachMedia(videoRef.current)

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        // Quality levels
        setQualities([
          { id: -1, label: 'Auto' },
          ...data.levels.map((l, i) => ({
            id: i,
            label: l.height ? `${l.height}p` : `${Math.round(l.bitrate / 1000)}k`,
          })),
        ])

        // Audio tracks
        const at = hls.audioTracks || []
        setAudioTracks(at.map((t, i) => ({ id: i, label: t.name || t.lang || `Track ${i + 1}`, lang: t.lang })))
        setActiveAudio(hls.audioTrack)

        // Subtitle tracks
        const st = hls.subtitleTracks || []
        setSubtitleTracks([
          { id: -1, label: 'Off' },
          ...st.map((t, i) => ({ id: i, label: t.name || t.lang || `Sub ${i + 1}` })),
        ])

        setLoadState('ready')
        videoRef.current.play().catch(() => {})
      })

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
        setAudioTracks(data.audioTracks.map((t, i) => ({
          id: i, label: t.name || t.lang || `Track ${i + 1}`, lang: t.lang,
        })))
      })

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => {
        setActiveAudio(data.id)
      })

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.warn('[apex] fatal HLS error, trying next source', data)
          initHls(srcIndex + 1)
        }
      })
    } catch (err) {
      console.warn(`[apex] source ${source.label} failed:`, err)
      initHls(srcIndex + 1)
    }
  }, [type, id, season, episode])

  useEffect(() => {
    initHls(0)
    return () => {
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [initHls])

  // ── Video element event listeners ─────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onPlay   = () => setPlaying(true)
    const onPause  = () => setPlaying(false)
    const onTime   = () => {
      setCurrent(v.currentTime)
      if (v.buffered.length > 0) setBuffered(v.buffered.end(v.buffered.length - 1))
    }
    const onLoaded = () => setDuration(v.duration)
    const onVol    = () => setVolume(v.volume)

    v.addEventListener('play',           onPlay)
    v.addEventListener('pause',          onPause)
    v.addEventListener('timeupdate',     onTime)
    v.addEventListener('loadedmetadata', onLoaded)
    v.addEventListener('volumechange',   onVol)

    return () => {
      v.removeEventListener('play',           onPlay)
      v.removeEventListener('pause',          onPause)
      v.removeEventListener('timeupdate',     onTime)
      v.removeEventListener('loadedmetadata', onLoaded)
      v.removeEventListener('volumechange',   onVol)
    }
  }, [])

  // ── Fullscreen listener ────────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const v = videoRef.current
      if (!v) return
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); togglePlay(); break
        case 'ArrowRight':  e.preventDefault(); v.currentTime += 10; break
        case 'ArrowLeft':   e.preventDefault(); v.currentTime -= 10; break
        case 'ArrowUp':     e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); break
        case 'ArrowDown':   e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); break
        case 'm':           toggleMute(); break
        case 'f':           toggleFullscreen(); break
        default: break
      }
      resetHide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [resetHide])

  // ── Controls ───────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    v.paused ? v.play() : v.pause()
    resetHide()
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  const setVolumeLevel = (val) => {
    const v = videoRef.current
    if (!v) return
    v.volume = val
    v.muted = val === 0
    setMuted(val === 0)
    setVolume(val)
  }

  const seek = (e) => {
    if (!seekRef.current || !videoRef.current || !duration) return
    const rect = seekRef.current.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    videoRef.current.currentTime = pct * duration
  }

  const toggleFullscreen = () => {
    const el = containerRef.current
    if (!el) return
    document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen()
  }

  const setPlaybackRate = (r) => {
    if (videoRef.current) videoRef.current.playbackRate = r
    setRate(r)
  }

  const switchAudio = (trackId) => {
    if (hlsRef.current) hlsRef.current.audioTrack = trackId
    setActiveAudio(trackId)
  }

  const switchQuality = (levelId) => {
    if (hlsRef.current) hlsRef.current.currentLevel = levelId
    setActiveQuality(levelId)
  }

  const switchSubtitle = (trackId) => {
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack = trackId
      hlsRef.current.subtitleDisplay = trackId !== -1
    }
    setActiveSub(trackId)
  }

  const trySources = () => {
    const next = (sourceIdx + 1) % STREAM_SOURCES.length
    setSourceIdx(next)
    initHls(next)
  }

  const pctPlayed  = duration ? (current  / duration) * 100 : 0
  const pctBuffered = duration ? (buffered / duration) * 100 : 0

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black z-[100] flex flex-col select-none"
      onMouseMove={resetHide}
      onTouchStart={resetHide}
      onClick={() => { if (loadState === 'ready') togglePlay() }}
    >
      {/* ── VIDEO ELEMENT ── */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        crossOrigin="anonymous"
      />

      {/* ── LOADING OVERLAY ── */}
      {loadState === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 z-20">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-[#00a8e1]/20 border-t-[#00a8e1] animate-spin" />
          </div>
          <p className="text-white font-semibold text-sm">Fetching stream…</p>
          <p className="text-gray-500 text-xs">via {sourceName}</p>
        </div>
      )}

      {/* ── ERROR OVERLAY ── */}
      {loadState === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black z-20 px-6 text-center">
          <AlertCircle className="w-14 h-14 text-red-500" />
          <div>
            <h2 className="text-white text-xl font-bold mb-2">Stream unavailable</h2>
            <p className="text-gray-400 text-sm max-w-sm">{errorMsg || 'Could not load any stream for this title.'}</p>
          </div>
          <div className="flex gap-3">
            <button onClick={trySources} className="flex items-center gap-2 bg-[#00a8e1] text-white px-5 py-2.5 rounded-lg font-bold hover:bg-sky-400 transition-colors">
              <RefreshCw className="w-4 h-4" /> Try next source
            </button>
            <button onClick={() => navigate(-1)} className="bg-white/10 text-white px-5 py-2.5 rounded-lg font-bold hover:bg-white/20 transition-colors">Go back</button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          CONTROLS — fade in/out
      ══════════════════════════════════════════════════════════════════════ */}
      <div
        className={`absolute inset-0 flex flex-col justify-between z-30 transition-opacity duration-300 pointer-events-none
          ${showControls ? 'opacity-100' : 'opacity-0'}`}
        style={{ pointerEvents: showControls ? 'auto' : 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── TOP BAR ── */}
        <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
          <button onClick={() => navigate(-1)} className="text-white hover:bg-white/20 p-1.5 rounded-full transition-colors">
            <ChevronLeft className="w-7 h-7" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm uppercase tracking-widest truncate">Now Playing</p>
            <p className="text-gray-400 text-xs mt-0.5">via <span className="text-[#00a8e1] font-semibold">{sourceName}</span></p>
          </div>
          {/* Source switcher */}
          <button
            onClick={trySources}
            title="Try next source"
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* ── BIG CENTRE PLAY/PAUSE ── */}
        <button
          onClick={togglePlay}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            w-20 h-20 rounded-full bg-black/40 flex items-center justify-center
            hover:bg-black/60 transition-all hover:scale-110 backdrop-blur-sm"
        >
          {playing
            ? <Pause  fill="white" className="w-9 h-9 text-white" />
            : <Play   fill="white" className="w-9 h-9 text-white ml-1" />}
        </button>

        {/* ── BOTTOM BAR ── */}
        <div className="px-4 pb-4 pt-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent">

          {/* Seek bar */}
          <div
            ref={seekRef}
            className="relative h-[5px] rounded-full bg-white/20 cursor-pointer mb-4 group"
            onClick={seek}
          >
            {/* Buffered */}
            <div className="absolute inset-y-0 left-0 rounded-full bg-white/30 pointer-events-none"
              style={{ width: `${pctBuffered}%` }} />
            {/* Played */}
            <div className="absolute inset-y-0 left-0 rounded-full bg-[#00a8e1] pointer-events-none transition-all"
              style={{ width: `${pctPlayed}%` }} />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-md"
              style={{ left: `calc(${pctPlayed}% - 7px)` }}
            />
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2 md:gap-3">

            {/* Skip back */}
            <button onClick={() => { videoRef.current.currentTime -= 10 }} className="text-white hover:text-[#00a8e1] transition-colors">
              <SkipBack className="w-5 h-5" />
            </button>

            {/* Play/Pause */}
            <button onClick={togglePlay} className="text-white hover:text-[#00a8e1] transition-colors">
              {playing
                ? <Pause fill="white" className="w-6 h-6" />
                : <Play  fill="white" className="w-6 h-6 ml-0.5" />}
            </button>

            {/* Skip forward */}
            <button onClick={() => { videoRef.current.currentTime += 10 }} className="text-white hover:text-[#00a8e1] transition-colors">
              <SkipForward className="w-5 h-5" />
            </button>

            {/* Volume */}
            <button onClick={toggleMute} className="text-white hover:text-[#00a8e1] transition-colors">
              {muted || volume === 0
                ? <VolumeX className="w-5 h-5" />
                : <Volume2 className="w-5 h-5" />}
            </button>
            <input
              type="range" min="0" max="1" step="0.02"
              value={muted ? 0 : volume}
              onChange={(e) => setVolumeLevel(parseFloat(e.target.value))}
              className="w-20 md:w-28 h-1 accent-[#00a8e1] cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Time */}
            <span className="text-white text-xs font-mono ml-1 select-none">
              {fmt(current)} / {fmt(duration)}
            </span>

            <div className="flex-1" />

            {/* Settings button */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowSettings(p => !p); resetHide() }}
                className={`transition-colors p-1 rounded hover:bg-white/10 ${showSettings ? 'text-[#00a8e1]' : 'text-white'}`}
              >
                <Settings className="w-5 h-5" />
              </button>

              {/* ── SETTINGS PANEL ── */}
              {showSettings && (
                <div
                  className="absolute bottom-10 right-0 w-72 bg-[#0d1620]/98 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Tabs */}
                  <div className="flex border-b border-white/10">
                    {[
                      { id: 'audio',   icon: <Languages className="w-3.5 h-3.5" />,  label: 'Audio' },
                      { id: 'quality', icon: <Gauge      className="w-3.5 h-3.5" />,  label: 'Quality' },
                      { id: 'speed',   icon: <Gauge      className="w-3.5 h-3.5" />,  label: 'Speed' },
                      { id: 'subs',    icon: <Subtitles  className="w-3.5 h-3.5" />,  label: 'Subs' },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setSettingsTab(tab.id)}
                        className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-wide transition-colors
                          ${settingsTab === tab.id ? 'text-[#00a8e1] border-b-2 border-[#00a8e1]' : 'text-gray-500 hover:text-gray-300'}`}
                      >
                        {tab.icon}
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Audio tracks */}
                  {settingsTab === 'audio' && (
                    <div className="max-h-52 overflow-y-auto py-2">
                      {audioTracks.length === 0
                        ? <p className="text-gray-600 text-xs text-center py-6">No alternate audio tracks</p>
                        : audioTracks.map(t => (
                          <button key={t.id} onClick={() => switchAudio(t.id)}
                            className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10
                              ${t.id === activeAudio ? 'text-[#00a8e1]' : 'text-gray-300'}`}>
                            <span>{t.label}</span>
                            {t.id === activeAudio && <span className="w-2 h-2 rounded-full bg-[#00a8e1]" />}
                          </button>
                        ))
                      }
                    </div>
                  )}

                  {/* Quality */}
                  {settingsTab === 'quality' && (
                    <div className="max-h-52 overflow-y-auto py-2">
                      {qualities.length === 0
                        ? <p className="text-gray-600 text-xs text-center py-6">No quality options yet</p>
                        : qualities.map(q => (
                          <button key={q.id} onClick={() => switchQuality(q.id)}
                            className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10
                              ${q.id === activeQuality ? 'text-[#00a8e1]' : 'text-gray-300'}`}>
                            <span>{q.label}</span>
                            {q.id === activeQuality && <span className="w-2 h-2 rounded-full bg-[#00a8e1]" />}
                          </button>
                        ))
                      }
                    </div>
                  )}

                  {/* Playback speed */}
                  {settingsTab === 'speed' && (
                    <div className="py-2">
                      {PLAYBACK_RATES.map(r => (
                        <button key={r} onClick={() => setPlaybackRate(r)}
                          className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10
                            ${r === rate ? 'text-[#00a8e1]' : 'text-gray-300'}`}>
                          <span>{r === 1 ? 'Normal' : `${r}×`}</span>
                          {r === rate && <span className="w-2 h-2 rounded-full bg-[#00a8e1]" />}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Subtitles */}
                  {settingsTab === 'subs' && (
                    <div className="max-h-52 overflow-y-auto py-2">
                      {subtitleTracks.length <= 1
                        ? <p className="text-gray-600 text-xs text-center py-6">No subtitles available</p>
                        : subtitleTracks.map(t => (
                          <button key={t.id} onClick={() => switchSubtitle(t.id)}
                            className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10
                              ${t.id === activeSub ? 'text-[#00a8e1]' : 'text-gray-300'}`}>
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
            <button onClick={toggleFullscreen} className="text-white hover:text-[#00a8e1] transition-colors ml-1">
              {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
