import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

const Player = () => {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const playerRef = useRef(null);

  useEffect(() => {
    if (!playerRef.current && window.videojs) {
      playerRef.current = window.videojs(videoRef.current, {
        autoplay: true,
        controls: true,
        fluid: true,
        sources: [{ src: `https://vidsrc.dev/api/raw/${type}/${id}`, type: 'application/x-mpegURL' }]
      });
    }
    return () => { if (playerRef.current) playerRef.current.dispose(); };
  }, [type, id]);

  return (
    <div className="fixed inset-0 bg-black z-[100] flex flex-col">
      <div className="absolute top-0 left-0 p-6 z-20 flex items-center gap-4 bg-gradient-to-b from-black to-transparent w-full opacity-0 hover:opacity-100 transition-opacity">
        <button onClick={() => navigate(-1)} className="text-white hover:bg-white/20 p-2 rounded-full"><ChevronLeft size={32} /></button>
        <h2 className="text-white font-bold text-xl uppercase">Now Playing</h2>
      </div>
      <div data-vjs-player className="flex-grow flex items-center justify-center"><video ref={videoRef} className="video-js vjs-big-play-centered vjs-theme-city w-full h-full" /></div>
    </div>
  );
};

export default Player;
