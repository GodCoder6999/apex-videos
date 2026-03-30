import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

const Player = () => {
  const { type = 'movie', id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  // Raw stream source URL based on TMDB ID and Type
  const videoSource = `https://vidsrc.dev/api/raw/${type}/${id}`; 

  useEffect(() => {
    // Accessing videojs via window object because it's loaded via CDN in index.html
    if (!playerRef.current && window.videojs) {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      const player = playerRef.current = window.videojs(videoElement, {
        autoplay: true,
        controls: true,
        responsive: true,
        fluid: true,
        playbackRates: [0.5, 1, 1.5, 2],
        controlBar: {
          children: [
            'playToggle',
            'volumePanel',
            'currentTimeDisplay',
            'timeDivider',
            'durationDisplay',
            'progressControl',
            'liveDisplay',
            'remainingTimeDisplay',
            'customControlSpacer',
            'playbackRateMenuButton',
            'chaptersButton',
            'descriptionsButton',
            'subsCapsButton',
            'audioTrackButton', // Enables multi-audio selection if the stream supports it
            'fullscreenToggle',
          ],
        },
        sources: [{
          src: videoSource,
          type: 'application/x-mpegURL' // Optimized for HLS (.m3u8) streams
        }]
      });
    }
  }, [videoSource]);

  // Clean up the player when the user leaves the page
  useEffect(() => {
    const player = playerRef.current;
    return () => {
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      {/* Overlay Header with Back Button */}
      <div className="absolute top-0 left-0 right-0 p-6 z-20 flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity opacity-0 hover:opacity-100 duration-300">
        <button 
          onClick={() => navigate(-1)} 
          className="text-white hover:bg-white/20 p-2 rounded-full transition-colors"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
        <h2 className="text-xl font-bold text-white uppercase tracking-widest drop-shadow-lg">
          Now Playing
        </h2>
      </div>

      {/* Video.js Player Container */}
      <div data-vjs-player className="flex-grow flex items-center justify-center">
        <video
          ref={videoRef}
          className="video-js vjs-big-play-centered vjs-theme-city w-full h-full"
        />
      </div>
    </div>
  );
};

export default Player;
