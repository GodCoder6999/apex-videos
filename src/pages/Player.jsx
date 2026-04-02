// src/pages/Player.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, AlertCircle, Settings, Languages } from 'lucide-react'

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
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`
}

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const IconClose = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconMore = () => <svg viewBox="0 0 24 24" fill="currentColor" style={{width:22,height:22}}><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
const IconChevronLeft = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><polyline points="15 18 9 12 15 6"/></svg>

const ICON_BTN = { background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }

export default function Player() {
  const { type = 'movie', id } = useParams()
  const navigate = useNavigate()

  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const hideTimer    = useRef(null)

  // State
  const [sources,       setSources]       = useState([])
  const [activeSource,  setActiveSource]  = useState(0)
  const [audioTracks,   setAudioTracks]   = useState([])
  const [activeAudio,   setActiveAudio]   = useState(-1)
  const [showUI,        setShowUI]        = useState(true)
  const [openPanel,     setOpenPanel]     = useState(null)
  const [loadState,     setLoadState]     = useState('loading')
  const [errorMsg,      setErrorMsg]      = useState('')
  const [loadStep,      setLoadStep]      = useState('Connecting to VidZee...')
  const [title,         setTitle]         = useState('')

  useEffect(() => {
    fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}`)
      .then(r => r.json()).then(d => setTitle(d.title || d.name || ''))
  }, [type, id])

  const resetHide = useCallback(() => {
    setShowUI(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { setShowUI(false); setOpenPanel(null) }, 4500)
  }, [])

  // ── 1. Fetch EXCLUSIVELY from VidZee ──────────────────────────────────────
  const fetchSources = useCallback(async () => {
    setLoadState('loading'); setLoadStep('Handshaking with VidZee API...');
    
    let streamId = id
    try {
      const extRes = await fetch(`${BASE_URL}/${type}/${id}/external_ids?api_key=${API_KEY}`)
      if (extRes.ok) {
        const extData = await extRes.json()
        if (extData.imdb_id) streamId = extData.imdb_id
      }
    } catch (_) {}

    const stremioType = type === 'tv' ? 'series' : 'movie'
    
    try {
      // VidZee Endpoint (Scraper Hub)
      const vzUrl = `https://vidzee.strem.fun/stream/${stremioType}/${streamId}.json`
      const resp = await fetch(vzUrl)
      if (resp.ok) {
        const data = await resp.json()
        const validStreams = (data?.streams || []).filter(s => s.url)
        
        // VidZee Sorting: Prioritize MULTI, HINDI, and 1080p
        const sorted = validStreams.sort((a, b) => {
          const score = s => {
            const t = (s.name || s.title || '').toLowerCase()
            let pts = 0
            if (t.includes('multi') || t.includes('dual')) pts += 2000
            if (t.includes('hin') || t.includes('hindi')) pts += 1500
            if (t.includes('1080p')) pts += 500
            return pts
          }
          return score(b) - score(a)
        })

        if (sorted.length === 0) throw new Error('No links found')
        setSources(sorted); setActiveSource(0)
      } else {
        throw new Error('VidZee API down')
      }
    } catch (e) {
      setLoadState('error'); setErrorMsg('VidZee could not find any active links for this title.')
    }
  }, [type, id])

  useEffect(() => { fetchSources() }, [fetchSources])

  // ── 2. Load VidZee HTTP Stream ──────────────────────────────────────────
  const loadVideo = useCallback(async (stream) => {
    if (!stream) return
    setLoadState('loading'); setLoadStep('Resolving VidZee CDN Link...')

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    const video = videoRef.current
    if (video) { video.pause(); video.removeAttribute('src'); video.load() }

    try {
      const Hls = await loadHls()
      // VidZee streams often need proxying to handle Referrer/CORS headers
      const targetUrl = `/api/proxy?url=${encodeURIComponent(stream.url)}`

      if (!Hls || !Hls.isSupported()) {
        video.src = targetUrl
        setLoadState('playing')
        video.play().catch(() => setLoadState('error'))
        return
      }

      const hls = new Hls({ enableWorker: true, xhrSetup: xhr => { xhr.withCredentials = false } })
      hlsRef.current = hls
      hls.attachMedia(video)
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(targetUrl))

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        const at = hls.audioTracks || []
        setAudioTracks(at.map(t => ({ id: t.id, label: t.name || t.lang || `Audio ${t.id}` })))
        if (at.length > 0) setActiveAudio(hls.audioTrack)
        setLoadState('playing')
        video.play().catch(() => {})
      })

      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) { setLoadState('error'); setErrorMsg('CDN Connection Failed. Try another VidZee link.') }
      })
    } catch (e) { setLoadState('error'); setErrorMsg(e.message) }
  }, [])

  useEffect(() => { if (sources[activeSource]) loadVideo(sources[activeSource]) }, [sources, activeSource, loadVideo])

  const switchAudio = id => {
    if (hlsRef.current) { hlsRef.current.audioTrack = id; setActiveAudio(id) }
  }

  // ── UI ────────────────────────────────────────────────────────────────
  const C = { panelBg: '#111', accent: '#1a98ff', border: '#222' }
  const panelStyle = { position:'absolute', top:56, right:16, width:350, background:C.panelBg, borderRadius:12, overflow:'hidden', zIndex:100, border:`1px solid ${C.border}` }

  return (
    <div ref={containerRef} onMouseMove={resetHide} style={{ position:'fixed', inset:0, background:'#000', zIndex:100, color:'#fff' }}>
      <video ref={videoRef} style={{ width:'100%', height:'100%', objectFit:'contain' }} playsInline autoPlay />

      <AnimatePresence>
        {loadState === 'error' && (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.9)' }}>
            <AlertCircle size={48} color="#ff4444" />
            <p style={{ marginTop:16 }}>{errorMsg}</p>
            <button onClick={() => { setOpenPanel('sources'); setLoadState('playing') }} style={{ marginTop:20, padding:'10px 24px', background:C.accent, border:'none', borderRadius:6, color:'#fff', fontWeight:600, cursor:'pointer' }}>Try Another Link</button>
          </div>
        )}
      </AnimatePresence>

      <motion.div animate={{ opacity: showUI ? 1 : 0 }} style={{ position:'absolute', inset:0 }}>
        <div style={{ position:'absolute', top:0, left:0, right:0, display:'flex', justifyContent:'space-between', padding:20, background:'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}><button onClick={() => navigate(-1)} style={ICON_BTN}><IconClose/></button><strong>{title}</strong></div>
          <button style={ICON_BTN} onClick={() => setOpenPanel(p => p === 'settings' ? null : 'settings')}><IconMore/></button>
          
          {/* Settings Panel */}
          <AnimatePresence>
            {openPanel === 'settings' && (
              <motion.div style={panelStyle} initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }}>
                <div style={{ padding:16, borderBottom:`1px solid ${C.border}`, fontSize:14, color:'#888' }}>VidZee Controls</div>
                <div onClick={() => setOpenPanel('sources')} style={{ padding:16, cursor:'pointer', display:'flex', gap:12 }}><Settings size={18}/><span>Change VidZee Server</span></div>
                <div onClick={() => setOpenPanel('audio')} style={{ padding:16, cursor:'pointer', display:'flex', gap:12 }}><Languages size={18}/><span>Switch Multi-Audio</span></div>
              </motion.div>
            )}

            {openPanel === 'audio' && (
              <motion.div style={panelStyle} initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }}>
                <div style={{ padding:16, borderBottom:`1px solid ${C.border}`, display:'flex', gap:8 }}><button onClick={()=>setOpenPanel('settings')} style={{background:'none',border:'none',color:'#fff'}}><IconChevronLeft/></button> Audio Tracks</div>
                {audioTracks.length === 0 ? <div style={{padding:16, color:'#666'}}>Single track stream.</div> : audioTracks.map(t => (
                  <div key={t.id} onClick={() => switchAudio(t.id)} style={{ padding:16, color: activeAudio === t.id ? C.accent : '#fff', cursor:'pointer' }}>{t.label}</div>
                ))}
              </motion.div>
            )}

            {openPanel === 'sources' && (
              <motion.div style={panelStyle} initial={{ opacity:0, x:20 }} animate={{ opacity:1, x:0 }}>
                <div style={{ padding:16, borderBottom:`1px solid ${C.border}`, display:'flex', gap:8 }}><button onClick={()=>setOpenPanel('settings')} style={{background:'none',border:'none',color:'#fff'}}><IconChevronLeft/></button> VidZee Links</div>
                <div style={{ maxHeight:300, overflowY:'auto' }}>
                  {sources.map((s, i) => (
                    <div key={i} onClick={() => { setActiveSource(i); setOpenPanel(null) }} style={{ padding:16, color: activeSource === i ? C.accent : '#fff', cursor:'pointer', borderBottom:`1px solid ${C.border}`, fontSize:13 }}>{s.name || s.title}</div>
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
