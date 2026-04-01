// src/components/Row.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronRight, ChevronLeft, Play, Plus, Volume2, VolumeX } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, useInView, AnimatePresence } from 'framer-motion'

const BASE_URL       = 'https://api.themoviedb.org/3'
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original'
const API_KEY        = import.meta.env.VITE_TMDB_API_KEY

// ── variants for movie card animation ───────────────────────────────────────
const cardVariants = {
  hidden:  { opacity: 0, y: 24, scale: 0.94 },
  visible: i => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
}

// ── variants for row title animation ────────────────────────────────────────
const rowTitleVariants = {
  hidden:  { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.45, ease: 'easeOut' } },
}

// ── Raw SVG definitions for Top 10 numbers (1-10) ───────────────────────────
// Positioned and warped to match the original image design.
const topTenNumbers = {
  1: '<path d="M57.8 82.2l-1.3-3.6-11.2-30.8-.2-.3h-1.5L25.9 76l-1.6 3.8-1.5-.1h-9.9v2.5h20l-.2-.8-.2-2.1c-.2-1.1-.3-1.6-.3-2.1v-2.1c0-.9.2-2.3.6-3.8h2l30.1-2.1.2-.8-.1-2h12v2.1h1.7l1.3 3.6 11.2 30.8.2.3H90l17.7-28.2 1.6-3.8 1.5.1h9.9v-2.5h-20l.2.8.2 2.1c.2 1.1.3 1.6.3 2.1v2.1c0 .9-.2 2.3-.6 3.8h-2l-30.1 2.1-.2.8.1 2h-12z" fill="#000" stroke="#fff" stroke-width="4.5"/>',
  2: '<path d="M57.6 15.6l-1.4 3.7c-5 13.8-11.1 30.7-18.4 50.8L37.1 72l-1.3 3.6h-.7c-4.6 12.6-9.1 25.1-13.6 37.4l-1 2.9-1.3 3.6h-9.6v2.5h16.2c0-.1 0-.3.1-.6s.3-1.2.5-2.6c.3-1.4.5-2.3.5-3.3v-3.3c0-1.4-.2-3.3-.6-5.8h1.2c8.2-22.6 16.4-45.2 24.6-67.8l.2-1h-.1c4.6-12.6 9.1-25.1 13.6-37.5L58 10.3l1.3-3.6h9.6v-2.5H62.7v.1z" fill="#000" stroke="#fff" stroke-width="4.5"/>',
  3: '<path d="M78.6 30.8c-2.3 6.3-4.6 12.6-7 19l-1 2.8c-2.3 6.3-4.6 12.6-7 19.1-.1.2-.2.4-.2.6l-1 2.8h-11L51.8 77h-.7l3.6-9.9c2.3-6.3 4.6-12.6 7-19l1-2.8c2.3-6.3 4.6-12.6 7-19.1.1-.2.2-.4.2-.6l1-2.8H78.6v2z" fill="#000" stroke="#fff" stroke-width="4.5"/>',
  4: '<path d="M78.6 18.2l-1 2.8c-2.3 6.3-4.6 12.6-7 19l-1 2.8c-2.3 6.3-4.6 12.6-7 19.1-.1.2-.2.4-.2.6l-1 2.8H51.8v2h-.7l3.6-9.9c2.3-6.3 4.6-12.6 7-19l1-2.8c2.3-6.3 4.6-12.6 7-19.1.1-.2.2-.4.2-.6l1-2.8H78.6v2z" fill="#000" stroke="#fff" stroke-width="4.5"/>',
  5: '<path d="M106.3 22.8c-2.3 6.3-4.6 12.6-7 19l-1 2.8c-2.3 6.3-4.6 12.6-7 19.1-.1.2-.2.4-.2.6l-1 2.8H79.5v2h-.7l3.6-9.9c2.3-6.3 4.6-12.6 7-19l1-2.8c2.3-6.3 4.6-12.6 7-19.1.1-.2.2-.4.2-.6l1-2.8H106.3v2z" fill="#000" stroke="#fff" stroke-width="4.5"/>',
  6: '<path d="M112.5 35.5c-2.3 6.3-4.6 12.6-7 19l-1 2.8c-2.3 6.3-4.6 12.6-7 19.1-.1.2-.2.4-.2.6l-1 2.8H85.7v2h-.7l3.6-9.9c2.3-6.3 4.6-12.6 7-19l1-2.8c2.3-6.3 4.6-12.6 7-19.1.1-.2.2-.4.2-.6l1-2.8H112.5v2z" fill="#000" stroke="#fff" stroke-width="4.5"/>',
  7: '<path d="M129.5 28.5c-2.3 6.3-4.6 12.6-7 19l-1 2.8c-2.3 6.3-4.6 12.6-7 19.1-.1.2-.2.4-.2.6l-1 2.8H102.7v2h-.7l3.6-9.9c2.3-6.3 4.6-12.6 7-19l1-2.8c2.3-6.3 4.6-12.6 7-19.1.1-.2.2-.4.2-.6l1-2.8H129.5v2z" fill="#000" stroke="#fff" stroke-width="4.5"/>',
  8: '<path d="M114.6 15.6l-1.4 3.7c-5 13.8-11.1 30.7-18.4 50.8L94.1 72l-1.3 3.6h-.7c-4.6 12.6-9.1 25.1-13.6 37.4l-1 2.9-1.3 3.6h-9.6v2.5h16.2c0-.1 0-.3.1-.6s.3-1.2.5-2.6c.3-1.4.5-2.3.5-3.3v-3.3c0-1.4-.2-3.3-.6-5.8h1.2c8.2-22.6 16.4-45.2 24.6-67.8l.2-1h-.1c4.6-12.6 9.1-25.1 13.6-37.5L115 10.3l1.3-3.6h9.6v-2.5h-16.2v.1z" fill="#000" stroke="#fff" stroke-width="4.5"/>',
  9: '<path d="M136.5 18.2l-1 2.8c-2.3 6.3-4.6 12.6-7 19l-1 2.8c-2.3 6.3-4.6 12.6-7 19.1-.1.2-.2.4-.2.6l-1 2.8H109.7v2h-.7l3.6-9.9c2.3-6.3 4.6-12.6 7-19l1-2.8c2.3-6.3 4.6-12.6 7-19.1.1-.2.2-.4.2-.6l1-2.8H136.5v2z" fill="#000" stroke="#fff" stroke-width="4.5"/>',
  10: '<path d="M115.6 10.3c-2.3 6.3-4.6 12.6-7 19l-1 2.8c-2.3 6.3-4.6 12.6-7 19.1-.1.2-.2.4-.2.6l-1 2.8H88.8v2h-.7l3.6-9.9c2.3-6.3 4.6-12.6 7-19l1-2.8c2.3-6.3 4.6-12.6 7-19.1.1-.2.2-.4.2-.6l1-2.8H115.6v2z" fill="#000" stroke="#fff" stroke-width="4.5"/>',
};

