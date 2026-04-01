// src/pages/Home.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Banner from '../components/Banner';
import Row from '../components/Row';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

// Reorganized to match Prime Video storefront categories
const generateCategories = (movieGenres, tvGenres) => {
  const base = [
    // Subscription & Exclusivity
    { id: 'watch_with_prime', name: 'Watch with a Prime membership', fetchUrl: `/discover/tv?api_key=${API_KEY}&with_networks=1024`, isLarge: true },

    // Chart & Popularity Categories
    { id: 'top_movies',       name: 'Top movies',                    fetchUrl: `/trending/movie/week?api_key=${API_KEY}&language=en-US`, isLarge: false },
    { id: 'top_10_india',     name: 'Top 10 in India',               fetchUrl: `/trending/all/day?api_key=${API_KEY}&language=en-US`,    isLarge: false },
    { id: 'blockbuster_free', name: 'Blockbuster movies - Free with ads', fetchUrl: `/movie/popular?api_key=${API_KEY}&language=en-US&with_original_language=en`, isLarge: false },

    // Partner Channel Categories (Simulated using specific networks or genres)
    { id: 'popular_mx_player',name: 'Most popular on MX Player - Watch for free', fetchUrl: `/discover/tv?api_key=${API_KEY}&with_original_language=hi&sort_by=popularity.desc`, isLarge: false },
    { id: 'goldmines_play',   name: 'Goldmines Play: Most popular',   fetchUrl: `/discover/movie?api_key=${API_KEY}&with_original_language=te&sort_by=popularity.desc`, isLarge: false },

    // Regional & Localization Categories
    { id: 'watch_hindi',      name: 'Watch in Hindi',                 fetchUrl: `/discover/movie?api_key=${API_KEY}&with_original_language=hi`, isLarge: false },
    { id: 'watch_english',    name: 'Watch in English',               fetchUrl: `/discover/movie?api_key=${API_KEY}&with_original_language=en`, isLarge: false },
    { id: 'watch_telugu',     name: 'Watch in Telugu',                fetchUrl: `/discover/movie?api_key=${API_KEY}&with_original_language=te`, isLarge: false },
    { id: 'watch_tamil',      name: 'Watch in Tamil',                 fetchUrl: `/discover/movie?api_key=${API_KEY}&with_original_language=ta`, isLarge: false },
    { id: 'watch_malayalam',  name: 'Watch in Malayalam',             fetchUrl: `/discover/movie?api_key=${API_KEY}&with_original_language=ml`, isLarge: false },
    { id: 'korean_dramas',    name: 'Korean dramas',                  fetchUrl: `/discover/tv?api_key=${API_KEY}&with_original_language=ko`,    isLarge: false },
    { id: 'bollywood_free',   name: 'Popular Bollywood movies - Free with ads', fetchUrl: `/discover/movie?api_key=${API_KEY}&with_original_language=hi&sort_by=popularity.desc`, isLarge: false },

    // Genre-Specific Categories
    { id: 'drama_tv',         name: 'Drama TV',                       fetchUrl: `/discover/tv?api_key=${API_KEY}&with_genres=18`,     isLarge: false },
    { id: 'drama_movies',     name: 'Drama movies',                   fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=18`,  isLarge: false },
    { id: 'action_free',      name: 'Popular action movies - Free with ads', fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=28`, isLarge: false },
    { id: 'anime_tv',         name: 'Anime TV - Free with ads',       fetchUrl: `/discover/tv?api_key=${API_KEY}&with_genres=16&with_original_language=ja`, isLarge: false },

    // Discovery & Curation Categories
    { id: 'latest_tv',        name: 'Latest TV',                      fetchUrl: `/tv/airing_today?api_key=${API_KEY}&language=en-US`, isLarge: false },
    { id: 'all_time_favs',    name: 'All time favourites',            fetchUrl: `/movie/top_rated?api_key=${API_KEY}&language=en-US`, isLarge: false },
  ]

  // Deduplicate by id
  const all = [...base]
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
    // Fetch both movie and TV genres
    Promise.all([
      fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${API_KEY}&language=en-US`).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/genre/tv/list?api_key=${API_KEY}&language=en-US`).then(r => r.json()),
    ]).then(([movieData, tvData]) => {
      const cats = generateCategories(movieData.genres || [], tvData.genres || [])
      setAllCategories(cats)
    }).catch(() => {
      setAllCategories(generateCategories([], []))
    })
  }, [])

  // Infinite scroll — load more when sentinel enters view
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && visibleCount < allCategories.length) {
          setVisibleCount(prev => Math.min(prev + BATCH_SIZE, allCategories.length))
        }
      },
      { threshold: 0.1, rootMargin: '300px' }
    )
    if (loaderRef.current) observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [allCategories.length, visibleCount])

  const visibleCategories = allCategories.slice(0, visibleCount)

  return (
    <div className="bg-[#00050D] min-h-screen">
      <Banner />

      <div className="-mt-12 md:-mt-24 relative z-20 pb-10">
        {visibleCategories.map(cat => (
          <Row
            key={cat.id}
            title={cat.name}
            fetchUrl={cat.fetchUrl}
            isLargeRow={cat.isLarge}
          />
        ))}

        {/* Infinite scroll sentinel */}
        <div ref={loaderRef} className="h-24 w-full flex items-center justify-center mt-4">
          {visibleCount < allCategories.length && (
            <div className="flex items-center gap-3">
              <div className="animate-pulse flex space-x-2">
                <div className="w-2.5 h-2.5 bg-primeBlue/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2.5 h-2.5 bg-primeBlue/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2.5 h-2.5 bg-primeBlue/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-gray-600 text-xs font-medium">Loading more…</span>
            </div>
          )}
          {visibleCount >= allCategories.length && allCategories.length > 0 && (
            <p className="text-gray-700 text-xs">You've explored everything! 🎬</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default Home;
