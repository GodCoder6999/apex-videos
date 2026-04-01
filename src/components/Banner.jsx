import React, { useState, useEffect } from 'react';
import { Play, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import YouTube from 'react-youtube';
import movieTrailer from 'movie-trailer';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original';

export default function Banner() {
  const [movie, setMovie] = useState(null);
  const [trailerUrl, setTrailerUrl] = useState('');
  const [playVideo, setPlayVideo] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch Trending Movies for the Banner
    fetch(`${BASE_URL}/trending/all/week?api_key=${API_KEY}&language=en-US`)
      .then((res) => res.json())
      .then((data) => {
        const randomMovie = data.results[Math.floor(Math.random() * data.results.length)];
        setMovie(randomMovie);
      });
  }, []);

  useEffect(() => {
    if (movie) {
      const movieTitle = movie.title || movie.name || movie.original_name;
      movieTrailer(movieTitle, { id: true })
        .then((url) => {
          setTrailerUrl(url);
          // Wait 3 seconds before switching from image to video
          setTimeout(() => setPlayVideo(true), 3000);
        })
        .catch(() => setTrailerUrl(''));
    }
  }, [movie]);

  if (!movie) return <div className="h-[70vh] w-full bg-[#0f171e] animate-pulse"></div>;

  const type = movie.media_type || (movie.first_air_date ? 'tv' : 'movie');

  const truncate = (str, n) => {
    return str?.length > n ? str.substr(0, n - 1) + '...' : str;
  };

  const bgFade = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 1.5 } }
  };

  return (
    <header className="relative h-[70vh] md:h-[85vh] text-white overflow-hidden">
      <div className="absolute inset-0 w-full h-full bg-black">
        {playVideo && trailerUrl ? (
          <div className="absolute top-1/2 left-1/2 w-[150vw] h-[150vh] -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-80">
            <YouTube 
              videoId={trailerUrl} 
              opts={{
                height: '100%',
                width: '100%',
                playerVars: { autoplay: 1, mute: 1, controls: 0, loop: 1, playlist: trailerUrl },
              }} 
              className="w-full h-full"
            />
          </div>
        ) : (
          <motion.div
            key={movie.id}
            variants={bgFade}
            initial="hidden"
            animate="visible"
            className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80"
            style={{ backgroundImage: `url("${IMAGE_BASE_URL}${movie.backdrop_path}")` }}
          />
        )}
      </div>

      {/* Gradient Overlay for Text Readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0f171e] via-[#0f171e]/40 to-transparent"></div>
      <div className="absolute inset-0 bg-gradient-to-r from-[#0f171e] via-[#0f171e]/50 to-transparent"></div>

      <div className="relative z-10 pt-[30vh] md:pt-[35vh] px-4 md:px-10 h-full flex flex-col justify-start w-full md:w-2/3 lg:w-1/2">
        <motion.h1 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.8 }}
          className="text-4xl md:text-6xl font-extrabold pb-2 drop-shadow-2xl"
        >
          {movie.title || movie.name || movie.original_name}
        </motion.h1>

        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="flex gap-3 mb-6 mt-4"
        >
          <button 
            onClick={() => navigate(`/play/${type}/${movie.id}`)}
            className="cursor-pointer text-black bg-white font-bold rounded flex items-center px-6 py-2 md:py-3 hover:bg-gray-300 transition-all"
          >
            <Play fill="currentColor" className="w-5 h-5 mr-2" /> Play
          </button>
          <button 
            onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
            className="cursor-pointer text-white bg-gray-500/50 font-bold rounded flex items-center px-6 py-2 md:py-3 hover:bg-gray-500/70 transition-all"
          >
            <Info className="w-5 h-5 mr-2" /> More Info
          </button>
        </motion.div>

        <motion.h1 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="w-full text-sm md:text-base max-w-[45rem] leading-relaxed drop-shadow-md text-gray-200"
        >
          {truncate(movie.overview, 150)}
        </motion.h1>
      </div>
    </header>
  );
}
