import React, { useState, useEffect } from 'react';
import { Play, Plus, Info, Volume2, VolumeX, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/original";
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

const Banner = ({ fetchUrl = `/trending/all/week?api_key=${API_KEY}&language=en-US` }) => {
  const [movie, setMovie] = useState(null);
  const [isMuted, setIsMuted] = useState(true);
  const [inWatchlist, setInWatchlist] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${BASE_URL}${fetchUrl}`)
      .then((res) => res.json())
      .then((data) => {
        const randomMovie = data.results[Math.floor(Math.random() * data.results.length)];
        setMovie(randomMovie);
      });
  }, [fetchUrl]);

  if (!movie) return <div className="h-[75vh] md:h-[90vh] bg-primeBg animate-pulse"></div>;

  const type = movie.media_type || (movie.first_air_date ? 'tv' : 'movie');

  return (
    <header 
      className="relative h-[75vh] md:h-[90vh] w-full bg-cover bg-center bg-no-repeat text-white transition-all duration-500"
      style={{ backgroundImage: `url("${IMAGE_BASE_URL}${movie.backdrop_path}")` }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-primeBg via-primeBg/80 to-transparent w-3/4" />
      <div className="absolute inset-0 bg-gradient-to-t from-primeBg via-primeBg/20 to-transparent" />
      
      <div className="absolute top-[30%] md:top-[35%] left-4 md:left-12 max-w-2xl w-full pr-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-primeBlue font-black text-sm tracking-wider bg-primeBlue/10 px-1.5 py-0.5 rounded">apex</span>
          <span className="text-gray-300 text-xs md:text-sm font-semibold tracking-wide">Included with Prime</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold mb-4 drop-shadow-2xl tracking-tight leading-tight">
          {movie.title || movie.name || movie.original_name}
        </h1>

        <div className="flex flex-wrap items-center gap-3 text-[13px] md:text-sm text-gray-400 font-semibold mb-6">
          <span className="text-yellow-500 font-bold flex items-center gap-1">
            IMDb <span className="text-white">{(movie.vote_average || 7.5).toFixed(1)}</span>
          </span>
          <span>{movie.release_date?.substring(0,4) || movie.first_air_date?.substring(0,4)}</span>
          <span className="border border-gray-600 px-1.5 py-0.5 rounded-sm text-gray-300">U/A 16+</span>
          <span className="bg-gray-800 px-1.5 py-0.5 rounded-sm text-gray-300">X-Ray</span>
          <span className="bg-gray-800 px-1.5 py-0.5 rounded-sm text-gray-300">HDR</span>
        </div>

        <p className="text-gray-200 text-sm md:text-[17px] mb-8 line-clamp-3 md:line-clamp-4 drop-shadow-md leading-relaxed font-medium w-[90%] md:w-full">
          {movie.overview}
        </p>

        <div className="flex items-center gap-3 md:gap-4">
          <button 
            onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
            className="flex items-center justify-center gap-2 bg-white text-black px-6 md:px-8 py-3 rounded-md font-bold hover:bg-gray-200 transition-all duration-200 text-base md:text-lg hover:scale-105 active:scale-95"
          >
            <Play fill="currentColor" className="w-5 h-5 md:w-6 md:h-6" /> Play
          </button>
          
          <button 
            onClick={() => setInWatchlist(!inWatchlist)}
            className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gray-800/60 flex items-center justify-center text-white hover:bg-white hover:text-black transition-all duration-200 backdrop-blur-md border border-gray-500 hover:border-transparent"
          >
            {inWatchlist ? <Check strokeWidth={3} className="w-6 h-6" /> : <Plus strokeWidth={2.5} className="w-6 h-6" />}
          </button>
          
          <button 
            onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
            className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gray-800/60 flex items-center justify-center text-white hover:bg-white hover:text-black transition-all duration-200 backdrop-blur-md border border-gray-500 hover:border-transparent"
          >
            <Info strokeWidth={2.5} className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="absolute bottom-[20%] right-6 md:right-12 hidden md:block">
        <button 
          onClick={() => setIsMuted(!isMuted)}
          className="w-12 h-12 rounded-full border border-gray-400 flex items-center justify-center text-white hover:bg-white/10 transition-colors backdrop-blur-sm"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
};

export default Banner;