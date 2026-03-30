import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, RefreshCw, Tv2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// SOURCE REGISTRY — 8 providers, all accept TMDB IDs, all serve
// their own full player inside the iframe (no CORS issues).
// ─────────────────────────────────────────────────────────────
const SOURCES = [
  {
    id: 'vidsrc-cc',
    label: 'VidSrc CC',
    movie: (id) => `https://vidsrc.cc/v2/embed/movie/${id}`,
    tv: (id, s, e) => `https://vidsrc.cc/v2/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: 'vidsrc-xyz',
    label: 'VidSrc XYZ',
    movie: (id) => `https://vidsrc.xyz/embed/movie?tmdb=${id}`,
    tv: (id, s, e) => `https://vidsrc.xyz/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    id: 'autoembed',
    label: 'AutoEmbed',
    movie: (id) => `https://player.autoembed.cc/embed/movie/${id}`,
    tv: (id, s, e) => `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: 'embed-su',
    label: 'Embed SU',
    movie: (id) => `https://embed.su/embed/movie/${id}`,
    tv: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`,
  },
  {
    id: '2embed',
    label: '2Embed',
    movie: (id) => `https://www.2embed.cc/embed/${id}`,
    tv: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },
  {
    id: 'multiembed',
    label: 'MultiEmbed',
    movie: (id) => `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1`,
    tv: (id, s, e) =>
      `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  },
  {
    id: 'vidsrc-me',
    label: 'VidSrc ME',
    movie: (id) => `https://vidsrc.me/embed/movie?tmdb=${id}`,
    tv: (id, s, e) => `https://vidsrc.me/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    id: 'smashy',
    label: 'Smashy',
    movie: (id) => `https://player.smashy.stream/movie/${id}`,
    tv: (id, s, e) => `https://player.smashy.stream/tv/${id}?s=${s}&e=${e}`,
  },
];

const getEmbedUrl = (source, type, id, season, episode) =>
  type === 'tv' ? source.tv(id, season, episode) : source.movie(id);

