// src/pages/Player.jsx
// ─────────────────────────────────────────────────────────────────────────────
// STREAM ENGINE v4 — Per-Language Source Model (The Correct Architecture)
//
// KEY INSIGHT: Free providers serve separate video files per language dub,
// NOT multi-audio HLS manifests. We must:
//
//  1. Fetch ALL streams from ALL providers
//  2. Parse the stream `title` field for language names
//     (providers embed language like "🇮🇳 Hindi", "[Hindi]", "HINDI", etc.)
//  3. Deduplicate & present ONE entry per language in the language selector
//  4. When user picks a language → reload the video with that language's URL
//  5. Within that language, expose quality variants (480p, 720p, 1080p, 4K)
//     from the same or other sources
//
// Providers:
//  • WebStreamr (webstreamr.hayd.uk) — Hindi, Tamil, Telugu, Gujarati,
//    Malayalam, Punjabi, Spanish, French, German, Italian + more via
//    HDHub4u, 4KHDHub, CineHDPlus, XDMovies etc.
//    Config URL: /{lang_config}/stream/movie/{imdb}.json
//    Config: {"hi":"on","en":"on","ta":"on","te":"on","ml":"on","es":"on",...}
//  • vidlink.pro  — English primary + captions
//  • vidsrc.net   — English fallback
//  • Stremio waterfall — extra sources
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, AlertCircle } from 'lucide-react'

const BASE_URL = 'https://api.themoviedb.org/3'
const API_KEY  = import.meta.env.VITE_TMDB_API_KEY

// ─── HLS.js CDN ───────────────────────────────────────────────────────────────
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

// ─── Language detection from stream title ────────────────────────────────────
// Providers embed language in the stream title in many ways.
// We normalise all of them to a canonical name.
const LANG_PATTERNS = [
  // Exact emoji flags + name combos from HDHub4u / WebStreamr
  { re: /🇮🇳.*hindi|hindi.*🇮🇳|\[hindi\]|\bhindi\b/i,         lang: 'Hindi',      code: 'hi', flag: '🇮🇳' },
  { re: /🇺🇸.*english|english.*🇺🇸|\[english\]|\benglish\b/i,   lang: 'English',    code: 'en', flag: '🇺🇸' },
  { re: /🇪🇸.*spanish|spanish.*🇪🇸|\[spanish\]|\bspanish\b|español/i, lang: 'Spanish', code: 'es', flag: '🇪🇸' },
  { re: /🇫🇷.*french|french.*🇫🇷|\[french\]|\bfrench\b|français/i,  lang: 'French',  code: 'fr', flag: '🇫🇷' },
  { re: /🇩🇪.*german|german.*🇩🇪|\[german\]|\bgerman\b|deutsch/i,   lang: 'German',  code: 'de', flag: '🇩🇪' },
  { re: /🇮🇹.*italian|italian.*🇮🇹|\[italian\]|\bitalian\b|italiano/i, lang: 'Italian', code: 'it', flag: '🇮🇹' },
  { re: /🇵🇹.*portuguese|portuguese.*🇵🇹|\[portuguese\]|\bportuguese\b/i, lang: 'Portuguese', code: 'pt', flag: '🇵🇹' },
  { re: /🇷🇺.*russian|russian.*🇷🇺|\[russian\]|\brussian\b/i,       lang: 'Russian',    code: 'ru', flag: '🇷🇺' },
  { re: /🇰🇷.*korean|korean.*🇰🇷|\[korean\]|\bkorean\b/i,           lang: 'Korean',     code: 'ko', flag: '🇰🇷' },
  { re: /🇯🇵.*japanese|japanese.*🇯🇵|\[japanese\]|\bjapanese\b/i,   lang: 'Japanese',   code: 'ja', flag: '🇯🇵' },
  { re: /🇨🇳.*chinese|chinese.*🇨🇳|\[chinese\]|\bchinese\b/i,       lang: 'Chinese',    code: 'zh', flag: '🇨🇳' },
  { re: /🇸🇦.*arabic|arabic.*🇸🇦|\[arabic\]|\barabic\b/i,           lang: 'Arabic',     code: 'ar', flag: '🇸🇦' },
  { re: /🇹🇷.*turkish|turkish.*🇹🇷|\[turkish\]|\bturkish\b/i,       lang: 'Turkish',    code: 'tr', flag: '🇹🇷' },
  { re: /🇮🇳.*tamil|tamil.*🇮🇳|\[tamil\]|\btamil\b/i,               lang: 'Tamil',      code: 'ta', flag: '🇮🇳' },
  { re: /🇮🇳.*telugu|telugu.*🇮🇳|\[telugu\]|\btelugu\b/i,           lang: 'Telugu',     code: 'te', flag: '🇮🇳' },
  { re: /🇮🇳.*malayalam|malayalam.*🇮🇳|\[malayalam\]|\bmalay(alam)?\b/i, lang: 'Malayalam', code: 'ml', flag: '🇮🇳' },
  { re: /🇮🇳.*kannada|kannada.*🇮🇳|\[kannada\]|\bkannada\b/i,       lang: 'Kannada',    code: 'kn', flag: '🇮🇳' },
  { re: /🇮🇳.*gujarati|gujarati.*🇮🇳|\[gujarati\]|\bgujarati\b/i,   lang: 'Gujarati',   code: 'gu', flag: '🇮🇳' },
  { re: /🇮🇳.*punjabi|punjabi.*🇮🇳|\[punjabi\]|\bpunjabi\b/i,       lang: 'Punjabi',    code: 'pa', flag: '🇮🇳' },
  { re: /🇧🇩.*bengali|bengali.*🇧🇩|\[bengali\]|\bbengali\b/i,       lang: 'Bengali',    code: 'bn', flag: '🇧🇩' },
  { re: /🇮🇳.*marathi|marathi.*🇮🇳|\[marathi\]|\bmarathi\b/i,       lang: 'Marathi',    code: 'mr', flag: '🇮🇳' },
  { re: /\bpolish\b|\[polish\]/i,                                     lang: 'Polish',     code: 'pl', flag: '🇵🇱' },
  { re: /\bdutch\b|\[dutch\]/i,                                       lang: 'Dutch',      code: 'nl', flag: '🇳🇱' },
  { re: /\bgreek\b|\[greek\]/i,                                       lang: 'Greek',      code: 'el', flag: '🇬🇷' },
  { re: /\bswedish\b|\[swedish\]/i,                                   lang: 'Swedish',    code: 'sv', flag: '🇸🇪' },
  { re: /\bnorwegian\b|\[norwegian\]/i,                               lang: 'Norwegian',  code: 'no', flag: '🇳🇴' },
  { re: /\bdanish\b|\[danish\]/i,                                     lang: 'Danish',     code: 'da', flag: '🇩🇰' },
  { re: /\bczech\b|\[czech\]/i,                                       lang: 'Czech',      code: 'cs', flag: '🇨🇿' },
  { re: /\bromanian\b|\[romanian\]/i,                                 lang: 'Romanian',   code: 'ro', flag: '🇷🇴' },
  { re: /\bhungarian\b|\[hungarian\]/i,                               lang: 'Hungarian',  code: 'hu', flag: '🇭🇺' },
  { re: /\bultraHD|4K\b/i,                                            lang: null,         code: null, flag: '' }, // quality tag, not language
]