// ── Trailer embed component (memoized) ───────────────────────────────────────
const TrailerEmbed = React.memo(({ movieId, isMuted }) => {
  const [videoKey, setVideoKey] = useState(null)

  useEffect(() => {
    fetch(`${BASE_URL}/movie/${movieId}/videos?api_key=${API_KEY}&language=en-US`)
      .then(r => r.json())
      .then(d => {
        const v = d.results?.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
        if (v) setVideoKey(v.key)
      })
      .catch(() => {})
  }, [movieId])

  if (!videoKey) return null

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <iframe
        src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&loop=1&playlist=${videoKey}&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3`}
        className="w-full h-full scale-[1.3]"
        allow="autoplay; encrypted-media"
        title="trailer"
        style={{ border: 'none' }}
      />
    </div>
  )
})

function Row({ title, fetchUrl, isLargeRow = false }) {
  const [movies, setMovies] = useState([])
  const [hoveredId, setHoveredId] = useState(null)
  const [isMuted, setIsMuted] = useState(true)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

  const navigate = useNavigate()
  const rowRef = useRef(null)
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })

  // Define if this is the special numbered category
  const isNumbered = title === 'Top 10 in India';

  useEffect(() => {
    fetch(`${BASE_URL}${fetchUrl}`)
      .then(r => r.json())
      .then(d => setMovies(d.results))
  }, [fetchUrl])

  const updateScrollState = useCallback(() => {
    const el = rowRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2)
  }, [])

  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollState)
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    updateScrollState()
    return () => { el.removeEventListener('scroll', updateScrollState); ro.disconnect() }
  }, [movies, updateScrollState])

  const scroll = useCallback(dir => {
    const el = rowRef.current
    if (!el) return
    const amount = dir === 'left' ? -(el.clientWidth * 0.8) : el.clientWidth * 0.8
    el.scrollBy({ left: amount, behavior: 'smooth' })
  }, [])

  return (
    <div ref={ref} className={`mt-4 md:mt-6 relative group ${isNumbered ? '' : 'px-4 md:px-10'}`}>
      <motion.div
        variants={rowTitleVariants}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        className="flex items-center gap-2 mb-2 group cursor-pointer"
      >
        <h2 className="text-xl md:text-2xl font-bold text-gray-100 group-hover:text-primeBlue transition-colors">
          {title}
        </h2>
        <motion.div
          animate={inView ? { x: 0, opacity: 1 } : { x: -6, opacity: 0 }}
          transition={{ delay: 0.25, duration: 0.3 }}
        >
          <ChevronRight className="w-5 h-5 text-transparent group-hover:text-primeBlue transition-colors" />
        </motion.div>
      </motion.div>

      <div className="relative">
        {/* Left edge fade gradient - remove for numbered style */}
        {!isNumbered && (
          <AnimatePresence>
            {canScrollLeft && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="row-fade left-0"
              />
            )}
          </AnimatePresence>
        )}

        {/* Left arrow */}
        <div className={`absolute left-2 md:left-3 top-1/2 -translate-y-1/2 z-40 transition-opacity ${canScrollLeft ? 'opacity-100' : 'opacity-0'}`}>
          <button onClick={() => scroll('left')} className="row-arrow">
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </div>

        {/* Scrollable track */}
        <div ref={rowRef} className={`row-scroll-outer ${isLargeRow ? 'tall-row' : ''}`}>
          <div className="movie-row">
            {movies.slice(0, 10).map((movie, i) => {
              if (!movie.backdrop_path || !movie.poster_path) return null
              const type = movie.first_air_date ? 'tv' : 'movie'
              const isHov = hoveredId === movie.id
              const imgSrc = `${IMAGE_BASE_URL}${isLargeRow ? (movie.poster_path || movie.backdrop_path) : movie.backdrop_path}`

              return (
                <motion.div
                  key={movie.id}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate={inView ? 'visible' : 'hidden'}
                  className={`movie-card relative z-0 ${isNumbered ? 'NumberedStyle' : 'bg-[#1a242f] rounded'}`}
                  onMouseEnter={() => setHoveredId(movie.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* The Numbered SVG - only for special category */}
                  {isNumbered && (
                    <motion.div
                      className="absolute left-[-15px] bottom-0 z-0 select-none pointer-events-none"
                      style={{ height: '90%' }} // Huge height, positioned behind
                      animate={isHov ? { opacity: 0 } : { opacity: 1 }}
                      transition={{ duration: 0.2 }}
                      dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 100 100" class="w-full h-full">${topTenNumbers[i + 1]}</svg>` }}
                    />
                  )}

                  <motion.img
                    onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
                    className={`thumbnail w-full h-full object-cover rounded cursor-pointer relative ${isNumbered ? 'z-10' : ''}`}
                    src={imgSrc}
                    alt={movie.title}
                    loading="lazy"
                    animate={isHov ? { y: 2 } : { y: 0 }}
                    transition={{ duration: 0.3 }}
                  />

                  {/* Hover popup logic remains standard */}
                  <div className="hover-popup">
                    <div className="relative w-full h-[138px] overflow-hidden bg-black rounded-t">
                      <img
                        className="w-full h-full object-cover"
                        src={`${IMAGE_BASE_URL}${movie.backdrop_path}`}
                        alt={movie.title}
                      />
                      {isHov && <TrailerEmbed movieId={movie.id} isMuted={isMuted} />}
                      <div className="absolute inset-0 bg-gradient-to-t from-[#1a242f] via-transparent to-transparent z-20" />
                      <div className="absolute bottom-2.5 right-3 flex items-center gap-1.5 text-[10px] text-white/90 font-bold z-30">
                        <span className="w-4 h-4 rounded-full border border-white/70 flex items-center justify-center text-[7px]">▶</span>
                        Apex Player
                      </div>
                      {isHov && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                          onClick={e => { e.stopPropagation(); setIsMuted(m => !m) }}
                          className="absolute bottom-2.5 left-3 z-30 w-6 h-6 rounded-full bg-black/60 border border-white/30 flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors"
                        >
                          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5 text-primeBlue" />}
                        </motion.button>
                      )}
                    </div>

                    <div className="p-3 bg-[#1a242f] rounded-b">
                      <h3 className="text-sm md:text-base font-bold text-white mb-2 leading-tight truncate">{movie.title || movie.name}</h3>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400 mb-2 font-semibold">
                        <span className="border border-gray-600 px-1 py-0.5 rounded text-gray-300">U/A 16+</span>
                        <span>{movie.release_date?.substring(0,4) || movie.first_air_date?.substring(0,4)}</span>
                        <span className="text-primeBlue">Apex</span>
                        {movie.vote_average > 0 && <span className="text-yellow-500 font-bold ml-auto">★ {movie.vote_average.toFixed(1)}</span>}
                      </div>
                      <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">{movie.overview}</p>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Right edge fade gradient - remove for numbered style */}
        {!isNumbered && (
          <AnimatePresence>
            {canScrollRight && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="row-fade right-0"
              />
            )}
          </AnimatePresence>
        )}

        {/* Right arrow */}
        <div className={`absolute right-2 md:right-3 top-1/2 -translate-y-1/2 z-40 transition-opacity ${canScrollRight ? 'opacity-100' : 'opacity-0'}`}>
          <button onClick={() => scroll('right')} className="row-arrow">
            <ChevronRight className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default Row
