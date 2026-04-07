import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, AlertCircle } from 'lucide-react'
import { MediaPlayer, MediaProvider, useMediaState, useAudioOptions, useVideoQualityOptions, useMediaRemote } from '@vidstack/react'

const BASE_URL = 'https://api.themoviedb.org/3'
const API_KEY = import.meta.env.VITE_TMDB_API_KEY

const fmt = s => {
  if (!s || isNaN(s) || s === Infinity) return '0:00'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60)
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
const IconCC = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <rect x="2" y="5" width="20" height="15" rx="2" />
    <line x1="6" y1="12" x2="18" y2="12" /><line x1="6" y1="16" x2="14" y2="16" />
  </svg>
)
const IconVolume = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
)
const IconVolumeMute = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
  </svg>
)
const IconPiP = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none" />
  </svg>
)
const IconFullscreen = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
  </svg>
)
const IconFullscreenExit = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <polyline points="8 3 3 3 3 8" /><polyline points="21 8 21 3 16 3" />
    <polyline points="3 16 3 21 8 21" /><polyline points="16 21 21 21 21 16" />
  </svg>
)
const IconMore = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 22, height: 22 }}>
    <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
  </svg>
)
const IconServer = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
    <line x1="6" y1="6" x2="6.01" y2="6"></line>
    <line x1="6" y1="18" x2="6.01" y2="18"></line>
  </svg>
)
const IconChevronRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
)
const IconChevronLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
)
const IconSkipBack = () => (
  <svg viewBox="0 0 44 44" fill="none" style={{ width: 36, height: 36 }}>
    <path d="M28 10.5A14 14 0 1 0 36 22" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
    <polyline points="28,4 28,11 35,11" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <text x="22" y="27" textAnchor="middle" fill="white" fontSize="9.5" fontFamily="Arial" fontWeight="700">10</text>
  </svg>
)
const IconSkipFwd = () => (
  <svg viewBox="0 0 44 44" fill="none" style={{ width: 36, height: 36 }}>
    <path d="M16 10.5A14 14 0 1 1 8 22" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
    <polyline points="16,4 16,11 9,11" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <text x="22" y="27" textAnchor="middle" fill="white" fontSize="9.5" fontFamily="Arial" fontWeight="700">10</text>
  </svg>
)
const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 24, height: 24 }}>
    <polygon points="6,3 20,12 6,21" />
  </svg>
)
const IconPause = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 24, height: 24 }}>
    <rect x="5" y="3" width="4" height="18" rx="1" />
    <rect x="15" y="3" width="4" height="18" rx="1" />
  </svg>
)

const ICON_BTN = {
  background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
  padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center',
  justifyContent: 'center', transition: 'background 0.15s', position: 'relative',
}

