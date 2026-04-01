// src/components/Row.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronRight, ChevronLeft, Play, Plus, Volume2, VolumeX } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, useInView, AnimatePresence } from 'framer-motion'

const BASE_URL       = 'https://api.themoviedb.org/3'
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original'
const API_KEY        = import.meta.env.VITE_TMDB_API_KEY

// ── Variants ──────────────────────────────────────────────────────────────────
const cardVariants = {
  hidden:  { opacity: 0, y: 24, scale: 0.94 },
  visible: i => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.06, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
}

const rowTitleVariants = {
  hidden:  { opacity: 0, x: -16 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.45, ease: 'easeOut' } },
}

// ── Trailer embed (per-popup, respects global mute) ───────────────────────────
function TrailerEmbed({ movieId, type = 'movie', muted }) {
  const [videoKey, setVideoKey] = useState(null)
  const [loaded,   setLoaded]   = useState(false)

  useEffect(() => {
    if (!movieId) return
    setVideoKey(null)
    setLoaded(false)
    fetch(`${BASE_URL}/${type}/${movieId}/videos?api_key=${API_KEY}&language=en-US`)
      .then(r => r.json())
      .then(d => {
        const v = d.results?.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'))
        if (v) setVideoKey(v.key)
      })
      .catch(() => {})
  }, [movieId, type])

  if (!videoKey) return null

  return (
    <motion.div
      key={`${videoKey}-${muted}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: loaded ? 1 : 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="absolute inset-0 z-10 pointer-events-none"
    >
      <iframe
        src={`https://www.youtube.com/embed/${videoKey}?autoplay=1&mute=${muted ? 1 : 0}&controls=0&loop=1&playlist=${videoKey}&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3`}
        className="w-full h-full scale-[1.02]"
        allow="autoplay; encrypted-media"
        onLoad={() => setLoaded(true)}
        title="trailer"
        style={{ border: 'none' }}
      />
    </motion.div>
  )
}

// ── Scroll arrow (Row level) ──────────────────────────────────────────────────
function ScrollArrow({ dir, onClick, visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key={dir}
          initial={{ opacity: 0, scale: 0.8, x: dir === 'left' ? -8 : 8 }}
          animate={{ opacity: 1, scale: 1, x: 0 }}
          exit={{ opacity: 0, scale: 0.8, x: dir === 'left' ? -8 : 8 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          onClick={e => { 
            e.preventDefault(); 
            e.stopPropagation(); 
            onClick(); 
          }}
          className={`
            pointer-events-auto
            w-10 h-10 md:w-14 md:h-14 rounded-full
            bg-black/60 border border-white/20
            flex items-center justify-center
            text-white backdrop-blur-md
            shadow-[0_4px_24px_rgba(0,0,0,0.8)]
            hover:bg-white hover:text-black hover:border-white
            hover:scale-110 active:scale-95
            transition-all duration-200
          `}
          style={{ willChange: 'transform, opacity' }}
        >
          {dir === 'left'
            ? <ChevronLeft  className="w-6 h-6 md:w-8 md:h-8" />
            : <ChevronRight className="w-6 h-6 md:w-8 md:h-8" />
          }
        </motion.button>
      )}
    </AnimatePresence>
  )
}

// ── Main Row component ────────────────────────────────────────────────────────
const Row = ({ title, fetchUrl, isLargeRow = false }) => {
  const [movies,      setMovies]      = useState([])
  const [hoveredId,   setHoveredId]   = useState(null)
  const [globalMuted, setGlobalMuted] = useState(true)
  const [canScrollL,  setCanScrollL]  = useState(false)
  const [canScrollR,  setCanScrollR]  = useState(true)
  const [isRowHovered, setIsRowHovered] = useState(false)

  const navigate = useNavigate()
  const rowRef   = useRef(null)
  const ref      = useRef(null)
  const inView   = useInView(ref, { once: true, margin: '-60px' })

  useEffect(() => {
    fetch(`${BASE_URL}${fetchUrl}`)
      .then(r => r.json())
      .then(d => setMovies(d.results || []))
  }, [fetchUrl])

  const updateArrows = useCallback(() => {
    const el = rowRef.current
    if (!el) return
    setCanScrollL(el.scrollLeft > 8)
    setCanScrollR(el.scrollLeft < el.scrollWidth - el.clientWidth - 8)
  }, [])

  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    el.addEventListener('scroll', updateArrows, { passive: true })
    const ro = new ResizeObserver(updateArrows)
    ro.observe(el)
    updateArrows()
    return () => { el.removeEventListener('scroll', updateArrows); ro.disconnect() }
  }, [movies, updateArrows])

  const scroll = useCallback(dir => {
    const el = rowRef.current
    if (!el) return
    el.scrollBy({ left: dir === 'left' ? -(el.clientWidth * 0.8) : el.clientWidth * 0.8, behavior: 'smooth' })
  }, [])

  const hasTrailerPlaying = hoveredId !== null

  return (
    <div
      ref={ref}
      className="mt-5 md:mt-7 relative group"
      onMouseEnter={() => setIsRowHovered(true)}
      onMouseLeave={() => setIsRowHovered(false)}
    >
      {/* Row title + mute button */}
      <div className="flex items-center justify-between pl-4 md:pl-10 pr-4 md:pr-10 mb-2">
        <motion.div
          variants={rowTitleVariants}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="flex items-center gap-2 group cursor-pointer"
        >
          <h2 className="text-xl md:text-2xl font-bold text-gray-100 group-hover:text-primeBlue transition-colors duration-200">
            {title}
          </h2>
          <motion.div
            animate={inView ? { x: 0, opacity: 1 } : { x: -6, opacity: 0 }}
            transition={{ delay: 0.25, duration: 0.3 }}
          >
            <ChevronRight className="w-5 h-5 text-transparent group-hover:text-primeBlue transition-colors duration-200" />
          </motion.div>
        </motion.div>

        <AnimatePresence>
          {isRowHovered && hasTrailerPlaying && (
            <motion.button
              initial={{ opacity: 0, scale: 0.85, x: 8 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.85, x: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={() => setGlobalMuted(m => !m)}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-gray-400 hover:text-white transition-colors duration-150 px-2.5 py-1 rounded-full border border-white/10 hover:border-white/30 bg-black/30 backdrop-blur-sm z-[60000]"
            >
              {globalMuted
                ? <><VolumeX className="w-3.5 h-3.5" /> Unmute</>
                : <><Volume2 className="w-3.5 h-3.5 text-primeBlue" /> Mute</>
              }
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <div className="relative">
        
        {/* Adjusted absolute wrapper height to exactly match the new card sizes */}
        <div className={`absolute left-0 right-0 top-[20px] pointer-events-none flex items-center justify-between z-[50000] ${isLargeRow ? 'h-[584px]' : 'h-[158px]'}`}>
          
          <AnimatePresence>
            {canScrollL && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                className="absolute left-0 top-0 bottom-0 w-16 md:w-24 bg-gradient-to-r from-primeBg to-transparent pointer-events-none"
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {canScrollR && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
                className="absolute right-0 top-0 bottom-0 w-16 md:w-24 bg-gradient-to-l from-primeBg to-transparent pointer-events-none"
              />
            )}
          </AnimatePresence>

          <div className="absolute left-2 md:left-4 z-[50000]">
            <ScrollArrow dir="left" onClick={() => scroll('left')} visible={canScrollL && isRowHovered} />
          </div>
          <div className="absolute right-2 md:right-4 z-[50000]">
            <ScrollArrow dir="right" onClick={() => scroll('right')} visible={canScrollR && isRowHovered} />
          </div>

        </div>

        {/* Scrollable track */}
        <div
          ref={rowRef}
          className={`row-scroll-outer px-4 md:px-10 ${isLargeRow ? 'tall-row' : ''}`}
        >
          <div className="movie-row">
            {movies.map((movie, i) => {
              if (!movie.backdrop_path) return null
              const mtype    = movie.media_type || (movie.first_air_date ? 'tv' : 'movie')
              const isHov    = hoveredId === movie.id
              const imgSrc   = `${IMAGE_BASE_URL}${isLargeRow ? (movie.poster_path || movie.backdrop_path) : movie.backdrop_path}`

              return (
                <motion.div
                  key={movie.id}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate={inView ? 'visible' : 'hidden'}
                  /* EXPLICIT CARD SIZES APPLIED HERE */
                  className={`movie-card ${isLargeRow ? 'w-[368px] h-[584px]' : 'w-[280px] h-[158px]'}`}
                  onMouseEnter={() => setHoveredId(movie.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Thumbnail */}
                  <motion.img
                    onClick={() => navigate(`/detail/${mtype}/${movie.id}`, { state: { movie } })}
                    className="thumbnail w-full h-full object-cover rounded cursor-pointer"
                    src={imgSrc}
                    alt={movie.name || movie.title}
                    loading="lazy"
                    transition={{ duration: 0.3 }}
                  />

                  {/* Hover popup linking to our CSS classes for explicit bounds */}
                  <div className={`hover-popup ${isLargeRow ? 'large-popup' : 'normal-popup'}`}>
                    
                    {/* Preview area -> scaled up to occupy the massive new popup bounds nicely */}
                    <div
                      className={`relative w-full overflow-hidden bg-black cursor-pointer ${isLargeRow ? 'h-[75%]' : 'h-[335px]'}`}
                      onClick={() => navigate(`/detail/${mtype}/${movie.id}`, { state: { movie } })}
                    >
                      <img
                        className="w-full h-full object-cover"
                        src={`${IMAGE_BASE_URL}${movie.backdrop_path}`}
                        alt={movie.name || movie.title}
                      />

                      {isHov && <TrailerEmbed movieId={movie.id} type={mtype} muted={globalMuted} />}

                      <div className="absolute inset-0 bg-gradient-to-t from-[#1a242f] via-black/20 to-transparent z-20" />

                      <div className="absolute bottom-4 right-4 flex items-center gap-1.5 text-xs text-white/90 font-bold z-30">
                        <span className="w-5 h-5 rounded-full border border-white/70 flex items-center justify-center text-[9px]">▶</span>
                        Apex Player
                      </div>

                      {isHov && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.7 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.7 }}
                          transition={{ duration: 0.2, delay: 0.3 }}
                          onClick={e => { e.stopPropagation(); setGlobalMuted(m => !m) }}
                          className="absolute bottom-4 left-4 z-30 w-8 h-8 rounded-full bg-black/60 border border-white/30 flex items-center justify-center text-white hover:bg-white hover:text-black transition-colors duration-150"
                        >
                          {globalMuted
                            ? <VolumeX className="w-4 h-4" />
                            : <Volume2 className="w-4 h-4 text-primeBlue" />
                          }
                        </motion.button>
                      )}
                    </div>

                    {/* Info section (takes up remaining space in the Flex column popup) */}
                    <div className="flex-1 p-5 bg-[#1a242f] flex flex-col justify-center">
                      <h3
                        onClick={() => navigate(`/detail/${mtype}/${movie.id}`, { state: { movie } })}
                        className="text-xl font-bold text-white mb-3 leading-tight truncate cursor-pointer hover:underline"
                      >
                        {movie.title || movie.name}
                      </h3>

                      <div className="flex items-center gap-3 mb-4">
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.96 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          onClick={e => { e.stopPropagation(); navigate(`/play/${mtype}/${movie.id}`) }}
                          className="flex-1 flex items-center justify-center gap-2 bg-white text-black py-2.5 rounded-md font-bold text-sm hover:bg-gray-100 transition-colors duration-150"
                        >
                          <Play fill="currentColor" className="w-4 h-4" /> Play
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.92 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          className="w-10 h-10 rounded-full border-2 border-gray-500 flex items-center justify-center text-white hover:border-white transition-colors duration-150 bg-white/5"
                        >
                          <Plus className="w-5 h-5" />
                        </motion.button>
                      </div>

                      <div className="flex items-center gap-2.5 text-xs text-gray-400 mb-3 font-semibold">
                        <span className="border border-gray-600 px-1.5 py-0.5 rounded text-gray-300">U/A 16+</span>
                        <span>{movie.release_date?.substring(0,4) || movie.first_air_date?.substring(0,4)}</span>
                        <span className="text-primeBlue">Apex</span>
                        {movie.vote_average > 0 && (
                          <span className="text-yellow-500 font-bold ml-auto">★ {movie.vote_average.toFixed(1)}</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-400 line-clamp-3 leading-relaxed">{movie.overview}</p>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Row
