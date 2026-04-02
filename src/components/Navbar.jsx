import React, { useState, useEffect } from 'react';
import { Search, Bell, User } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // New States for API Data
  const [trending, setTrending] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  
  const location = useLocation();
  const navigate = useNavigate();

  // Make sure this matches your .env variable name
  const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY; 

  // Handle Scroll Background
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsSearchOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch Initial Trending Data (When Search is empty)
  useEffect(() => {
    const fetchTrending = async () => {
      try {
        const res = await fetch(`https://api.themoviedb.org/3/trending/all/day?api_key=${TMDB_API_KEY}`);
        const data = await res.json();
        // Keep only top 4 movies/shows
        const filtered = data.results.filter(item => item.media_type !== 'person').slice(0, 4);
        setTrending(filtered);
      } catch (error) {
        console.error("Error fetching trending:", error);
      }
    };
    fetchTrending();
  }, [TMDB_API_KEY]);

  // Fetch Predictive Search Suggestions (Debounced)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        // Keep only top 4 movie/tv results
        const filtered = data.results.filter(item => item.media_type !== 'person').slice(0, 4);
        setSuggestions(filtered);
      } catch (error) {
        console.error("Error fetching suggestions:", error);
      }
    }, 400); // 400ms delay to prevent API spam

    return () => clearTimeout(timer);
  }, [searchQuery, TMDB_API_KEY]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setIsSearchOpen(false);
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
    }
  };

  const handleResultClick = (item) => {
    setIsSearchOpen(false);
    setSearchQuery('');
    // Use 'movie' fallback if media_type is missing
    const type = item.media_type || (item.name ? 'tv' : 'movie');
    navigate(`/detail/${type}/${item.id}`);
  };

  const mainLinks = [
    { name: 'Home', path: '/' },
    { name: 'Movies', path: '/movies' },
    { name: 'TV shows', path: '/tv-shows' },
    { name: 'Live TV', path: '/live-tv' },
  ];

  const secondaryLinks = [
    { name: 'Subscriptions', path: '/subscriptions' },
    { name: 'Store', path: '/store' }
  ];

  const baseLinkStyle = "px-[22px] py-[9px] rounded-full transition-all duration-200 mx-[3px] cursor-pointer text-[15.5px] font-medium text-white";
  const inactiveLinkStyle = "hover:bg-white/10";
  const activeLinkStyle = "bg-gradient-to-b from-white/[0.18] to-white/[0.06] shadow-[0_2px_6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-1px_0_rgba(0,0,0,0.3)] font-semibold";

  // Decide which data to show in the dropdown
  const displayResults = searchQuery.trim() ? suggestions : trending;
  const sectionTitle = searchQuery.trim() ? "Suggestions" : "Trending Now";

  return (
    <>
      <nav 
        className={`fixed top-0 z-40 transition-all duration-500 ${
          isScrolled 
            ? 'left-4 right-4 md:left-12 md:right-12 bg-[#0f171a]/80 backdrop-blur-md shadow-xl rounded-b-3xl border border-t-0 border-white/10' 
            : 'left-0 right-0 bg-gradient-to-b from-black/90 to-transparent rounded-none border-transparent'
        }`}
      >
        <div className="flex items-center justify-between px-4 md:px-10 py-4">
          <div className="flex items-center gap-6">
            <Link to="/" className="text-2xl font-bold text-white tracking-wide cursor-pointer mr-2">
              apex<span className="text-primeBlue">videos</span>
            </Link>
            
            <div className="hidden lg:flex items-center">
              {mainLinks.map((link) => {
                const isActive = location.pathname === link.path;
                return (
                  <Link key={link.name} to={link.path} className={`${baseLinkStyle} ${isActive ? activeLinkStyle : inactiveLinkStyle}`}>
                    {link.name}
                  </Link>
                );
              })}
              <div className="w-[1px] h-[26px] bg-[#334252] ml-4 mr-1 self-center"></div>
              {secondaryLinks.map((link) => {
                const isActive = location.pathname === link.path;
                return (
                  <Link key={link.name} to={link.path} className={`${baseLinkStyle} ${isActive ? activeLinkStyle : inactiveLinkStyle}`}>
                    {link.name}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-6 text-gray-300">
            <Search className="w-5 h-5 cursor-pointer hover:text-white transition-colors" onClick={() => setIsSearchOpen(true)} />
            <Bell className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
            <User className="w-6 h-6 cursor-pointer hover:text-white transition-colors" />
          </div>
        </div>
      </nav>

      {/* Glassmorphic Search Modal */}
      {isSearchOpen && (
        <div 
          className="fixed inset-0 z-50 flex justify-center items-start pt-[10vh] bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setIsSearchOpen(false)}
        >
          <div 
            className="w-full max-w-[900px] flex flex-col gap-5 rounded-2xl p-6 md:p-8 bg-[#1b2530]/60 backdrop-blur-xl border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.8)]"
            onClick={(e) => e.stopPropagation()}
          >
            <form 
              onSubmit={handleSearchSubmit}
              className="flex items-center border border-white/20 rounded-xl px-4 py-3 bg-[#1b2530]/40 focus-within:border-primeBlue/60 focus-within:bg-[#1b2530]/60 transition-all duration-300"
            >
              <Search className="w-6 h-6 text-white/70 mr-4" />
              <input 
                type="text" 
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search movies, TV shows..." 
                className="flex-grow bg-transparent border-none text-white text-lg md:text-xl outline-none placeholder-gray-400"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="text-white/80 hover:text-white text-sm font-medium px-2 hover:underline focus:outline-none">
                  Clear
                </button>
              )}
            </form>

            <div className="flex flex-col gap-4 px-2 mt-2">
              <h3 className="text-gray-400 text-sm font-bold uppercase tracking-wider">{sectionTitle}</h3>
              {displayResults.map(item => (
                <div 
                  key={item.id}
                  className="text-base font-semibold text-white cursor-pointer hover:text-primeBlue transition-colors flex items-center gap-3"
                  onClick={() => handleResultClick(item)}
                >
                  <Search className="w-4 h-4 text-gray-500" />
                  {item.title || item.name}
                </div>
              ))}
              {displayResults.length === 0 && searchQuery && (
                <p className="text-gray-400 text-sm">No predictions found.</p>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              {displayResults.map((item) => (
                <div 
                  key={`card-${item.id}`} 
                  onClick={() => handleResultClick(item)}
                  className="flex flex-col gap-2 cursor-pointer group"
                >
                  <div className="relative w-full pt-[56.25%] rounded-lg overflow-hidden bg-gray-800">
                    <img 
                      src={item.backdrop_path ? `https://image.tmdb.org/t/p/w500${item.backdrop_path}` : 'https://via.placeholder.com/400x225?text=No+Image'} 
                      alt={item.title || item.name} 
                      className="absolute top-0 left-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="text-sm font-semibold text-white line-clamp-2">{item.title || item.name}</div>
                  <div className="text-xs text-gray-400">
                    {item.release_date ? item.release_date.split('-')[0] : (item.first_air_date ? item.first_air_date.split('-')[0] : '')}
                    {item.media_type === 'movie' ? ' • Movie' : ' • TV'}
                  </div>
                </div>
              ))}
            </div>
            
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
