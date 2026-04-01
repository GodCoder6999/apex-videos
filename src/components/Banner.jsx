// src/components/Banner.jsx
import React, { useState, useEffect } from 'react'
import { Play, Plus, Info, Volume2, VolumeX, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'

const BASE_URL       = 'https://api.themoviedb.org/3'
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original'
const API_KEY        = import.meta.env.VITE_TMDB_API_KEY

// ── Animation variants ────────────────────────────────────────────────────────
const heroTitle = {
  hidden:  { opacity: 0, y: 50 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] } },
}
const heroBadge = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.15, ease: 'easeOut' } },
}
const heroMeta = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.3, ease: 'easeOut' } },
}
const heroOverview = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.42, ease: 'easeOut' } },
}
const heroButtons = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: 0.55, ease: 'easeOut' } },
}
const bgFade = {
  hidden:  { opacity: 0, scale: 1.04 },
  visible: { opacity: 1, scale: 1, transition: { duration: 1.1, ease: 'easeOut' } },
}

const Banner = ({ fetchUrl = `/trending/all/week?api_key=${API_KEY}&language=en-US` }) => {
  const [movie,       setMovie]       = useState(null)
  const [isMuted,     setIsMuted]     = useState(true)
  const [inWatchlist, setInWatchlist] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetch(`${BASE_URL}${fetchUrl}`)
      .then(r => r.json())
      .then(d => {
        const r = d.results[Math.floor(Math.random() * d.results.length)]
        setMovie(r)
      })
  }, [fetchUrl])

  if (!movie) return (
    <div className="h-[75vh] md:h-[90vh] bg-primeBg animate-pulse relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-primeBg via-primeBg/60 to-transparent" />
    </div>
  )

  const type = movie.media_type || (movie.first_air_date ? 'tv' : 'movie')

  return (
    <header className="relative h-[75vh] md:h-[90vh] w-full overflow-hidden text-white">
      {/* Background image — fades in and slightly zooms out */}
      <AnimatePresence>
        <motion.div
          key={movie.id}
          variants={bgFade}
          initial="hidden"
          animate="visible"
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${IMAGE_BASE_URL}${movie.backdrop_path}")` }}
        />
      </AnimatePresence>

      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-r from-primeBg via-primeBg/80 to-transparent w-3/4" />
      <div className="absolute inset-0 bg-gradient-to-t from-primeBg via-primeBg/20 to-transparent" />

      {/* Content */}
      <div className="absolute top-[28%] md:top-[33%] left-4 md:left-12 max-w-2xl w-full pr-4">
        {/* Badge */}
        <motion.div
          variants={heroBadge} initial="hidden" animate="visible"
          className="flex items-center gap-2 mb-3"
        >
          <span className="text-primeBlue font-black text-sm bg-primeBlue/10 px-1.5 py-0.5 rounded">apex</span>
          <span className="text-gray-300 text-xs md:text-sm font-semibold">Included with Prime</span>
        </motion.div>

        {/* Title — the hero slide-up */}
        <motion.h1
          variants={heroTitle} initial="hidden" animate="visible"
          className="text-4xl md:text-6xl font-extrabold mb-4 tracking-tight leading-tight"
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

        {/* Overview */}
        <motion.p
          variants={heroOverview} initial="hidden" animate="visible"
          className="text-gray-200 text-sm md:text-[17px] mb-8 line-clamp-3 md:line-clamp-4 leading-relaxed font-medium"
        >
          {movie.overview}
        </motion.p>

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
            className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gray-800/60 flex items-center justify-center text-white hover:bg-white hover:text-black border border-gray-500 transition-all"
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
            className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gray-800/60 flex items-center justify-center text-white hover:bg-white hover:text-black border border-gray-500 transition-all"
          >
            <Info strokeWidth={2.5} className="w-6 h-6" />
          </motion.button>
        </motion.div>
      </div>

      {/* Mute button */}
      <motion.div
        initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.8, duration: 0.4 }}
        className="absolute bottom-[20%] right-6 md:right-12 hidden md:block"
      >
        <motion.button
          whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
          onClick={() => setIsMuted(!isMuted)}
          className="w-12 h-12 rounded-full border border-gray-400 flex items-center justify-center text-white hover:bg-white/10 transition-colors backdrop-blur-sm"
        >
          <AnimatePresence mode="wait">
            {isMuted
              ? <motion.div key="muted"   initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><VolumeX className="w-5 h-5" /></motion.div>
              : <motion.div key="unmuted" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Volume2 className="w-5 h-5" /></motion.div>
            }
          </AnimatePresence>
        </motion.button>
      </motion.div>
    </header>
  )
}

export default Banner
