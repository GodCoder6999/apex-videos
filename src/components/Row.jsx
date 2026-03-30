import React, { useState, useEffect } from 'react';
import { ChevronRight, Play, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/original";

const Row = ({ title, fetchUrl, isLargeRow = false }) => {
  const [movies, setMovies] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${BASE_URL}${fetchUrl}`)
      .then((res) => res.json())
      .then((data) => setMovies(data.results));
  }, [fetchUrl]);

  return (
    <div className="pl-4 md:pl-10 mt-6 md:mt-8 relative">
      
      {/* Row Title */}
      <div className="flex items-center gap-2 mb-2 group cursor-pointer w-max">
        <h2 className="text-xl md:text-2xl font-bold text-gray-100 group-hover:text-primeBlue transition-colors">
          {title}
        </h2>
        <ChevronRight className="w-5 h-5 text-transparent group-hover:text-primeBlue transition-colors" />
      </div>
      
      {/* Movie Cards Container */}
      <div className="movie-row">
        {movies.map((movie) => {
          // Ensure we only render items that have images
          if (!movie.poster_path || !movie.backdrop_path) return null;

          // Dynamically determine if this is a Movie or a TV Show for the routing
          const type = movie.media_type || (movie.first_air_date ? 'tv' : 'movie');

          return (
            <div 
              key={movie.id} 
              className={`movie-card ${isLargeRow ? "w-[170px] md:w-[210px] h-[250px] md:h-[320px]" : "w-[220px] md:w-[300px] h-[125px] md:h-[170px]"}`}
            >
              {/* 1. Base Image (Visible before hover) */}
              <img
                onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
                className="thumbnail w-full h-full object-cover transition-opacity duration-300 rounded"
                src={`${IMAGE_BASE_URL}${isLargeRow ? movie.poster_path : movie.backdrop_path}`}
                alt={movie.name || movie.title}
                loading="lazy"
              />

              {/* 2. The Hover Popup Card */}
              <div className="hover-popup">
                
                {/* Popup Header Image */}
                <div 
                  className="relative w-full h-[140px] md:h-[180px] overflow-hidden bg-black cursor-pointer"
                  onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
                >
                  <img
                    className="w-full h-full object-cover"
                    src={`${IMAGE_BASE_URL}${movie.backdrop_path}`}
                    alt={movie.name || movie.title}
                  />
                  {/* Bottom Gradient for text readability */}
                  <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-primeHover to-transparent" />
                  
                  {/* Fake Player Badge */}
                  <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-[11px] text-white font-bold z-10 drop-shadow-md">
                    <span className="w-5 h-5 rounded-full border-[1.5px] border-white flex items-center justify-center text-[8px]">▶</span>
                    Apex Player
                  </div>
                </div>

                {/* Popup Details Body */}
                <div className="p-4 bg-primeHover">
                  
                  {/* Title */}
                  <h3 
                    onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
                    className="text-lg md:text-xl font-bold text-white mb-3 leading-tight truncate cursor-pointer hover:underline"
                  >
                    {movie.title || movie.name}
                  </h3>
                  
                  {/* Action Buttons */}
                  <div className="flex items-center gap-3 mb-4">
                    <button 
                      onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
                      className="flex-1 flex items-center justify-center gap-2 bg-white text-black py-2.5 rounded font-bold hover:bg-gray-200 transition-colors"
                    >
                      <Play fill="currentColor" className="w-4 h-4" /> Play
                    </button>
                    <button className="w-11 h-11 rounded-full border-2 border-gray-500 flex items-center justify-center text-white hover:border-white transition-colors bg-white/5 group">
                      <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </button>
                  </div>

                  {/* Metadata Row */}
                  <div className="flex items-center gap-3 text-xs text-gray-400 mb-3 font-semibold">
                    <span className="border border-gray-500 px-1.5 py-0.5 rounded text-gray-300">U/A 16+</span>
                    <span>{movie.release_date?.substring(0,4) || movie.first_air_date?.substring(0,4)}</span>
                    <span className="text-primeBlue text-[13px]">Apex</span>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">
                    {movie.overview}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Row;