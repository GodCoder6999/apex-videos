import React, { useState, useEffect } from 'react';
import { Search, Bell, User } from 'lucide-react';
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
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
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
            <Search 
              className="w-5 h-5 cursor-pointer hover:text-white transition-colors" 
              onClick={() => setIsSearchOpen(true)}
            />
            <Bell className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
            <User className="w-6 h-6 cursor-pointer hover:text-white transition-colors" />
          </div>
        </div>
      </nav>

      {/* Glassmorphic Search Modal Overlay */}
      {isSearchOpen && (
        <div 
          className="fixed inset-0 z-50 flex justify-center items-start pt-[10vh] bg-black/60 backdrop-blur-sm px-4"
          onClick={() => setIsSearchOpen(false)}
        >
          {/* Modal Container - Glassmorphism applied here */}
          <div 
            className="w-full max-w-[900px] flex flex-col gap-5 rounded-2xl p-6 md:p-8 bg-[#1b2530]/60 backdrop-blur-xl border border-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.8)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Area */}
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
                placeholder="Search" 
                className="flex-grow bg-transparent border-none text-white text-lg md:text-xl outline-none placeholder-gray-400"
              />
              {searchQuery && (
                <button 
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-white/80 hover:text-white text-sm font-medium px-2 hover:underline focus:outline-none"
                >
                  Clear
                </button>
              )}
            </form>

            {/* Text Suggestions */}
            <div className="flex flex-col gap-4 px-2 mt-2">
              <div 
                className="text-base font-semibold text-white cursor-pointer hover:text-gray-300 transition-colors"
                onClick={() => setSearchQuery('The Summer I Turned Pretty')}
              >
                The Summer I Turned Pretty
              </div>
              <div 
                className="text-base font-semibold text-white cursor-pointer hover:text-gray-300 transition-colors"
                onClick={() => setSearchQuery('The Summer I Turned Pretty: Cousins Beach Yule Log')}
              >
                The Summer I Turned Pretty: Cousins Beach Yule Log
              </div>
            </div>

            {/* Card Suggestions Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              {/* Card 1 */}
              <div className="flex flex-col gap-2 cursor-pointer group">
                <div className="relative w-full pt-[56.25%] rounded-lg overflow-hidden bg-gray-800">
                  <img 
                    src="https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=400&q=80" 
                    alt="The Summer I Turned Pretty" 
                    className="absolute top-0 left-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="text-sm font-semibold text-white line-clamp-2">The Summer I Turned Pretty</div>
                <div className="text-xs text-gray-400">2022</div>
              </div>

              {/* Card 2 */}
              <div className="flex flex-col gap-2 cursor-pointer group">
                <div className="relative w-full pt-[56.25%] rounded-lg overflow-hidden bg-gray-800">
                  <img 
                    src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=80" 
                    alt="The Map That Leads to You" 
                    className="absolute top-0 left-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="text-sm font-semibold text-white line-clamp-2">The Map That Leads to You</div>
                <div className="text-xs text-gray-400">2025 • 1 h 38 min</div>
              </div>

              {/* Card 3 */}
              <div className="flex flex-col gap-2 cursor-pointer group">
                <div className="relative w-full pt-[56.25%] rounded-lg overflow-hidden bg-gray-800">
                  <img 
                    src="https://images.unsplash.com/photo-1504681869696-d977211a5f4c?auto=format&fit=crop&w=400&q=80" 
                    alt="I Know What You Did Last Summer" 
                    className="absolute top-0 left-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="text-sm font-semibold text-white line-clamp-2">I Know What You Did Last Summer</div>
                <div className="text-xs text-gray-400">2021</div>
              </div>

              {/* Card 4 */}
              <div className="flex flex-col gap-2 cursor-pointer group">
                <div className="relative w-full pt-[56.25%] rounded-lg overflow-hidden bg-gray-800">
                  <img 
                    src="https://images.unsplash.com/photo-1513297887119-d46091b24bfa?auto=format&fit=crop&w=400&q=80" 
                    alt="The Summer I Turned Pretty: Cousins Beach..." 
                    className="absolute top-0 left-0 w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
                <div className="text-sm font-semibold text-white line-clamp-2">The Summer I Turned Pretty: Cousins Beach...</div>
                <div className="text-xs text-gray-400">2025</div>
              </div>
            </div>
            
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
