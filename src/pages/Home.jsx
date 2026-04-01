// src/pages/Home.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Banner from '../components/Banner';
import Row from '../components/Row';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

// All possible category generators — we'll cycle through these infinitely
const generateCategories = (movieGenres, tvGenres) => {
  const base = [
    { id: 'trending_all',    name: 'Trending Now',                  fetchUrl: `/trending/all/week?api_key=${API_KEY}&language=en-US`,           isLarge: false },
    { id: 'originals',       name: 'Apex Originals & Exclusives',   fetchUrl: `/discover/tv?api_key=${API_KEY}&with_networks=1024`,              isLarge: true  },
    { id: 'top_rated_movie', name: 'Top Rated Movies',              fetchUrl: `/movie/top_rated?api_key=${API_KEY}&language=en-US`,              isLarge: false },
    { id: 'trending_movie',  name: 'Trending Movies',               fetchUrl: `/trending/movie/week?api_key=${API_KEY}&language=en-US`,          isLarge: false },
    { id: 'trending_tv',     name: 'Trending TV Shows',             fetchUrl: `/trending/tv/week?api_key=${API_KEY}&language=en-US`,             isLarge: false },
    { id: 'top_rated_tv',    name: 'Top Rated TV Shows',            fetchUrl: `/tv/top_rated?api_key=${API_KEY}&language=en-US`,                 isLarge: false },
    { id: 'now_playing',     name: 'In Theatres Now',               fetchUrl: `/movie/now_playing?api_key=${API_KEY}&language=en-US`,            isLarge: true  },
    { id: 'upcoming',        name: 'Coming Soon',                   fetchUrl: `/movie/upcoming?api_key=${API_KEY}&language=en-US`,               isLarge: false },
    { id: 'popular_movie',   name: 'Popular Movies',                fetchUrl: `/movie/popular?api_key=${API_KEY}&language=en-US`,                isLarge: false },
    { id: 'popular_tv',      name: 'Popular TV Shows',              fetchUrl: `/tv/popular?api_key=${API_KEY}&language=en-US`,                   isLarge: false },
    { id: 'airing_today',    name: 'Airing Today',                  fetchUrl: `/tv/airing_today?api_key=${API_KEY}&language=en-US`,             isLarge: false },
    { id: 'on_the_air',      name: 'Currently On Air',              fetchUrl: `/tv/on_the_air?api_key=${API_KEY}&language=en-US`,               isLarge: false },
    { id: 'action',          name: 'Action & Adventure',            fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=28`,              isLarge: false },
    { id: 'comedy',          name: 'Comedy Specials',               fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=35`,              isLarge: false },
    { id: 'horror',          name: 'Horror Movies',                 fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=27`,              isLarge: false },
    { id: 'romance',         name: 'Romance & Drama',               fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=10749`,           isLarge: false },
    { id: 'scifi',           name: 'Sci-Fi Worlds',                 fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=878`,             isLarge: false },
    { id: 'thriller',        name: 'Thriller & Suspense',           fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=53`,              isLarge: false },
    { id: 'animation',       name: 'Animation',                     fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=16`,              isLarge: false },
    { id: 'documentary',     name: 'Documentaries',                 fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=99`,              isLarge: false },
    { id: 'family',          name: 'Family Favourites',             fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=10751`,           isLarge: false },
    { id: 'mystery',         name: 'Mystery & Crime',               fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=9648`,            isLarge: false },
    { id: 'war',             name: 'War & History',                 fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=10752`,           isLarge: false },
    { id: 'music',           name: 'Music & Musicals',              fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=10402`,           isLarge: false },
    { id: 'western',         name: 'Westerns',                      fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=37`,              isLarge: false },
    { id: 'tv_action',       name: 'Action TV Series',              fetchUrl: `/discover/tv?api_key=${API_KEY}&with_genres=10759`,              isLarge: false },
    { id: 'tv_comedy',       name: 'Comedy Series',                 fetchUrl: `/discover/tv?api_key=${API_KEY}&with_genres=35`,                 isLarge: false },
    { id: 'tv_drama',        name: 'Drama Series',                  fetchUrl: `/discover/tv?api_key=${API_KEY}&with_genres=18`,                 isLarge: false },
    { id: 'tv_mystery',      name: 'Crime & Mystery Series',        fetchUrl: `/discover/tv?api_key=${API_KEY}&with_genres=9648`,               isLarge: false },
    { id: 'tv_scifi',        name: 'Sci-Fi & Fantasy Series',       fetchUrl: `/discover/tv?api_key=${API_KEY}&with_genres=10765`,              isLarge: false },
    { id: 'tv_reality',      name: 'Reality Shows',                 fetchUrl: `/discover/tv?api_key=${API_KEY}&with_genres=10764`,              isLarge: false },
    { id: 'tv_talk',         name: 'Talk Shows',                    fetchUrl: `/discover/tv?api_key=${API_KEY}&with_genres=10767`,              isLarge: false },
    { id: 'tv_docs',         name: 'Documentary Series',            fetchUrl: `/discover/tv?api_key=${API_KEY}&with_genres=99`,                 isLarge: false },
    { id: 'tv_kids',         name: 'Kids & Family Shows',           fetchUrl: `/discover/tv?api_key=${API_KEY}&with_genres=10762`,              isLarge: false },
    { id: 'tv_animation',    name: 'Animated Series',               fetchUrl: `/discover/tv?api_key=${API_KEY}&with_genres=16`,                 isLarge: false },
    { id: 'tv_news',         name: 'News & Current Affairs',        fetchUrl: `/discover/tv?api_key=${API_KEY}&with_genres=10763`,              isLarge: false },
    // Decade buckets
    { id: 'decade_2020s',    name: 'Best of 2020s',                 fetchUrl: `/discover/movie?api_key=${API_KEY}&primary_release_date.gte=2020-01-01&sort_by=vote_average.desc&vote_count.gte=500`, isLarge: false },
    { id: 'decade_2010s',    name: 'Best of 2010s',                 fetchUrl: `/discover/movie?api_key=${API_KEY}&primary_release_date.gte=2010-01-01&primary_release_date.lte=2019-12-31&sort_by=vote_average.desc&vote_count.gte=500`, isLarge: false },
    { id: 'decade_2000s',    name: 'Best of 2000s',                 fetchUrl: `/discover/movie?api_key=${API_KEY}&primary_release_date.gte=2000-01-01&primary_release_date.lte=2009-12-31&sort_by=vote_average.desc&vote_count.gte=500`, isLarge: false },
    { id: 'decade_90s',      name: 'Classics of the 90s',           fetchUrl: `/discover/movie?api_key=${API_KEY}&primary_release_date.gte=1990-01-01&primary_release_date.lte=1999-12-31&sort_by=vote_average.desc&vote_count.gte=200`, isLarge: false },
    // Regional
    { id: 'hindi',           name: 'Hindi Cinema',                  fetchUrl: `/discover/movie?api_key=${API_KEY}&with_original_language=hi&sort_by=popularity.desc`, isLarge: false },
    { id: 'korean',          name: 'Korean Drama & Cinema',         fetchUrl: `/discover/movie?api_key=${API_KEY}&with_original_language=ko&sort_by=popularity.desc`, isLarge: false },
    { id: 'japanese',        name: 'Japanese Films & Anime',        fetchUrl: `/discover/movie?api_key=${API_KEY}&with_original_language=ja&sort_by=popularity.desc`, isLarge: false },
    { id: 'spanish',         name: 'Spanish Language Films',        fetchUrl: `/discover/movie?api_key=${API_KEY}&with_original_language=es&sort_by=popularity.desc`, isLarge: false },
    { id: 'french',          name: 'French Cinema',                 fetchUrl: `/discover/movie?api_key=${API_KEY}&with_original_language=fr&sort_by=popularity.desc`, isLarge: false },
    // High rated
    { id: 'top10_all',       name: 'All-Time Greatest',             fetchUrl: `/discover/movie?api_key=${API_KEY}&sort_by=vote_average.desc&vote_count.gte=5000`,    isLarge: false },
    { id: 'hidden_gems',     name: 'Hidden Gems',                   fetchUrl: `/discover/movie?api_key=${API_KEY}&vote_average.gte=7.5&vote_count.gte=100&vote_count.lte=1000&sort_by=vote_average.desc`, isLarge: false },
    // Network specials
    { id: 'netflix',         name: 'From Netflix',                  fetchUrl: `/discover/tv?api_key=${API_KEY}&with_networks=213`,               isLarge: false },
    { id: 'hbo',             name: 'From HBO',                      fetchUrl: `/discover/tv?api_key=${API_KEY}&with_networks=49`,                isLarge: false },
    { id: 'apple',           name: 'Apple TV+ Shows',               fetchUrl: `/discover/tv?api_key=${API_KEY}&with_networks=2552`,              isLarge: false },
    { id: 'disney',          name: 'Disney+ Shows',                 fetchUrl: `/discover/tv?api_key=${API_KEY}&with_networks=2739`,              isLarge: false },
    { id: 'hulu',            name: 'From Hulu',                     fetchUrl: `/discover/tv?api_key=${API_KEY}&with_networks=453`,               isLarge: false },
  ]

  // Append movie genres from API
  const movieGenreRows = (movieGenres || []).map(g => ({
    id: `mg_${g.id}`,
    name: `${g.name} Movies`,
    fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=${g.id}`,
    isLarge: false,
  }))

  // Append TV genres from API
  const tvGenreRows = (tvGenres || []).map(g => ({
    id: `tg_${g.id}`,
    name: `${g.name} TV`,
    fetchUrl: `/discover/tv?api_key=${API_KEY}&with_genres=${g.id}`,
    isLarge: false,
  }))

  // Deduplicate by id
  const all = [...base, ...movieGenreRows, ...tvGenreRows]
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
