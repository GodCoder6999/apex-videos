import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, AlertCircle, Loader2 } from 'lucide-react';

// ---------------------------------------------------------------------------
// HLS source chain — tried in order until one loads successfully.
// All return raw .m3u8 manifests that Video.js / VHS can parse natively,
// giving you real multi-audio and subtitle tracks without any iframe.
// ---------------------------------------------------------------------------
const buildSources = (type, id) => [
  // 1. vidsrc.dev raw HLS  (primary)
  {
    src: `https://vidsrc.dev/embed/${type}/${id}`,
    type: 'application/x-mpegURL',
    label: 'vidsrc.dev',
  },
  // 2. vidsrc.to  (fallback 1)
  {
    src: `https://vidsrc.to/embed/${type}/${id}`,
    type: 'application/x-mpegURL',
    label: 'vidsrc.to',
  },
  // 3. vidsrc.me  (fallback 2)
  {
    src: `https://vidsrc.me/embed/${type}/${id}`,
    type: 'application/x-mpegURL',
    label: 'vidsrc.me',
  },
  // 4. multiembed.mov raw m3u8 (fallback 3 — sometimes exposes HLS directly)
  {
    src: `https://multiembed.mov/directstream.php?video_id=${id}&tmdb=1&type=${type}`,
    type: 'application/x-mpegURL',
    label: 'multiembed',
  },
];

// ---------------------------------------------------------------------------
// Video.js options
// ---------------------------------------------------------------------------
const vjsOptions = {
  autoplay: true,
  controls: true,
  fluid: true,
  playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
  html5: {
    vhs: {
      // Let VHS pick the best rendition, honour audio-track selection
      overrideNative: true,
      enableLowInitialPlaylist: false,
      handleManifestRedirects: true,
    },
    nativeAudioTracks: false,
    nativeVideoTracks: false,
  },
  controlBar: {
    children: [
      'playToggle',
      'volumePanel',
      'currentTimeDisplay',
      'timeDivider',
      'durationDisplay',
      'progressControl',
      'liveDisplay',
      'seekToLive',
      'remainingTimeDisplay',
      'customControlSpacer',
      'playbackRateMenuButton',
      'chaptersButton',
      'audioTrackButton',   // ← multi-audio switcher
      'subsCapsButton',      // ← subtitles / CC
      'qualitySelector',     // only if vjs-quality-selector plugin is present
      'pictureInPictureToggle',
      'fullscreenToggle',
    ],
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const Player = () => {
  const { type = 'movie', id } = useParams();
  const navigate = useNavigate();

  const videoRef   = useRef(null);
  const playerRef  = useRef(null);
  const sourceIdx  = useRef(0);

  const [status, setStatus]       = useState('loading');   // loading | playing | error
  const [sourceLabel, setSourceLabel] = useState('');
  const [showHeader, setShowHeader]   = useState(true);

  const sources = buildSources(type, id);

  // ------------------------------------------------------------------
  // Try to load a source; on error advance to the next in the chain
  // ------------------------------------------------------------------
  const trySource = (player, idx) => {
    if (idx >= sources.length) {
      setStatus('error');
      return;
    }
    const src = sources[idx];
    setSourceLabel(src.label);

    player.src({ src: src.src, type: src.type });

    // One-shot error handler — tear it down and try next
    const onError = () => {
      player.off('error', onError);
      trySource(player, idx + 1);
    };

    player.one('error', onError);

    player.one('playing', () => {
      player.off('error', onError);  // cancel fallback if we start playing
      setStatus('playing');
    });
  };

  // ------------------------------------------------------------------
  // Initialise Video.js once
  // ------------------------------------------------------------------
  useEffect(() => {
    const vjs = window.videojs;
    if (!vjs || playerRef.current) return;

    const player = vjs(videoRef.current, vjsOptions);
    playerRef.current = player;

    // Surface any available audio tracks in the UI after metadata loads
    player.one('loadedmetadata', () => {
      const tracks = player.audioTracks?.();
      if (tracks && tracks.length > 1) {
        // Video.js AudioTrackButton already handles this — just log for debug
        console.info('[apex] audio tracks:', tracks.length);
      }
    });

    // Kick off the source chain
    trySource(player, 0);

    // Auto-hide header after 3 s of playing
    let hideTimer;
    player.on('playing', () => {
      hideTimer = setTimeout(() => setShowHeader(false), 3000);
    });
    player.on('pause', () => {
      clearTimeout(hideTimer);
      setShowHeader(true);
    });

    return () => {
      clearTimeout(hideTimer);
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">

      {/* ── Header overlay ── */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 md:p-6 z-20 flex items-center gap-4
          bg-gradient-to-b from-black/80 to-transparent
          transition-opacity duration-500
          ${showHeader ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onMouseEnter={() => setShowHeader(true)}
      >
        <button
          onClick={() => navigate(-1)}
          className="text-white hover:bg-white/20 p-2 rounded-full transition-colors flex-shrink-0"
        >
          <ChevronLeft className="w-7 h-7 md:w-8 md:h-8" />
        </button>
        <div className="flex flex-col">
          <span className="text-white font-bold text-base md:text-xl uppercase tracking-widest leading-none">
            Now Playing
          </span>
          {sourceLabel && (
            <span className="text-gray-400 text-xs mt-0.5">
              Source: <span className="text-primeBlue">{sourceLabel}</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Loading spinner ── */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-4">
          <Loader2 className="w-12 h-12 text-primeBlue animate-spin" />
          <p className="text-gray-400 text-sm">
            Connecting to stream{sourceLabel ? ` via ${sourceLabel}` : '…'}
          </p>
        </div>
      )}

      {/* ── All-sources-failed error ── */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-6 px-6 text-center">
          <AlertCircle className="w-14 h-14 text-red-500" />
          <div>
            <h2 className="text-white text-xl font-bold mb-2">Stream unavailable</h2>
            <p className="text-gray-400 text-sm max-w-sm">
              We tried all available sources and couldn't load this title right now.
              It may be geo-restricted or temporarily offline.
            </p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="bg-primeBlue text-white px-6 py-2.5 rounded font-bold hover:bg-sky-400 transition-colors"
          >
            Go back
          </button>
        </div>
      )}

      {/* ── Video.js player ── */}
      <div
        data-vjs-player
        className="flex-grow flex items-center justify-center"
        onMouseMove={() => {
          setShowHeader(true);
          // Re-hide after 3 s of no movement while playing
          if (playerRef.current && !playerRef.current.paused()) {
            clearTimeout(window._apexHideTimer);
            window._apexHideTimer = setTimeout(() => setShowHeader(false), 3000);
          }
        }}
      >
        <video
          ref={videoRef}
          className="video-js vjs-big-play-centered vjs-theme-city w-full h-full"
          crossOrigin="anonymous"
        />
      </div>
    </div>
  );
};

export default Player;