function detectLang(title) {
  if (!title) return null
  for (const p of LANG_PATTERNS) {
    if (p.lang && p.re.test(title)) return { lang: p.lang, code: p.code, flag: p.flag }
  }
  return null
}

// Detect quality from title/name
function detectQuality(str) {
  if (!str) return null
  if (/4k|2160p|uhd/i.test(str))  return '4K'
  if (/1080p|fhd|fullhd/i.test(str)) return '1080p'
  if (/720p|hd\b/i.test(str))     return '720p'
  if (/480p|sd\b/i.test(str))     return '480p'
  if (/360p/i.test(str))          return '360p'
  return null
}

// ─── WebStreamr language config ──────────────────────────────────────────────
// This is the key: WebStreamr needs to be told WHICH languages to fetch.
// We request ALL languages, and it returns whatever sources it finds.
const WEBSTREAMR_LANG_CONFIG = JSON.stringify({
  hi: 'on', en: 'on', ta: 'on', te: 'on', ml: 'on', kn: 'on',
  gu: 'on', pa: 'on', bn: 'on', mr: 'on',
  es: 'on', fr: 'on', de: 'on', it: 'on', pt: 'on',
  ru: 'on', ko: 'on', ja: 'on', zh: 'on', ar: 'on',
  tr: 'on', pl: 'on', nl: 'on',
})

// ─── Provider fetchers ────────────────────────────────────────────────────────
// Each returns: { streams: [{ url, title, quality, langInfo, isHls, label }] }

async function fetchWebStreamr(imdbId, type, season, episode) {
  if (!imdbId) throw new Error('No IMDB ID for WebStreamr')

  // WebStreamr stremio-protocol URL with language config
  const stType = type === 'tv' ? 'series' : 'movie'
  const stId = type === 'tv' ? `${imdbId}:${season}:${episode}` : imdbId
  const configEncoded = encodeURIComponent(WEBSTREAMR_LANG_CONFIG)
  const apiUrl = `https://webstreamr.hayd.uk/${configEncoded}/stream/${stType}/${stId}.json`

  const r = await fetch(`/api/proxy?url=${encodeURIComponent(apiUrl)}`, {
    signal: AbortSignal.timeout(15000)
  })
  if (!r.ok) throw new Error(`WebStreamr ${r.status}`)
  const txt = await r.text()
  if (txt.trimStart().startsWith('<')) throw new Error('WebStreamr returned HTML')

  const data = JSON.parse(txt)
  const rawStreams = data?.streams || []

  return rawStreams
    .filter(s => s.url && !s.url.includes('.mkv'))
    .map(s => {
      const fullTitle = [s.name, s.title].filter(Boolean).join(' ')
      const langInfo = detectLang(fullTitle)
      const quality = detectQuality(fullTitle) || detectQuality(s.name) || detectQuality(s.title)
      const isHls = /\.m3u8/i.test(s.url)
      return {
        url: s.url,
        title: fullTitle,
        quality: quality || 'HD',
        langInfo,
        isHls,
        sourceLabel: 'WebStreamr',
        behaviourHeaders: s.behaviorHints || null,
      }
    })
    .filter(s => s.langInfo) // only keep streams where we detected language
}

