// src/pages/Player.jsx
// ─────────────────────────────────────────────────────────────────────────────
// STREAM ENGINE v3 — Full Language & Quality Extraction
//
// Strategy:
//  1. Fire ALL providers in parallel (don't stop at first result)
//  2. For each stream, fetch & parse the raw m3u8 master manifest ourselves
//  3. Extract EVERY #EXT-X-MEDIA:TYPE=AUDIO track → all dubbed languages
//  4. Extract EVERY #EXT-X-STREAM-INF variant → all quality levels (480p–1080p+)
//  5. Merge results across providers — present unified language + quality selector
//
// Built-in language map covers 40+ languages including Hindi, Spanish, French, etc.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, AlertCircle } from 'lucide-react'

const BASE_URL = 'https://api.themoviedb.org/3'
const API_KEY  = import.meta.env.VITE_TMDB_API_KEY

// ─── HLS.js CDN loader ───────────────────────────────────────────────────────
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

// ─── Language code → human readable name ─────────────────────────────────────
const LANG_MAP = {
  en:'English', hi:'Hindi', es:'Spanish', fr:'French', de:'German',
  it:'Italian', pt:'Portuguese', ru:'Russian', zh:'Chinese', ja:'Japanese',
  ko:'Korean', ar:'Arabic', tr:'Turkish', pl:'Polish', nl:'Dutch',
  sv:'Swedish', no:'Norwegian', da:'Danish', fi:'Finnish', cs:'Czech',
  sk:'Slovak', ro:'Romanian', hu:'Hungarian', bg:'Bulgarian', hr:'Croatian',
  sr:'Serbian', uk:'Ukrainian', he:'Hebrew', th:'Thai', id:'Indonesian',
  ms:'Malay', vi:'Vietnamese', bn:'Bengali', pa:'Punjabi', ta:'Tamil',
  te:'Telugu', ml:'Malayalam', kn:'Kannada', gu:'Gujarati', mr:'Marathi',
  ur:'Urdu', fa:'Persian', az:'Azerbaijani', ka:'Georgian',
  // 3-letter ISO 639-2
  eng:'English', hin:'Hindi', spa:'Spanish', fra:'French', deu:'German',
  ita:'Italian', por:'Portuguese', rus:'Russian', zho:'Chinese', jpn:'Japanese',
  kor:'Korean', ara:'Arabic', tur:'Turkish', pol:'Polish', nld:'Dutch',
  // regional
  'pt-br':'Portuguese (BR)', 'es-la':'Spanish (LA)', 'es-mx':'Spanish (MX)',
  'zh-hans':'Chinese (Simplified)', 'zh-hant':'Chinese (Traditional)',
  'zh-cn':'Chinese (Simplified)', 'zh-tw':'Chinese (Traditional)',
}

function langName(code, fallback) {
  if (!code) return fallback || 'Unknown'
  const lc = code.toLowerCase()
  return LANG_MAP[lc] || LANG_MAP[lc.substring(0, 2)] || fallback || code.toUpperCase()
}

// ─── Minimal M3U8 master playlist parser ─────────────────────────────────────
// Extracts all #EXT-X-MEDIA (audio/subtitle) and #EXT-X-STREAM-INF (variants)
// without any external library.
function parseM3U8Master(text, rawUrl) {
  const base = rawUrl ? rawUrl.substring(0, rawUrl.lastIndexOf('/') + 1) : ''

  function toAbs(uri) {
    if (!uri) return uri
    if (uri.startsWith('http')) return uri
    if (uri.startsWith('//')) return 'https:' + uri
    if (uri.startsWith('/')) return (base.match(/^(https?:\/\/[^/]+)/)?.[1] || '') + uri
    return base + uri
  }

  function parseAttrs(str) {
    const attrs = {}
    const re = /([A-Z0-9-]+)=(?:"([^"]*)"|([\w.\-:/+%=]+))/g
    let m
    while ((m = re.exec(str)) !== null) {
      attrs[m[1]] = m[2] !== undefined ? m[2] : m[3]
    }
    return attrs
  }

  const lines  = text.split('\n').map(l => l.trim()).filter(Boolean)
  const audio  = []
  const subs   = []
  const vars   = []
  let aid = 0, sid = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('#EXT-X-MEDIA:')) {
      const a = parseAttrs(line.slice('#EXT-X-MEDIA:'.length))
      if (a.TYPE === 'AUDIO') {
        audio.push({
          id: aid++,
          name: langName(a.LANGUAGE, a.NAME),
          lang: a.LANGUAGE || '',
          uri: a.URI ? toAbs(a.URI) : null,
          groupId: a['GROUP-ID'] || '',
          isDefault: a.DEFAULT === 'YES',
        })
      } else if (a.TYPE === 'SUBTITLES' && a.URI) {
        subs.push({
          id: sid++,
          name: langName(a.LANGUAGE, a.NAME),
          lang: a.LANGUAGE || '',
          uri: toAbs(a.URI),
          groupId: a['GROUP-ID'] || '',
        })
      }
    }

    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const a = parseAttrs(line.slice('#EXT-X-STREAM-INF:'.length))
      const next = lines[i + 1]
      if (next && !next.startsWith('#')) {
        const bw = parseInt(a['AVERAGE-BANDWIDTH'] || a.BANDWIDTH || '0')
        const res = a.RESOLUTION || ''
        const h = res ? parseInt(res.split('x')[1] || '0') : 0
        vars.push({
          bandwidth: bw, resolution: res, height: h,
          label: h ? `${h}p` : `${Math.round(bw / 1000)}kbps`,
          uri: toAbs(next),
          audioGroup: a.AUDIO || null,
        })
        i++
      }
    }
  }

  // Sort variants by quality desc, dedupe by height
  vars.sort((a, b) => b.bandwidth - a.bandwidth)
  const seenH = new Set()
  const variants = vars.filter(v => {
    if (!v.height) return true
    if (seenH.has(v.height)) return false
    seenH.add(v.height); return true
  })

  // Dedupe audio by lang
  const seenL = new Set()
  const audioTracks = audio.filter(t => {
    const k = (t.lang || t.name).toLowerCase()
    if (seenL.has(k)) return false
    seenL.add(k); return true
  })

  return { audioTracks, subtitleTracks: subs, variants }
}

