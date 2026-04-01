import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Play, Plus, ThumbsUp, Share2 } from 'lucide-react';
import YouTube from 'react-youtube';
import movieTrailer from 'movie-trailer';

const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original';

export default function MovieDetail() {
  const location = useLocation();
  const navigate = useNavigate();
  const movie = location.state?.movie;
  const [trailerUrl, setTrailerUrl] = useState('');

  useEffect(() => {
    if (!movie) {
      navigate('/');
      return;
    }

    // Fetch trailer for the background
    const movieTitle = movie.title || movie.name || movie.original_name;
    movieTrailer(movieTitle, { id: true })
      .then((url) => setTrailerUrl(url))
      .catch(() => setTrailerUrl(''));
  }, [movie, navigate]);

  if (!movie) return null;

  const type = movie.media_type || (movie.first_air_date ? 'tv' : 'movie');
  const releaseYear = (movie.release_date || movie.first_air_date)?.substring(0, 4);

  return (
    <div className="relative min-h-screen bg-[#0f171e] text-white pt-24 px-4 md:px-12 overflow-x-hidden">
      
      {/* Background Media container with gradient mask */}
      <div 
        className="absolute top-0 right-0 w-full md:w-[75vw] h-[60vh] md:h-[85vh] opacity-40 md:opacity-50 pointer-events-none overflow-hidden z-0"
        style={{ 
          maskImage: 'linear-gradient(to right, transparent, black 40%)', 
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 40%)' 
        }}
      >
        {trailerUrl ? (
          <YouTube 
            videoId={trailerUrl} 
            opts={{ 
              height: '100%', 
              width: '100%', 
              playerVars: { autoplay: 1, mute: 1, controls: 0, loop: 1, playlist: trailerUrl } 
            }} 
            className="absolute top-1/2 left-1/2 w-[150vw] h-[150vh] -translate-x-1/2 -translate-y-1/2 scale-150"
          />
        ) : (
          <div 
            className="w-full h-full bg-cover bg-right-top" 
            style={{ backgroundImage: `url("${IMAGE_BASE_URL}${movie.backdrop_path}")` }} 
          />
        )}
      </div>

      <div className="absolute inset-0 bg-gradient-to-t from-[#0f171e] via-[#0f171e]/60 to-transparent z-0 md:hidden"></div>

      {/* Content */}
      <div className="relative z-10 w-full md:w-1/2 mt-10 md:mt-20">
        <h1 className="text-4xl md:text-6xl font-extrabold mb-4">{movie.title || movie.name}</h1>
        
        <div className="flex items-center gap-4 text-sm md:text-base text-[#8197a4] font-semibold mb-6">
          <span className="text-[#00a8e1]">Prime</span>
          <span>{releaseYear}</span>
          <span className="px-2 py-[1px] bg-gray-800 rounded text-gray-300 border border-gray-600">
            {movie.adult ? '18+' : '13+'}
          </span>
          <span>{movie.vote_average?.toFixed(1)} IMDb</span>
        </div>

        <p className="text-base md:text-lg leading-relaxed text-gray-200 mb-8 max-w-2xl">
          {movie.overview}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-4 mb-12">
          <button 
            onClick={() => navigate(`/play/${type}/${movie.id}`)}
            className="flex items-center justify-center gap-2 bg-[#0f79af] hover:bg-[#0b5e8a] text-white px-8 py-3 rounded text-lg font-bold transition-colors"
          >
            <Play className="w-6 h-6" fill="currentColor" /> Resume
          </button>

          <div className="flex gap-3">
            <button className="w-12 h-12 rounded-full bg-gray-800/50 hover:bg-gray-700/80 border border-gray-600 flex items-center justify-center transition-colors">
              <Plus className="w-6 h-6" />
            </button>
            <button className="w-12 h-12 rounded-full bg-gray-800/50 hover:bg-gray-700/80 border border-gray-600 flex items-center justify-center transition-colors">
              <ThumbsUp className="w-5 h-5" />
            </button>
            <button className="w-12 h-12 rounded-full bg-gray-800/50 hover:bg-gray-700/80 border border-gray-600 flex items-center justify-center transition-colors">
              <Share2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