async function fetchVidlink(tmdbId, type, season, episode) {
  const p = type === 'movie'
    ? `isMovie=true&id=${tmdbId}`
    : `isMovie=false&id=${tmdbId}&season=${season}&episode=${episode}`
  const r = await fetch(`/api/proxy?url=${encodeURIComponent(`https://vidlink.pro/api/vidlink/watch?${p}`)}`, {
    signal: AbortSignal.timeout(12000)
  })
  if (!r.ok) throw new Error(`VidLink ${r.status}`)
  const txt = await r.text()
  if (txt.trimStart().startsWith('<')) throw new Error('VidLink HTML')
  const d = JSON.parse(txt)
  const pl = d?.stream?.playlist
  if (!pl) throw new Error('VidLink no playlist')
  const cors = d?.stream?.flags?.includes('cors-allowed')
  const captions = (d?.stream?.captions || []).filter(c => c.url).map(c => ({
    label: c.language || 'English', lang: c.language || 'en', url: c.url,
  }))
  return [{
    url: cors ? pl : `/api/proxy?url=${encodeURIComponent(pl)}`,
    rawUrl: pl, title: 'English', quality: '1080p',
    langInfo: { lang: 'English', code: 'en', flag: '🇺🇸' },
    isHls: true, sourceLabel: 'VidLink', captions,
  }]
}

async function fetchStremio(imdbId, tmdbId, type, season, episode) {
  const st = type === 'tv' ? 'series' : 'movie'
  const sid = imdbId
    ? (type === 'tv' ? `${imdbId}:${season}:${episode}` : imdbId)
    : `tmdb:${tmdbId}`

  for (const base of ['https://stremify.hayd.uk', 'https://nuviostreams.hayd.uk']) {
    try {
      const r = await fetch(`/api/proxy?url=${encodeURIComponent(`${base}/stream/${st}/${sid}.json`)}`, {
        signal: AbortSignal.timeout(8000)
      })
      if (!r.ok) continue
      const txt = await r.text()
      if (txt.trimStart().startsWith('<')) continue
      const d = JSON.parse(txt)
      const streams = (d?.streams || []).filter(s => s.url && !/\.mkv/i.test(s.url))
      if (!streams.length) continue

      return streams.map(s => {
        const fullTitle = [s.name, s.title].filter(Boolean).join(' ')
        const langInfo = detectLang(fullTitle) || { lang: 'English', code: 'en', flag: '🇺🇸' }
        const quality = detectQuality(fullTitle) || 'HD'
        const isHls = /\.m3u8/i.test(s.url)
        return { url: isHls ? s.url : s.url, title: fullTitle, quality, langInfo, isHls, sourceLabel: base.includes('stremify') ? 'Stremify' : 'Nuvio' }
      })
    } catch (_) {}
  }
  return []
}

// ─── Master resolver ──────────────────────────────────────────────────────────
async function resolveAllStreams({ tmdbId, imdbId, type, season, episode, onStep }) {
  onStep('Scanning all language sources…')

  const [webstreamrResult, vidlinkResult, stremioResult] = await Promise.allSettled([
    fetchWebStreamr(imdbId, type, season, episode),
    fetchVidlink(tmdbId, type, season, episode),
    fetchStremio(imdbId, tmdbId, type, season, episode),
  ])

  const allStreams = [
    ...(webstreamrResult.status === 'fulfilled' ? webstreamrResult.value : []),
    ...(vidlinkResult.status   === 'fulfilled' ? vidlinkResult.value   : []),
    ...(stremioResult.status   === 'fulfilled' ? stremioResult.value   : []),
  ]

  if (!allStreams.length) throw new Error('No streams found from any provider. Please try again.')

  // Group by language
  const byLang = {}
  for (const s of allStreams) {
    const key = s.langInfo?.code || 'en'
    if (!byLang[key]) byLang[key] = { ...s.langInfo, streams: [] }
    byLang[key].streams.push(s)
  }

  // Sort streams within each language by quality
  const qualityOrder = { '4K': 4, '2160p': 4, '1080p': 3, '720p': 2, '480p': 1, '360p': 0, 'HD': 2 }
  for (const key of Object.keys(byLang)) {
    byLang[key].streams.sort((a, b) => (qualityOrder[b.quality] || 1) - (qualityOrder[a.quality] || 1))
  }

  // Build language list: English first, then alphabetical
  const langList = Object.values(byLang).sort((a, b) => {
    if (a.code === 'en') return -1
    if (b.code === 'en') return 1
    return a.lang.localeCompare(b.lang)
  })

  return { byLang, langList }
}