// ─── Provider fetchers ────────────────────────────────────────────────────────
async function tryVidlink(tmdbId, type, season, episode) {
  const p = type === 'movie'
    ? `isMovie=true&id=${tmdbId}`
    : `isMovie=false&id=${tmdbId}&season=${season}&episode=${episode}`
  const r = await fetch(`/api/proxy?url=${encodeURIComponent(`https://vidlink.pro/api/vidlink/watch?${p}`)}`, {
    signal: AbortSignal.timeout(12000)
  })
  if (!r.ok) throw new Error(`vidlink ${r.status}`)
  const t = await r.text()
  if (t.trimStart().startsWith('<')) throw new Error('vidlink HTML')
  const d = JSON.parse(t)
  const pl = d?.stream?.playlist
  if (!pl) throw new Error('vidlink no playlist')
  const cors = d?.stream?.flags?.includes('cors-allowed')
  const captions = (d?.stream?.captions || []).filter(c => c.url).map(c => ({
    label: langName(c.language, c.language), lang: c.language || 'en', url: c.url,
  }))
  return {
    url: cors ? pl : `/api/proxy?url=${encodeURIComponent(pl)}`,
    rawUrl: pl, label: 'VidLink', captions,
  }
}

async function tryVidsrcNet(id, type, season, episode) {
  const path = type === 'movie' ? `/api/stream/movie/${id}` : `/api/stream/tv/${id}/${season}/${episode}`
  const r = await fetch(`/api/proxy?url=${encodeURIComponent(`https://vidsrc.net${path}`)}`, {
    signal: AbortSignal.timeout(10000)
  })
  if (!r.ok) throw new Error(`vidsrc.net ${r.status}`)
  const t = await r.text()
  if (t.trimStart().startsWith('<')) throw new Error('vidsrc.net HTML')
  const d = JSON.parse(t)
  const raw = typeof d?.stream === 'string' ? d.stream : d?.stream?.hls || d?.stream?.url
  if (!raw) throw new Error('vidsrc.net no url')
  return { url: `/api/proxy?url=${encodeURIComponent(raw)}`, rawUrl: raw, label: 'VidSrc', captions: [] }
}

async function tryVidsrcRip(id, type, season, episode) {
  const path = type === 'movie' ? `/api/stream/${id}` : `/api/stream/${id}/${season}/${episode}`
  const r = await fetch(`/api/proxy?url=${encodeURIComponent(`https://vidsrc.rip${path}`)}`, {
    signal: AbortSignal.timeout(10000)
  })
  if (!r.ok) throw new Error(`vidsrc.rip ${r.status}`)
  const t = await r.text()
  if (t.trimStart().startsWith('<')) throw new Error('vidsrc.rip HTML')
  const d = JSON.parse(t)
  const raw = d?.stream?.hls || d?.stream?.url || d?.url || (typeof d?.stream === 'string' ? d.stream : null)
  if (!raw) throw new Error('vidsrc.rip no url')
  return { url: `/api/proxy?url=${encodeURIComponent(raw)}`, rawUrl: raw, label: 'VidSrc.rip', captions: [] }
}

async function tryStremio(imdbId, tmdbId, type, season, episode) {
  const st = type === 'tv' ? 'series' : 'movie'
  const sid = imdbId
    ? (type === 'tv' ? `${imdbId}:${season}:${episode}` : imdbId)
    : (type === 'tv' ? `tmdb:${tmdbId}:${season}:${episode}` : `tmdb:${tmdbId}`)
  for (const base of ['https://stremify.hayd.uk','https://webstreamr.hayd.uk','https://nuviostreams.hayd.uk']) {
    try {
      const r = await fetch(`/api/proxy?url=${encodeURIComponent(`${base}/stream/${st}/${sid}.json`)}`, {
        signal: AbortSignal.timeout(8000)
      })
      if (!r.ok) continue
      const t = await r.text()
      if (t.trimStart().startsWith('<')) continue
      const d = JSON.parse(t)
      const streams = (d?.streams || []).filter(s => {
        if (!s.url) return false
        const u = s.url.toLowerCase(), ti = (s.title || '').toLowerCase()
        return !u.includes('.mkv') && !ti.includes('mkv') && !ti.includes('hevc')
      })
      streams.sort((a, b) => (b.url.includes('.m3u8')?1:0) - (a.url.includes('.m3u8')?1:0))
      if (!streams.length) continue
      const s = streams[0]
      const isHls = /\.m3u8/i.test(s.url)
      return {
        url: isHls ? `/api/proxy?url=${encodeURIComponent(s.url)}` : s.url,
        rawUrl: s.url,
        label: s.name?.split('\n')[0] || 'Stremio',
        captions: [],
      }
    } catch (_) {}
  }
  throw new Error('Stremio unavailable')
}

// ─── Fetch + parse manifest for a source ─────────────────────────────────────
async function getManifestTracks(proxyUrl, rawUrl) {
  try {
    const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const t = await r.text()
    if (!t.includes('#EXTM3U')) return null
    return parseM3U8Master(t, rawUrl)
  } catch (_) { return null }
}

