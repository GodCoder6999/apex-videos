import React, { useState, useEffect, useRef } from 'react';
import Banner from '../components/Banner';
import Row from '../components/Row';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

function Home() {
  const [genres, setGenres] = useState([]);
  const [visibleRows, setVisibleRows] = useState(4); // Start by rendering 4 rows
  const loaderRef = useRef(null);

  useEffect(() => {
    // Fetch all TMDB Movie Genres to map them to rows
    fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${API_KEY}&language=en-US`)
      .then((res) => res.json())
      .then((data) => {
        // Essential categories at the top
        const baseCategories = [
          { id: 'trending', name: 'Recommended movies', fetchUrl: `/trending/all/week?api_key=${API_KEY}&language=en-US`, isLarge: false },
          { id: 'originals', name: 'Apex Originals and Exclusives', fetchUrl: `/discover/tv?api_key=${API_KEY}&with_networks=1024`, isLarge: true },
          { id: 'top_rated', name: 'Top Rated', fetchUrl: `/movie/top_rated?api_key=${API_KEY}&language=en-US`, isLarge: false }
        ];
        
        // Map dynamic genres
        const dynamicCategories = data.genres.map((genre) => ({
          id: genre.id,
          name: `${genre.name} Movies`,
          fetchUrl: `/discover/movie?api_key=${API_KEY}&with_genres=${genre.id}`,
          isLarge: false
        }));

        setGenres([...baseCategories, ...dynamicCategories]);
      });
  }, []);

  // Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          // Load 3 more rows when the user scrolls to the bottom
          setVisibleRows((prev) => Math.min(prev + 3, genres.length)); 
        }
      },
      { threshold: 1.0 }
    );

    if (loaderRef.current) observer.observe(loaderRef.current);
    
    return () => {
      if (loaderRef.current) observer.disconnect();
    };
  }, [genres]);

  return (
    <div className="bg-[#0f171e] min-h-screen">
      <Banner />
      
      <div className="-mt-12 md:-mt-24 relative z-20 pb-10">
        {genres.slice(0, visibleRows).map((genre) => (
          <Row 
            key={genre.id} 
            title={genre.name} 
            fetchUrl={genre.fetchUrl} 
            isLargeRow={genre.isLarge} 
          />
        ))}
        
        {/* Invisible trigger div for IntersectionObserver */}
        <div ref={loaderRef} className="h-20 w-full flex items-center justify-center mt-10">
          {visibleRows < genres.length && (
            <div className="animate-pulse flex space-x-2">
              <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
              <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
              <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Home;
