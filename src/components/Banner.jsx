// src/components/Banner.jsx
import React, { useState, useEffect, useRef } from 'react'
import { Play, Plus, Info, Volume2, VolumeX, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

const BASE_URL       = 'https://api.themoviedb.org/3'
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original'
const API_KEY        = import.meta.env.VITE_TMDB_API_KEY

// ── Animation variants ────────────────────────────────────────────────────────
const heroTitle = {
  hidden:  { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
}
const heroBadge = {
  hidden:  { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.1, ease: 'easeOut' } },
}
const heroMeta = {
  hidden:  { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.2, ease: 'easeOut' } },
}
const heroOverview = {
  hidden:  { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.3, ease: 'easeOut' } },
}
const heroButtons = {
  hidden:  { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.4, ease: 'easeOut' } },
}

const Banner = ({ fetchUrl = `/trending/all/week?api_key=${API_KEY}&language=en-US` }) => {
  const [movies,          setMovies]        = useState([])
  const [currentIndex,    setCurrentIndex]  = useState(0)
  const [isHovered,       setIsHovered]     = useState(false)
  
  const [isMuted,         setIsMuted]       = useState(true)
  const [inWatchlist,     setInWatchlist]   = useState(false)
  const [trailerKey,      setTrailerKey]    = useState(null)
  const [trailerLoaded,   setTrailerLoaded] = useState(false)
  const [showTrailer,     setShowTrailer]   = useState(false)
  
  const navigate = useNavigate()
  const hoverTimerRef = useRef(null)
  const slideTimerRef = useRef(null)

  // 1. Fetch top trending movies for the carousel
  useEffect(() => {
    fetch(`${BASE_URL}${fetchUrl}`)
      .then(r => r.json())
      .then(d => {
        // Take top 7 results for the slider
        if (d.results) setMovies(d.results.slice(0, 7))
      })
  }, [fetchUrl])

  const movie = movies[currentIndex]

  // 2. Fetch the trailer specific to the currently active movie
  useEffect(() => {
    if (!movie) return
    setTrailerKey(null)
    setTrailerLoaded(false)
    setShowTrailer(false)

    const type = movie.media_type || (movie.first_air_date ? 'tv' : 'movie')
    fetch(`${BASE_URL}/${type}/${movie.id}/videos?api_key=${API_KEY}&language=en-US`)
      .then(r => r.json())
      .then(d => {
        const trailer = d.results?.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
        if (trailer) setTrailerKey(trailer.key)
      })
      .catch(() => {})
  }, [movie])

  // 3. Carousel Auto-slide and 5-Second Hover Logic
  useEffect(() => {
    // Clear any existing timers
    clearInterval(slideTimerRef.current)
    clearTimeout(hoverTimerRef.current)

    if (isHovered) {
      // User is hovering: pause sliding, hide previous trailer, and start 5s countdown
      setShowTrailer(false)
      hoverTimerRef.current = setTimeout(() => {
        setShowTrailer(true)
      }, 5000)
    } else {
      // User is NOT hovering: hide trailer, resume auto-sliding every 7 seconds
      setShowTrailer(false)
      slideTimerRef.current = setInterval(() => {
        setCurrentIndex(prev => movies.length ? (prev + 1) % movies.length : 0)
      }, 7000)
    }

    return () => {
      clearInterval(slideTimerRef.current)
      clearTimeout(hoverTimerRef.current)
    }
  }, [isHovered, currentIndex, movies.length])

  // Manual Controls
  const nextSlide = () => setCurrentIndex(prev => (prev + 1) % movies.length)
  const prevSlide = () => setCurrentIndex(prev => (prev - 1 + movies.length) % movies.length)

  if (!movies.length || !movie) return (
    <div className="h-[75vh] md:h-[90vh] bg-[#00050D] animate-pulse relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-[#00050D] via-[#00050D]/60 to-transparent" />
    </div>
  )

  const type = movie.media_type || (movie.first_air_date ? 'tv' : 'movie')

  return (
    <header 
      className="relative h-[75vh] md:h-[90vh] w-full overflow-hidden text-white bg-[#00050D]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background image — smooth crossfade on slide change */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key={movie.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: 'easeInOut' }}
          className="absolute inset-0 bg-cover bg-top bg-no-repeat"
          style={{ backgroundImage: `url("${IMAGE_BASE_URL}${movie.backdrop_path}")` }}
        />
      </AnimatePresence>

      {/* Hero trailer iframe (Only appears after 5s of hover) */}
      {trailerKey && showTrailer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: trailerLoaded ? 1 : 0 }}
          transition={{ duration: 1 }}
          className="absolute inset-0 z-[1] pointer-events-none"
        >
          <iframe
            src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&loop=1&playlist=${trailerKey}&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&start=0`}
            className="w-full h-full scale-[1.15]"
            allow="autoplay; encrypted-media"
            onLoad={() => setTrailerLoaded(true)}
            title="hero-trailer"
            style={{ border: 'none', pointerEvents: 'none' }}
          />
        </motion.div>
      )}

      {/* True Dark #00050D Gradients */}
      <div className="absolute inset-0 z-[2] bg-gradient-to-r from-[#00050D] via-[#00050D]/80 to-transparent w-[85%] md:w-3/4" />
      <div className="absolute inset-0 z-[2] bg-gradient-to-t from-[#00050D] via-[#00050D]/20 to-transparent" />

      {/* Slider Manual Controls (Sleek No-Background Arrows) */}
      <button 
        onClick={prevSlide}
        className="absolute left-1 md:left-4 top-1/2 -translate-y-1/2 z-[50] text-gray-400 hover:text-white transition-colors duration-200 p-2 cursor-pointer drop-shadow-2xl"
      >
        <ChevronLeft strokeWidth={1} className="w-14 h-14 md:w-20 md:h-20" />
      </button>

      <button 
        onClick={nextSlide}
        className="absolute right-1 md:right-4 top-1/2 -translate-y-1/2 z-[50] text-gray-400 hover:text-white transition-colors duration-200 p-2 cursor-pointer drop-shadow-2xl"
      >
        <ChevronRight strokeWidth={1} className="w-14 h-14 md:w-20 md:h-20" />
      </button>

      {/* Content Area */}
      <div className="absolute z-[3] top-[28%] md:top-[33%] left-14 md:left-28 max-w-2xl w-full pr-4 pointer-events-none">
        
        {/* We use key={movie.id} to force re-animation of text when slide changes */}
        <AnimatePresence mode="wait">
          <motion.div key={`content-${movie.id}`} className="pointer-events-auto">
            
            {/* Badge */}
            <motion.div
              variants={heroBadge} initial="hidden" animate="visible"
              className="flex items-center gap-2 mb-3"
            >
              <span className="text-primeBlue font-black text-sm bg-primeBlue/10 px-1.5 py-0.5 rounded">apex</span>
              <span className="text-gray-300 text-xs md:text-sm font-semibold">Included with Prime</span>
            </motion.div>

            {/* Title */}
            <motion.h1
              variants={heroTitle} initial="hidden" animate="visible"
              className="text-4xl md:text-6xl font-extrabold mb-4 tracking-tight leading-tight drop-shadow-lg"
            >
              {movie.title || movie.name || movie.original_name}
            </motion.h1>

            {/* Meta */}
            <motion.div
              variants={heroMeta} initial="hidden" animate="visible"
              className="flex flex-wrap items-center gap-3 text-[13px] md:text-sm text-gray-400 font-semibold mb-6"
            >
              <span className="text-yellow-500 font-bold flex items-center gap-1">
                IMDb <span className="text-white">{(movie.vote_average || 7.5).toFixed(1)}</span>
              </span>
              <span>{movie.release_date?.substring(0,4) || movie.first_air_date?.substring(0,4)}</span>
              <span className="border border-gray-600 px-1.5 py-0.5 rounded-sm">U/A 16+</span>
            </motion.div>

            {/* Overview — hide when trailer is playing to clean up UI */}
            <AnimatePresence>
              {!(showTrailer && trailerLoaded) && (
                <motion.p
                  variants={heroOverview} initial="hidden" animate="visible" exit={{ opacity: 0 }}
                  className="text-gray-200 text-sm md:text-[17px] mb-8 line-clamp-3 md:line-clamp-4 leading-relaxed font-medium"
                >
                  {movie.overview}
                </motion.p>
              )}
            </AnimatePresence>

            {/* Buttons */}
            <motion.div
              variants={heroButtons} initial="hidden" animate="visible"
              className="flex items-center gap-3 md:gap-4"
            >
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onClick={() => navigate(`/play/${type}/${movie.id}`)}
                className="flex items-center justify-center gap-2 bg-white text-black px-6 md:px-8 py-3 rounded-md font-bold hover:bg-gray-200 transition-colors text-base md:text-lg"
              >
                <Play fill="currentColor" className="w-5 h-5 md:w-6 md:h-6" /> Play
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}
                onClick={() => setInWatchlist(!inWatchlist)}
                className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#333333] flex items-center justify-center text-white hover:bg-gray-500 transition-all shadow-lg"
              >
                <AnimatePresence mode="wait">
                  {inWatchlist
                    ? <motion.div key="check" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
                        <Check strokeWidth={3} className="w-6 h-6" />
                      </motion.div>
                    : <motion.div key="plus" initial={{ scale: 0, rotate: 90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
                        <Plus strokeWidth={2.5} className="w-6 h-6" />
                      </motion.div>
                  }
                </AnimatePresence>
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}
                onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
                className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-[#333333] flex items-center justify-center text-white hover:bg-gray-500 transition-all shadow-lg"
              >
                <Info strokeWidth={2.5} className="w-6 h-6" />
              </motion.button>
            </motion.div>

          </motion.div>
        </AnimatePresence>
      </div>

      {/* Mute button — only visible when trailer is actively playing */}
      <motion.div
        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.8, duration: 0.4 }}
        className="absolute z-[4] bottom-[20%] right-6 md:right-12"
      >
        <AnimatePresence>
          {trailerKey && showTrailer && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                setIsMuted(!isMuted)
                // Force iframe reload with new mute state
                setTrailerLoaded(false)
                setShowTrailer(false)
                setTimeout(() => setShowTrailer(true), 100)
              }}
              className="w-12 h-12 rounded-full border border-gray-400 flex items-center justify-center text-white hover:bg-white/10 transition-colors backdrop-blur-sm"
            >
              <AnimatePresence mode="wait">
                {isMuted
                  ? <motion.div key="muted"   initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><VolumeX className="w-5 h-5" /></motion.div>
                  : <motion.div key="unmuted" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Volume2 className="w-5 h-5" /></motion.div>
                }
              </AnimatePresence>
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
      
      {/* Slider Position Dots (Optional, but helps with UX) */}
      <div className="absolute z-[4] bottom-6 md:bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2">
        {movies.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`transition-all duration-300 rounded-full ${currentIndex === idx ? 'w-6 h-2 bg-primeBlue' : 'w-2 h-2 bg-white/30 hover:bg-white/60'}`}
          />
        ))}
      </div>
    </header>
  )
}

export default Banner
