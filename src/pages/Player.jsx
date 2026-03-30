import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Volume2, Settings, List } from 'lucide-react';

const Player = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [error, setError] = useState(false);

  // SOURCE: Using a Raw Stream API that provides .m3u8 files
  const videoSource = `https://vidsrc.dev/api/raw/${type}/${id}`; 

  useEffect(() => {
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
            'playbackRateMenuButton',
            'audioTrackButton', // IMPORTANT: Enables Multi-Audio Switching
            'subsCapsButton',    // Enables Subtitle Selection
            'fullscreenToggle',
          ],
        },
        sources: [{
          src: videoSource,
          type: 'application/x-mpegURL' // HLS format
        }]
      });

      player.on('error', () => setError(true));
    }
  }, [videoSource]);

  useEffect(() => {
    const player = playerRef.current;
    return () => {
      if (player && !player.isDisposed()) {
        player.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  if (error) return (
    <div className="h-screen bg-black flex flex-col items-center justify-center text-white p-4 text-center">
      <h2 className="text-2xl font-bold mb-4">Direct Stream Not Available</h2>
      <p className="text-gray-400 mb-6">This title might only be available via standard encrypted players.</p>
      <button onClick={() => navigate(-1)} className="bg-primeBlue px-8 py-2 rounded font-bold">Go Back</button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col group">
      {/* Overlay Header */}
      <div className="absolute top-0 left-0 right-0 p-6 z-20 flex items-center gap-4 bg-gradient-to-b from-black/90 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <button onClick={() => navigate(-1)} className="text-white hover:bg-white/20 p-2 rounded-full">
          <ChevronLeft className="w-8 h-8" />
        </button>
        <h2 className="text-xl font-bold text-white uppercase tracking-widest drop-shadow-lg">Now Playing</h2>
      </div>

      <div data-vjs-player className="flex-grow flex items-center justify-center">
        <video ref={videoRef} className="video-js vjs-big-play-centered vjs-theme-city w-full h-full" />
      </div>
    </div>
  );
};

export default Player;