// ─────────────────────────────────────────────────────────────
export default function Player() {
  const { type = 'movie', id } = useParams();
  const navigate = useNavigate();

  const [sourceIdx, setSourceIdx] = useState(0);
  const [season] = useState(1);
  const [episode] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showUI, setShowUI] = useState(true);
  const [showSources, setShowSources] = useState(false);

  const hideTimer = useRef(null);

  const currentSource = SOURCES[sourceIdx];
  const embedUrl = getEmbedUrl(currentSource, type, id, season, episode);

  const resetHideTimer = useCallback(() => {
    setShowUI(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setShowUI(false);
      setShowSources(false);
    }, 3500);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => clearTimeout(hideTimer.current);
  }, [resetHideTimer]);

  // Reset loading state whenever source / content changes
  useEffect(() => {
    setLoading(true);
    setShowSources(false);
  }, [sourceIdx, id, type]);

  const switchSource = (idx) => {
    setSourceIdx(idx);
    resetHideTimer();
  };

  const handleIframeLoad = () => {
    setTimeout(() => setLoading(false), 600);
  };

  return (
    <div
      className="fixed inset-0 bg-black z-[100] flex flex-col overflow-hidden"
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      {/* ════ TOP BAR ════ */}
      <div
        className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-between
          px-3 md:px-6 py-3 bg-gradient-to-b from-black/95 via-black/60 to-transparent
          transition-all duration-500
          ${showUI ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}`}
      >
        {/* Back + title */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="text-white hover:bg-white/20 p-1.5 rounded-full transition-colors"
          >
            <ChevronLeft className="w-6 h-6 md:w-7 md:h-7" />
          </button>
          <div className="leading-none">
            <p className="text-white font-bold text-sm md:text-base uppercase tracking-widest">
              Now Playing
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              via{' '}
              <span className="text-[#00a8e1] font-semibold">{currentSource.label}</span>
            </p>
          </div>
        </div>

        {/* Source toggle button */}
        <button
          onClick={() => { setShowSources((p) => !p); resetHideTimer(); }}
          className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20
            border border-white/20 text-white text-xs font-semibold
            px-3 py-2 rounded-full transition-all backdrop-blur-sm"
        >
          <Tv2 className="w-4 h-4" />
          <span className="hidden sm:inline">Sources</span>
        </button>
      </div>

      {/* ════ SOURCE PICKER ════ */}
      <div
        className={`absolute top-[60px] right-3 md:right-6 z-40 w-52
          bg-[#0d1620]/95 backdrop-blur-md border border-white/10
          rounded-2xl overflow-hidden shadow-2xl
          transition-all duration-300 origin-top-right
          ${showSources ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}
      >
        <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest px-4 pt-3 pb-1">
          Select Source
        </p>
        {SOURCES.map((src, idx) => (
          <button
            key={src.id}
            onClick={() => switchSource(idx)}
            className={`w-full flex items-center justify-between px-4 py-2.5 text-sm
              font-medium transition-colors hover:bg-white/10
              ${idx === sourceIdx
                ? 'text-[#00a8e1] bg-[#00a8e1]/10'
                : 'text-gray-300'}`}
          >
            <span>{src.label}</span>
            {idx === sourceIdx && (
              <span className="w-2 h-2 rounded-full bg-[#00a8e1]" />
            )}
          </button>
        ))}
      </div>

      {/* ════ LOADING OVERLAY ════ */}
      {loading && (
        <div className="absolute inset-0 z-20 bg-[#0f171e] flex flex-col items-center justify-center gap-6 px-4">
          {/* Spinner */}
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-[#00a8e1]/15 border-t-[#00a8e1] animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-2 h-2 bg-[#00a8e1] rounded-full animate-pulse" />
            </div>
          </div>

          <div className="text-center">
            <p className="text-white font-semibold text-sm">Loading stream…</p>
            <p className="text-gray-500 text-xs mt-1">via {currentSource.label}</p>
          </div>

          {/* Source quick-select chips */}
          <div className="flex flex-wrap justify-center gap-2 max-w-sm">
            {SOURCES.map((src, idx) => (
              <button
                key={src.id}
                onClick={() => switchSource(idx)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all
                  ${idx === sourceIdx
                    ? 'border-[#00a8e1] text-[#00a8e1] bg-[#00a8e1]/10'
                    : 'border-white/15 text-gray-500 hover:border-white/30 hover:text-gray-300'}`}
              >
                {src.label}
              </button>
            ))}
          </div>

          <p className="text-gray-600 text-[11px] text-center max-w-xs">
            If nothing plays in a few seconds, tap another source above
          </p>
        </div>
      )}

      {/* ════ IFRAME PLAYER ════ */}
      <iframe
        key={`${sourceIdx}-${id}-${type}`}
        src={embedUrl}
        onLoad={handleIframeLoad}
        title="apex video player"
        className="w-full flex-1 border-0"
        allowFullScreen
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        style={{ colorScheme: 'normal', display: 'block' }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation allow-top-navigation-by-user-activation"
      />

      {/* ════ BOTTOM BAR ════ */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-30 px-4 py-2.5
          bg-gradient-to-t from-black/90 via-black/30 to-transparent
          flex items-center justify-between
          transition-all duration-500
          ${showUI ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}
      >
        <p className="text-[11px] text-gray-600">
          apex<span className="text-[#00a8e1]">videos</span>
          <span className="mx-1.5 text-gray-700">·</span>
          Stream may contain provider ads
        </p>

        <button
          onClick={() => { setLoading(true); resetHideTimer(); }}
          className="flex items-center gap-1 text-gray-500 hover:text-white text-xs transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          <span className="hidden sm:inline">Reload</span>
        </button>
      </div>
    </div>
  );
}
