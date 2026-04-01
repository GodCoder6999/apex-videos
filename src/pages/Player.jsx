// src/pages/Player.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, AlertCircle, Maximize, Minimize } from 'lucide-react'

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

const LOAD_STEPS = [
  { msg: 'Connecting to Nuvio Streams…',  delay: 0     },
  { msg: 'Fetching metadata…',            delay: 1500  },
  { msg: 'Scanning available sources…',   delay: 3500  },
  { msg: 'Extracting stream URL…',        delay: 6000  },
  { msg: 'Almost there…',                 delay: 10000 },
]

async function safeJsonFetch(url) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(25000) })
  if (!resp.ok) throw new Error(`Network response was not ok (${resp.status})`)
  const text = await resp.text()
  if (text.trimStart().startsWith('<'))
    throw new Error('Server returned HTML. The stream API might be blocked or updating.')
  return JSON.parse(text)
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

// ── Shared styles ─────────────────────────────────────────────────────────────
const ICON_BTN = {
  background: 'none',
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  padding: '8px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s',
  position: 'relative',
}

export default function Player() {
  const { type = 'movie', id } = useParams()
  const navigate = useNavigate()

  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const seekTrackRef = useRef(null)
  const hideTimer    = useRef(null)
  const stepTimers   = useRef([])

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

  // Track lists
  const [audioTracks,   setAudioTracks]   = useState([])
  const [activeAudio,   setActiveAudio]   = useState(-1)
  const [qualities,     setQualities]     = useState([])
  const [activeQuality, setActiveQuality] = useState(-1)
  const [subTracks,     setSubTracks]     = useState([])
  const [activeSub,     setActiveSub]     = useState(-1)

  // UI visibility
  const [showUI,        setShowUI]        = useState(true)

  // Panel state: null | 'settings' | 'audio' | 'quality' | 'subtitles' | 'speed' | 'volume'
  const [openPanel,     setOpenPanel]     = useState(null)

  // Load/error state
  const [loadState,     setLoadState]     = useState('loading')
  const [errorMsg,      setErrorMsg]      = useState('')
  const [srcLabel,      setSrcLabel]      = useState('')
  const [loadStep,      setLoadStep]      = useState(LOAD_STEPS[0].msg)
  const [loadProgress,  setLoadProgress]  = useState(0)

  // Title
  const [title,         setTitle]         = useState('')
  const [season]  = useState(1)
  const [episode] = useState(1)

  // Fetch title
  useEffect(() => {
    fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}&language=en-US`)
      .then(r => r.json())
      .then(d => setTitle(d.title || d.name || ''))
      .catch(() => {})
  }, [type, id])

  // Auto-hide controls
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

  // ── Boot: fetch stream & setup HLS ─────────────────────────────────────────
  const boot = useCallback(async () => {
    setLoadState('loading')
    setSrcLabel('')
    setLoadStep(LOAD_STEPS[0].msg)
    setLoadProgress(0)
    setOpenPanel(null)
    stepTimers.current.forEach(clearTimeout)
    stepTimers.current = []

    setAudioTracks([])
    setActiveAudio(-1)
    setQualities([])
    setActiveQuality(-1)
    setSubTracks([])
    setActiveSub(-1)

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    const video = videoRef.current
    if (video) {
      video.removeAttribute('src')
      video.load()
    }

    // Animate load steps
    LOAD_STEPS.forEach(({ msg, delay }, i) => {
      const t = setTimeout(() => {
        setLoadStep(msg)
        setLoadProgress(Math.round((i / (LOAD_STEPS.length - 1)) * 75))
      }, delay)
      stepTimers.current.push(t)
    })

    let m3u8, source
    try {
      // 1. Resolve stream ID
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

      // 2. Fetch stream list from Nuvio 
      const stremioType = type === 'tv' ? 'series' : 'movie'
      const nuvioUrl = `https://nuviostreams.hayd.uk/stream/${stremioType}/${streamId}.json`
      const json = await safeJsonFetch(nuvioUrl)
      stepTimers.current.forEach(clearTimeout)

      // ──────────────────────────────────────────────────────────────────
      // FIX: STRICT STREAM FILTERING (NO MKV ALLOWED)
      // Because we cannot transcode on Vercel, we MUST filter out MKVs 
      // and HEVC files entirely. We only keep standard mp4 and m3u8 files.
      // ──────────────────────────────────────────────────────────────────
      const validStreams = (json?.streams || []).filter(s => {
        if (!s.url) return false
        
        const url = s.url.toLowerCase()
        const streamTitle = (s.title || '').toLowerCase()

        // 1. Reject MKV completely
        if (url.includes('.mkv') || streamTitle.includes('mkv')) return false
        
        // 2. Reject HEVC / H265 / x265 completely (Browsers can't decode it)
        if (streamTitle.includes('hevc') || streamTitle.includes('x265') || streamTitle.includes('h265')) return false
        
        return true
      })

      if (!validStreams.length) {
        throw new Error('No browser-compatible streams found. (Available streams are in unsupported MKV or HEVC formats).')
      }

      // Sort to prioritize .m3u8 playlists over direct .mp4 files
      validStreams.sort((a, b) => {
        const aIsM3u8 = a.url.toLowerCase().includes('.m3u8') ? 1 : 0
        const bIsM3u8 = b.url.toLowerCase().includes('.m3u8') ? 1 : 0
        return bIsM3u8 - aIsM3u8
      })
      
      const stream = validStreams[0]

      // Only proxy .m3u8 files. Direct .mp4 bypasses proxy to prevent memory crashing.
      const isHls = /\.m3u8/i.test(stream.url) || stream.url.includes('.m3u8')
      m3u8 = isHls 
        ? `/api/proxy?url=${encodeURIComponent(stream.url)}` 
        : stream.url
        
      source = stream.name
        ? `${stream.name}${stream.title ? ' · ' + stream.title.split('\n')[0] : ''}`
        : 'Nuvio Streams'

    } catch (e) {
      stepTimers.current.forEach(clearTimeout)
      setLoadState('error')
      setErrorMsg(e.message)
      return
    }

    setSrcLabel(source)
    setLoadProgress(85)
    setLoadStep('Initializing player…')

    const Hls   = await loadHls()
    const video2 = videoRef.current
    if (!video2) return

    const isM3U8 = /\.m3u8/i.test(m3u8) || decodeURIComponent(m3u8).includes('.m3u8')

    // ── Native fallback (For direct MP4s or Safari) ──────────────────
    if (!isM3U8 || !Hls || !Hls.isSupported()) {
      video2.src = m3u8
      setLoadState('playing')
      setLoadProgress(100)
      
      video2.play().catch((err) => {
        console.error("Playback error:", err)
        setPlaying(false)
        if (err.name === 'NotSupportedError') {
           setLoadState('error')
           setErrorMsg('Browser rejected this video format. Please try another stream.')
        }
      })
      return
    }

    // ── HLS.js path ─────────────────────────────────────────────────────────
    const hls = new Hls({
      enableWorker:             true,
      lowLatencyMode:           false,
      backBufferLength:         90,
      maxBufferLength:          60,
      maxMaxBufferLength:       600,
      startLevel:               -1,       
      manifestLoadingMaxRetry:  4,
      levelLoadingMaxRetry:     4,
      fragLoadingMaxRetry:      6,
      xhrSetup: xhr => {
        xhr.withCredentials = false
      },
    })

    hlsRef.current = hls

    hls.attachMedia(video2)

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(m3u8)
    })

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      // Quality levels
      const qs = [
        { id: -1, label: 'Auto' },
        ...data.levels.map((l, i) => ({
          id: i,
          label: l.height ? `${l.height}p` : `Level ${i + 1}`,
          bitrate: l.bitrate,
        })),
      ]
      setQualities(qs)
      setActiveQuality(-1)

      // Audio tracks mapped properly
      const at = hls.audioTracks || []
      if (at.length > 0) {
        const mapped = at.map(t => ({
          id:    t.id, 
          label: t.name || t.lang || `Track ${t.id}`,
          lang:  t.lang || '',
        }))
        setAudioTracks(mapped)
        const defTrack = at.find(t => t.default) || at[0]
        const defId = defTrack ? defTrack.id : 0
        setActiveAudio(defId)
        hls.audioTrack = defId
      }

      // Subtitle tracks
      const st = hls.subtitleTracks || []
      setSubTracks([
        { id: -1, label: 'Off' },
        ...st.map((t, i) => ({ id: i, label: t.name || t.lang || `Sub ${i + 1}` })),
      ])
      setActiveSub(-1)
      hls.subtitleDisplay = false

      setLoadState('playing')
      setLoadProgress(100)
      video2.play().catch(() => setPlaying(false))
    })

    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, d) => {
      const mapped = (d.audioTracks || []).map(t => ({
        id:    t.id,
        label: t.name || t.lang || `Track ${t.id}`,
        lang:  t.lang || '',
      }))
      setAudioTracks(mapped)
    })

    hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, d) => {
      setActiveAudio(d.id)
    })

    hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => {
      if (hls.autoLevelEnabled) setActiveQuality(-1)
      else setActiveQuality(d.level)
    })

    hls.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) return
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad()
      } else {
        setLoadState('error')
        setErrorMsg('A fatal stream error occurred. Please retry.')
      }
    })

  }, [type, id, season, episode])

  useEffect(() => {
    boot()
    return () => {
      stepTimers.current.forEach(clearTimeout)
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [boot])

  // ── Video event listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onPlay      = () => setPlaying(true)
    const onPause     = () => setPlaying(false)
    const onTimeUpdate = () => {
      setCurrent(v.currentTime)
      if (v.buffered.length)
        setBuffered(v.buffered.end(v.buffered.length - 1))
    }
    const onLoadedMeta = () => {
      setDuration(v.duration)
      v.volume = volume
      if (!hlsRef.current && v.audioTracks?.length > 0) {
        const tracks = Array.from(v.audioTracks).map((t, i) => ({
          id: i, label: t.label || t.language || `Track ${i + 1}`, lang: t.language || '',
        }))
        setAudioTracks(tracks)
        const defIdx = Array.from(v.audioTracks).findIndex(t => t.enabled)
        setActiveAudio(defIdx !== -1 ? defIdx : 0)
      }
    }
    const onDurationChange = () => setDuration(v.duration)
    const onVolumeChange   = () => { setVolume(v.volume); setMuted(v.muted) }
    const onWaiting        = () => setIsBuffering(true)
    const onPlaying        = () => setIsBuffering(false)
    const onCanPlay        = () => setIsBuffering(false)
    const onError          = () => {
      if(v.error && v.error.code === 4) { // MEDIA_ERR_SRC_NOT_SUPPORTED
         setLoadState('error')
         setErrorMsg('Browser does not support this file format.')
      }
    }

    v.addEventListener('play',           onPlay)
    v.addEventListener('pause',          onPause)
    v.addEventListener('timeupdate',     onTimeUpdate)
    v.addEventListener('loadedmetadata', onLoadedMeta)
    v.addEventListener('durationchange', onDurationChange)
    v.addEventListener('volumechange',   onVolumeChange)
    v.addEventListener('waiting',        onWaiting)
    v.addEventListener('playing',        onPlaying)
    v.addEventListener('canplay',        onCanPlay)
    v.addEventListener('error',          onError)

    return () => {
      v.removeEventListener('play',           onPlay)
      v.removeEventListener('pause',          onPause)
      v.removeEventListener('timeupdate',     onTimeUpdate)
      v.removeEventListener('loadedmetadata', onLoadedMeta)
      v.removeEventListener('durationchange', onDurationChange)
      v.removeEventListener('volumechange',   onVolumeChange)
      v.removeEventListener('waiting',        onWaiting)
      v.removeEventListener('playing',        onPlaying)
      v.removeEventListener('canplay',        onCanPlay)
      v.removeEventListener('error',          onError)
    }
  }, []) // eslint-disable-line

  // Fullscreen change
  useEffect(() => {
    const fn = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = e => {
      if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return
      const v = videoRef.current
      if (!v) return
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault()
        v.paused ? v.play() : v.pause()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        v.currentTime = Math.min(duration, v.currentTime + 10)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        v.currentTime = Math.max(0, v.currentTime - 10)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        v.volume = Math.min(1, v.volume + 0.1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        v.volume = Math.max(0, v.volume - 0.1)
      } else if (e.key === 'm') {
        v.muted = !v.muted
      } else if (e.key === 'f') {
        toggleFs()
      }
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
  const toggleMute = () => {
    const v = videoRef.current; if (!v) return
    v.muted = !v.muted
  }
  const setVol = val => {
    const v = videoRef.current; if (!v) return
    const n = Math.max(0, Math.min(1, val))
    v.volume = n
    if (n === 0) v.muted = true
    else if (v.muted) v.muted = false
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

  // ── Audio / Quality / Sub switching ────────────────────────────────────────
  const switchAudio = id => {
    const hls = hlsRef.current
    const v   = videoRef.current
    if (hls) {
      hls.audioTrack = id
      setActiveAudio(id)
    } else if (v?.audioTracks) {
      for (let i = 0; i < v.audioTracks.length; i++)
        v.audioTracks[i].enabled = (i === id)
      setActiveAudio(id)
    }
  }
  const switchQuality = id => {
    const hls = hlsRef.current; if (!hls) return
    hls.currentLevel = id
    hls.autoLevelEnabled = id === -1
    setActiveQuality(id)
  }
  const switchSub = id => {
    const hls = hlsRef.current; if (!hls) return
    if (id === -1) {
      hls.subtitleDisplay = false
      hls.subtitleTrack   = -1
    } else {
      hls.subtitleTrack   = id
      hls.subtitleDisplay = true
    }
    setActiveSub(id)
  }
  const setSpeedFn = r => {
    if (videoRef.current) videoRef.current.playbackRate = r
    setSpeed(r)
  }

  const pctPlayed   = duration ? (current  / duration) * 100 : 0
  const pctBuffered = duration ? (buffered / duration) * 100 : 0
  const volPct      = muted ? 0 : volume * 100

  // ── Colours ────────────────────────────────────────────────────────────────
  const C = {
    bg:          '#000',
    panelBg:     '#1a1d21',
    panelBorder: '#2e3239',
    accent:      '#1a98ff',
    textSec:     '#8b8f97',
    hover:       'rgba(255,255,255,0.08)',
    active:      'rgba(255,255,255,0.12)',
  }

  // ── Radio circle ───────────────────────────────────────────────────────────
  const RadioCircle = ({ selected }) => (
    <div style={{
      width:30, height:30, minWidth:30,
      border: `2px solid ${selected ? C.accent : C.textSec}`,
      borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: selected ? C.accent : 'transparent',
      transition: 'border-color 0.15s, background 0.15s',
      flexShrink: 0,
    }}>
      {selected && <div style={{width:10,height:10,background:'#fff',borderRadius:'50%'}}/>}
    </div>
  )

  // ── Panel helpers ──────────────────────────────────────────────────────────
  const panelStyle = {
    position:'absolute', top:56, right:16,
    width:320, background:C.panelBg,
    borderRadius:8, overflow:'hidden',
    zIndex:100, boxShadow:'0 8px 32px rgba(0,0,0,0.8)',
  }
  const panelHeaderStyle = {
    display:'flex', alignItems:'center', padding:'16px 20px',
    borderBottom:`1px solid ${C.panelBorder}`,
    fontSize:16, fontWeight:600, gap:12,
  }
  const settingsRowStyle = {
    display:'flex', alignItems:'center',
    padding:'16px 20px', cursor:'pointer',
    transition:'background 0.12s',
    borderBottom:`1px solid ${C.panelBorder}`,
    gap:16,
  }
  const rowLabelStyle = { flex:1, fontSize:15, fontWeight:500 }
  const rowValueStyle = {
    fontSize:14, color:C.textSec,
    display:'flex', alignItems:'center', gap:4,
  }
  const radioOptionStyle = {
    display:'flex', alignItems:'flex-start',
    padding:'14px 20px', cursor:'pointer',
    transition:'background 0.12s',
    borderBottom:`1px solid ${C.panelBorder}`,
    gap:14,
  }

  // ── Current labels for Settings panel ────────────────────────────────────
  const audioLabel   = audioTracks.find(t => t.id === activeAudio)?.label  || 'Auto'
  const qualityLabel = qualities.find(q => q.id === activeQuality)?.label  || 'Auto'
  const subLabel     = subTracks.find(s => s.id === activeSub)?.label      || 'Off'
  const speedLabel   = speed === 1 ? 'Normal' : `${speed}×`

  return (
    <div
      ref={containerRef}
      onMouseMove={resetHide}
      onTouchStart={resetHide}
      onClick={() => { if (loadState === 'playing') { togglePlay(); resetHide() } }}
      style={{
        position:'fixed', inset:0, background:'#000',
        zIndex:100, display:'flex', flexDirection:'column',
        userSelect:'none', fontFamily:"'Amazon Ember','Arial',sans-serif",
      }}
    >
      {/* ── VIDEO ── */}
      <video
        ref={videoRef}
        style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'contain' }}
        playsInline
        autoPlay
      />

      {/* ── LOADING OVERLAY ── */}
      <AnimatePresence>
        {loadState === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            style={{
              position:'absolute', inset:0, zIndex:20,
              display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center', gap:28,
              background:'#0a0d12', textAlign:'center', padding:'0 24px',
            }}
          >
            {/* Layered spinner */}
            <div style={{position:'relative', width:72, height:72}}>
              <div style={{position:'absolute',inset:0,borderRadius:'50%',border:'3px solid rgba(255,255,255,0.05)'}}/>
              <motion.div
                animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease:'linear' }}
                style={{position:'absolute',inset:0,borderRadius:'50%',border:'3px solid transparent',borderTopColor:'#1a98ff'}}
              />
              <motion.div
                animate={{ rotate: -360 }} transition={{ duration: 1.5, repeat: Infinity, ease:'linear' }}
                style={{position:'absolute',inset:8,borderRadius:'50%',border:'2px solid transparent',borderTopColor:'rgba(255,255,255,0.15)'}}
              />
            </div>

            {/* Step text */}
            <AnimatePresence mode="wait">
              <motion.div
                key={loadStep}
                initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
                transition={{ duration:0.28 }}
              >
                <p style={{color:'#fff', fontWeight:600, fontSize:14, letterSpacing:'0.02em'}}>{loadStep}</p>
                <p style={{color:'#555', fontSize:12, marginTop:4}}>Securing connection to stream…</p>
              </motion.div>
            </AnimatePresence>

            {/* Progress bar */}
            <div style={{width:200, height:3, background:'rgba(255,255,255,0.08)', borderRadius:2, overflow:'hidden'}}>
              <motion.div
                animate={{ width:`${loadProgress}%` }}
                transition={{ duration:0.7, ease:'easeOut' }}
                style={{height:'100%', background:'linear-gradient(90deg,#1a98ff,#0070cc)', borderRadius:2}}
              />
            </div>

            {srcLabel && (
              <p style={{color:'#444', fontSize:11}}>
                via <span style={{color:'#1a98ff', fontWeight:600}}>{srcLabel}</span>
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
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            style={{
              position:'absolute', inset:0, zIndex:20,
              display:'flex', flexDirection:'column',
              alignItems:'center', justifyContent:'center', gap:20,
              background:'rgba(0,0,0,0.96)', textAlign:'center', padding:'0 24px',
            }}
          >
            <AlertCircle style={{width:52,height:52,color:'#ff4444'}}/>
            <div>
              <p style={{color:'#fff', fontSize:20, fontWeight:700, marginBottom:8}}>Stream Unavailable</p>
              <p style={{color:'#888', fontSize:14, lineHeight:1.6, maxWidth:360}}>{errorMsg}</p>
            </div>
            <div style={{display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center'}}>
              <button
                onClick={e => { e.stopPropagation(); boot() }}
                style={{
                  display:'flex', alignItems:'center', gap:8,
                  background:'#1a98ff', color:'#fff',
                  border:'none', padding:'10px 24px', borderRadius:8,
                  fontSize:14, fontWeight:700, cursor:'pointer',
                }}
              >
                <RefreshCw style={{width:16,height:16}}/> Try Again
              </button>
              <button
                onClick={e => { e.stopPropagation(); navigate(-1) }}
                style={{
                  background:'rgba(255,255,255,0.1)', color:'#fff',
                  border:'none', padding:'10px 24px', borderRadius:8,
                  fontSize:14, fontWeight:700, cursor:'pointer',
                }}
              >
                Go Back
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BUFFERING SPINNER ── */}
      <AnimatePresence>
        {loadState === 'playing' && isBuffering && (
          <motion.div
            key="buf"
            initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            style={{
              position:'absolute', inset:0, zIndex:10,
              display:'flex', alignItems:'center', justifyContent:'center',
              pointerEvents:'none',
            }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 0.85, repeat: Infinity, ease:'linear' }}
              style={{
                width:52, height:52, borderRadius:'50%',
                border:'3px solid rgba(255,255,255,0.15)',
                borderTopColor:'#fff',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CONTROLS UI ── */}
      {loadState !== 'error' && (
        <motion.div
          animate={{ opacity: showUI ? 1 : 0 }}
          transition={{ duration: 0.25 }}
          style={{ position:'absolute', inset:0, zIndex:30, pointerEvents: showUI ? 'auto' : 'none' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Gradient overlays */}
          <div style={{
            position:'absolute', top:0, left:0, right:0, height:160,
            background:'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)',
            pointerEvents:'none',
          }}/>
          <div style={{
            position:'absolute', bottom:0, left:0, right:0, height:220,
            background:'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)',
            pointerEvents:'none',
          }}/>

          {/* ── TOP BAR ── */}
          <div style={{
            position:'absolute', top:0, left:0, right:0,
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'14px 20px', zIndex:10,
          }}>
            {/* Left: close + title */}
            <div style={{display:'flex', alignItems:'center', gap:14}}>
              <button
                onClick={() => navigate(-1)}
                style={{...ICON_BTN, padding:4, borderRadius:4}}
                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background='none'}
              >
                <IconClose/>
              </button>
              <div>
                <p style={{fontSize:20, fontWeight:700, letterSpacing:'-0.3px', color:'#fff'}}>
                  {title || 'Now Playing'}
                </p>
                {srcLabel && (
                  <p style={{fontSize:11, color:'#555', marginTop:1}}>
                    via <span style={{color:'#1a98ff', fontWeight:600}}>{srcLabel}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Right: CC, Volume, PiP, Fullscreen, More */}
            <div style={{display:'flex', alignItems:'center', gap:4, position:'relative'}}>

              {/* CC/Subtitles */}
              <button
                style={{...ICON_BTN, background: openPanel === 'subtitles' ? C.active : 'none'}}
                onClick={e => { e.stopPropagation(); setOpenPanel(p => p === 'subtitles' ? null : 'subtitles') }}
                onMouseEnter={e => e.currentTarget.style.background=C.hover}
                onMouseLeave={e => e.currentTarget.style.background= openPanel==='subtitles' ? C.active : 'none'}
                title="Subtitles"
              >
                <IconCC/>
              </button>

              {/* Volume */}
              <button
                style={{...ICON_BTN, background: openPanel === 'volume' ? C.active : 'none'}}
                onClick={e => { e.stopPropagation(); setOpenPanel(p => p === 'volume' ? null : 'volume') }}
                onMouseEnter={e => e.currentTarget.style.background=C.hover}
                onMouseLeave={e => e.currentTarget.style.background= openPanel==='volume' ? C.active : 'none'}
                title="Volume"
              >
                {(muted || volume === 0) ? <IconVolumeMute/> : <IconVolume/>}
              </button>

              {/* PiP */}
              <button
                style={ICON_BTN}
                onClick={e => {
                  e.stopPropagation()
                  if (document.pictureInPictureEnabled && videoRef.current)
                    videoRef.current.requestPictureInPicture?.().catch(() => {})
                }}
                onMouseEnter={e => e.currentTarget.style.background=C.hover}
                onMouseLeave={e => e.currentTarget.style.background='none'}
                title="Picture in Picture"
              >
                <IconPiP/>
              </button>

              {/* Fullscreen */}
              <button
                style={ICON_BTN}
                onClick={e => { e.stopPropagation(); toggleFs() }}
                onMouseEnter={e => e.currentTarget.style.background=C.hover}
                onMouseLeave={e => e.currentTarget.style.background='none'}
                title="Fullscreen"
              >
                {fullscreen ? <IconFullscreenExit/> : <IconFullscreen/>}
              </button>

              {/* More (settings) */}
              <button
                style={{...ICON_BTN, background: openPanel === 'settings' ? C.active : 'none'}}
                onClick={e => { e.stopPropagation(); setOpenPanel(p => p === 'settings' ? null : 'settings') }}
                onMouseEnter={e => e.currentTarget.style.background=C.hover}
                onMouseLeave={e => e.currentTarget.style.background= openPanel==='settings' ? C.active : 'none'}
                title="Settings"
              >
                <IconMore/>
              </button>

              {/* ── SETTINGS PANEL ── */}
              <AnimatePresence>
                {openPanel === 'settings' && (
                  <motion.div
                    key="settings"
                    initial={{ opacity:0, y:-8, scale:0.95 }}
                    animate={{ opacity:1, y:0, scale:1 }}
                    exit={{ opacity:0, y:-8, scale:0.95 }}
                    transition={{ duration:0.18 }}
                    style={panelStyle}
                    onClick={e => e.stopPropagation()}
                  >
                    <div style={panelHeaderStyle}>Settings</div>

                    {/* Subtitles row */}
                    <div
                      style={settingsRowStyle}
                      onClick={() => setOpenPanel('subtitles')}
                      onMouseEnter={e => e.currentTarget.style.background=C.hover}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}
                    >
                      <IconCC/>
                      <span style={rowLabelStyle}>Subtitles</span>
                      <span style={rowValueStyle}>{subLabel} <IconChevronRight/></span>
                    </div>

                    {/* Audio row */}
                    <div
                      style={settingsRowStyle}
                      onClick={() => setOpenPanel('audio')}
                      onMouseEnter={e => e.currentTarget.style.background=C.hover}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}>
                        <rect x="2" y="6" width="4" height="12" rx="1"/><rect x="8" y="3" width="4" height="18" rx="1"/>
                        <rect x="14" y="8" width="4" height="10" rx="1"/>
                      </svg>
                      <span style={rowLabelStyle}>Audio</span>
                      <span style={rowValueStyle}>{audioLabel} <IconChevronRight/></span>
                    </div>

                    {/* Quality row */}
                    <div
                      style={settingsRowStyle}
                      onClick={() => setOpenPanel('quality')}
                      onMouseEnter={e => e.currentTarget.style.background=C.hover}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}>
                        <rect x="2" y="4" width="20" height="16" rx="2"/>
                        <line x1="8" y1="20" x2="8" y2="22"/><line x1="16" y1="20" x2="16" y2="22"/>
                        <line x1="5" y1="22" x2="19" y2="22"/>
                      </svg>
                      <span style={rowLabelStyle}>Video Quality</span>
                      <span style={rowValueStyle}>{qualityLabel} <IconChevronRight/></span>
                    </div>

                    {/* Speed row */}
                    <div
                      style={{...settingsRowStyle, borderBottom:'none'}}
                      onClick={() => setOpenPanel('speed')}
                      onMouseEnter={e => e.currentTarget.style.background=C.hover}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}>
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                      </svg>
                      <span style={rowLabelStyle}>Playback Speed</span>
                      <span style={rowValueStyle}>{speedLabel} <IconChevronRight/></span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── AUDIO SUB-PANEL ── */}
              <AnimatePresence>
                {openPanel === 'audio' && (
                  <motion.div
                    key="audio"
                    initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
                    transition={{ duration:0.18 }}
                    style={panelStyle}
                    onClick={e => e.stopPropagation()}
                  >
                    <div style={panelHeaderStyle}>
                      <button
                        style={{background:'none',border:'none',color:'#fff',cursor:'pointer',padding:2,borderRadius:4,display:'flex',alignItems:'center'}}
                        onClick={() => setOpenPanel('settings')}
                      >
                        <IconChevronLeft/>
                      </button>
                      Audio
                    </div>
                    {audioTracks.length === 0 ? (
                      <p style={{color:C.textSec, fontSize:13, textAlign:'center', padding:'28px 20px'}}>
                        No alternate audio tracks available
                      </p>
                    ) : audioTracks.map(t => (
                      <div
                        key={t.id}
                        style={radioOptionStyle}
                        onClick={() => switchAudio(t.id)}
                        onMouseEnter={e => e.currentTarget.style.background=C.hover}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}
                      >
                        <RadioCircle selected={t.id === activeAudio}/>
                        <div>
                          <div style={{fontSize:15, fontWeight:500}}>{t.label}</div>
                          {t.lang && <div style={{fontSize:12, color:C.textSec, marginTop:2}}>{t.lang.toUpperCase()}</div>}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── QUALITY SUB-PANEL ── */}
              <AnimatePresence>
                {openPanel === 'quality' && (
                  <motion.div
                    key="quality"
                    initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
                    transition={{ duration:0.18 }}
                    style={panelStyle}
                    onClick={e => e.stopPropagation()}
                  >
                    <div style={panelHeaderStyle}>
                      <button
                        style={{background:'none',border:'none',color:'#fff',cursor:'pointer',padding:2,borderRadius:4,display:'flex',alignItems:'center'}}
                        onClick={() => setOpenPanel('settings')}
                      >
                        <IconChevronLeft/>
                      </button>
                      Video Quality
                    </div>
                    {qualities.length === 0 ? (
                      <p style={{color:C.textSec, fontSize:13, textAlign:'center', padding:'28px 20px'}}>
                        Quality options unavailable
                      </p>
                    ) : qualities.map(q => (
                      <div
                        key={q.id}
                        style={{
                          ...radioOptionStyle,
                          background: q.id === activeQuality ? 'rgba(255,255,255,0.95)' : 'transparent',
                          borderRadius: q.id === activeQuality ? 6 : 0,
                        }}
                        onClick={() => switchQuality(q.id)}
                        onMouseEnter={e => {
                          if (q.id !== activeQuality) e.currentTarget.style.background=C.hover
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = q.id === activeQuality
                            ? 'rgba(255,255,255,0.95)' : 'transparent'
                        }}
                      >
                        <div style={{
                          width:20, height:20, minWidth:20,
                          border:`2px solid ${q.id === activeQuality ? '#000' : C.textSec}`,
                          borderRadius:'50%',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          background: q.id === activeQuality ? '#000' : 'transparent',
                          flexShrink:0,
                        }}>
                          {q.id === activeQuality && <div style={{width:8,height:8,background:'#fff',borderRadius:'50%'}}/>}
                        </div>
                        <div>
                          <div style={{fontSize:15, fontWeight:500, color: q.id === activeQuality ? '#000' : '#fff'}}>
                            {q.label}
                          </div>
                          {q.bitrate && (
                            <div style={{fontSize:12, color: q.id === activeQuality ? '#444' : C.textSec, marginTop:2}}>
                              ~{(q.bitrate / 1e6).toFixed(1)} Mbps
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── SUBTITLES SUB-PANEL ── */}
              <AnimatePresence>
                {openPanel === 'subtitles' && (
                  <motion.div
                    key="subtitles"
                    initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
                    transition={{ duration:0.18 }}
                    style={panelStyle}
                    onClick={e => e.stopPropagation()}
                  >
                    <div style={panelHeaderStyle}>
                      <button
                        style={{background:'none',border:'none',color:'#fff',cursor:'pointer',padding:2,borderRadius:4,display:'flex',alignItems:'center'}}
                        onClick={() => setOpenPanel('settings')}
                      >
                        <IconChevronLeft/>
                      </button>
                      Subtitles
                    </div>
                    {subTracks.length <= 1 ? (
                      <p style={{color:C.textSec, fontSize:13, textAlign:'center', padding:'28px 20px'}}>
                        No subtitles in this stream
                      </p>
                    ) : subTracks.map(s => (
                      <div
                        key={s.id}
                        style={radioOptionStyle}
                        onClick={() => switchSub(s.id)}
                        onMouseEnter={e => e.currentTarget.style.background=C.hover}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}
                      >
                        <RadioCircle selected={s.id === activeSub}/>
                        <div style={{fontSize:15, fontWeight:500}}>{s.label}</div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── SPEED SUB-PANEL ── */}
              <AnimatePresence>
                {openPanel === 'speed' && (
                  <motion.div
                    key="speed"
                    initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
                    transition={{ duration:0.18 }}
                    style={panelStyle}
                    onClick={e => e.stopPropagation()}
                  >
                    <div style={panelHeaderStyle}>
                      <button
                        style={{background:'none',border:'none',color:'#fff',cursor:'pointer',padding:2,borderRadius:4,display:'flex',alignItems:'center'}}
                        onClick={() => setOpenPanel('settings')}
                      >
                        <IconChevronLeft/>
                      </button>
                      Playback Speed
                    </div>
                    {SPEEDS.map(r => (
                      <div
                        key={r}
                        style={radioOptionStyle}
                        onClick={() => setSpeedFn(r)}
                        onMouseEnter={e => e.currentTarget.style.background=C.hover}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}
                      >
                        <RadioCircle selected={r === speed}/>
                        <div style={{fontSize:15, fontWeight:500}}>
                          {r === 1 ? 'Normal' : `${r}×`}
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── VOLUME POPUP ── */}
              <AnimatePresence>
                {openPanel === 'volume' && (
                  <motion.div
                    key="volume"
                    initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
                    transition={{ duration:0.18 }}
                    style={{...panelStyle, width:240, padding:'16px 20px'}}
                    onClick={e => e.stopPropagation()}
                  >
                    <label style={{fontSize:14, color:C.textSec, display:'block', marginBottom:14}}>Volume</label>
                    <input
                      type="range" min="0" max="100" step="1"
                      value={volPct}
                      onChange={e => setVol(parseInt(e.target.value) / 100)}
                      style={{
                        width:'100%', WebkitAppearance:'none', appearance:'none',
                        height:4, borderRadius:2, outline:'none', cursor:'pointer',
                        background:`linear-gradient(to right, #fff ${volPct}%, rgba(255,255,255,0.3) ${volPct}%)`,
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>

          {/* ── BOTTOM CONTROLS ── */}
          <div style={{
            position:'absolute', bottom:0, left:0, right:0,
            padding:'0 0 28px 0', zIndex:10,
          }}>
            {/* Scrubber */}
            <div style={{
              padding:'0 16px', marginBottom:16,
              display:'flex', alignItems:'center', gap:12,
            }}>
              <span style={{fontSize:13, color:'#fff', minWidth:45, letterSpacing:'0.02em'}}>
                {fmt(current)}
              </span>

              <div
                ref={seekTrackRef}
                onClick={e => { e.stopPropagation(); seekTo(e) }}
                style={{
                  flex:1, position:'relative',
                  height:3, background:'rgba(255,255,255,0.3)',
                  borderRadius:2, cursor:'pointer',
                  transition:'height 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.height='5px' }}
                onMouseLeave={e => { e.currentTarget.style.height='3px' }}
              >
                {/* Buffered */}
                <div style={{
                  position:'absolute', inset:'0 auto 0 0',
                  width:`${pctBuffered}%`,
                  background:'rgba(255,255,255,0.2)', borderRadius:2,
                }}/>
                {/* Played */}
                <div style={{
                  position:'absolute', inset:'0 auto 0 0',
                  width:`${pctPlayed}%`,
                  background:'#fff', borderRadius:2, position:'relative',
                }}>
                  {/* Thumb */}
                  <div style={{
                    position:'absolute', right:-5, top:'50%',
                    transform:'translateY(-50%)',
                    width:10, height:10,
                    background:'#fff', borderRadius:'50%',
                    boxShadow:'0 0 4px rgba(0,0,0,0.5)',
                  }}/>
                </div>
              </div>

              <span style={{fontSize:13, color:'#fff', minWidth:45, textAlign:'right', letterSpacing:'0.02em'}}>
                {fmt(duration)}
              </span>
            </div>

            {/* Playback buttons */}
            <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:20}}>
              {/* Skip back 10 */}
              <button
                style={{background:'none',border:'none',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',transition:'background 0.15s',padding:6}}
                onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10); resetHide() }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background='none'}
                title="Back 10 seconds"
              >
                <IconSkipBack/>
              </button>

              {/* Play/Pause — white circle */}
              <button
                onClick={e => { e.stopPropagation(); togglePlay() }}
                style={{
                  width:56, height:56,
                  background:'rgba(255,255,255,0.95)',
                  border:'none', borderRadius:'50%',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  cursor:'pointer', color:'#000',
                  transition:'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,1)'}
                onMouseLeave={e => e.currentTarget.style.background='rgba(255,255,255,0.95)'}
              >
                <AnimatePresence mode="wait">
                  {playing
                    ? <motion.div key="p" initial={{scale:0}} animate={{scale:1}} exit={{scale:0}} transition={{duration:0.15}}><IconPause/></motion.div>
                    : <motion.div key="pl" initial={{scale:0}} animate={{scale:1}} exit={{scale:0}} transition={{duration:0.15}}><IconPlay/></motion.div>
                  }
                </AnimatePresence>
              </button>

              {/* Skip fwd 10 */}
              <button
                style={{background:'none',border:'none',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',transition:'background 0.15s',padding:6}}
                onClick={e => { e.stopPropagation(); if (videoRef.current) videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10); resetHide() }}
                onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.08)'}
                onMouseLeave={e => e.currentTarget.style.background='none'}
                title="Forward 10 seconds"
              >
                <IconSkipFwd/>
              </button>
            </div>
          </div>

        </motion.div>
      )}
    </div>
  )
}
