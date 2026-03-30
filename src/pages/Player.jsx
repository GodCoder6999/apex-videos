import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import { ChevronLeft, RotateCcw, RotateCw, Volume2, VolumeX, Settings } from 'lucide-react';

const Player = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);

  // This is where you'd construct your source. 
  // Most "free" developers use a base URL that handles the scraping.
  const videoSource = `https://vidsrc.dev/api/raw/${type}/${id}`; 

  useEffect(() => {
    // Initialize Video.js player
    if (!playerRef.current) {
      const videoElement = videoRef.current;
      if (!videoElement) return;

      const player = playerRef.current = videojs(videoElement, {
        autoplay: true,
        controls: true,
        responsive: true,
        fluid: true,
        sources: [{
          src: videoSource,
          type: 'application/x-mpegURL' // For HLS (.m3u8) streams
        }]
      });

      // Enable Multi-Audio/Subtitles selection if provided by the stream
      player.on('loadedmetadata', () => {
        const audioTracks = player.audioTracks();
        console.log("Available Audio Tracks:", audioTracks.length);
      });
    }
  }, [videoSource]);

  // Cleanup on unmount
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
      {/* Header / Back Button */}
      <div className="absolute top-0 left-0 right-0 p-6 z-20 flex items-center gap-4 bg-gradient-to-b from-black/80 to-transparent transition-opacity hover:opacity-100 opacity-0 group">
        <button 
          onClick={() => navigate(-1)} 
          className="text-white hover:bg-white/20 p-2 rounded-full transition-colors"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
        <h2 className="text-xl font-bold text-white drop-shadow-md">Playing: {id}</h2>
      </div>

      {/* Video Container */}
      <div data-vjs-player className="flex-grow flex items-center justify-center bg-black">
        <video
          ref={videoRef}
          className="video-js vjs-big-play-centered vjs-theme-city w-full h-full"
        />
      </div>
    </div>
  );
};

export default Player;
