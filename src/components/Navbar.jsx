import React, { useState, useEffect } from 'react';
import { Search, Bell, User } from 'lucide-react';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`fixed w-full z-50 transition-all duration-300 ${isScrolled ? 'bg-primeBg shadow-lg' : 'bg-gradient-to-b from-black/80 to-transparent'}`}>
      <div className="flex items-center justify-between px-4 md:px-10 py-4">
        <div className="flex items-center gap-8">
          <h1 className="text-2xl font-bold text-white tracking-wide cursor-pointer">
            apex<span className="text-primeBlue">videos</span>
          </h1>
          <div className="hidden md:flex gap-5 text-gray-300 font-medium text-sm">
            <span className="text-white cursor-pointer border-b-2 border-white pb-1">Home</span>
            <span className="hover:text-white cursor-pointer transition-colors pb-1 border-b-2 border-transparent hover:border-white">Store</span>
            <span className="hover:text-white cursor-pointer transition-colors pb-1 border-b-2 border-transparent hover:border-white">Live TV</span>
            <span className="hover:text-white cursor-pointer transition-colors pb-1 border-b-2 border-transparent hover:border-white">Categories</span>
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