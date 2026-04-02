import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Play, Plus, Volume2, VolumeX, PlaySquare, ThumbsUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const BASE_URL = 'https://api.themoviedb.org/3';
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

// ── Trailer embed (reused from Row.jsx) ───────────────────────────
function TrailerEmbed({ movieId, type = 'movie', muted }) {
  const [videoKey, setVideoKey] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!movieId) return;
    setVideoKey(null);
    setLoaded(false);
    fetch(`${BASE_URL}/${type}/${movieId}/videos?api_key=${API_KEY}&language=en-US`)
      .then(r => r.json())
      .then(d => {
        const v = d.results?.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
        if (v) setVideoKey(v.key);
      })
      .catch(() => {});
  }, [movieId, type]);

  if (!videoKey) return null;

  return (
    <motion.div
      key={`${videoKey}-${muted}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: loaded ? 1 : 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="absolute inset-0 z-10 pointer-events-none"
    >
      <iframe
        src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${videoKey}&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3`}
        className="w-full h-full scale-[1.02]"
        allow="autoplay; encrypted-media"
        onLoad={() => setLoaded(true)}
        title="trailer"
        style={{ border: 'none' }}
      />
    </motion.div>
  );
}

// ── Main Search Page Component ───────────────────────────
const Search = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // States for hovering features (like Row.jsx)
  const [hoveredId, setHoveredId] = useState(null);
  const [globalMuted, setGlobalMuted] = useState(true);
  
  const location = useLocation();
  const query = new URLSearchParams(location.search).get('q');
  const navigate = useNavigate();

  useEffect(() => {
    if (!query) {
      setResults([]);
      setLoading(false);
      return;
    }

    const fetchSearchResults = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}`);
        const data = await res.json();
        // Keep only movies and tv shows
        const filteredResults = data.results.filter(item => item.media_type === 'movie' || item.media_type === 'tv');
        setResults(filteredResults);
      } catch (error) {
        console.error("Failed to fetch search results", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSearchResults();
  }, [query]);

  const handleCardClick = (item) => {
    const type = item.media_type || (item.name ? 'tv' : 'movie');
    navigate(`/detail/${type}/${item.id}`, { state: { movie: item } });
  };

  return (
    <div className="pt-28 px-4 md:px-10 min-h-screen bg-primeBg pb-20">
      <h1 className="text-2xl md:text-3xl font-bold text-white mb-8 ml-2">
        Results for "{query}"
      </h1>

      {loading ? (
        <div className="text-white text-xl ml-2">Loading results...</div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-12">
          {results.map((item) => {
            if (!item.poster_path && !item.backdrop_path) return null;
            
            const mtype = item.media_type || (item.name ? 'tv' : 'movie');
            const posterSrc = item.poster_path 
                ? `https://image.tmdb.org/t/p/w500${item.poster_path}` 
                : `https://image.tmdb.org/t/p/w500${item.backdrop_path}`;
            const backdropSrc = item.backdrop_path 
                ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` 
                : posterSrc;
                
            return (
              <div 
                key={item.id} 
                className="relative w-full pt-[150%] rounded-md z-10 hover:z-[100]"
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Base Thumbnail */}
                <img 
                  src={posterSrc}
                  alt={item.title || item.name} 
                  className="absolute top-0 left-0 w-full h-full object-cover rounded-md cursor-pointer"
                  onClick={() => handleCardClick(item)}
                />
                
                {/* Expandable Hover Popup */}
                <AnimatePresence>
                  {hoveredId === item.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1.15 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] sm:w-[280px] bg-[#00050D] rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10 flex flex-col z-[100] cursor-pointer"
                      onClick={() => handleCardClick(item)}
                    >
                      {/* Top Video Section */}
                      <div className="relative w-full aspect-video bg-black">
                        <img 
                          src={backdropSrc} 
                          alt={item.title || item.name} 
                          className="w-full h-full object-cover" 
                        />
                        
                        <TrailerEmbed movieId={item.id} type={mtype} muted={globalMuted} />
                        
                        <div className="absolute inset-0 bg-gradient-to-t from-[#00050D] via-transparent to-transparent z-20" />

                        <motion.button
                          initial={{ opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 1, scale: 1 }}
                          onClick={e => { e.stopPropagation(); setGlobalMuted(!globalMuted); }}
                          className="absolute bottom-3 right-3 z-30 w-8 h-8 rounded-full bg-[#333333] flex items-center justify-center text-white hover:bg-gray-500 transition-colors"
                        >
                          {globalMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-primeBlue" />}
                        </motion.button>
                      </div>

                      {/* Details Section */}
                      <div className="p-4 flex flex-col gap-1.5">
                        <h3 className="text-lg font-bold text-white mb-0.5 truncate hover:text-primeBlue transition-colors">
                          {item.title || item.name}
                        </h3>

                        <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold text-primeBlue opacity-90">
                           <span className="w-3.5 h-3.5 rounded-full bg-primeBlue text-black flex items-center justify-center text-[8px]">✓</span>
                           Apex Player (Included)
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-2 mb-2">
                          <button
                            onClick={e => { e.stopPropagation(); navigate(`/play/${mtype}/${item.id}`); }}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-white text-black py-1.5 rounded text-[13px] font-bold hover:bg-gray-200 transition-colors"
                          >
                            <Play className="w-4 h-4 fill-current" /> Play
                          </button>
                          
                          <button className="w-8 h-8 rounded-full flex items-center justify-center text-white bg-[#333333] hover:bg-gray-600 transition-colors">
                            <PlaySquare className="w-4 h-4" />
                          </button>
                          <button className="w-8 h-8 rounded-full flex items-center justify-center text-white bg-[#333333] hover:bg-gray-600 transition-colors">
                            <Plus className="w-4 h-4" />
                          </button>
                          <button className="w-8 h-8 rounded-full flex items-center justify-center text-white bg-[#333333] hover:bg-gray-600 transition-colors">
                            <ThumbsUp className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Metadata */}
                        <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
                          <span className="bg-gray-800 text-gray-200 px-1 py-0.5 rounded text-[9px] font-bold">U/A 16+</span>
                          <span>{item.release_date?.substring(0,4) || item.first_air_date?.substring(0,4)}</span>
                          {item.vote_average > 0 && <span className="ml-1 text-gray-300">★ {item.vote_average.toFixed(1)}</span>}
                        </div>
                        
                        {/* Overview Snippet */}
                        <p className="text-[11px] text-gray-400 line-clamp-2 mt-1 leading-snug">
                          {item.overview || "No overview available."}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-gray-400 text-xl ml-2 mt-10">
          No matching movies or TV shows found. Try a different keyword.
        </div>
      )}
    </div>
  );
};

export default Search;
