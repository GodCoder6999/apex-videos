// src/components/Row.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronRight, ChevronLeft, Play, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, useInView, AnimatePresence } from 'framer-motion'

const BASE_URL       = 'https://api.themoviedb.org/3'
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original'
const API_KEY        = import.meta.env.VITE_TMDB_API_KEY

// Card stagger animation
const cardVariants = {
  hidden:  { opacity: 0, y: 30, scale: 0.95 },
  visible: i => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.08,
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
}

const rowTitle = {
  hidden:  { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: 'easeOut' } },
}

// TrailerEmbed — muted autoplay YouTube iframe
function TrailerEmbed({ movieId, type = 'movie' }) {
  const [videoKey, setVideoKey] = useState(null)
  const [loaded,   setLoaded]   = useState(false)

  useEffect(() => {
    if (!movieId) return
    setVideoKey(null)
    setLoaded(false)
    fetch(`${BASE_URL}/${type}/${movieId}/videos?api_key=${API_KEY}&language=en-US`)
      .then(r => r.json())
      .then(d => {
        const trailer = d.results?.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
        if (trailer) setVideoKey(trailer.key)
      })
      .catch(() => {})
  }, [movieId, type])

  if (!videoKey) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: loaded ? 1 : 0 }}
      transition={{ duration: 0.5 }}
      className="absolute inset-0 z-10"
    >
      <iframe
        src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoKey}&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3`}
        className="w-full h-full"
        allow="autoplay; encrypted-media"
        onLoad={() => setLoaded(true)}
        title="trailer"
        style={{ border: 'none', pointerEvents: 'none' }}
      />
    </motion.div>
  )
}

const Row = ({ title, fetchUrl, isLargeRow = false }) => {
  const [movies,    setMovies]    = useState([])
  const [hoveredId, setHoveredId] = useState(null)
  const [canScrollL, setCanScrollL] = useState(false)
  const [canScrollR, setCanScrollR] = useState(true)
  const navigate  = useNavigate()
  const rowRef    = useRef(null)
  const ref       = useRef(null)
  const inView    = useInView(ref, { once: true, margin: '-80px' })

  useEffect(() => {
    fetch(`${BASE_URL}${fetchUrl}`)
      .then(r => r.json())
      .then(d => setMovies(d.results || []))
  }, [fetchUrl])

  const updateScrollBtns = useCallback(() => {
    const el = rowRef.current
    if (!el) return
    setCanScrollL(el.scrollLeft > 10)
    setCanScrollR(el.scrollLeft < el.scrollWidth - el.clientWidth - 10)
  }, [])

  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollBtns, { passive: true })
    updateScrollBtns()
    return () => el.removeEventListener('scroll', updateScrollBtns)
  }, [movies, updateScrollBtns])

  const scroll = dir => {
    const el = rowRef.current
    if (!el) return
    const amount = el.clientWidth * 0.75
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  return (
    <div ref={ref} className="mt-6 md:mt-8 relative group/row">
      {/* Row title */}
      <motion.div
        variants={rowTitle}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        className="flex items-center gap-2 mb-2 pl-4 md:pl-10 group cursor-pointer w-max"
      >
        <h2 className="text-xl md:text-2xl font-bold text-gray-100 group-hover:text-primeBlue transition-colors">
          {title}
        </h2>
        <motion.div
          animate={inView ? { x: 0, opacity: 1 } : { x: -8, opacity: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          <ChevronRight className="w-5 h-5 text-transparent group-hover:text-primeBlue transition-colors" />
        </motion.div>
      </motion.div>

      {/* Scroll container wrapper */}
      <div className="relative">
        {/* Left Arrow */}
        <AnimatePresence>
          {canScrollL && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => scroll('left')}
              className="absolute left-0 top-0 bottom-0 z-40 w-12 md:w-16 flex items-center justify-center bg-gradient-to-r from-[#0f171e] to-transparent hover:from-[#0f171e]/95 transition-all group/arrow"
              style={{ marginTop: '28px' }}
            >
              <motion.div
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                className="w-9 h-9 rounded-full bg-black/60 border border-white/20 flex items-center justify-center backdrop-blur-sm text-white hover:bg-white hover:text-black transition-all shadow-xl"
              >
                <ChevronLeft className="w-5 h-5" />
              </motion.div>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Right Arrow */}
        <AnimatePresence>
          {canScrollR && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => scroll('right')}
              className="absolute right-0 top-0 bottom-0 z-40 w-12 md:w-16 flex items-center justify-center bg-gradient-to-l from-[#0f171e] to-transparent hover:from-[#0f171e]/95 transition-all group/arrow"
              style={{ marginTop: '28px' }}
            >
              <motion.div
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                className="w-9 h-9 rounded-full bg-black/60 border border-white/20 flex items-center justify-center backdrop-blur-sm text-white hover:bg-white hover:text-black transition-all shadow-xl"
              >
                <ChevronRight className="w-5 h-5" />
              </motion.div>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Scrollable row */}
        <div
          ref={rowRef}
          className="flex gap-4 overflow-x-scroll scrollbar-hide px-4 md:px-10 py-5"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {movies.map((movie, i) => {
            if (!movie.poster_path || !movie.backdrop_path) return null
            const type = movie.media_type || (movie.first_air_date ? 'tv' : 'movie')
            const isHovered = hoveredId === movie.id

            return (
              <motion.div
                key={movie.id}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate={inView ? 'visible' : 'hidden'}
                className={`movie-card flex-shrink-0 ${isLargeRow ? 'w-[170px] md:w-[210px] h-[250px] md:h-[320px]' : 'w-[220px] md:w-[300px] h-[125px] md:h-[170px]'}`}
                style={{ scrollSnapAlign: 'start' }}
                onMouseEnter={() => setHoveredId(movie.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <img
                  onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
                  className="thumbnail w-full h-full object-cover transition-opacity duration-300 rounded"
                  src={`${IMAGE_BASE_URL}${isLargeRow ? movie.poster_path : movie.backdrop_path}`}
                  alt={movie.name || movie.title}
                  loading="lazy"
                />

                {/* Hover popup */}
                <div className="hover-popup">
                  {/* Trailer / Backdrop preview */}
                  <div
                    className="relative w-full h-[140px] md:h-[180px] overflow-hidden bg-black cursor-pointer"
                    onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
                  >
                    {/* Backdrop fallback */}
                    <img
                      className="w-full h-full object-cover"
                      src={`${IMAGE_BASE_URL}${movie.backdrop_path}`}
                      alt={movie.name || movie.title}
                    />

                    {/* Trailer autoplay on hover */}
                    {isHovered && (
                      <TrailerEmbed movieId={movie.id} type={type} />
                    )}

                    <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-primeHover to-transparent z-20" />
                    <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-[11px] text-white font-bold z-30 drop-shadow-md">
                      <span className="w-5 h-5 rounded-full border-[1.5px] border-white flex items-center justify-center text-[8px]">▶</span>
                      Apex Player
                    </div>
                  </div>

                  <div className="p-4 bg-primeHover">
                    <h3
                      onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
                      className="text-lg md:text-xl font-bold text-white mb-3 leading-tight truncate cursor-pointer hover:underline"
                    >
                      {movie.title || movie.name}
                    </h3>

                    <div className="flex items-center gap-3 mb-4">
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={e => { e.stopPropagation(); navigate(`/play/${type}/${movie.id}`) }}
                        className="flex-1 flex items-center justify-center gap-2 bg-white text-black py-2.5 rounded font-bold hover:bg-gray-200 transition-colors"
                      >
                        <Play fill="currentColor" className="w-4 h-4" /> Play
                      </motion.button>
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        className="w-11 h-11 rounded-full border-2 border-gray-500 flex items-center justify-center text-white hover:border-white transition-colors bg-white/5"
                      >
                        <Plus className="w-5 h-5" />
                      </motion.button>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-gray-400 mb-3 font-semibold">
                      <span className="border border-gray-500 px-1.5 py-0.5 rounded text-gray-300">U/A 16+</span>
                      <span>{movie.release_date?.substring(0,4) || movie.first_air_date?.substring(0,4)}</span>
                      <span className="text-primeBlue text-[13px]">Apex</span>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">{movie.overview}</p>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Row
