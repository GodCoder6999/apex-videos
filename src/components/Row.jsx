// src/components/Row.jsx
import React, { useState, useEffect, useRef } from 'react'
import { ChevronRight, Play, Plus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'

const BASE_URL       = 'https://api.themoviedb.org/3'
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/original'

// Card stagger: each card appears 0.2s after the previous
const cardVariants = {
  hidden:  { opacity: 0, y: 30, scale: 0.95 },
  visible: i => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: i * 0.2,          // 0.2s stagger per card
      duration: 0.45,
      ease: [0.22, 1, 0.36, 1],
    },
  }),
}

const rowTitle = {
  hidden:  { opacity: 0, x: -20 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.5, ease: 'easeOut' } },
}

const Row = ({ title, fetchUrl, isLargeRow = false }) => {
  const [movies, setMovies] = useState([])
  const navigate = useNavigate()

  // Only animate cards when the row scrolls into view
  const ref     = useRef(null)
  const inView  = useInView(ref, { once: true, margin: '-80px' })

  useEffect(() => {
    fetch(`${BASE_URL}${fetchUrl}`)
      .then(r => r.json())
      .then(d => setMovies(d.results || []))
  }, [fetchUrl])

  return (
    <div ref={ref} className="pl-4 md:pl-10 mt-6 md:mt-8 relative">
      {/* Row title */}
      <motion.div
        variants={rowTitle}
        initial="hidden"
        animate={inView ? 'visible' : 'hidden'}
        className="flex items-center gap-2 mb-2 group cursor-pointer w-max"
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

      <div className="movie-row">
        {movies.map((movie, i) => {
          if (!movie.poster_path || !movie.backdrop_path) return null
          const type = movie.media_type || (movie.first_air_date ? 'tv' : 'movie')

          return (
            <motion.div
              key={movie.id}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              animate={inView ? 'visible' : 'hidden'}
              className={`movie-card ${isLargeRow ? 'w-[170px] md:w-[210px] h-[250px] md:h-[320px]' : 'w-[220px] md:w-[300px] h-[125px] md:h-[170px]'}`}
            >
              <img
                onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
                className="thumbnail w-full h-full object-cover transition-opacity duration-300 rounded"
                src={`${IMAGE_BASE_URL}${isLargeRow ? movie.poster_path : movie.backdrop_path}`}
                alt={movie.name || movie.title}
                loading="lazy"
              />

              <div className="hover-popup">
                <div
                  className="relative w-full h-[140px] md:h-[180px] overflow-hidden bg-black cursor-pointer"
                  onClick={() => navigate(`/detail/${type}/${movie.id}`, { state: { movie } })}
                >
                  <img
                    className="w-full h-full object-cover"
                    src={`${IMAGE_BASE_URL}${movie.backdrop_path}`}
                    alt={movie.name || movie.title}
                  />
                  <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-primeHover to-transparent" />
                  <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-[11px] text-white font-bold z-10 drop-shadow-md">
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
  )
}

export default Row
