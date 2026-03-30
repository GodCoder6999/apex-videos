import React, { useState, useEffect } from 'react';
import { Play } from 'lucide-react';

const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/original";
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

const Banner = () => {
  const [movie, setMovie] = useState(null);

  useEffect(() => {
    fetch(`${BASE_URL}/trending/all/week?api_key=${API_KEY}&language=en-US`)
      .then((res) => res.json())
      .then((data) => {
        const randomMovie = data.results[Math.floor(Math.random() * data.results.length)];
        setMovie(randomMovie);
      });
  }, []);

  if (!movie) return <div className="h-[60vh] md:h-[85vh] bg-primeBg animate-pulse"></div>;

  return (
    <header 
      className="relative h-[60vh] md:h-[85vh] bg-cover bg-center text-white"
      style={{ backgroundImage: `url("${IMAGE_BASE_URL}${movie.backdrop_path}")` }}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-primeBg via-primeBg/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-primeBg via-transparent to-transparent" />
      
      <div className="absolute top-[40%] md:top-[35%] left-4 md:left-10 max-w-2xl">
        <h1 className="text-4xl md:text-6xl font-extrabold mb-4 drop-shadow-lg">
          {movie.title || movie.name || movie.original_name}
        </h1>
        <p className="text-gray-300 text-sm md:text-lg mb-6 line-clamp-3 md:line-clamp-4 drop-shadow-md">
          {movie.overview}
        </p>
        <div className="flex gap-4">
          <button className="flex items-center gap-2 bg-primeBlue hover:bg-[#0085b3] text-white px-8 py-3 rounded font-bold transition-colors">
            <Play className="w-5 h-5 fill-current" /> Play
          </button>
          <button className="flex items-center gap-2 bg-gray-600/60 hover:bg-gray-500/60 text-white px-8 py-3 rounded font-bold transition-colors backdrop-blur-sm">
            More Details
          </button>
        </div>
      </div>
    </header>
  );
};

export default Banner;