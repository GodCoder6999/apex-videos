// src/pages/Player.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, AlertCircle } from 'lucide-react'

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

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const IconClose = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconCC = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><rect x="2" y="5" width="20" height="15" rx="2"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="6" y1="16" x2="14" y2="16"/></svg>
const IconVolume = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
const IconVolumeMute = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
const IconPiP = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/></svg>
const IconFullscreen = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
const IconFullscreenExit = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><polyline points="8 3 3 3 3 8"/><polyline points="21 8 21 3 16 3"/><polyline points="3 16 3 21 8 21"/><polyline points="16 21 21 21 21 16"/></svg>
const IconMore = () => <svg viewBox="0 0 24 24" fill="currentColor" style={{width:22,height:22}}><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
const IconServer = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>
const IconChevronRight = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}><polyline points="9 18 15 12 9 6"/></svg>
const IconChevronLeft = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><polyline points="15 18 9 12 15 6"/></svg>
const IconPlay = () => <svg viewBox="0 0 24 24" fill="currentColor" style={{width:24,height:24}}><polygon points="6,3 20,12 6,21"/></svg>
const IconPause = () => <svg viewBox="0 0 24 24" fill="currentColor" style={{width:24,height:24}}><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>

const ICON_BTN = { background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }

export default function Player() {
  const { type = 'movie', id } = useParams()
  const navigate = useNavigate()

  const videoRef     = useRef(null)
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

  // Sources & Track lists
  const [sources,       setSources]       = useState([])
  const [activeSource,  setActiveSource]  = useState(0)
  const [audioTracks,   setAudioTracks]   = useState([])
  const [activeAudio,   setActiveAudio]   = useState(-1)
  const [qualities,     setQualities]     = useState([])
  const [activeQuality, setActiveQuality] = useState(-1)

  // UI state
  const [showUI,        setShowUI]        = useState(true)
  const [openPanel,     setOpenPanel]     = useState(null)
  const [loadState,     setLoadState]     = useState('loading')
  const [errorMsg,      setErrorMsg]      = useState('')
  const [loadStep,      setLoadStep]      = useState('Connecting to Signal Vault...')
  const [loadProgress,  setLoadProgress]  = useState(0)
  const [title,         setTitle]         = useState('')
  const [season] = useState(1)
  const [episode] = useState(1)

  useEffect(() => {
    fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}&language=en-US`)
      .then(r => r.json())
      .then(d => setTitle(d.title || d.name || ''))
      .catch(() => {})
  }, [type, id])

  const resetHide = useCallback(() => {
    setShowUI(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { setShowUI(false); setOpenPanel(null) }, 4500)
  }, [])

  // ── 1. Fetch EXCLUSIVELY from Signal Vault (Flix-Streams) ──────────────────
  const fetchSources = useCallback(async () => {
    setLoadState('loading'); setLoadProgress(20); setLoadStep('Resolving Content Meta...');
    
    let streamId = type === 'tv' ? `tmdb:${id}:${season}:${episode}` : `tmdb:${id}`
    try {
      const extRes = await fetch(`${BASE_URL}/${type}/${id}/external_ids?api_key=${API_KEY}`)
      if (extRes.ok) {
        const extData = await extRes.json()
        if (extData.imdb_id) streamId = type === 'tv' ? `${extData.imdb_id}:${season}:${episode}` : extData.imdb_id
      }
    } catch (_) {}

    const stremioType = type === 'tv' ? 'series' : 'movie'
    setLoadProgress(60); setLoadStep('Searching Signal Vault Servers...')
    
    try {
      // Signal Vault integration via Flix-Streams manifest
      const svUrl = `https://flixnest.app/api/flix-streams/stream/${stremioType}/${streamId}.json`
      const resp = await fetch(svUrl, { signal: AbortSignal.timeout(10000) })
      if (resp.ok) {
        const data = await resp.json()
        const validStreams = (data?.streams || []).filter(s => s.url)
        
        // Prioritize Signal Vault Server 2 (High Multi-Audio/Hindi Coverage)
        const getScore = (s) => {
          let score = 0
          const label = (s.name || s.title || s.description || '').toLowerCase()
          
          if (label.includes('signal vault') || label.includes('sv2')) score += 5000
          if (label.includes('multi') || label.includes('dual')) score += 1000
          if (label.includes('hindi') || label.includes('hin')) score += 800
          if (label.includes('4k') || label.includes('remux')) score += 500
          if (label.includes('1080p')) score += 100
          
          return score
        }

        const sorted = validStreams.sort((a, b) => getScore(b) - getScore(a))
        setSources(sorted); setActiveSource(0); setLoadProgress(80)
      } else {
        throw new Error('Signal Vault unavailable')
      }
    } catch (e) {
      setLoadState('error'); setErrorMsg('Signal Vault is currently offline. Please check your network or try again later.')
    }
  }, [type, id, season, episode])

  useEffect(() => { fetchSources() }, [fetchSources])

  // ── 2. Load Selected Stream ───────────────────────────────────
  const loadVideo = useCallback(async (stream) => {
    if (!stream) return
    setLoadState('loading'); setLoadStep('Buffering Signal Vault Stream...'); setLoadProgress(90)
    setAudioTracks([]); setActiveAudio(-1); setQualities([]); setActiveQuality(-1)

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    const video = videoRef.current
    if (video) { video.pause(); video.removeAttribute('src'); video.load() }

    try {
      const Hls = await loadHls()
      if (!video) return

      const isM3U8 = /\.m3u8/i.test(stream.url) || stream.url.includes('.m3u8')
      const targetUrl = isM3U8 ? `/api/proxy?url=${encodeURIComponent(stream.url)}` : stream.url

      if (!isM3U8 || !Hls || !Hls.isSupported()) {
        video.src = targetUrl
        setLoadState('playing'); setLoadProgress(100)
        video.play().catch(e => { if(e.name !== 'AbortError') setLoadState('error') })
        return
      }

      const hls = new Hls({ enableWorker: true, lowLatencyMode: false, xhrSetup: xhr => { xhr.withCredentials = false } })
      hlsRef.current = hls
      hls.attachMedia(video)
      hls.on(Hls.Events.MEDIA_ATTACHED, () => { hls.loadSource(targetUrl) })

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const at = hls.audioTracks || []
        if (at.length > 0) {
          setAudioTracks(at.map(t => ({ id: t.id, label: t.name || t.lang || `Track ${t.id}` })))
          setActiveAudio(at[0].id); hls.audioTrack = at[0].id
        }
        setLoadState('playing'); video.play().catch(() => {})
      })
      
      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, d) => setActiveAudio(d.id))
      hls.on(Hls.Events.ERROR, (_, d) => {
        if (d.fatal) { setLoadState('error'); setErrorMsg('Signal Vault stream error. Try another link.') }
      })
    } catch (e) { setLoadState('error'); setErrorMsg(e.message) }
  }, [])

  useEffect(() => { if (sources[activeSource]) loadVideo(sources[activeSource]) }, [sources, activeSource, loadVideo])

  const switchAudio = id => {
    const hls = hlsRef.current; const v = videoRef.current
    if (hls) { hls.audioTrack = id; setActiveAudio(id) } 
    else if (v?.audioTracks) { for (let i = 0; i < v.audioTracks.length; i++) v.audioTracks[i].enabled = (i === id); setActiveAudio(id) }
  }

  // ── UI Styles ────────────────────────────────────────────────────────
  const C = { bg: '#000', panelBg: '#1a1d21', panelBorder: '#2e3239', accent: '#1a98ff', textSec: '#8b8f97' }
  const panelStyle = { position:'absolute', top:56, right:16, width:380, background:C.panelBg, borderRadius:8, overflow:'hidden', zIndex:100, boxShadow:'0 8px 32px rgba(0,0,0,0.8)' }
  const RadioCircle = ({ selected }) => <div style={{ width:24, height:24, flexShrink: 0, border: `2px solid ${selected ? C.accent : C.textSec}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{selected && <div style={{width:8,height:8,background:'#fff',borderRadius:'50%'}}/>}</div>

  return (
    <div ref={containerRef} onMouseMove={resetHide} style={{ position:'fixed', inset:0, background:'#000', zIndex:100, display:'flex', flexDirection:'column', fontFamily:"sans-serif", userSelect:'none' }}>
      <video ref={videoRef} style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'contain' }} playsInline autoPlay />

      <AnimatePresence>
        {loadState === 'error' && (
          <motion.div style={{ position:'absolute', inset:0, zIndex:20, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20, background:'rgba(0,0,0,0.96)', textAlign:'center', padding:24 }}>
            <AlertCircle style={{width:52,height:52,color:'#ff4444'}}/>
            <p style={{color:'#fff', fontSize:20, fontWeight:700}}>Signal Vault Error</p>
            <p style={{color:'#888', fontSize:14, maxWidth:400}}>{errorMsg}</p>
            <button onClick={() => { setOpenPanel('sources'); setLoadState('playing') }} style={{ padding:'10px 24px', background:'#1a98ff', color:'#fff', borderRadius:8, fontWeight:700, border:'none', cursor:'pointer' }}>View Signal Vault Links</button>
          </motion.div>
        )}
      </AnimatePresence>

      {loadState !== 'error' && (
        <motion.div animate={{ opacity: showUI ? 1 : 0 }} style={{ position:'absolute', inset:0, zIndex:30, pointerEvents: showUI ? 'auto' : 'none' }}>
          <div style={{ position:'absolute', top:0, left:0, right:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', background:'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)' }}>
            <div style={{display:'flex', gap:14, alignItems:'center'}}><button onClick={() => navigate(-1)} style={ICON_BTN}><IconClose/></button><span style={{color:'#fff', fontWeight:700, fontSize:18}}>{title}</span></div>
            <div style={{display:'flex', gap:4, position:'relative'}}>
              <button style={ICON_BTN} onClick={() => setOpenPanel(p => p === 'settings' ? null : 'settings')}><IconMore/></button>
              <AnimatePresence>
                {openPanel === 'settings' && (
                  <motion.div style={panelStyle}>
                    <div style={{padding:'16px 20px', borderBottom:`1px solid ${C.panelBorder}`, fontWeight:600, color:'#fff'}}>Signal Vault Settings</div>
                    <div style={{padding:'16px 20px', borderBottom:`1px solid ${C.panelBorder}`, display:'flex', cursor:'pointer', color:'#fff'}} onClick={() => setOpenPanel('sources')}><IconServer/><span style={{marginLeft:12}}>Change Signal Vault Source</span></div>
                    <div style={{padding:'16px 20px', display:'flex', cursor:'pointer', color:'#fff'}} onClick={() => setOpenPanel('audio')}><IconCC/><span style={{marginLeft:12}}>Audio Tracks (Multi/Hindi)</span></div>
                  </motion.div>
                )}
                {openPanel === 'audio' && (
                  <motion.div style={panelStyle}>
                    <div style={{padding:'16px 20px', borderBottom:`1px solid ${C.panelBorder}`, color:'#fff', fontWeight:600}}><button onClick={() => setOpenPanel('settings')} style={{background:'none',border:'none',color:'#fff',marginRight:10}}><IconChevronLeft/></button> Multi-Language Tracks</div>
                    {audioTracks.length === 0 ? <div style={{padding:20, color:C.textSec, fontSize:13}}>No alternate audio detected for this specific link.</div> 
                    : audioTracks.map(t => (
                      <div key={t.id} onClick={() => switchAudio(t.id)} style={{padding:'14px 20px', display:'flex', cursor:'pointer', borderBottom:`1px solid ${C.panelBorder}`, color:'#fff'}}>
                        <RadioCircle selected={t.id === activeAudio}/><span style={{marginLeft:12}}>{t.label}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
                {openPanel === 'sources' && (
                   <motion.div style={panelStyle}>
                    <div style={{padding:'16px 20px', borderBottom:`1px solid ${C.panelBorder}`, color:'#fff', fontWeight:600}}><button onClick={() => setOpenPanel('settings')} style={{background:'none',border:'none',color:'#fff',marginRight:10}}><IconChevronLeft/></button> Signal Vault Links</div>
                    <div style={{maxHeight: 400, overflowY: 'auto'}}>
                      {sources.map((s, i) => (
                        <div key={i} onClick={() => { setActiveSource(i); setOpenPanel(null); }} style={{padding:'14px 20px', display:'flex', alignItems:'flex-start', cursor:'pointer', borderBottom:`1px solid ${C.panelBorder}`, color:'#fff'}}>
                          <RadioCircle selected={i === activeSource}/>
                          <div style={{marginLeft:12, overflow:'hidden', display: 'flex', flexDirection: 'column', gap: 4}}>
                            <div style={{fontSize:14, fontWeight:500}}>{s.name || s.title}</div>
                            {s.description && <div style={{fontSize:12, color:C.textSec, whiteSpace:'pre-wrap'}}>{s.description}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