// ─── Proxy URL builder ────────────────────────────────────────────────────────
function proxyUrl(url) {
  if (!url) return url
  // Already proxied
  if (url.startsWith('/api/proxy')) return url
  // Direct MP4 or URLs that don't need proxying for CORS (some providers allow it)
  if (url.includes('cors-allowed') || url.endsWith('.mp4')) return url
  return `/api/proxy?url=${encodeURIComponent(url)}`
}

// ─── Time formatter ───────────────────────────────────────────────────────────
const fmt = s => {
  if (!s || isNaN(s) || s === Infinity) return '0:00'
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = Math.floor(s%60)
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`
}
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

// ─── Icons ────────────────────────────────────────────────────────────────────
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
const Dot = ({ on }) => (
  <div style={{ width:28,height:28,minWidth:28,flexShrink:0,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center', border:`2px solid ${on?C.accent:C.dim}`, background:on?C.accent:'transparent', transition:'all 0.15s' }}>
    {on && <div style={{width:9,height:9,background:'#fff',borderRadius:'50%'}}/>}
  </div>
)

// ─── Player ───────────────────────────────────────────────────────────────────
export default function Player() {
  const { type = 'movie', id } = useParams()
  const navigate = useNavigate()

  const videoRef    = useRef(null)
  const hlsRef      = useRef(null)
  const containerRef= useRef(null)
  const seekRef     = useRef(null)
  const hideTimer   = useRef(null)

  // Stream data
  const [byLang,    setByLang]    = useState({})  // {code: {lang, code, flag, streams[]}}
  const [langList,  setLangList]  = useState([])  // [{lang, code, flag, streams[]}]
  const [activeLang,setActiveLang]= useState(null) // {lang, code, flag, streams[]}
  const [activeStream,setActiveStream] = useState(null) // the actual stream object playing
  const [captions,  setCaptions]  = useState([])
  const [activeCap, setActiveCap] = useState(-1)

  // Playback
  const [playing,     setPlaying]     = useState(false)
  const [muted,       setMuted]       = useState(false)
  const [volume,      setVolume]      = useState(0.8)
  const [current,     setCurrent]     = useState(0)
  const [duration,    setDuration]    = useState(0)
  const [buffered,    setBuffered]    = useState(0)
  const [fullscreen,  setFullscreen]  = useState(false)
  const [speed,       setSpeed]       = useState(1)
  const [isBuffering, setIsBuffering] = useState(false)

  // HLS quality levels
  const [hlsLevels,   setHlsLevels]   = useState([])
  const [activeLevel, setActiveLevel] = useState(-1)

  // UI
  const [showUI,   setShowUI]   = useState(true)
  const [panel,    setPanel]    = useState(null)
  const [loadState,setLoadState]= useState('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [loadStep, setLoadStep] = useState('Connecting…')
  const [loadPct,  setLoadPct]  = useState(0)
  const [title,    setTitle]    = useState('')
  const [imdbId,   setImdbId]   = useState('')
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

  // ── Load a specific stream into the video element ─────────────────────────
  const loadStream = useCallback(async (stream) => {
    if (!stream) return
    setActiveStream(stream)
    setIsBuffering(true)
    setHlsLevels([])
    setActiveLevel(-1)

    if (stream.captions) setCaptions(stream.captions)

    const v = videoRef.current
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    if (v) { v.removeAttribute('src'); v.load() }

    const url = proxyUrl(stream.url)
    const isM = stream.isHls || /\.m3u8/i.test(url) || decodeURIComponent(url).includes('.m3u8')
    const Hls = await loadHls()

    if (!v) return

    if (!isM || !Hls || !Hls.isSupported()) {
      v.src = url
      v.play().catch(()=>{})
      return
    }

    const hls = new Hls({
      enableWorker: true, startLevel: -1,
      backBufferLength: 90, maxBufferLength: 60, maxMaxBufferLength: 600,
      manifestLoadingMaxRetry: 3, levelLoadingMaxRetry: 3, fragLoadingMaxRetry: 4,
    })
    hlsRef.current = hls
    hls.attachMedia(v)
    hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(url))
    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      const levels = data.levels.map((l, i) => ({
        id: i, label: l.height ? `${l.height}p` : `${Math.round((l.bitrate||0)/1000)}kbps`,
        bandwidth: l.bitrate || 0, height: l.height || 0,
      })).sort((a,b) => b.bandwidth - a.bandwidth)
      setHlsLevels([{ id:-1, label:'Auto' }, ...levels])
      setActiveLevel(-1)
      v.play().catch(()=>{})
    })
    hls.on(Hls.Events.LEVEL_SWITCHED, (_, d) => setActiveLevel(hls.autoLevelEnabled ? -1 : d.level))
    hls.on(Hls.Events.ERROR, (_, d) => {
      if (d.fatal) {
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
        else { setLoadState('error'); setErrorMsg('Stream playback failed.') }
      }
    })
  }, [])

  // ── Boot: fetch all streams ───────────────────────────────────────────────
  const boot = useCallback(async () => {
    setLoadState('loading'); setLoadStep('Scanning all language sources…'); setLoadPct(5)
    setPanel(null); setByLang({}); setLangList([])
    setActiveLang(null); setActiveStream(null)
    setCaptions([]); setActiveCap(-1)

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    const v = videoRef.current
    if (v) { v.removeAttribute('src'); v.load() }

    let resolved
    try {
      resolved = await resolveAllStreams({
        tmdbId: id, imdbId, type, season, episode, onStep: setLoadStep
      })
    } catch (e) { setLoadState('error'); setErrorMsg(e.message); return }

    setLoadPct(80)
    setByLang(resolved.byLang)
    setLangList(resolved.langList)

    // Auto-play the best stream (English first, then whatever is available)
    const defaultLang = resolved.langList.find(l => l.code === 'en') || resolved.langList[0]
    if (!defaultLang) { setLoadState('error'); setErrorMsg('No playable streams found.'); return }

    setActiveLang(defaultLang)
    const bestStream = defaultLang.streams[0]

    setLoadStep(`Loading ${defaultLang.lang}…`)
    setLoadPct(90)
    setLoadState('playing')

    await loadStream(bestStream)
  }, [id, imdbId, type, season, episode, loadStream])

  useEffect(() => {
    boot()
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null } }
  }, [boot])

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
      error: ()=>{ const v2=videoRef.current; if(v2?.error?.code===4){setLoadState('error');setErrorMsg('Unsupported format. Try a different quality.')} },
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
      if(e.key===' '||e.key==='k'){e.preventDefault();v.paused?v.play():v.pause()}
      else if(e.key==='ArrowRight'){e.preventDefault();v.currentTime=Math.min(duration,v.currentTime+10)}
      else if(e.key==='ArrowLeft'){e.preventDefault();v.currentTime=Math.max(0,v.currentTime-10)}
      else if(e.key==='ArrowUp'){e.preventDefault();v.volume=Math.min(1,v.volume+0.1)}
      else if(e.key==='ArrowDown'){e.preventDefault();v.volume=Math.max(0,v.volume-0.1)}
      else if(e.key==='m') v.muted=!v.muted
      else if(e.key==='f') toggleFs()
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

  // Switch language → reload with best quality stream for that language
  const switchLang = useCallback(async (langEntry) => {
    setActiveLang(langEntry)
    setPanel(null)
    const best = langEntry.streams[0]
    await loadStream(best)
  }, [loadStream])

  // Switch quality within current language
  const switchQuality = useCallback(async (stream) => {
    setPanel(null)
    const wasTime = videoRef.current?.currentTime || 0
    const wasPlaying = !videoRef.current?.paused
    await loadStream(stream)
    setTimeout(() => {
      if (videoRef.current) {
        videoRef.current.currentTime = wasTime
        if (wasPlaying) videoRef.current.play().catch(()=>{})
      }
    }, 500)
  }, [loadStream])

  // Switch HLS quality level within current stream
  const switchHlsLevel = useCallback((level) => {
    const hls = hlsRef.current; if (!hls) return
    hls.currentLevel = level.id; hls.autoLevelEnabled = level.id === -1
    setActiveLevel(level.id)
  }, [])

  const switchCap = (i) => { setActiveCap(i) }
  const setSpd = r => { if(videoRef.current) videoRef.current.playbackRate=r; setSpeed(r) }

  const pP  = duration ? (current/duration)*100 : 0
  const pB  = duration ? (buffered/duration)*100 : 0
  const vPc = muted ? 0 : volume*100

  // Quality options: prefer per-source streams in current lang, then hls.js levels
  const qualityOptions = activeLang?.streams || []
  const hlsQualityOptions = hlsLevels

  const langLabel = activeLang ? `${activeLang.flag} ${activeLang.lang}` : 'Auto'
  const qualLabel = activeStream?.quality || (hlsLevels.find(l=>l.id===activeLevel)?.label) || 'Auto'
  const capLabel  = activeCap===-1?'Off':(captions[activeCap]?.label||'On')
  const spdLabel  = speed===1?'Normal':`${speed}×`

  const PS = { position:'absolute', top:56, right:16, width:340, background:C.panelBg, borderRadius:10, overflow:'hidden', overflowY:'auto', maxHeight:'80vh', zIndex:100, boxShadow:'0 8px 40px rgba(0,0,0,0.9)' }
  const PH = { display:'flex', alignItems:'center', padding:'16px 20px', borderBottom:`1px solid ${C.border}`, fontSize:16, fontWeight:700, gap:12, position:'sticky', top:0, background:C.panelBg, zIndex:1 }
  const RW = { display:'flex', alignItems:'center', padding:'13px 20px', cursor:'pointer', transition:'background 0.12s', borderBottom:`1px solid ${C.border}`, gap:14 }
  const Back = ({ to }) => (
    <button style={{background:'none',border:'none',color:'#fff',cursor:'pointer',padding:2,borderRadius:4,display:'flex',alignItems:'center'}} onClick={()=>setPanel(to)}><Ic.ChL/></button>
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
                <p style={{color:'#555',fontSize:12,marginTop:4}}>Fetching dubbed versions in all available languages…</p>
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

      {/* Controls */}
      {loadState!=='error' && (
        <motion.div animate={{opacity:showUI?1:0}} transition={{duration:0.25}} style={{position:'absolute',inset:0,zIndex:30,pointerEvents:showUI?'auto':'none'}} onClick={e=>e.stopPropagation()}>
          <div style={{position:'absolute',top:0,left:0,right:0,height:160,background:'linear-gradient(to bottom,rgba(0,0,0,0.85),transparent)',pointerEvents:'none'}}/>
          <div style={{position:'absolute',bottom:0,left:0,right:0,height:220,background:'linear-gradient(to top,rgba(0,0,0,0.95) 0%,rgba(0,0,0,0.6) 60%,transparent 100%)',pointerEvents:'none'}}/>

          {/* Top bar */}
          <div style={{position:'absolute',top:0,left:0,right:0,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',zIndex:10}}>
            <div style={{display:'flex',alignItems:'center',gap:14}}>
              <button onClick={()=>navigate(-1)} style={{...IBTN,padding:4,borderRadius:4}} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background='none'}><Ic.Close/></button>
              <div>
                <p style={{fontSize:20,fontWeight:700,color:'#fff'}}>{title||'Now Playing'}</p>
                <p style={{fontSize:11,color:'#555',marginTop:1}}>
                  {activeLang && <span style={{color:C.accent,fontWeight:600}}>{activeLang.flag} {activeLang.lang}</span>}
                  {activeStream && <span style={{color:'#666'}}> · {activeStream.quality} · {activeStream.sourceLabel}</span>}
                  {langList.length>0 && <span style={{color:'#444'}}> · {langList.length} language{langList.length!==1?'s':''} found</span>}
                </p>
              </div>
            </div>

            <div style={{display:'flex',alignItems:'center',gap:4,position:'relative'}}>
              {/* CC */}
              <button style={{...IBTN,background:panel==='captions'?C.active:'none'}} onClick={e=>{e.stopPropagation();setPanel(p=>p==='captions'?null:'captions')}} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background=panel==='captions'?C.active:'none'} title="Subtitles"><Ic.CC/></button>
              {/* Volume */}
              <button style={{...IBTN,background:panel==='volume'?C.active:'none'}} onClick={e=>{e.stopPropagation();setPanel(p=>p==='volume'?null:'volume')}} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background=panel==='volume'?C.active:'none'} title="Volume">{(muted||volume===0)?<Ic.Mute/>:<Ic.Vol/>}</button>
              {/* PiP */}
              <button style={IBTN} onClick={e=>{e.stopPropagation();videoRef.current?.requestPictureInPicture?.().catch(()=>{})}} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background='none'} title="PiP"><Ic.PiP/></button>
              {/* Fullscreen */}
              <button style={IBTN} onClick={e=>{e.stopPropagation();toggleFs()}} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background='none'} title="Fullscreen">{fullscreen?<Ic.FSExit/>:<Ic.FS/>}</button>
              {/* Settings */}
              <button style={{...IBTN,background:panel==='settings'?C.active:'none'}} onClick={e=>{e.stopPropagation();setPanel(p=>p==='settings'?null:'settings')}} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background=panel==='settings'?C.active:'none'} title="Settings"><Ic.More/></button>

              {/* SETTINGS */}
              <AnimatePresence>
                {panel==='settings'&&(
                  <motion.div key="set" initial={{opacity:0,y:-8,scale:0.95}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:-8,scale:0.95}} transition={{duration:0.18}} style={PS} onClick={e=>e.stopPropagation()}>
                    <div style={PH}>Settings</div>
                    {[
                      { id:'language', ico:<Ic.Globe/>, label:'Audio Language', val:langLabel, badge:langList.length>0?`${langList.length} languages`:null },
                      { id:'quality',  ico:<Ic.Qual/>,  label:'Video Quality',  val:qualLabel, badge:(qualityOptions.length>1||(hlsQualityOptions.length>1))?`${Math.max(qualityOptions.length,hlsQualityOptions.length-1)} options`:null },
                      { id:'captions', ico:<Ic.CC/>,    label:'Subtitles',      val:capLabel },
                      { id:'speed',    ico:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{width:20,height:20}}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label:'Playback Speed', val:spdLabel },
                    ].map((item,i,arr)=>(
                      <div key={item.id} style={{...RW,borderBottom:i===arr.length-1?'none':`1px solid ${C.border}`}} onClick={()=>setPanel(item.id)} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
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
                    <div style={PH}><Back to="settings"/>Audio Language
                      <span style={{fontSize:11,color:C.dim,fontWeight:400,marginLeft:'auto'}}>{langList.length} found</span>
                    </div>
                    {langList.length===0
                      ? <div style={{padding:'28px 20px',textAlign:'center'}}><p style={{color:C.dim,fontSize:14}}>No language options found for this title.</p></div>
                      : langList.map(l => {
                          const isOn = activeLang?.code === l.code
                          return (
                            <div key={l.code} style={{...RW,background:isOn?'rgba(26,152,255,0.07)':'transparent'}} onClick={()=>switchLang(l)} onMouseEnter={e=>e.currentTarget.style.background=isOn?'rgba(26,152,255,0.12)':C.hover} onMouseLeave={e=>e.currentTarget.style.background=isOn?'rgba(26,152,255,0.07)':'transparent'}>
                              <Dot on={isOn}/>
                              <div style={{flex:1}}>
                                <div style={{fontSize:15,fontWeight:isOn?600:400,color:isOn?'#fff':'#ccc'}}>{l.flag} {l.lang}</div>
                                <div style={{fontSize:11,color:C.dim,marginTop:2}}>{l.streams.length} source{l.streams.length!==1?'s':''} · {l.streams.map(s=>s.quality).filter((v,i,a)=>a.indexOf(v)===i).join(', ')}</div>
                              </div>
                            </div>
                          )
                        })
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* QUALITY PANEL */}
              <AnimatePresence>
                {panel==='quality'&&(
                  <motion.div key="qual" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.18}} style={PS} onClick={e=>e.stopPropagation()}>
                    <div style={PH}><Back to="settings"/>Video Quality</div>
                    {/* Per-source quality options (different files per quality) */}
                    {qualityOptions.length > 1 && (
                      <>
                        <div style={{padding:'8px 20px 4px',fontSize:11,color:C.dim,fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase'}}>Source Quality</div>
                        {qualityOptions.map((s,i)=>{
                          const isOn = activeStream?.url === s.url
                          return (
                            <div key={i} style={{...RW,background:isOn?'rgba(26,152,255,0.07)':'transparent'}} onClick={()=>switchQuality(s)} onMouseEnter={e=>e.currentTarget.style.background=isOn?'rgba(26,152,255,0.12)':C.hover} onMouseLeave={e=>e.currentTarget.style.background=isOn?'rgba(26,152,255,0.07)':'transparent'}>
                              <Dot on={isOn}/>
                              <div style={{flex:1}}>
                                <div style={{fontSize:15,fontWeight:isOn?600:400,color:isOn?'#fff':'#ccc'}}>{s.quality}</div>
                                <div style={{fontSize:11,color:C.dim,marginTop:2}}>{s.sourceLabel}</div>
                              </div>
                              {(s.quality==='4K'||s.quality==='2160p')&&<span style={{fontSize:10,color:'#ffd700',background:'rgba(255,215,0,0.1)',padding:'2px 7px',borderRadius:4,fontWeight:600}}>4K</span>}
                              {s.quality==='1080p'&&<span style={{fontSize:10,color:C.accent,background:'rgba(26,152,255,0.15)',padding:'2px 7px',borderRadius:4,fontWeight:600}}>FHD</span>}
                            </div>
                          )
                        })}
                      </>
                    )}
                    {/* HLS adaptive quality levels */}
                    {hlsQualityOptions.length > 1 && (
                      <>
                        <div style={{padding:'8px 20px 4px',fontSize:11,color:C.dim,fontWeight:600,letterSpacing:'0.05em',textTransform:'uppercase'}}>Stream Levels</div>
                        {hlsQualityOptions.map(q=>{
                          const isOn = q.id===activeLevel||(q.id===-1&&activeLevel===-1)
                          return (
                            <div key={q.id} style={{...RW,background:isOn?'rgba(26,152,255,0.07)':'transparent'}} onClick={()=>switchHlsLevel(q)} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background=isOn?'rgba(26,152,255,0.07)':'transparent'}>
                              <Dot on={isOn}/>
                              <div style={{flex:1}}>
                                <div style={{fontSize:15,fontWeight:isOn?600:400,color:isOn?'#fff':'#ccc'}}>{q.label}</div>
                                {q.bandwidth>0&&<div style={{fontSize:11,color:C.dim,marginTop:2}}>~{(q.bandwidth/1e6).toFixed(1)} Mbps</div>}
                              </div>
                              {q.id===-1&&<span style={{fontSize:10,color:C.accent,background:'rgba(26,152,255,0.15)',padding:'2px 7px',borderRadius:4,fontWeight:600}}>AUTO</span>}
                            </div>
                          )
                        })}
                      </>
                    )}
                    {qualityOptions.length<=1 && hlsQualityOptions.length<=1 && (
                      <p style={{color:C.dim,fontSize:13,textAlign:'center',padding:'28px 20px'}}>Only one quality available</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* CAPTIONS */}
              <AnimatePresence>
                {panel==='captions'&&(
                  <motion.div key="cap" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.18}} style={PS} onClick={e=>e.stopPropagation()}>
                    <div style={PH}><Back to="settings"/>Subtitles</div>
                    <div style={RW} onClick={()=>switchCap(-1)} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><Dot on={activeCap===-1}/><div style={{fontSize:15,fontWeight:500}}>Off</div></div>
                    {captions.length===0?<p style={{color:C.dim,fontSize:13,textAlign:'center',padding:'20px'}}>No subtitles available</p>
                      :captions.map((c,i)=>(
                          <div key={i} style={RW} onClick={()=>switchCap(i)} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><Dot on={activeCap===i}/><div style={{fontSize:15,fontWeight:500}}>{c.label}</div></div>
                        ))
                    }
                  </motion.div>
                )}
              </AnimatePresence>

              {/* SPEED */}
              <AnimatePresence>
                {panel==='speed'&&(
                  <motion.div key="spd" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.18}} style={PS} onClick={e=>e.stopPropagation()}>
                    <div style={PH}><Back to="settings"/>Playback Speed</div>
                    {SPEEDS.map(r=>(
                      <div key={r} style={RW} onClick={()=>setSpd(r)} onMouseEnter={e=>e.currentTarget.style.background=C.hover} onMouseLeave={e=>e.currentTarget.style.background='transparent'}><Dot on={r===speed}/><div style={{fontSize:15,fontWeight:500}}>{r===1?'Normal':`${r}×`}</div></div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* VOLUME */}
              <AnimatePresence>
                {panel==='volume'&&(
                  <motion.div key="vol" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.18}} style={{...PS,width:240,padding:'16px 20px'}} onClick={e=>e.stopPropagation()}>
                    <label style={{fontSize:14,color:C.dim,display:'block',marginBottom:14}}>Volume</label>
                    <input type="range" min="0" max="100" step="1" value={vPc} onChange={e=>setVol(parseInt(e.target.value)/100)} style={{width:'100%',WebkitAppearance:'none',appearance:'none',height:4,borderRadius:2,outline:'none',cursor:'pointer',background:`linear-gradient(to right,#fff ${vPc}%,rgba(255,255,255,0.3) ${vPc}%)`}}/>
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
              <div ref={seekRef} onClick={e=>{e.stopPropagation();seekTo(e)}} style={{flex:1,position:'relative',height:3,background:'rgba(255,255,255,0.3)',borderRadius:2,cursor:'pointer',transition:'height 0.15s'}} onMouseEnter={e=>e.currentTarget.style.height='5px'} onMouseLeave={e=>e.currentTarget.style.height='3px'}>
                <div style={{position:'absolute',inset:'0 auto 0 0',width:`${pB}%`,background:'rgba(255,255,255,0.2)',borderRadius:2}}/>
                <div style={{position:'absolute',inset:'0 auto 0 0',width:`${pP}%`,background:'#fff',borderRadius:2}}>
                  <div style={{position:'absolute',right:-5,top:'50%',transform:'translateY(-50%)',width:10,height:10,background:'#fff',borderRadius:'50%',boxShadow:'0 0 4px rgba(0,0,0,0.5)'}}/>
                </div>
              </div>
              <span style={{fontSize:13,color:'#fff',minWidth:45,textAlign:'right'}}>{fmt(duration)}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:20}}>
              <button style={{background:'none',border:'none',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',padding:6,transition:'background 0.15s'}} onClick={e=>{e.stopPropagation();if(videoRef.current)videoRef.current.currentTime=Math.max(0,videoRef.current.currentTime-10);resetHide()}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'} onMouseLeave={e=>e.currentTarget.style.background='none'}><Ic.SkipB/></button>
              <button onClick={e=>{e.stopPropagation();togglePlay()}} style={{width:56,height:56,background:'rgba(255,255,255,0.95)',border:'none',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#000',transition:'background 0.15s'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,1)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.95)'}>
                <AnimatePresence mode="wait">
                  {playing?<motion.div key="p" initial={{scale:0}} animate={{scale:1}} exit={{scale:0}} transition={{duration:0.15}}><Ic.Pause/></motion.div>:<motion.div key="pl" initial={{scale:0}} animate={{scale:1}} exit={{scale:0}} transition={{duration:0.15}}><Ic.Play/></motion.div>}
                </AnimatePresence>
              </button>
              <button style={{background:'none',border:'none',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',padding:6,transition:'background 0.15s'}} onClick={e=>{e.stopPropagation();if(videoRef.current)videoRef.current.currentTime=Math.min(duration,videoRef.current.currentTime+10);resetHide()}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.08)'} onMouseLeave={e=>e.currentTarget.style.background='none'}><Ic.SkipF/></button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
