import React, { useState, useEffect } from 'react';
import { Search, Bell, User } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  // Tailwind variables for your specific reference CSS
  const baseLinkStyle = "px-[22px] py-[9px] rounded-full transition-all duration-200 mx-[3px] cursor-pointer text-[15.5px] font-medium text-white";
  const inactiveLinkStyle = "hover:bg-white/10";
  const activeLinkStyle = "bg-gradient-to-b from-white/[0.18] to-white/[0.06] shadow-[0_2px_6px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-1px_0_rgba(0,0,0,0.3)] font-semibold";

  return (
    <nav 
      className={`fixed top-0 z-50 transition-all duration-500 ${
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
            {/* Main Navigation Links */}
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

            {/* Separator Line */}
            <div className="w-[1px] h-[26px] bg-[#334252] ml-4 mr-1 self-center"></div>

            {/* Secondary Navigation Links */}
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
          <Search className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
          <Bell className="w-5 h-5 cursor-pointer hover:text-white transition-colors" />
          <User className="w-6 h-6 cursor-pointer hover:text-white transition-colors" />
        </div>
      </div>
    </nav>
  );
};

export default Navbar;