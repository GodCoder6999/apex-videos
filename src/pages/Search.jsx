import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const Search = () => {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Extract query from URL (?q=inception)
  const location = useLocation();
  const query = new URLSearchParams(location.search).get('q');
  const navigate = useNavigate();

  const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY;

  useEffect(() => {
    if (!query) {
      setResults([]);
      setLoading(false);
      return;
    }

    const fetchSearchResults = async () => {
      setLoading(true);
      try {
        const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`);
        const data = await res.json();
        // Filter out actors/crew, keep media
        const filteredResults = data.results.filter(item => item.media_type === 'movie' || item.media_type === 'tv');
        setResults(filteredResults);
      } catch (error) {
        console.error("Failed to fetch search results", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSearchResults();
  }, [query, TMDB_API_KEY]);

  const handleCardClick = (item) => {
    const type = item.media_type || (item.name ? 'tv' : 'movie');
    navigate(`/detail/${type}/${item.id}`);
  };

  return (
    <div className="pt-28 px-4 md:px-12 min-h-screen bg-primeBg">
      <h1 className="text-3xl font-bold text-white mb-8">
        Results for "{query}"
      </h1>

      {loading ? (
        <div className="text-white text-xl">Loading results...</div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-8">
          {results.map((item) => (
            <div 
              key={item.id} 
              onClick={() => handleCardClick(item)}
              className="relative cursor-pointer group flex flex-col gap-2 transition-transform duration-300 hover:scale-110 hover:z-50"
            >
              {/* Card Thumbnail */}
              <div className="relative w-full pt-[150%] rounded-md overflow-hidden bg-gray-800 shadow-lg">
                <img 
                  src={item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster'}
                  alt={item.title || item.name} 
                  className="absolute top-0 left-0 w-full h-full object-cover"
                />
                
                {/* Dark gradient overlay that appears on hover to show text over image */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                   <div className="text-sm font-bold text-white line-clamp-2">{item.title || item.name}</div>
                   <div className="text-xs text-primeBlue font-semibold mt-1 uppercase tracking-wider">
                     {item.media_type === 'movie' ? 'Movie' : 'TV Show'}
                   </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-gray-400 text-xl">
          No matching movies or TV shows found. Try a different keyword.
        </div>
      )}
    </div>
  );
};

export default Search;
