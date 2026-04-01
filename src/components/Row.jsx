import React, { useState, useEffect, useRef } from 'react';
import { ChevronRight, ChevronLeft, Play, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import YouTube from 'react-youtube';
import movieTrailer from 'movie-trailer';

const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original';

export default function Row({ title, fetchUrl, isLargeRow = false }) {
  const [movies, setMovies] = useState([]);
  const [hoveredMovie, setHoveredMovie] = useState(null);
  const [trailerUrl, setTrailerUrl] = useState('');
  const navigate = useNavigate();

  const ref = useRef(null);
  const rowRef = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });

  useEffect(() => {
    fetch(`${BASE_URL}${fetchUrl}`)
      .then((r) => r.json())
      .then((d) => setMovies(d.results || []));
  }, [fetchUrl]);

  // Handle Trailer Fetch on Hover
  useEffect(() => {
    if (hoveredMovie) {
      const movieTitle = hoveredMovie.title || hoveredMovie.name || hoveredMovie.original_name;
      movieTrailer(movieTitle, { id: true })
        .then((url) => setTrailerUrl(url))
        .catch(() => setTrailerUrl('')); // Fallback if no trailer is found
    } else {
      setTrailerUrl('');
    }
  }, [hoveredMovie]);

  const handleScroll = (direction) => {
    if (rowRef.current) {
      const { scrollLeft, clientWidth } = rowRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth : scrollLeft + clientWidth;
      rowRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const opts = {
    height: '100%',
    width: '100%',
    playerVars: { autoplay: 1, mute: 1, controls: 0, modestbranding: 1 },
  };

  return (
    <div ref={ref} className="pl-4 md:pl-10 mt-6 md:mt-8 relative group">
      <h2 className="text-xl md:text-2xl font-bold text-gray-100 mb-2">{title}</h2>

      {/* Slide Arrows */}
      <div 
        className="absolute top-1/2 left-0 z-40 hidden group-hover:flex items-center justify-center h-full w-12 -translate-y-1/2 bg-black/50 cursor-pointer hover:bg-black/80 transition-colors" 
        onClick={() => handleScroll('left')}
      >
        <ChevronLeft className="w-8 h-8 text-white" />
      </div>
      <div 
        className="absolute top-1/2 right-0 z-40 hidden group-hover:flex items-center justify-center h-full w-12 -translate-y-1/2 bg-black/50 cursor-pointer hover:bg-black/80 transition-colors" 
        onClick={() => handleScroll('right')}
      >
        <ChevronRight className="w-8 h-8 text-white" />
      </div>

      {/* Row Container */}
      <div ref={rowRef} className="movie-row flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth py-5">
        {movies.map((movie) => {
          if (!movie.poster_path || !movie.backdrop_path) return null;
          const type = movie.media_type || (movie.first_air_date ? 'tv' : 'movie');

          return (
            <motion.div
              key={movie.id}
              className={`movie-card relative flex-shrink-0 cursor-pointer transition-transform duration-300 hover:z-50 ${isLargeRow ? 'w-[170px] md:w-[210px]' : 'w-[220px] md:w-[300px]'}`}
              onMouseEnter={() => setHoveredMovie(movie)}
              onMouseLeave={() => setHoveredMovie(null)}
            >
              <img
                onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
                className="w-full h-full object-cover rounded"
                src={`${IMAGE_BASE_URL}${isLargeRow ? movie.poster_path : movie.backdrop_path}`}
                alt={movie.name || movie.title}
              />

              {/* Hover Popup Container */}
              <div className="hover-popup absolute top-[-20px] left-[-40px] w-[320px] md:w-[380px] bg-[#1a242f] rounded-xl shadow-2xl opacity-0 invisible scale-75 transition-all duration-300 origin-bottom z-[100000] overflow-hidden pointer-events-none group-hover:pointer-events-auto">
                <div 
                  className="relative w-full h-[180px] bg-black cursor-pointer" 
                  onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
                >
                  {trailerUrl && hoveredMovie?.id === movie.id ? (
                     <YouTube videoId={trailerUrl} opts={opts} className="absolute inset-0 w-full h-full pointer-events-none" />
                  ) : (
                    <img className="w-full h-full object-cover" src={`${IMAGE_BASE_URL}${movie.backdrop_path}`} alt={movie.name || movie.title} />
                  )}
                </div>
                <div className="p-4">
                  <h3 className="text-xl font-bold text-white mb-3 truncate">{movie.title || movie.name}</h3>
                  <div className="flex gap-3 mb-3">
                    <button 
                      onClick={(e) => { e.stopPropagation(); navigate(`/play/${type}/${movie.id}`); }} 
                      className="flex-1 flex justify-center items-center gap-2 bg-white text-black py-2 rounded font-bold hover:bg-gray-200 transition-colors"
                    >
                      <Play className="w-4 h-4" fill="currentColor" /> Play
                    </button>
                    <button className="w-10 h-10 rounded-full border border-gray-500 text-white flex items-center justify-center hover:border-white transition-colors">
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="text-xs text-gray-400 font-semibold mt-2">
                    {movie.release_date ? movie.release_date.substring(0, 4) : ''} • {movie.vote_average?.toFixed(1)} Rating
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