// ─── Master resolver: parallel fetch + aggregate all tracks ──────────────────
async function resolveAll({ tmdbId, imdbId, type, season, episode, onStep }) {
  onStep('Contacting all providers in parallel…')
  const settled = await Promise.allSettled([
    tryVidlink(tmdbId, type, season, episode),
    tryVidsrcNet(imdbId || tmdbId, type, season, episode),
    tryVidsrcRip(imdbId || tmdbId, type, season, episode),
    tryStremio(imdbId, tmdbId, type, season, episode),
  ])
  const ok = settled.filter(r => r.status === 'fulfilled').map(r => r.value)
  if (!ok.length) throw new Error('All stream providers failed. Please try again.')

  onStep(`Parsing manifests from ${ok.length} source${ok.length>1?'s':''}…`)

  // Parse ALL manifests in parallel
  const manifests = await Promise.allSettled(
    ok.map(s => getManifestTracks(s.url, s.rawUrl))
  )

  // Aggregate: merge audio tracks + qualities across all sources
  const seenLang = new Set(), seenH = new Set()
  const allAudio = [], allQualities = []

  manifests.forEach((m, i) => {
    if (m.status !== 'fulfilled' || !m.value) return
    const src = ok[i]
    m.value.audioTracks.forEach(t => {
      const k = (t.lang || t.name).toLowerCase()
      if (!seenLang.has(k)) { seenLang.add(k); allAudio.push({ ...t, sourceIdx: i, srcLabel: src.label }) }
    })
    m.value.variants.forEach(v => {
      const k = v.label
      if (!seenH.has(k)) { seenH.add(k); allQualities.push({ ...v, sourceIdx: i }) }
    })
  })

  // Aggregate captions
  const seenCapLang = new Set()
  const allCaptions = []
  ok.forEach(s => {
    (s.captions || []).forEach(c => {
      const k = (c.lang || c.label).toLowerCase()
      if (!seenCapLang.has(k)) { seenCapLang.add(k); allCaptions.push(c) }
    })
  })

  // Sort qualities: highest resolution first
  allQualities.sort((a, b) => (b.height || 0) - (a.height || 0))

  return { primary: ok[0], sources: ok, audioTracks: allAudio, qualities: allQualities, captions: allCaptions }
}

