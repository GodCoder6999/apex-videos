// src/pages/Player.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, Play, Pause, Volume2, VolumeX,
  Maximize, Minimize, Settings, RefreshCw,
  SkipBack, SkipForward, AlertCircle, Languages, Gauge
} from 'lucide-react'

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
  if (!s || isNaN(s)) return '0:00'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${m}:${String(sec).padStart(2,'0')}`
}
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

async function safeJsonFetch(url) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!resp.ok) throw new Error(`Network response was not ok (${resp.status})`)
  const text = await resp.text()
  if (text.trimStart().startsWith('<')) {
    throw new Error('Server returned HTML. The stream API might be blocked or updating.')
  }
  return JSON.parse(text)
}

// ── Smooth spring config ──────────────────────────────────────────────────────
const spring = { type: 'spring', stiffness: 340, damping: 28 }
const ease   = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

// Load steps with timing hints
const LOAD_STEPS = [
  { msg: 'Connecting to Nuvio Streams…',  delay: 0    },
  { msg: 'Fetching metadata…',            delay: 1500 },
  { msg: 'Scanning available sources…',   delay: 3000 },
  { msg: 'Extracting stream…',            delay: 6000 },
  { msg: 'Almost there…',                 delay: 10000 },
]

export default function Player() {
  const { type = 'movie', id } = useParams()
  const navigate = useNavigate()

  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const seekRef      = useRef(null)
  const hideTimer    = useRef(null)
  const stepTimers   = useRef([])

  const [playing,       setPlaying]       = useState(false)
  const [muted,         setMuted]         = useState(false)
  const [volume,        setVolume]        = useState(1)
  const [current,       setCurrent]       = useState(0)
  const [duration,      setDuration]      = useState(0)
  const [buffered,      setBuffered]      = useState(0)
  const [fullscreen,    setFullscreen]    = useState(false)
  const [speed,         setSpeed]         = useState(1)
  const [audioTracks,   setAudioTracks]   = useState([])
  const [activeAudio,   setActiveAudio]   = useState(-1)
  const [qualities,     setQualities]     = useState([])
  const [activeQuality, setActiveQuality] = useState(-1)
  const [subTracks,     setSubTracks]     = useState([])
  const [activeSub,     setActiveSub]     = useState(-1)
  const [showUI,        setShowUI]        = useState(true)
  const [showPanel,     setShowPanel]     = useState(false)
  const [panelTab,      setPanelTab]      = useState('audio')
  const [loadState,     setLoadState]     = useState('loading') // loading | playing | error
  const [errorMsg,      setErrorMsg]      = useState('')
  const [srcLabel,      setSrcLabel]      = useState('')
  const [loadStep,      setLoadStep]      = useState(LOAD_STEPS[0].msg)
  const [loadProgress,  setLoadProgress]  = useState(0)
  const [isBuffering,   setIsBuffering]   = useState(false)

  const [season]  = useState(1)
  const [episode] = useState(1)

  const resetHide = useCallback(() => {
    setShowUI(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { setShowUI(false); setShowPanel(false) }, 4000)
  }, [])

  useEffect(() => { resetHide(); return () => clearTimeout(hideTimer.current) }, [resetHide])

  const boot = useCallback(async () => {
    setLoadState('loading')
    setSrcLabel('')
    setLoadStep(LOAD_STEPS[0].msg)
    setLoadProgress(0)
    stepTimers.current.forEach(clearTimeout)
    stepTimers.current = []
    
    // Clear old tracks
    setAudioTracks([])
    setActiveAudio(-1)
    setQualities([])
    setActiveQuality(-1)
    setSubTracks([])
    setActiveSub(-1)

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    if (videoRef.current) videoRef.current.src = ''

    // Animate through load steps
    LOAD_STEPS.forEach(({ msg, delay }, i) => {
      const t = setTimeout(() => {
        setLoadStep(msg)
        setLoadProgress((i / (LOAD_STEPS.length - 1)) * 80)
      }, delay)
      stepTimers.current.push(t)
    })

    let m3u8, source
    try {
      // 1. Get IMDB ID (Nuvio relies heavily on IMDB Identifiers for accuracy)
      let streamId = `tmdb:${id}`
      try {
         const tmdbUrl = `${BASE_URL}/${type}/${id}/external_ids?api_key=${API_KEY}`
         const extRes = await fetch(tmdbUrl)
         if (extRes.ok) {
           const extData = await extRes.json()
           if (extData.imdb_id) {
               streamId = type === 'tv' ? `${extData.imdb_id}:${season}:${episode}` : extData.imdb_id
           } else if (type === 'tv') {
               streamId = `tmdb:${id}:${season}:${episode}`
           }
         }
      } catch (e) {
         if (type === 'tv') streamId = `tmdb:${id}:${season}:${episode}`
         console.warn("Failed to fetch IMDB ID, falling back to TMDB ID", e)
      }

      // 2. Fetch Streams directly from Nuvio API
      const nuvioUrl = `https://nuviostreams.hayd.uk/stream/${type}/${streamId}.json`
      const json = await safeJsonFetch(nuvioUrl)
      stepTimers.current.forEach(clearTimeout)

      if (!json || !json.streams || !json.streams.length) {
         throw new Error('No streams found on Nuvio for this title.')
      }

      // 3. Find the first playable valid stream
      const stream = json.streams.find(s => s.url)
      if (!stream) throw new Error('No playable stream URL found.')

      m3u8 = stream.url
      // Map Nuvio's provider name/metadata
      source = stream.name ? `${stream.name} - ${stream.title?.split('\n')[0] || 'Auto'}` : 'Nuvio Streams'

    } catch (e) {
      stepTimers.current.forEach(clearTimeout)
      setLoadState('error')
      setErrorMsg(e.message)
      return
    }

    setSrcLabel(source)
    setLoadProgress(90)
    setLoadStep('Initializing player…')

    const Hls   = await loadHls()
    const video = videoRef.current
    if (!video) return

    const isM3U8 = m3u8.includes('.m3u8')

    // If it's an MP4/MKV fallback or if HLS isn't supported on device
    if (!isM3U8 || !Hls || !Hls.isSupported()) {
      video.src = m3u8
      video.play().catch(() => {})
      setLoadState('playing')
      setLoadProgress(100)
      return
    }

    // Connect to HLS
    const hls = new Hls({
      enableWorker: true,
      xhrSetup: xhr => { xhr.withCredentials = false },
      manifestLoadingMaxRetry: 4,
      levelLoadingMaxRetry: 4,
      fragLoadingMaxRetry: 6,
      fragLoadingTimeOut: 30000,
      manifestLoadingTimeOut: 30000,
      startLevel: -1,
      abrEwmaDefaultEstimate: 1000000,
    })
    
    hlsRef.current = hls
    hls.loadSource(m3u8)
    hls.attachMedia(video)

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      setQualities([
        { id: -1, label: 'Auto' },
        ...data.levels.map((l, i) => ({ id: i, label: l.height ? `${l.height}p` : `Level ${i+1}` })),
      ])
      setActiveQuality(-1)

      const at = hls.audioTracks || []
      if (at.length) {
        setAudioTracks(at.map((t, i) => ({ id: i, label: t.name || t.lang || `Track ${i+1}` })))
        setActiveAudio(hls.audioTrack)
      }
      
      const st = hls.subtitleTracks || []
      setSubTracks([{ id: -1, label: 'Off' }, ...st.map((t, i) => ({ id: i, label: t.name || t.lang || `Sub ${i+1}` }))])

      setLoadState('playing')
      setLoadProgress(100)
      video.play().catch(() => {})
    })

    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, d) =>
      setAudioTracks(d.audioTracks.map((t, i) => ({ id: i, label: t.name || t.lang || `Track ${i+1}` }))))
    hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, d) => setActiveAudio(d.id))

    hls.on(Hls.Events.ERROR, (_, d) => {
      if (d.fatal) {
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad()
        } else {
          setLoadState('error')
          setErrorMsg('Stream error. The source may have expired — click Retry.')
        }
      }
    })

    // Buffering detection
    video.addEventListener('waiting', () => setIsBuffering(true))
    video.addEventListener('playing', () => setIsBuffering(false))
    video.addEventListener('canplay', () => setIsBuffering(false))
  }, [type, id, season, episode])

  useEffect(() => {
    boot()
    return () => {
      stepTimers.current.forEach(clearTimeout)
      if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    }
  }, [boot])

  useEffect(() => {
    const v = videoRef.current; if (!v) return
    const handlers = {
      play:           () => setPlaying(true),
      pause:          () => setPlaying(false),
      timeupdate:     () => {
        setCurrent(v.currentTime)
        if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
      },
      loadedmetadata: () => {
        setDuration(v.duration)
        // Fallback for native embedded audio tracks (MP4/MKV format) if HLS is not used
        if (!hlsRef.current && v.audioTracks && v.audioTracks.length > 0) {
          const tracks = [];
          for (let i = 0; i < v.audioTracks.length; i++) {
            tracks.push({ id: i, label: v.audioTracks[i].label || v.audioTracks[i].language || `Track ${i+1}` });
          }
          setAudioTracks(tracks);
          for (let i = 0; i < v.audioTracks.length; i++) {
             if (v.audioTracks[i].enabled) { setActiveAudio(i); break; }
          }
        }
      },
      durationchange: () => setDuration(v.duration),
      volumechange:   () => { setVolume(v.volume); setMuted(v.muted) },
    }
    Object.entries(handlers).forEach(([e, fn]) => v.addEventListener(e, fn))
    return () => Object.entries(handlers).forEach(([e, fn]) => v.removeEventListener(e, fn))
  }, [])

  useEffect(() => {
    const fn = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  useEffect(() => {
    const onKey = e => {
      if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return
      const v = videoRef.current; if (!v) return
      const actions = {
        ' ':          () => { e.preventDefault(); v.paused ? v.play() : v.pause() },
        'k':          () => v.paused ? v.play() : v.pause(),
        'ArrowRight': () => { e.preventDefault(); v.currentTime = Math.min(duration, v.currentTime + 10) },
        'ArrowLeft':  () => { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 10) },
        'ArrowUp':    () => { e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1) },
        'ArrowDown':  () => { e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1) },
        'm':          () => { v.muted = !v.muted },
        'f':          () => document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.requestFullscreen(),
      }
      actions[e.key]?.()
      resetHide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duration, resetHide])

  const togglePlay = () => { const v = videoRef.current; if (!v) return; v.paused ? v.play() : v.pause(); resetHide() }
  const toggleMute = () => { const v = videoRef.current; if (!v) return; v.muted = !v.muted }
  const setVol     = val => { const v = videoRef.current; if (!v) return; v.volume = val; v.muted = val === 0 }
  const toggleFs   = () => document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.requestFullscreen()
  const setSpeedFn = r => { if (videoRef.current) videoRef.current.playbackRate = r; setSpeed(r) }
  const switchQ    = i => { if (hlsRef.current) hlsRef.current.currentLevel = i; setActiveQuality(i) }
  const switchSub  = i => { if (hlsRef.current) { hlsRef.current.subtitleTrack = i; hlsRef.current.subtitleDisplay = i !== -1 }; setActiveSub(i) }

  // Dual Switch Audio API (Supports HLS generated tracks & Native embedded browser tracks)
  const switchAudio = i => { 
    if (hlsRef.current) {
      hlsRef.current.audioTrack = i; 
      setActiveAudio(i);
    } else if (videoRef.current && videoRef.current.audioTracks) {
      for (let j = 0; j < videoRef.current.audioTracks.length; j++) {
        videoRef.current.audioTracks[j].enabled = (j === i);
      }
      setActiveAudio(i);
    }
  }

  const seek = e => {
    const bar = seekRef.current; if (!bar || !duration) return
    const { left, width } = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - left) / width))
    if (videoRef.current) videoRef.current.currentTime = pct * duration
  }

  const pctPlayed   = duration ? (current  / duration) * 100 : 0
  const pctBuffered = duration ? (buffered / duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black z-[100] flex flex-col overflow-hidden select-none"
      onMouseMove={resetHide}
      onTouchStart={resetHide}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        crossOrigin="anonymous"
        onClick={togglePlay}
      />

      {/* ── LOADING OVERLAY ── */}
      <AnimatePresence>
        {loadState === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-[#0a1018] px-6 text-center"
          >
            {/* Layered spinner */}
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 rounded-full border-4 border-white/5" />
              <motion.div
                className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#00a8e1]"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
              />
              <motion.div
                className="absolute inset-[6px] rounded-full border-4 border-transparent border-t-white/20"
                animate={{ rotate: -360 }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
              />
              <motion.div
                className="absolute inset-[13px] rounded-full border-2 border-transparent border-t-[#00a8e1]/50"
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              />
            </div>

            {/* Step text */}
            <AnimatePresence mode="wait">
              <motion.div
                key={loadStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="flex flex-col gap-1.5"
              >
                <p className="text-white font-semibold text-sm tracking-wide">{loadStep}</p>
                <p className="text-gray-600 text-xs">Connecting securely to Nuvio…</p>
              </motion.div>
            </AnimatePresence>

            {/* Progress bar */}
            <div className="w-52 h-[3px] bg-white/8 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#00a8e1] to-[#0088bb] rounded-full"
                animate={{ width: `${loadProgress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>

            {srcLabel && (
              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-gray-600 text-xs"
              >
                via <span className="text-[#00a8e1] font-semibold">{srcLabel}</span>
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── ERROR OVERLAY ── */}
      <AnimatePresence>
        {loadState === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-black/96 px-6 text-center"
          >
            <motion.div
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
            >
              <AlertCircle className="w-14 h-14 text-red-500/90" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, ...ease }}
              className="flex flex-col gap-2"
            >
              <h2 className="text-white text-xl font-bold">Stream Unavailable</h2>
              <p className="text-gray-400 text-sm max-w-sm leading-relaxed">{errorMsg}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, ...ease }}
              className="flex gap-3 flex-wrap justify-center"
            >
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                transition={spring}
                onClick={boot}
                className="flex items-center gap-2 bg-[#00a8e1] text-white px-6 py-2.5 rounded-lg font-bold hover:bg-sky-400 transition-colors"
              >
                <RefreshCw className="w-4 h-4" /> Try Again
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                transition={spring}
                onClick={() => navigate(-1)}
                className="bg-white/10 text-white px-6 py-2.5 rounded-lg font-bold hover:bg-white/20 transition-colors"
              >
                Go Back
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BUFFERING SPINNER (over video) ── */}
      <AnimatePresence>
        {loadState === 'playing' && isBuffering && (
          <motion.div
            key="buffering"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none"
          >
            <div className="relative w-14 h-14">
              <motion.div
                className="absolute inset-0 rounded-full border-3 border-transparent border-t-white/80"
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CONTROLS ── */}
      {loadState !== 'error' && (
        <motion.div
          className="absolute inset-0 z-30 flex flex-col justify-between"
          animate={{ opacity: showUI ? 1 : 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          style={{ pointerEvents: showUI ? 'auto' : 'none' }}
        >
          {/* Top bar */}
          <motion.div
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, ...ease }}
            className="flex items-center gap-3 px-4 md:px-6 py-4 bg-gradient-to-b from-black/90 via-black/40 to-transparent"
          >
            <motion.button
              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              transition={spring}
              onClick={() => navigate(-1)}
              className="text-white hover:bg-white/15 p-1.5 rounded-full transition-colors"
            >
              <ChevronLeft className="w-7 h-7" />
            </motion.button>

            <div className="flex-1 min-w-0">
              <p className="text-white font-bold text-sm md:text-base uppercase tracking-widest">Now Playing</p>
              {srcLabel && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  via <span className="text-[#00a8e1] font-semibold">{srcLabel}</span>
                </p>
              )}
            </div>

            <motion.button
              whileHover={{ scale: 1.1, rotate: 180 }}
              whileTap={{ scale: 0.9 }}
              transition={spring}
              onClick={boot}
              title="Refresh stream"
              className="text-gray-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </motion.button>
          </motion.div>

          {/* Centre play/pause */}
          <motion.button
            onClick={togglePlay}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            transition={spring}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center hover:bg-black/55"
          >
            <AnimatePresence mode="wait">
              {playing
                ? <motion.div key="pause" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: 90 }} transition={{ duration: 0.18 }}>
                    <Pause fill="white" className="w-9 h-9 text-white" />
                  </motion.div>
                : <motion.div key="play"  initial={{ scale: 0, rotate: 90 }}  animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0, rotate: -90 }} transition={{ duration: 0.18 }}>
                    <Play fill="white" className="w-9 h-9 text-white ml-1" />
                  </motion.div>
              }
            </AnimatePresence>
          </motion.button>

          {/* Bottom bar */}
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, ...ease }}
            className="px-4 md:px-6 pb-5 pt-2 bg-gradient-to-t from-black/95 via-black/50 to-transparent"
          >
            {/* Seek bar */}
            <div
              ref={seekRef}
              onClick={seek}
              className="relative h-[5px] mb-4 rounded-full bg-white/15 cursor-pointer group"
            >
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-white/20 pointer-events-none"
                style={{ width: `${pctBuffered}%` }}
                transition={{ duration: 0.2 }}
              />
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-[#00a8e1] pointer-events-none"
                style={{ width: `${pctPlayed}%` }}
                transition={{ duration: 0.1 }}
              />
              {/* Scrubber dot */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white opacity-0 group-hover:opacity-100 shadow-lg pointer-events-none transition-all duration-150 group-hover:scale-110"
                style={{ left: `calc(${pctPlayed}% - 8px)` }}
              />
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <motion.button
                whileTap={{ scale: 0.85 }} transition={spring}
                onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 10 }}
                className="text-white/75 hover:text-white hidden sm:block transition-colors"
              >
                <SkipBack className="w-5 h-5" />
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.85 }} transition={spring}
                onClick={togglePlay}
                className="text-white hover:text-[#00a8e1] transition-colors"
              >
                {playing
                  ? <Pause fill="white" className="w-6 h-6" />
                  : <Play  fill="white" className="w-6 h-6 ml-0.5" />}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.85 }} transition={spring}
                onClick={() => { if (videoRef.current) videoRef.current.currentTime += 10 }}
                className="text-white/75 hover:text-white hidden sm:block transition-colors"
              >
                <SkipForward className="w-5 h-5" />
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.85 }} transition={spring}
                onClick={toggleMute}
                className="text-white hover:text-[#00a8e1] transition-colors"
              >
                {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </motion.button>

              <input
                type="range" min="0" max="1" step="0.02"
                value={muted ? 0 : volume}
                onChange={e => setVol(parseFloat(e.target.value))}
                onClick={e => e.stopPropagation()}
                className="w-20 md:w-28 accent-[#00a8e1] cursor-pointer"
                style={{ accentColor: '#00a8e1' }}
              />

              <span className="text-white/70 text-xs font-mono tabular-nums ml-1 hidden sm:inline">
                {fmt(current)} / {fmt(duration)}
              </span>

              <div className="flex-1" />

              {/* Settings panel */}
              <div className="relative" onClick={e => e.stopPropagation()}>
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 45 }}
                  whileTap={{ scale: 0.9 }}
                  transition={spring}
                  onClick={() => { setShowPanel(p => !p); resetHide() }}
                  className={`p-1.5 rounded-lg transition-colors hover:bg-white/10 ${showPanel ? 'text-[#00a8e1]' : 'text-white'}`}
                >
                  <Settings className="w-5 h-5" />
                </motion.button>

                <AnimatePresence>
                  {showPanel && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.92 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.92 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute bottom-12 right-0 w-72 rounded-2xl overflow-hidden shadow-2xl bg-[#0a1018]/98 border border-white/10 backdrop-blur-xl z-40"
                    >
                      {/* Tabs */}
                      <div className="flex border-b border-white/8">
                        {[
                          { id: 'audio',   icon: <Languages className="w-3.5 h-3.5" />, label: 'Audio'   },
                          { id: 'quality', icon: <Gauge      className="w-3.5 h-3.5" />, label: 'Quality' },
                          { id: 'speed',   icon: <Gauge      className="w-3.5 h-3.5" />, label: 'Speed'   },
                          { id: 'subs',    icon: <Settings   className="w-3 h-3"     />, label: 'Subs'    },
                        ].map(tab => (
                          <button
                            key={tab.id}
                            onClick={() => setPanelTab(tab.id)}
                            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-bold uppercase tracking-wider transition-colors ${panelTab === tab.id ? 'text-[#00a8e1] border-b-2 border-[#00a8e1]' : 'text-gray-500 hover:text-gray-300'}`}
                          >
                            {tab.icon}{tab.label}
                          </button>
                        ))}
                      </div>

                      {/* Panel content */}
                      <div className="max-h-56 overflow-y-auto py-1">
                        {panelTab === 'audio' && (audioTracks.length === 0
                          ? <p className="text-gray-600 text-xs text-center py-8">No alternate audio tracks available</p>
                          : audioTracks.map(t => (
                            <button key={t.id} onClick={() => switchAudio(t.id)}
                              className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-white/8 ${t.id === activeAudio ? 'text-[#00a8e1]' : 'text-gray-300'}`}>
                              <span>{t.label}</span>
                              {t.id === activeAudio && <motion.span layoutId="audio-dot" className="w-2 h-2 rounded-full bg-[#00a8e1]" />}
                            </button>
                          ))
                        )}
                        {panelTab === 'quality' && (qualities.length === 0
                          ? <p className="text-gray-600 text-xs text-center py-8">Quality options unavailable</p>
                          : qualities.map(q => (
                            <button key={q.id} onClick={() => switchQ(q.id)}
                              className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-white/8 ${q.id === activeQuality ? 'text-[#00a8e1]' : 'text-gray-300'}`}>
                              <span>{q.label}</span>
                              {q.id === activeQuality && <motion.span layoutId="quality-dot" className="w-2 h-2 rounded-full bg-[#00a8e1]" />}
                            </button>
                          ))
                        )}
                        {panelTab === 'speed' && SPEEDS.map(r => (
                          <button key={r} onClick={() => setSpeedFn(r)}
                            className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-white/8 ${r === speed ? 'text-[#00a8e1]' : 'text-gray-300'}`}>
                            <span>{r === 1 ? 'Normal' : `${r}×`}</span>
                            {r === speed && <motion.span layoutId="speed-dot" className="w-2 h-2 rounded-full bg-[#00a8e1]" />}
                          </button>
                        ))}
                        {panelTab === 'subs' && (subTracks.length <= 1
                          ? <p className="text-gray-600 text-xs text-center py-8">No subtitles in this stream</p>
                          : subTracks.map(t => (
                            <button key={t.id} onClick={() => switchSub(t.id)}
                              className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-white/8 ${t.id === activeSub ? 'text-[#00a8e1]' : 'text-gray-300'}`}>
                              <span>{t.label}</span>
                              {t.id === activeSub && <motion.span layoutId="sub-dot" className="w-2 h-2 rounded-full bg-[#00a8e1]" />}
                            </button>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <motion.button
                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                transition={spring}
                onClick={toggleFs}
                className="text-white hover:text-[#00a8e1] transition-colors ml-1"
              >
                {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
