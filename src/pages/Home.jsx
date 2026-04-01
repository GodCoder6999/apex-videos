// src/pages/Home.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Banner from '../components/Banner';
import Row from '../components/Row';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

// Updated to better match the requested user categories, while still using genre APIs for variety
const generateCategories = (movieGenres, tvGenres) => {
  const base = [
    { id: 'trending_all',    name: 'Top 10 in India',               fetchUrl: `/trending/all/day?api_key=${API_KEY}&language=en-US`,    isLarge: false },
    { id: 'prime_hindi',     name: 'Prime - Watch in Your Language', fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=10749`,           isLarge: true  },
    { id: 'watchlist',       name: 'Watch with a Prime membership',   fetchUrl: `/discover/tv?api_key=${API_KEY}&with_networks=1024`,              isLarge: true  },
    { id: 'top_rated_movie', name: 'MX Player: Top movies',          fetchUrl: `/movie/top_rated?api_key=${API_KEY}&language=en-US`,              isLarge: false },
    { id: 'upcoming',        name: 'Coming Soon',                   fetchUrl: `/movie/upcoming?api_key=${API_KEY}&language=en-US`,               isLarge: false },
    { id: 'action',          name: 'Action Movies',                 fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=28`,              isLarge: false },
    { id: 'comedy',          name: 'Comedy Specials',               fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=35`,              isLarge: false },
    { id: 'horror',          name: 'Horror Favourites',             fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=27`,              isLarge: false },
    { id: 'scifi',           name: 'Sci-Fi Worlds',                 fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=878`,             isLarge: false },
    { id: 'documentary',     name: 'Documentaries',                 fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=99`,              isLarge: false },
  ]

  // Append movie genres from API for deduplicated dynamic variety
  const movieGenreRows = (movieGenres || []).map(g => ({
    id: `mg_${g.id}`,
    name: `${g.name} Movies`,
    fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=${g.id}`,
    isLarge: false,
  }))

  // Deduplicate by id
  const all = [...base, ...movieGenreRows]
  const seen = new Set()
  return all.filter(c => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })
}

const BATCH_SIZE = 5

function Home() {
  const [allCategories, setAllCategories] = useState([])
  const [visibleCount,  setVisibleCount]  = useState(BATCH_SIZE)
  const loaderRef = useRef(null)

  useEffect(() => {
    // Fetch genres for deduplicated dynamic variety
    fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${API_KEY}&language=en-US`)
      .then(r => r.json())
      .then(data => {
        const cats = generateCategories(data.genres || [], [])
        setAllCategories(cats)
      }).catch(() => {
        setAllCategories(generateCategories([], []))
      })
  }, [])

  // Infinite scroll — load more when sentinel enters view, allowing for infinite looping
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => prev + BATCH_SIZE)
        }
      },
      { threshold: 0.1, rootMargin: '300px' }
    )
    if (loaderRef.current) observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [allCategories.length])

  // Generate the list of visible categories, wrapping around infinitesimally
  const visibleCategories = [];
  if (allCategories.length > 0) {
    for (let i = 0; i < visibleCount; i++) {
      const catIndex = i % allCategories.length;
      visibleCategories.push(allCategories[catIndex]);
    }
  }

  return (
    <div className="bg-[#0f171e] min-h-screen">
      <Banner />

      <div className="-mt-12 md:-mt-24 relative z-20 pb-10">
        {visibleCategories.map((cat, index) => (
          <Row
            // Use a unique key based on index to force re-render during looping
            key={`${cat.id}-${index}`}
            title={cat.name}
            fetchUrl={cat.fetchUrl}
            isLargeRow={cat.isLarge}
          />
        ))}

        {/* Infinite scroll sentinel */}
        <div ref={loaderRef} className="h-24 w-full flex items-center justify-center mt-4">
          <div className="animate-pulse flex space-x-2">
            <div className="w-2.5 h-2.5 bg-primeBlue/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2.5 h-2.5 bg-primeBlue/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2.5 h-2.5 bg-primeBlue/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
