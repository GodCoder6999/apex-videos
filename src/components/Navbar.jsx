import React, { useState, useEffect } from 'react';
import { Search, Bell, User, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close modal on escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsSearchOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setIsSearchOpen(false);
      // Route to a search results page (ensure you create this route in App.jsx if needed)
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchQuery('');
    }
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
                  <Link 
                    key={link.name} 
                    to={link.path}
                    className={`${baseLinkStyle} ${isActive ? activeLinkStyle : inactiveLinkStyle}`}
                  >
                    {link.name}
                  </Link>
                );
              })}

              <div className="w-[1px] h-[26px] bg-[#334252] ml-4 mr-1 self-center"></div>

              {secondaryLinks.map((link) => {
                const isActive = location.pathname === link.path;
                return (
                  <Link 
                    key={link.name} 
                    to={link.path}
                    className={`${baseLinkStyle} ${isActive ? activeLinkStyle : inactiveLinkStyle}`}
                  >
                    {link.name}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-6 text-gray-300">
            {/* Search Trigger */}
            <Search 
              className="w-5 h-5 cursor-pointer hover:text-white transition-colors" 
              onClick={() => setIsSearchOpen(true)}
            />
            <Bell className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
            <User className="w-6 h-6 cursor-pointer hover:text-white transition-colors" />
          </div>
        </div>
      </nav>

      {/* Search Modal Overlay */}
      {isSearchOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setIsSearchOpen(false)}
        >
          {/* Modal Container */}
          <div 
            className="bg-[#00050D] border border-white/10 w-full max-w-3xl rounded-2xl p-8 shadow-[0_0_40px_rgba(0,168,225,0.1)] relative transform transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button 
              onClick={() => setIsSearchOpen(false)}
              className="absolute top-6 right-6 text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 rounded-full p-2"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-3xl font-bold text-white mb-8 text-center">Search apex<span className="text-primeBlue">videos</span></h2>

            {/* Search Form - Styled like an upload/drop zone */}
            <form 
              onSubmit={handleSearchSubmit} 
              className="relative group flex flex-col items-center justify-center p-10 border-2 border-dashed border-gray-600 focus-within:border-primeBlue focus-within:bg-primeBlue/5 rounded-2xl transition-all duration-300"
            >
              <Search className="w-12 h-12 text-gray-500 group-focus-within:text-primeBlue mb-6 transition-colors" />
              
              <input 
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type to search movies, shows, and more..."
                className="w-full text-center bg-transparent border-none outline-none text-white text-2xl md:text-3xl placeholder-gray-600 mb-8"
              />

              <button 
                type="submit"
                className="bg-primeBlue hover:bg-[#0096c8] text-white px-10 py-4 rounded-full font-semibold text-lg tracking-wide transition-all duration-300 shadow-[0_0_20px_rgba(0,168,225,0.3)] hover:shadow-[0_0_30px_rgba(0,168,225,0.5)] flex items-center gap-2"
              >
                <Search className="w-5 h-5" />
                Find Content
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