// ─── Utility ─────────────────────────────────────────────────────────────────
const fmt = s => {
  if (!s || isNaN(s) || s === Infinity) return '0:00'
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60)
  return h>0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`
}
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

// ─── Icons (inline SVG) ───────────────────────────────────────────────────────
const Ic = {
  Close:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  CC:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><rect x="2" y="5" width="20" height="15" rx="2"/><path d="M7 15s.875-4 4-4 4 4 4 4M15 15s.875-4 4-4"/></svg>,
  Vol:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>,
  Mute:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>,
  PiP:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><rect x="2" y="4" width="20" height="16" rx="2"/><rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor" stroke="none"/></svg>,
  FS:     () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>,
  FSExit: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><polyline points="8 3 3 3 3 8"/><polyline points="21 8 21 3 16 3"/><polyline points="3 16 3 21 8 21"/><polyline points="16 21 21 21 21 16"/></svg>,
  More:   () => <svg viewBox="0 0 24 24" fill="currentColor" style={{width:22,height:22}}><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>,
  ChR:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}><polyline points="9 18 15 12 9 6"/></svg>,
  ChL:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><polyline points="15 18 9 12 15 6"/></svg>,
  Globe:  () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
  Qual:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="8" y1="20" x2="8" y2="22"/><line x1="16" y1="20" x2="16" y2="22"/><line x1="5" y1="22" x2="19" y2="22"/></svg>,
  SkipB:  () => <svg viewBox="0 0 44 44" fill="none" style={{width:36,height:36}}><path d="M28 10.5A14 14 0 1 0 36 22" stroke="white" strokeWidth="2.2" strokeLinecap="round"/><polyline points="28,4 28,11 35,11" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/><text x="22" y="27" textAnchor="middle" fill="white" fontSize="9.5" fontFamily="Arial" fontWeight="700">10</text></svg>,
  SkipF:  () => <svg viewBox="0 0 44 44" fill="none" style={{width:36,height:36}}><path d="M16 10.5A14 14 0 1 1 8 22" stroke="white" strokeWidth="2.2" strokeLinecap="round"/><polyline points="16,4 16,11 9,11" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/><text x="22" y="27" textAnchor="middle" fill="white" fontSize="9.5" fontFamily="Arial" fontWeight="700">10</text></svg>,
  Play:   () => <svg viewBox="0 0 24 24" fill="currentColor" style={{width:24,height:24}}><polygon points="6,3 20,12 6,21"/></svg>,
  Pause:  () => <svg viewBox="0 0 24 24" fill="currentColor" style={{width:24,height:24}}><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>,
}

const IBTN = { background:'none', border:'none', color:'#fff', cursor:'pointer', padding:'8px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.15s' }
const C = { panelBg:'#1a1d21', border:'#2e3239', accent:'#1a98ff', dim:'#8b8f97', hover:'rgba(255,255,255,0.08)', active:'rgba(255,255,255,0.12)' }
const RadioDot = ({ on }) => (
  <div style={{ width:28,height:28,minWidth:28,flexShrink:0,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center', border:`2px solid ${on?C.accent:C.dim}`, background:on?C.accent:'transparent', transition:'all 0.15s' }}>
    {on && <div style={{width:9,height:9,background:'#fff',borderRadius:'50%'}}/>}
  </div>
)

// ─── Player Component ─────────────────────────────────────────────────────────
export default function Player() {
  const { type = 'movie', id } = useParams()
  const navigate = useNavigate()

  const videoRef     = useRef(null)
  const hlsRef       = useRef(null)
  const containerRef = useRef(null)
  const seekRef      = useRef(null)
  const hideTimer    = useRef(null)
  const sourcesRef   = useRef([])

  const [playing,      setPlaying]      = useState(false)
  const [muted,        setMuted]        = useState(false)
  const [volume,       setVolume]       = useState(0.8)
  const [current,      setCurrent]      = useState(0)
  const [duration,     setDuration]     = useState(0)
  const [buffered,     setBuffered]     = useState(0)
  const [fullscreen,   setFullscreen]   = useState(false)
  const [speed,        setSpeed]        = useState(1)
  const [isBuffering,  setIsBuffering]  = useState(false)

  const [audioTracks,  setAudioTracks]  = useState([])
  const [activeAudio,  setActiveAudio]  = useState(null)
  const [qualities,    setQualities]    = useState([])
  const [activeQId,    setActiveQId]    = useState(-1)
  const [captions,     setCaptions]     = useState([])
  const [activeCap,    setActiveCap]    = useState(-1)

  const [showUI,       setShowUI]       = useState(true)
  const [panel,        setPanel]        = useState(null)
  const [loadState,    setLoadState]    = useState('loading')
  const [errorMsg,     setErrorMsg]     = useState('')
  const [srcLabel,     setSrcLabel]     = useState('')
  const [loadStep,     setLoadStep]     = useState('Connecting…')
  const [loadPct,      setLoadPct]      = useState(0)
  const [title,        setTitle]        = useState('')
  const [imdbId,       setImdbId]       = useState('')
  const [season]  = useState(1)
  const [episode] = useState(1)

  useEffect(() => {
    fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}&language=en-US`).then(r=>r.json()).then(d=>setTitle(d.title||d.name||'')).catch(()=>{})
    fetch(`${BASE_URL}/${type}/${id}/external_ids?api_key=${API_KEY}`).then(r=>r.json()).then(d=>{if(d.imdb_id)setImdbId(d.imdb_id)}).catch(()=>{})
  }, [type, id])

  const resetHide = useCallback(() => {
    setShowUI(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { setShowUI(false); setPanel(null) }, 4500)
  }, [])
  useEffect(() => { resetHide(); return () => clearTimeout(hideTimer.current) }, [resetHide])

  // ── Boot ───────────────────────────────────────────────────────────────────
  const boot = useCallback(async () => {
    setLoadState('loading'); setLoadStep('Connecting…'); setLoadPct(5)
    setSrcLabel(''); setPanel(null)
    setAudioTracks([]); setActiveAudio(null)
    setQualities([]); setActiveQId(-1)
    setCaptions([]); setActiveCap(-1)

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    const v = videoRef.current
    if (v) { v.removeAttribute('src'); v.load() }

    let resolved
    try {
      resolved = await resolveAll({ tmdbId:id, imdbId, type, season, episode, onStep: setLoadStep })
    } catch (e) { setLoadState('error'); setErrorMsg(e.message); return }

    sourcesRef.current = resolved.sources
    setSrcLabel(resolved.primary.label)
    setCaptions(resolved.captions)
    setLoadPct(80)

    // Set audio + quality from manifest parsing
    if (resolved.audioTracks.length > 0) {
      setAudioTracks(resolved.audioTracks)
      setActiveAudio(resolved.audioTracks.find(t => t.isDefault) || resolved.audioTracks[0])
    }
    if (resolved.qualities.length > 0) {
      setQualities([{ id:-1, label:'Auto', bandwidth:0, height:0 }, ...resolved.qualities])
      setActiveQId(-1)
    }

    setLoadStep('Initializing player…'); setLoadPct(88)

    const Hls = await loadHls()
    const v2 = videoRef.current; if (!v2) return

    const url = resolved.primary.url
    const isM = /\.m3u8/i.test(url) || decodeURIComponent(url).includes('.m3u8')

    if (!isM || !Hls || !Hls.isSupported()) {
      v2.src = url; setLoadState('playing'); setLoadPct(100)
      v2.play().catch(() => setPlaying(false)); return
    }

    const hls = new Hls({ enableWorker:true, lowLatencyMode:false, backBufferLength:90, maxBufferLength:60, maxMaxBufferLength:600, startLevel:-1, manifestLoadingMaxRetry:4, levelLoadingMaxRetry:4, fragLoadingMaxRetry:6 })
    hlsRef.current = hls
    hls.attachMedia(v2)
    hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(url))

    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      // Quality: merge hls.js levels (has proper IDs for switching) with our parsed labels
      const hlsLevels = data.levels.map((l, i) => ({
        id: i, label: l.height ? `${l.height}p` : `Level ${i+1}`,
        bandwidth: l.bitrate, height: l.height || 0,
      }))
      if (resolved.qualities.length === 0 && hlsLevels.length > 0) {
        setQualities([{ id:-1, label:'Auto', bandwidth:0, height:0 }, ...hlsLevels])
      }
      setActiveQId(-1)

      // Audio from hls.js (supplement/replace if manifest parsing had none)
      const hlsAudio = hls.audioTracks || []
      if (resolved.audioTracks.length === 0 && hlsAudio.length > 0) {
        const tracks = hlsAudio.map(t => ({
          id: t.id, name: langName(t.lang, t.name), lang: t.lang||'',
          uri: null, isDefault: !!t.default, sourceIdx: 0, srcLabel: resolved.primary.label,
          useHls: true,
        }))
        setAudioTracks(tracks)
        const def = hlsAudio.find(t=>t.default) || hlsAudio[0]
        if (def) { setActiveAudio(tracks[0]); hls.audioTrack = def.id }
      }

      setLoadState('playing'); setLoadPct(100)
      v2.play().catch(() => setPlaying(false))
    })

    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, d) => {
      const hlsAudio = d.audioTracks || []
      if (resolved.audioTracks.length === 0) {
        const tracks = hlsAudio.map(t => ({
          id:t.id, name:langName(t.lang,t.name), lang:t.lang||'',
          uri:null, isDefault:!!t.default, sourceIdx:0, srcLabel:resolved.primary.label, useHls:true,
        }))
        setAudioTracks(tracks)
      }
    })

    hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => setActiveQId(hls.autoLevelEnabled ? -1 : d.level))
    hls.on(Hls.Events.ERROR, (_, d) => {
      if (!d.fatal) return
      if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
      else { setLoadState('error'); setErrorMsg('Fatal stream error. Please retry.') }
    })
  }, [id, imdbId, type, season, episode])

  useEffect(() => { boot(); return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } } }, [boot])

  // Video events
  useEffect(() => {
    const v = videoRef.current; if (!v) return
    const H = {
      play: ()=>setPlaying(true), pause: ()=>setPlaying(false),
      timeupdate: ()=>{ setCurrent(v.currentTime); if(v.buffered.length) setBuffered(v.buffered.end(v.buffered.length-1)) },
      loadedmetadata: ()=>{ setDuration(v.duration); v.volume=volume },
      durationchange: ()=>setDuration(v.duration),
      volumechange: ()=>{ setVolume(v.volume); setMuted(v.muted) },
      waiting: ()=>setIsBuffering(true),
      playing: ()=>setIsBuffering(false),
      canplay: ()=>setIsBuffering(false),
    }
    Object.entries(H).forEach(([e,fn])=>v.addEventListener(e,fn))
    return ()=>Object.entries(H).forEach(([e,fn])=>v.removeEventListener(e,fn))
  }, [volume]) // eslint-disable-line

  useEffect(() => {
    const fn = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', fn)
    return () => document.removeEventListener('fullscreenchange', fn)
  }, [])

  // Subtitle injection
  useEffect(() => {
    const v = videoRef.current; if (!v) return
    Array.from(v.querySelectorAll('track')).forEach(t=>t.remove())
    if (activeCap < 0 || !captions[activeCap]) return
    const c = captions[activeCap]
    const t = document.createElement('track')
    t.kind='subtitles'; t.src=c.url; t.label=c.label
    t.srclang=(c.lang||'en').substring(0,2); t.default=true
    v.appendChild(t)
    setTimeout(()=>{ if(v.textTracks[0]) v.textTracks[0].mode='showing' }, 200)
  }, [activeCap, captions])

  // Keyboard
  useEffect(() => {
    const k = e => {
      if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return
      const v = videoRef.current; if (!v) return
      if (e.key===' '||e.key==='k'){e.preventDefault();v.paused?v.play():v.pause()}
      else if (e.key==='ArrowRight'){e.preventDefault();v.currentTime=Math.min(duration,v.currentTime+10)}
      else if (e.key==='ArrowLeft'){e.preventDefault();v.currentTime=Math.max(0,v.currentTime-10)}
      else if (e.key==='ArrowUp'){e.preventDefault();v.volume=Math.min(1,v.volume+0.1)}
      else if (e.key==='ArrowDown'){e.preventDefault();v.volume=Math.max(0,v.volume-0.1)}
      else if (e.key==='m') v.muted=!v.muted
      else if (e.key==='f') toggleFs()
      resetHide()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [duration, resetHide]) // eslint-disable-line

  // Controls
  const togglePlay = () => { const v=videoRef.current; if(!v) return; v.paused?v.play():v.pause(); resetHide() }
  const toggleFs   = () => { document.fullscreenElement?document.exitFullscreen():containerRef.current?.requestFullscreen() }
  const seekTo     = e => {
    const bar=seekRef.current; if(!bar||!duration) return
    const {left,width}=bar.getBoundingClientRect()
    const pct=Math.max(0,Math.min(1,(e.clientX-left)/width))
    if(videoRef.current) videoRef.current.currentTime=pct*duration; resetHide()
  }
  const setVol = val => {
    const v=videoRef.current; if(!v) return
    const n=Math.max(0,Math.min(1,val)); v.volume=n
    if(n===0) v.muted=true; else if(v.muted) v.muted=false
  }

  // Audio language switching — 3 strategies:
  const switchAudio = useCallback(async (track) => {
    setActiveAudio(track)
    const hls = hlsRef.current; const v = videoRef.current

    // Strategy 1: standard hls.js audioTrack switching (muxed/demuxed same manifest)
    if (track.useHls && hls) { hls.audioTrack = track.id; return }

    // Strategy 2: separate audio URI (EXT-X-MEDIA with URI pointing to audio-only playlist)
    // Load the audio track's playlist and mux it with the video-only stream
    if (track.uri) {
      const wasTime = v?.currentTime || 0
      const wasPlaying = !v?.paused
      if (hls) { hls.destroy(); hlsRef.current = null }
      const Hls = await loadHls(); if (!Hls || !Hls.isSupported() || !v) return
      const proxied = `/api/proxy?url=${encodeURIComponent(track.uri)}`
      const nh = new Hls({ enableWorker:true, startLevel:-1, backBufferLength:90, maxBufferLength:60 })
      hlsRef.current = nh; nh.attachMedia(v)
      nh.on(Hls.Events.MEDIA_ATTACHED, () => nh.loadSource(proxied))
      nh.on(Hls.Events.MANIFEST_PARSED, () => {
        v.currentTime = wasTime; if (wasPlaying) v.play().catch(()=>{})
      })
      nh.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { setLoadState('error'); setErrorMsg('Audio track failed.') } })
      return
    }

    // Strategy 3: switch to a different source that has this language
    if (track.sourceIdx !== undefined) {
      const src = sourcesRef.current[track.sourceIdx]; if (!src) return
      const wasTime = v?.currentTime || 0; const wasPlaying = !v?.paused
      if (hls) { hls.destroy(); hlsRef.current = null }
      const Hls = await loadHls(); if (!Hls || !v) return
      const nh = new Hls({ enableWorker:true, startLevel:-1, backBufferLength:90, maxBufferLength:60 })
      hlsRef.current = nh; nh.attachMedia(v)
      nh.on(Hls.Events.MEDIA_ATTACHED, () => nh.loadSource(src.url))
      nh.on(Hls.Events.MANIFEST_PARSED, () => {
        // Try matching language in the new source
        const at = nh.audioTracks || []
        const match = at.find(t => (t.lang||'').toLowerCase() === (track.lang||'').toLowerCase())
        if (match) nh.audioTrack = match.id
        v.currentTime = wasTime; if (wasPlaying) v.play().catch(()=>{})
      })
      nh.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { setLoadState('error'); setErrorMsg('Source switch failed.') } })
      setSrcLabel(src.label)
    }
  }, [])

  const switchQuality = useCallback((q) => {
    const hls = hlsRef.current
    if (hls) { hls.currentLevel = q.id; hls.autoLevelEnabled = q.id === -1 }
    setActiveQId(q.id ?? -1)
  }, [])

  const switchCaption = (i) => {
    setActiveCap(i)
    const hls = hlsRef.current
    if (hls) { if(i===-1){hls.subtitleDisplay=false;hls.subtitleTrack=-1}else{hls.subtitleDisplay=true;hls.subtitleTrack=i} }
  }

  const setSpd = r => { if(videoRef.current) videoRef.current.playbackRate=r; setSpeed(r) }

  const pP  = duration ? (current/duration)*100 : 0
  const pB  = duration ? (buffered/duration)*100 : 0
  const vPc = muted ? 0 : volume*100

  const aLabel = activeAudio?.name || 'Auto'
  const qLabel = qualities.find(q=>q.id===activeQId)?.label || 'Auto'
  const cLabel = activeCap===-1?'Off':(captions[activeCap]?.label||'On')
  const sLabel = speed===1?'Normal':`${speed}×`

  const PS = {
    position:'absolute', top:56, right:16, width:340,
    background:C.panelBg, borderRadius:10, overflow:'hidden', overflowY:'auto',
    maxHeight:'80vh', zIndex:100, boxShadow:'0 8px 40px rgba(0,0,0,0.9)',
  }
  const PH = { display:'flex', alignItems:'center', padding:'16px 20px', borderBottom:`1px solid ${C.border}`, fontSize:16, fontWeight:700, gap:12, position:'sticky', top:0, background:C.panelBg, zIndex:1 }
  const RW = { display:'flex', alignItems:'center', padding:'13px 20px', cursor:'pointer', transition:'background 0.12s', borderBottom:`1px solid ${C.border}`, gap:14 }

  const BackBtn = ({ to }) => (
    <button style={{background:'none',border:'none',color:'#fff',cursor:'pointer',padding:2,borderRadius:4,display:'flex',alignItems:'center'}} onClick={()=>setPanel(to)}>
      <Ic.ChL/>
    </button>
  )

  return (
    <div ref={containerRef}
      onMouseMove={resetHide} onTouchStart={resetHide}
      onClick={()=>{if(loadState==='playing'){togglePlay();resetHide()}}}
      style={{position:'fixed',inset:0,background:'#000',zIndex:100,display:'flex',flexDirection:'column',userSelect:'none',fontFamily:"'Amazon Ember','Arial',sans-serif"}}>

      <video ref={videoRef} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain'}} playsInline autoPlay crossOrigin="anonymous"/>

      {/* Loading */}
      <AnimatePresence>
        {loadState==='loading' && (
          <motion.div key="L" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            style={{position:'absolute',inset:0,zIndex:20,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:28,background:'#0a0d12',textAlign:'center',padding:'0 24px'}}>
            <div style={{position:'relative',width:72,height:72}}>
              <div style={{position:'absolute',inset:0,borderRadius:'50%',border:'3px solid rgba(255,255,255,0.05)'}}/>
              <motion.div animate={{rotate:360}} transition={{duration:0.9,repeat:Infinity,ease:'linear'}} style={{position:'absolute',inset:0,borderRadius:'50%',border:'3px solid transparent',borderTopColor:'#1a98ff'}}/>
              <motion.div animate={{rotate:-360}} transition={{duration:1.5,repeat:Infinity,ease:'linear'}} style={{position:'absolute',inset:8,borderRadius:'50%',border:'2px solid transparent',borderTopColor:'rgba(255,255,255,0.15)'}}/>
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={loadStep} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.28}}>
                <p style={{color:'#fff',fontWeight:600,fontSize:14}}>{loadStep}</p>
                <p style={{color:'#555',fontSize:12,marginTop:4}}>Aggregating all languages & quality levels…</p>
              </motion.div>
            </AnimatePresence>
            <div style={{width:220,height:3,background:'rgba(255,255,255,0.08)',borderRadius:2,overflow:'hidden'}}>
              <motion.div animate={{width:`${loadPct}%`}} transition={{duration:0.7,ease:'easeOut'}} style={{height:'100%',background:'linear-gradient(90deg,#1a98ff,#0070cc)',borderRadius:2}}/>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {loadState==='error' && (
          <motion.div key="E" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            style={{position:'absolute',inset:0,zIndex:20,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:20,background:'rgba(0,0,0,0.96)',textAlign:'center',padding:'0 24px'}}>
            <AlertCircle style={{width:52,height:52,color:'#ff4444'}}/>
            <div><p style={{color:'#fff',fontSize:20,fontWeight:700,marginBottom:8}}>Stream Unavailable</p><p style={{color:'#888',fontSize:14,lineHeight:1.6,maxWidth:380}}>{errorMsg}</p></div>
            <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'center'}}>
              <button onClick={e=>{e.stopPropagation();boot()}} style={{display:'flex',alignItems:'center',gap:8,background:'#1a98ff',color:'#fff',border:'none',padding:'10px 24px',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer'}}><RefreshCw style={{width:16,height:16}}/> Try Again</button>
              <button onClick={e=>{e.stopPropagation();navigate(-1)}} style={{background:'rgba(255,255,255,0.1)',color:'#fff',border:'none',padding:'10px 24px',borderRadius:8,fontSize:14,fontWeight:700,cursor:'pointer'}}>Go Back</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Buffering */}
      <AnimatePresence>
        {loadState==='playing'&&isBuffering && (
          <motion.div key="B" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} style={{position:'absolute',inset:0,zIndex:10,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
            <motion.div animate={{rotate:360}} transition={{duration:0.85,repeat:Infinity,ease:'linear'}} style={{width:52,height:52,borderRadius:'50%',border:'3px solid rgba(255,255,255,0.15)',borderTopColor:'#fff'}}/>
          </motion.div>
        )}
      </AnimatePresence>

      {/* UI Controls */}
      {loadState!=='error' && (
        <motion.div animate={{opacity:showUI?1:0}} transition={{duration:0.25}} style={{position:'absolute',inset:0,zIndex:30,pointerEvents:showUI?'auto':'none'}} onClick={e=>e.stopPropagation()}>

          <div style={{position:'absolute',top:0,left:0,right:0,height:160,background:'linear-gradient(to bottom,rgba(0,0,0,0.85),transparent)',pointerEvents:'none'}}/>
          <div style={{position:'absolute',bottom:0,left:0,right:0,height:220,background:'linear-gradient(to top,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.6) 60%,transparent 100%)',pointerEvents:'none'}}/>

          {/* Top bar */}
          <div style={{position:'absolute',top:0,left:0,right:0,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',zIndex:10}}>
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <button onClick={()=>navigate(-1)} style={{...IBTN,padding:4,borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background='none'}><Ic.Close/></button>
              <div>
                <p style={{fontSize:20,fontWeight:700,letterSpacing:'-0.3px',color:'#fff'}}>{title||'Now Playing'}</p>
                {srcLabel && <p style={{fontSize:11,color:'#555',marginTop:1}}>
                  via <span style={{color:C.accent,fontWeight:600}}>{srcLabel}</span>
                  {audioTracks.length>0&&<span style={{color:'#666'}}> · {audioTracks.length} lang{audioTracks.length!==1?'s':''}</span>}
                  {qualities.length>1&&<span style={{color:'#666'}}> · {qualities.length-1} qual{qualities.length-1!==1?'ities':'ity'}</span>}
                </p>}
              </div>
            </div>

            <div style={{display:'flex',alignItems:'center',gap:4,position:'relative'}}>
              {[
                { id:'captions', ico:<Ic.CC/>, title:'Subtitles' },
                { id:'volume',   ico:(muted||volume===0)?<Ic.Mute/>:<Ic.Vol/>, title:'Volume' },
              ].map(b=>(
                <button key={b.id} style={{...IBTN,background:panel===b.id?C.active:'none'}} title={b.title}
                  onClick={e=>{e.stopPropagation();setPanel(p=>p===b.id?null:b.id)}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                  onMouseLeave={e=>e.currentTarget.style.background=panel===b.id?C.active:'none'}>
                  {b.ico}
                </button>
              ))}
              <button style={IBTN} onClick={e=>{e.stopPropagation();videoRef.current?.requestPictureInPicture?.().catch(()=>{})}} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background='none'} title="PiP"><Ic.PiP/></button>
              <button style={IBTN} onClick={e=>{e.stopPropagation();toggleFs()}} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background='none'} title="Fullscreen">{fullscreen?<Ic.FSExit/>:<Ic.FS/>}</button>
              <button style={{...IBTN,background:panel==='settings'?C.active:'none'}}
                onClick={e=>{e.stopPropagation();setPanel(p=>p==='settings'?null:'settings')}}
                onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                onMouseLeave={e=>e.currentTarget.style.background=panel==='settings'?C.active:'none'}
                title="Settings"><Ic.More/></button>

              {/* SETTINGS */}
              <AnimatePresence>
                {panel==='settings'&&(
                  <motion.div key="set" initial={{opacity:0,y:-8,scale:0.95}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:0.95}} transition={{duration:0.18}} style={PS} onClick={e=>e.stopPropagation()}>
                    <div style={PH}>Settings</div>
                    {[
                      { id:'language', ico:<Ic.Globe/>, label:'Audio Language', val:aLabel, badge:audioTracks.length>0?`${audioTracks.length} available`:null },
                      { id:'captions', ico:<Ic.CC/>,    label:'Subtitles',       val:cLabel },
                      { id:'quality',  ico:<Ic.Qual/>,  label:'Video Quality',   val:qLabel, badge:qualities.length>1?`${qualities.length-1} levels`:null },
                      { id:'speed',    ico:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label:'Playback Speed', val:sLabel },
                    ].map((item,i,arr)=>(
                      <div key={item.id} style={{...RW,borderBottom:i===arr.length-1?'none':`1px solid ${C.border}`}}
                        onClick={()=>setPanel(item.id)}
                        onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        {item.ico}
                        <div style={{flex:1}}>
                          <div style={{fontSize:15,fontWeight:500}}>{item.label}</div>
                          {item.badge&&<div style={{fontSize:11,color:C.accent,marginTop:1}}>{item.badge}</div>}
                        </div>
                        <span style={{fontSize:14,color:C.dim,display:'flex',alignItems:'center',gap:4}}>{item.val}<Ic.ChR/></span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* LANGUAGE PANEL */}
              <AnimatePresence>
                {panel==='language'&&(
                  <motion.div key="lang" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.18}} style={PS} onClick={e=>e.stopPropagation()}>
                    <div style={PH}><BackBtn to="settings"/>Audio Language
                      <span style={{fontSize:11,color:C.dim,fontWeight:400,marginLeft:'auto'}}>{audioTracks.length} track{audioTracks.length!==1?'s':''}</span>
                    </div>
                    {audioTracks.length===0
                      ? <div style={{padding:'32px 20px',textAlign:'center'}}>
                          <p style={{color:C.dim,fontSize:14}}>No alternate audio tracks found.</p>
                          <p style={{color:'#444',fontSize:12,marginTop:6}}>This stream may only have English audio.</p>
                        </div>
                      : audioTracks.map(t=>{
                          const isOn = activeAudio?.id===t.id && activeAudio?.sourceIdx===t.sourceIdx
                          return (
                            <div key={`${t.id}-${t.sourceIdx}`} style={{...RW,borderBottom:`1px solid ${C.border}`}}
                              onClick={()=>switchAudio(t)}
                              onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                              <RadioDot on={isOn}/>
                              <div style={{flex:1}}>
                                <div style={{fontSize:15,fontWeight:isOn?600:500,color:isOn?'#fff':'#ccc'}}>{t.name}</div>
                                {(t.lang||t.srcLabel)&&<div style={{fontSize:11,color:C.dim,marginTop:2}}>
                                  {t.lang&&<span>{t.lang.toUpperCase()}</span>}
                                  {t.lang&&t.srcLabel&&<span> · </span>}
                                  {t.srcLabel&&<span>{t.srcLabel}</span>}
                                </div>}
                              </div>
                              {t.isDefault&&<span style={{fontSize:10,color:C.accent,background:'rgba(26,152,255,0.15)',padding:'2px 7px',borderRadius:4,fontWeight:600}}>DEFAULT</span>}
                            </div>
                          )
                        })
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* CAPTIONS PANEL */}
              <AnimatePresence>
                {panel==='captions'&&(
                  <motion.div key="cap" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.18}} style={PS} onClick={e=>e.stopPropagation()}>
                    <div style={PH}><BackBtn to="settings"/>Subtitles</div>
                    <div style={RW} onClick={()=>switchCaption(-1)} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <RadioDot on={activeCap===-1}/>
                      <div style={{fontSize:15,fontWeight:500}}>Off</div>
                    </div>
                    {captions.length===0
                      ? <p style={{color:C.dim,fontSize:13,textAlign:'center',padding:'20px'}}>No subtitles available</p>
                      : captions.map((c,i)=>(
                          <div key={i} style={RW} onClick={()=>switchCaption(i)} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            <RadioDot on={activeCap===i}/>
                            <div style={{fontSize:15,fontWeight:500}}>{c.label}</div>
                          </div>
                        ))
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* QUALITY PANEL */}
              <AnimatePresence>
                {panel==='quality'&&(
                  <motion.div key="qual" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.18}} style={PS} onClick={e=>e.stopPropagation()}>
                    <div style={PH}><BackBtn to="settings"/>Video Quality
                      <span style={{fontSize:11,color:C.dim,fontWeight:400,marginLeft:'auto'}}>{Math.max(0,qualities.length-1)} level{qualities.length-1!==1?'s':''}</span>
                    </div>
                    {qualities.length===0
                      ? <p style={{color:C.dim,fontSize:13,textAlign:'center',padding:'28px 20px'}}>Quality options not available</p>
                      : qualities.map(q=>{
                          const isOn = q.id===activeQId||(q.id===-1&&activeQId===-1)
                          return (
                            <div key={q.id} style={{...RW,background:isOn?'rgba(26,152,255,0.07)':'transparent'}}
                              onClick={()=>switchQuality(q)}
                              onMouseEnter={e=>e.currentTarget.style.background=isOn?'rgba(26,152,255,0.12)':C.hover}
                              onMouseLeave={e=>e.currentTarget.style.background=isOn?'rgba(26,152,255,0.07)':'transparent'}>
                              <RadioDot on={isOn}/>
                              <div style={{flex:1}}>
                                <div style={{fontSize:15,fontWeight:isOn?600:500,color:isOn?'#fff':'#ccc'}}>{q.label}</div>
                                {q.bandwidth>0&&<div style={{fontSize:11,color:C.dim,marginTop:2}}>~{(q.bandwidth/1e6).toFixed(1)} Mbps</div>}
                              </div>
                              {q.id===-1&&<span style={{fontSize:10,color:C.accent,background:'rgba(26,152,255,0.15)',padding:'2px 7px',borderRadius:4,fontWeight:600}}>ADAPTIVE</span>}
                              {q.height>=1080&&q.id!==-1&&<span style={{fontSize:10,color:'#ffd700',background:'rgba(255,215,0,0.1)',padding:'2px 7px',borderRadius:4,fontWeight:600}}>HD</span>}
                            </div>
                          )
                        })
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* SPEED PANEL */}
              <AnimatePresence>
                {panel==='speed'&&(
                  <motion.div key="spd" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.18}} style={PS} onClick={e=>e.stopPropagation()}>
                    <div style={PH}><BackBtn to="settings"/>Playback Speed</div>
                    {SPEEDS.map(r=>(
                      <div key={r} style={RW} onClick={()=>setSpd(r)} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                        <RadioDot on={r===speed}/>
                        <div style={{fontSize:15,fontWeight:500}}>{r===1?'Normal':`${r}×`}</div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* VOLUME POPUP */}
              <AnimatePresence>
                {panel==='volume'&&(
                  <motion.div key="vol" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.18}} style={{...PS,width:240,padding:'16px 20px'}} onClick={e=>e.stopPropagation()}>
                    <label style={{fontSize:14,color:C.dim,display:'block',marginBottom:14}}>Volume</label>
                    <input type="range" min="0" max="100" step="1" value={vPc}
                      onChange={e=>setVol(parseInt(e.target.value)/100)}
                      style={{width:'100%',WebkitAppearance:'none',appearance:'none',height:4,borderRadius:2,outline:'none',cursor:'pointer',
                        background:`linear-gradient(to right,#fff ${vPc}%,rgba(255,255,255,0.3) ${vPc}%)`}}/>
                    <p style={{fontSize:12,color:C.dim,marginTop:10,textAlign:'center'}}>{Math.round(vPc)}%</p>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>

          {/* Bottom controls */}
          <div style={{position:'absolute',bottom:0,left:0,right:0,padding:'0 0 28px 0',zIndex:10}}>
            <div style={{padding:'0 16px',marginBottom:16,display:'flex',alignItems:'center',gap:12}}>
              <span style={{fontSize:13,color:'#fff',minWidth:45}}>{fmt(current)}</span>
              <div ref={seekRef} onClick={e=>{e.stopPropagation();seekTo(e)}}
                style={{flex:1,position:'relative',height:3,background:'rgba(255,255,255,0.3)',borderRadius:2,cursor:'pointer',transition:'height 0.15s'}}
                onMouseEnter={e=>e.currentTarget.style.height='5px'}
                onMouseLeave={e=>e.currentTarget.style.height='3px'}>
                <div style={{position:'absolute',inset:'0 auto 0 0',width:`${pB}%`,background:'rgba(255,255,255,0.2)',borderRadius:2}}/>
                <div style={{position:'absolute',inset:'0 auto 0 0',width:`${pP}%`,background:'#fff',borderRadius:2}}>
                  <div style={{position:'absolute',right:-5,top:'50%',transform:'translateY(-50%)',width:10,height:10,background:'#fff',borderRadius:'50%',boxShadow:'0 0 4px rgba(0,0,0,0.5)'}}/>
                </div>
              </div>
              <span style={{fontSize:13,color:'#fff',minWidth:45,textAlign:'right'}}>{fmt(duration)}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:20}}>
              <button style={{background:'none',border:'none',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',padding:6,transition:'background 0.15s'}}
                onClick={e=>{e.stopPropagation();if(videoRef.current)videoRef.current.currentTime=Math.max(0,videoRef.current.currentTime-10);resetHide()}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'}
                onMouseLeave={e=>e.currentTarget.style.background='none'}><Ic.SkipB/></button>
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
              <button style={{background:'none',border:'none',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',padding:6,transition:'background 0.15s'}}
                onClick={e=>{e.stopPropagation();if(videoRef.current)videoRef.current.currentTime=Math.min(duration,videoRef.current.currentTime+10);resetHide()}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'}
                onMouseLeave={e=>e.currentTarget.style.background='none'}><Ic.SkipF/></button>
            </div>
          </div>

        </motion.div>
      )}
    </div>
  )
}
