// src/pages/Player.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, AlertCircle, Volume2, Globe } from 'lucide-react'

const BASE_URL = 'https://api.themoviedb.org/3'
const API_KEY  = import.meta.env.VITE_TMDB_API_KEY

// ── Load hls.js Engine ──────────────────────────────────────────────────────
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

export default function Player() {
  const { type = 'movie', id } = useParams()
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const hideTimer = useRef(null)

  const [sources, setSources] = useState([])
  const [activeSource, setActiveSource] = useState(0)
  const [audioTracks, setAudioTracks] = useState([])
  const [activeAudio, setActiveAudio] = useState(-1)
  const [loadState, setLoadState] = useState('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [loadStep, setLoadStep] = useState('Initiating VidZee Scrapers...')
  const [showUI, setShowUI] = useState(true)
  const [openPanel, setOpenPanel] = useState(null)
  const [title, setTitle] = useState('')

  useEffect(() => {
    fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}`)
      .then(r => r.json()).then(d => setTitle(d.title || d.name || ''))
  }, [type, id])

  const resetHide = useCallback(() => {
    setShowUI(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { setShowUI(false); setOpenPanel(null) }, 4500)
  }, [])

  // ── 1. Fetch from Flix-Streams (Optimized VidZee Provider) ─────────────────
  const fetchSources = useCallback(async () => {
    setLoadState('loading'); setLoadStep('Resolving IMDb ID for VidZee...');
    
    // Resolve IMDb ID (Critical for VidZee 100% success rate)
    let streamId = id
    try {
      const extRes = await fetch(`${BASE_URL}/${type}/${id}/external_ids?api_key=${API_KEY}`)
      const extData = await extRes.ok ? await extRes.json() : {}
      if (extData.imdb_id) streamId = extData.imdb_id
    } catch (_) {}

    const stremioType = type === 'tv' ? 'series' : 'movie'
    // For series, VidZee needs the S:E format appended to the IMDb ID
    const fullId = type === 'tv' ? `${streamId}:1:1` : streamId

    try {
      setLoadStep('Fetching VidZee Multi-Audio Clusters...')
      // Utilizing the active 2026 Flix-Streams endpoint for VidZee
      const vzUrl = `https://flixnest.app/api/flix-streams/stream/${stremioType}/${fullId}.json`
      const resp = await fetch(vzUrl)
      if (!resp.ok) throw new Error('VidZee Server Timeout')
      
      const data = await resp.json()
      const allStreams = data?.streams || []

      // Scoring: Specifically target VidZee links with "Multi" or "Hindi" tags
      const sorted = allStreams.sort((a, b) => {
        const score = s => {
          const t = (s.name || s.title || '').toLowerCase()
          let pts = 0
          if (t.includes('vidzee')) pts += 5000 // Force VidZee to the top
          if (t.includes('multi') || t.includes('dual')) pts += 1000
          if (t.includes('hindi') || t.includes('hin')) pts += 800
          if (t.includes('1080p')) pts += 200
          return pts
        }
        return score(b) - score(a)
      })

      if (sorted.length === 0) throw new Error('No active VidZee links found')
      setSources(sorted); setActiveSource(0)
    } catch (e) {
      setLoadState('error'); setErrorMsg('VidZee: No active links found. The title might be too new or currently restricted.')
    }
  }, [type, id])

  useEffect(() => { fetchSources() }, [fetchSources])

  // ── 2. Load VidZee HLS Stream with Audio Demuxing ──────────────────────────
  const loadVideo = useCallback(async (stream) => {
    if (!stream) return
    setLoadState('loading'); setLoadStep('Bypassing CDN Headers...')

    if (hlsRef.current) hlsRef.current.destroy()
    const video = videoRef.current
    if (video) { video.pause(); video.removeAttribute('src'); video.load() }

    try {
      const Hls = await loadHls()
      // Proxying is required for VidZee to bypass 403 Forbidden errors
      const targetUrl = `/api/proxy?url=${encodeURIComponent(stream.url)}`

      if (!Hls || !Hls.isSupported()) {
        video.src = targetUrl
        setLoadState('playing'); video.play().catch(() => setLoadState('error'))
        return
      }

      const hls = new Hls({ enableWorker: true, xhrSetup: xhr => { xhr.withCredentials = false } })
      hlsRef.current = hls
      hls.attachMedia(video)
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(targetUrl))

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const at = hls.audioTracks || []
        setAudioTracks(at.map(t => ({ id: t.id, label: t.name || t.lang || `Track ${t.id}` })))
        if (at.length > 0) setActiveAudio(hls.audioTrack)
        setLoadState('playing'); video.play().catch(() => {})
      })

      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) { setLoadState('error'); setErrorMsg('VidZee playback error. Try Server 2.') }
      })
    } catch (e) { setLoadState('error'); setErrorMsg(e.message) }
  }, [])

  useEffect(() => { if (sources[activeSource]) loadVideo(sources[activeSource]) }, [sources, activeSource, loadVideo])

  const switchAudio = id => {
    if (hlsRef.current) { hlsRef.current.audioTrack = id; setActiveAudio(id) }
  }

  // ── UI Components ──────────────────────────────────────────────────────────
  const ICON_BTN = { background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '10px' }

  return (
    <div ref={containerRef} onMouseMove={resetHide} className="fixed inset-0 bg-black text-white flex flex-col font-sans overflow-hidden">
      <video ref={videoRef} className="w-full h-full object-contain" playsInline autoPlay />

      <AnimatePresence>
        {loadState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50 p-6 text-center">
            <AlertCircle size={52} className="text-red-500 mb-4" />
            <p className="text-lg font-bold">VidZee Scraper Failed</p>
            <p className="text-gray-400 text-sm mt-2 max-w-md">{errorMsg}</p>
            <button onClick={() => { setOpenPanel('sources'); setLoadState('playing') }} className="mt-6 px-6 py-3 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 transition">Try Another Link</button>
          </div>
        )}
      </AnimatePresence>

      <motion.div animate={{ opacity: showUI ? 1 : 0 }} className="absolute inset-0 z-40 pointer-events-none">
        <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent pointer-events-auto">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} style={ICON_BTN}><RefreshCw size={20} /></button>
            <h1 className="text-xl font-bold truncate max-w-sm">{title}</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setOpenPanel('sources')} style={ICON_BTN} title="VidZee Links"><Globe size={22} /></button>
            <button onClick={() => setOpenPanel('audio')} style={ICON_BTN} title="Audio Tracks"><Volume2 size={22} /></button>
          </div>

          <AnimatePresence>
            {openPanel && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} 
                className="absolute top-20 right-6 w-80 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-neutral-800 font-bold bg-neutral-950">
                  {openPanel === 'sources' ? 'VidZee Servers' : 'Switch Audio Track'}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {openPanel === 'sources' ? sources.map((s, i) => (
                    <div key={i} onClick={() => { setActiveSource(i); setOpenPanel(null) }} 
                      className={`p-4 cursor-pointer hover:bg-blue-600/20 transition border-b border-neutral-800/50 ${activeSource === i ? 'text-blue-400' : ''}`}>
                      <div className="text-sm font-semibold truncate">{s.name || s.title}</div>
                      <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest">{s.name?.includes('Multi') ? 'Dual-Audio' : 'Standard'}</div>
                    </div>
                  )) : audioTracks.map(t => (
                    <div key={t.id} onClick={() => switchAudio(t.id)} 
                      className={`p-4 cursor-pointer hover:bg-blue-600/20 transition border-b border-neutral-800/50 ${activeAudio === t.id ? 'text-blue-400' : ''}`}>
                      {t.label}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