function PlayerUI({ sources, activeSource, setActiveSource, fetchSources, title, navigate }) {
  const player = useRef(null)
  const containerRef = useRef(null)
  const seekTrackRef = useRef(null)
  const hideTimer = useRef(null)

  // Vidstack state hooks
  const remote = useMediaRemote()
  const isPlaying = !useMediaState('paused', player)
  const isMuted = useMediaState('muted', player)
  const volume = useMediaState('volume', player)
  const current = useMediaState('currentTime', player)
  const duration = useMediaState('duration', player)
  const buffered = useMediaState('bufferedEnd', player)
  const isBuffering = useMediaState('waiting', player)
  const speed = useMediaState('playbackRate', player)
  const canPlay = useMediaState('canPlay', player)
  const error = useMediaState('error', player)
  const fullscreen = useMediaState('fullscreen', player)

  // Track hooks
  const audioOptions = useAudioOptions({ ref: player })
  const qualityOptions = useVideoQualityOptions({ ref: player })
  
  const [showUI, setShowUI] = useState(true)
  const [openPanel, setOpenPanel] = useState(null)
  const [loadState, setLoadState] = useState('loading')

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

  useEffect(() => {
    if (error) {
      setLoadState('error')
    } else if (canPlay) {
      setLoadState('playing')
    } else {
      setLoadState('loading')
    }
  }, [error, canPlay])

  // Fullscreen & Keyboard
  useEffect(() => {
    const onKey = e => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      if (e.key === ' ' || e.key === 'k') { e.preventDefault(); isPlaying ? remote.pause() : remote.play() }
      else if (e.key === 'ArrowRight') { e.preventDefault(); remote.seek(Math.min(duration, current + 10)) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); remote.seek(Math.max(0, current - 10)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); remote.changeVolume(Math.min(1, volume + 0.1)) }
      else if (e.key === 'ArrowDown') { e.preventDefault(); remote.changeVolume(Math.max(0, volume - 0.1)) }
      else if (e.key === 'm') remote.toggleMuted()
      else if (e.key === 'f') remote.toggleFullscreen()
      resetHide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duration, current, volume, isPlaying, remote, resetHide])

  // ── Controls ───────────────────────────────────────────────────────────────
  const togglePlay = () => { isPlaying ? remote.pause() : remote.play(); resetHide() }
  const setVol = val => { remote.changeVolume(Math.max(0, Math.min(1, val))) }
  const seekTo = e => {
    const bar = seekTrackRef.current; if (!bar || !duration) return
    const { left, width } = bar.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - left) / width))
    remote.seek(pct * duration)
    resetHide()
  }

  const stream = sources[activeSource]
  const isM3U8 = stream?.url && (/\.m3u8/i.test(stream.url) || stream.url.includes('.m3u8'))
  const proxyUrl = isM3U8 ? `/api/proxy?url=${encodeURIComponent(stream.url)}` : stream?.url

  const pctPlayed = duration ? (current / duration) * 100 : 0
  const pctBuffered = duration ? (buffered / duration) * 100 : 0
  const volPct = isMuted ? 0 : volume * 100

  // ── UI Styles & Helpers ───────────────────────────────────────────────────
  const C = { bg: '#000', panelBg: '#1a1d21', panelBorder: '#2e3239', accent: '#1a98ff', textSec: '#8b8f97', hover: 'rgba(255,255,255,0.08)', active: 'rgba(255,255,255,0.12)' }
  const RadioCircle = ({ selected }) => (
    <div style={{ width: 24, height: 24, minWidth: 24, border: `2px solid ${selected ? C.accent : C.textSec}`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: selected ? C.accent : 'transparent', flexShrink: 0 }}>
      {selected && <div style={{ width: 8, height: 8, background: '#fff', borderRadius: '50%' }} />}
    </div>
  )
  const panelStyle = { position: 'absolute', top: 56, right: 16, width: 320, background: C.panelBg, borderRadius: 8, overflow: 'hidden', zIndex: 100, boxShadow: '0 8px 32px rgba(0,0,0,0.8)' }
  const panelHeaderStyle = { display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.panelBorder}`, fontSize: 16, fontWeight: 600, gap: 12 }
  const settingsRowStyle = { display: 'flex', alignItems: 'center', padding: '16px 20px', cursor: 'pointer', borderBottom: `1px solid ${C.panelBorder}`, gap: 16 }
  const rowLabelStyle = { flex: 1, fontSize: 15, fontWeight: 500 }
  const rowValueStyle = { fontSize: 14, color: C.textSec, display: 'flex', alignItems: 'center', gap: 4 }
  const radioOptionStyle = { display: 'flex', alignItems: 'flex-start', padding: '14px 20px', cursor: 'pointer', borderBottom: `1px solid ${C.panelBorder}`, gap: 14 }

  const getStreamLabel = (s) => {
    const parts = (s.title || s.name || 'Unknown Stream').split('\n')
    const name = parts[0].substring(0, 50) + (parts[0].length > 50 ? '...' : '')
    const sizePart = parts.find(p => p.includes('GB') || p.includes('MB')) || ''
    const sizeMatch = sizePart.match(/([\d.]+\s*(?:GB|MB))/i)
    const size = sizeMatch ? sizeMatch[1].trim() : ''
    const flags = (s.name || '').match(/[\u{1F1E0}-\u{1F1FF}]{2}|🌐/gu) || []
    const langStr = flags.join(' ')
    const qualMatch = (s.name || '').match(/(2160p|1080p|720p|480p|360p|4K)/i)
    const qual = qualMatch ? qualMatch[1] : ''
    return { name, size, langStr, qual }
  }

  const audioLabel = audioOptions.find(t => t.selected)?.label || 'Default'
  const qualityLabel = qualityOptions.find(q => q.selected)?.label || 'Auto'
  const speedLabel = speed === 1 ? 'Normal' : `${speed}×`

  return (
    <MediaPlayer ref={player} src={proxyUrl || ''} autoPlay playsInline crossOrigin="anonymous" style={{ width: '100%', height: '100%' }}>
      <MediaProvider />
      <div ref={containerRef} onMouseMove={resetHide} onTouchStart={resetHide} onClick={() => { if (loadState === 'playing') { togglePlay(); resetHide() } }} style={{ position: 'absolute', inset: 0, zIndex: 100, display: 'flex', flexDirection: 'column', userSelect: 'none', fontFamily: "'Amazon Ember','Arial',sans-serif" }}>

      {/* ── LOADING OVERLAY ── */}
      <AnimatePresence>
        {isBuffering || loadState === 'loading' ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, background: 'rgba(10,13,18,0.8)', textAlign: 'center', padding: '0 24px' }}>
            <div style={{ position: 'relative', width: 72, height: 72 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid rgba(255,255,255,0.05)' }} />
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid transparent', borderTopColor: '#1a98ff' }} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ── ERROR OVERLAY ── */}
      <AnimatePresence>
        {loadState === 'error' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, background: 'rgba(0,0,0,0.96)', textAlign: 'center', padding: '0 24px' }}>
            <AlertCircle style={{ width: 52, height: 52, color: '#ff4444' }} />
            <div>
              <p style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Stream Error</p>
              <p style={{ color: '#888', fontSize: 14, maxWidth: 360 }}>Failed to load media. Try a different source.</p>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', pointerEvents: 'auto' }}>
              {sources.length > 0 && (
                <button onClick={e => { e.stopPropagation(); setOpenPanel('sources'); setLoadState('playing'); }} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1a98ff', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Select Different Source
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CONTROLS UI ── */}
      {loadState !== 'error' && (
        <motion.div animate={{ opacity: showUI ? 1 : 0 }} style={{ position: 'absolute', inset: 0, zIndex: 30, pointerEvents: showUI ? 'auto' : 'none' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 160, background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 220, background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)', pointerEvents: 'none' }} />

          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button onClick={() => navigate(-1)} style={ICON_BTN}><IconClose /></button>
              <p style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{title || 'Now Playing'}</p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
              <button style={ICON_BTN} onClick={() => setOpenPanel(p => p === 'volume' ? null : 'volume')}>{isMuted || volume === 0 ? <IconVolumeMute /> : <IconVolume />}</button>
              <button style={ICON_BTN} onClick={() => remote.togglePictureInPicture()}><IconPiP /></button>
              <button style={ICON_BTN} onClick={() => remote.toggleFullscreen()}>{fullscreen ? <IconFullscreenExit /> : <IconFullscreen />}</button>
              <button style={ICON_BTN} onClick={() => setOpenPanel(p => p === 'settings' ? null : 'settings')}><IconMore /></button>

              {/* ── SETTINGS PANEL ── */}
              <AnimatePresence>
                {openPanel === 'settings' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={panelStyle} onClick={e => e.stopPropagation()}>
                    <div style={panelHeaderStyle}>Settings</div>
                    <div style={settingsRowStyle} onClick={() => setOpenPanel('sources')}>
                      <IconServer /> <span style={rowLabelStyle}>Stream Source</span> <span style={rowValueStyle}>Server {activeSource + 1} <IconChevronRight /></span>
                    </div>
                    <div style={settingsRowStyle} onClick={() => setOpenPanel('audio')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 20, height: 20 }}><rect x="2" y="6" width="4" height="12" rx="1" /><rect x="8" y="3" width="4" height="18" rx="1" /><rect x="14" y="8" width="4" height="10" rx="1" /></svg>
                      <span style={rowLabelStyle}>Audio</span> <span style={rowValueStyle}>{audioLabel} <IconChevronRight /></span>
                    </div>
                    <div style={settingsRowStyle} onClick={() => setOpenPanel('quality')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 20, height: 20 }}><rect x="2" y="4" width="20" height="16" rx="2" /><line x1="8" y1="20" x2="8" y2="22" /><line x1="16" y1="20" x2="16" y2="22" /><line x1="5" y1="22" x2="19" y2="22" /></svg>
                      <span style={rowLabelStyle}>Video Quality</span> <span style={rowValueStyle}>{qualityLabel} <IconChevronRight /></span>
                    </div>
                    <div style={{ ...settingsRowStyle, borderBottom: 'none' }} onClick={() => setOpenPanel('speed')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ width: 20, height: 20 }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      <span style={rowLabelStyle}>Playback Speed</span> <span style={rowValueStyle}>{speedLabel} <IconChevronRight /></span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── SOURCES SUB-PANEL ── */}
              <AnimatePresence>
                {openPanel === 'sources' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={panelStyle} onClick={e => e.stopPropagation()}>
                    <div style={panelHeaderStyle}><button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }} onClick={() => setOpenPanel('settings')}><IconChevronLeft /></button> Select Stream Source</div>
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                      {sources.map((s, i) => {
                        const { name, size, langStr, qual } = getStreamLabel(s)
                        return (
                          <div key={i} style={radioOptionStyle} onClick={() => { setActiveSource(i); setOpenPanel(null); }}>
                            <RadioCircle selected={i === activeSource} />
                            <div style={{ overflow: 'hidden', flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', color: i === activeSource ? '#fff' : '#ddd' }}>{name}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                                {langStr && <span style={{ fontSize: 12, letterSpacing: '1px' }}>{langStr}</span>}
                                {qual && <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(26,152,255,0.25)', color: '#6cb8ff', padding: '1px 6px', borderRadius: 4 }}>{qual}</span>}
                                {size && <span style={{ fontSize: 11, color: '#8b8f97' }}>{size}</span>}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── AUDIO SUB-PANEL ── */}
              <AnimatePresence>
                {openPanel === 'audio' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={panelStyle} onClick={e => e.stopPropagation()}>
                    <div style={panelHeaderStyle}><button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }} onClick={() => setOpenPanel('settings')}><IconChevronLeft /></button> Audio</div>
                    {audioOptions.length === 0 ? <p style={{ color: C.textSec, fontSize: 13, textAlign: 'center', padding: '28px 20px' }}>No alternate audio tracks available</p> : audioOptions.map(t => (
                      <div key={t.label} style={radioOptionStyle} onClick={() => t.select()}>
                        <RadioCircle selected={t.selected} />
                        <div><div style={{ fontSize: 15, fontWeight: 500 }}>{t.label}</div></div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── QUALITY SUB-PANEL ── */}
              <AnimatePresence>
                {openPanel === 'quality' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={panelStyle} onClick={e => e.stopPropagation()}>
                    <div style={panelHeaderStyle}><button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }} onClick={() => setOpenPanel('settings')}><IconChevronLeft /></button> Video Quality</div>
                    {qualityOptions.map(q => (
                      <div key={q.label} style={radioOptionStyle} onClick={() => q.select()}>
                        <RadioCircle selected={q.selected} />
                        <div><div style={{ fontSize: 15, fontWeight: 500 }}>{q.label}</div>{q.bitrate && <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>~{(q.bitrate / 1e6).toFixed(1)} Mbps</div>}</div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── SPEED SUB-PANEL ── */}
              <AnimatePresence>
                {openPanel === 'speed' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={panelStyle} onClick={e => e.stopPropagation()}>
                    <div style={panelHeaderStyle}><button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }} onClick={() => setOpenPanel('settings')}><IconChevronLeft /></button> Playback Speed</div>
                    {SPEEDS.map(r => (
                      <div key={r} style={radioOptionStyle} onClick={() => remote.changePlaybackRate(r)}>
                        <RadioCircle selected={r === speed} /><div style={{ fontSize: 15, fontWeight: 500 }}>{r === 1 ? 'Normal' : `${r}×`}</div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── VOLUME POPUP ── */}
              <AnimatePresence>
                {openPanel === 'volume' && (
                  <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} style={{ ...panelStyle, width: 240, padding: '16px 20px' }} onClick={e => e.stopPropagation()}>
                    <label style={{ fontSize: 14, color: C.textSec, display: 'block', marginBottom: 14 }}>Volume</label>
                    <input type="range" min="0" max="100" step="1" value={volPct} onChange={e => setVol(parseInt(e.target.value) / 100)} style={{ width: '100%', WebkitAppearance: 'none', appearance: 'none', height: 4, borderRadius: 2, outline: 'none', cursor: 'pointer', background: `linear-gradient(to right, #fff ${volPct}%, rgba(255,255,255,0.3) ${volPct}%)` }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ── BOTTOM CONTROLS ── */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 0 28px 0', zIndex: 10 }}>
            <div style={{ padding: '0 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: '#fff', minWidth: 45, letterSpacing: '0.02em' }}>{fmt(current)}</span>
              <div ref={seekTrackRef} onClick={e => { e.stopPropagation(); seekTo(e) }} style={{ flex: 1, position: 'relative', height: 3, background: 'rgba(255,255,255,0.3)', borderRadius: 2, cursor: 'pointer', pointerEvents: 'auto' }}>
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pctBuffered}%`, background: 'rgba(255,255,255,0.2)', borderRadius: 2 }} />
                <div style={{ position: 'absolute', inset: '0 auto 0 0', width: `${pctPlayed}%`, background: '#fff', borderRadius: 2, position: 'relative' }}>
                  <div style={{ position: 'absolute', right: -5, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, background: '#fff', borderRadius: '50%', boxShadow: '0 0 4px rgba(0,0,0,0.5)' }} />
                </div>
              </div>
              <span style={{ fontSize: 13, color: '#fff', minWidth: 45, textAlign: 'right', letterSpacing: '0.02em' }}>{fmt(duration)}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
              <button style={ICON_BTN} onClick={e => { e.stopPropagation(); remote.seek(Math.max(0, current - 10)); resetHide() }}><IconSkipBack /></button>
              <button onClick={e => { e.stopPropagation(); togglePlay() }} style={{ width: 56, height: 56, background: 'rgba(255,255,255,0.95)', border: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#000', pointerEvents: 'auto' }}>
                <AnimatePresence mode="wait">{isPlaying ? <motion.div key="p" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }}><IconPause /></motion.div> : <motion.div key="pl" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }}><IconPlay /></motion.div>}</AnimatePresence>
              </button>
              <button style={ICON_BTN} onClick={e => { e.stopPropagation(); remote.seek(Math.min(duration, current + 10)); resetHide() }}><IconSkipFwd /></button>
            </div>
          </div>
        </motion.div>
      )}
      </div>
    </MediaPlayer>
  )
}

export default function Player() {
  const { type = 'movie', id } = useParams()
  const navigate = useNavigate()
  
  const [sources, setSources] = useState([])
  const [activeSource, setActiveSource] = useState(0)
  const [title, setTitle] = useState('')
  const [season] = useState(1)
  const [episode] = useState(1)

  useEffect(() => {
    fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}&language=en-US`)
      .then(r => r.json())
      .then(d => setTitle(d.title || d.name || ''))
      .catch(() => { })
  }, [type, id])

  const fetchSources = useCallback(async () => {
    let streamId = type === 'tv' ? `tmdb:${id}:${season}:${episode}` : `tmdb:${id}`
    try {
      const extRes = await fetch(`${BASE_URL}/${type}/${id}/external_ids?api_key=${API_KEY}`)
      if (extRes.ok) {
        const extData = await extRes.json()
        if (extData.imdb_id) {
          streamId = type === 'tv' ? `${extData.imdb_id}:${season}:${episode}` : extData.imdb_id
        }
      }
    } catch (_) { }

    const stremioType = type === 'tv' ? 'series' : 'movie'
    const webStreamrConfig = encodeURIComponent(JSON.stringify({
      multi: 'checked', hi: 'checked', ta: 'checked', te: 'checked',
      es: 'checked', fr: 'checked', de: 'checked', it: 'checked',
      ml: 'checked', gu: 'checked', pa: 'checked', mx: 'checked', al: 'checked'
    }))

    const ADDONS = [
      { base: `https://webstreamr.hayd.uk/${webStreamrConfig}`, label: 'WebStreamr' },
      { base: 'https://nuviostreams.hayd.uk', label: 'Nuvio Streams' },
      { base: 'https://stremify.hayd.uk', label: 'Stremify' },
      { base: 'https://mediafusion.elfhosted.com', label: 'MediaFusion (Web-DLs)' },
      { base: 'https://autostream.elfhosted.com', label: 'AutoStream' },
      { base: 'https://torrentio.strem.fun', label: 'Torrentio (P2P Backend)' },
    ]

    const allStreams = []
    const seenUrls = new Set()

    const results = await Promise.allSettled(
      ADDONS.map(async (addon) => {
        try {
          const targetUrl = `${addon.base}/stream/${stremioType}/${streamId}.json`
          const proxyUrl = `/api/proxy?url=${encodeURIComponent(targetUrl)}`
          const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) })
          if (!resp.ok) return []
          const text = await resp.text()
          if (text.trimStart().startsWith('<')) return []
          const data = JSON.parse(text)
          return data?.streams || []
        } catch (err) { return [] }
      })
    )

    for (const result of results) {
      if (result.status === 'fulfilled') {
        for (const stream of result.value) {
          if (stream.url && !seenUrls.has(stream.url)) {
            seenUrls.add(stream.url)
            allStreams.push(stream)
          }
        }
      }
    }

    if (!allStreams.length) {
      return
    }

    const getScore = (s) => {
      let score = 0
      const url = (s.url || '').toLowerCase()
      const t = (s.title || '').toLowerCase()
      const n = (s.name || '').toLowerCase()
      const combined = t + ' ' + n
      const bingeGroup = (s.behaviorHints?.bingeGroup || '').toLowerCase()

      const langKeywords = [
        'hindi', 'hin', 'tamil', 'tam', 'telugu', 'tel', 'malayalam', 'mal',
        'english', 'eng', 'french', 'fre', 'german', 'ger', 'spanish', 'esp',
        'italian', 'ita', 'gujarati', 'guj', 'punjabi', 'pan', 'albanian'
      ]
      const langFlags = ['🇺🇸', '🇮🇳', '🇩🇪', '🇫🇷', '🇮🇹', '🇪🇸', '🇲🇽', '🇦🇱', '🌐']
      const flagCount = langFlags.filter(f => (s.name || '').includes(f)).length
      const detectedLangs = new Set()
      for (const kw of langKeywords) {
        if (combined.includes(kw)) detectedLangs.add(kw.substring(0, 3))
      }
      const bgLangs = bingeGroup.match(/_(en|hi|ta|te|ml|gu|pa|fr|de|it|es|mx|al)/g)
      if (bgLangs) bgLangs.forEach(l => detectedLangs.add(l.substring(1)))

      const langCount = Math.max(detectedLangs.size, flagCount)
      score += langCount * 500

      if (combined.includes('multi audio') || combined.includes('multi-audio') || combined.includes('multi ')) score += 800
      if (combined.includes('dual')) score += 400
      if (n.includes('🌐')) score += 600

      if (url.includes('.m3u8')) score += 150
      else if (url.includes('.mp4')) score += 80

      if (combined.includes('hevc') || combined.includes('x265') || combined.includes('h265')) score -= 300

      const fileSize = s.behaviorHints?.videoSize || 0
      if (fileSize > 0) {
        if (fileSize > 15 * 1e9) score -= 500
        else if (fileSize > 8 * 1e9) score -= 200
        else if (fileSize < 4 * 1e9) score += 100
      }

      if (combined.includes('1080p')) score += 80
      if (combined.includes('720p')) score += 40
      if (combined.includes('2160p') || combined.includes('4k')) score += 30
      if (combined.includes('480p') || combined.includes('360p')) score -= 50

      if (combined.includes('amzn') || combined.includes('prime')) score += 400
      if (combined.includes('web-dl') || combined.includes('webdl') || combined.includes('webrip')) score += 300
      if (combined.includes('nf') || combined.includes('netflix') || combined.includes('dsnp')) score += 250
      if (combined.includes('bluray') || combined.includes('remux')) score += 60

      const hasPreferred = detectedLangs.has('eng') || detectedLangs.has('hin') || 
                           detectedLangs.has('mul') || combined.includes('multi') || n.includes('🌐')
      if (!hasPreferred && langCount <= 1) {
        score -= 800
      }

      return score
    }

    allStreams.sort((a, b) => getScore(b) - getScore(a))

    setSources(allStreams)
    setActiveSource(0)
  }, [type, id, season, episode])

  useEffect(() => {
    fetchSources()
  }, [fetchSources])

  if (sources.length === 0) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#fff', fontSize: '18px', fontWeight: '500' }}>Scanning stream providers...</p>
      </div>
    )
  }

  return <PlayerUI sources={sources} activeSource={activeSource} setActiveSource={setActiveSource} fetchSources={fetchSources} title={title} navigate={navigate} />
}
