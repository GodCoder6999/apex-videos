import React, { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';

const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/original";

const Row = ({ title, fetchUrl, isLargeRow = false }) => {
  const [movies, setMovies] = useState([]);

  useEffect(() => {
    fetch(`${BASE_URL}${fetchUrl}`)
      .then((res) => res.json())
      .then((data) => setMovies(data.results));
  }, [fetchUrl]);

  return (
    <div className="pl-4 md:pl-10 mt-6 md:mt-10">
      <div className="flex items-center gap-2 mb-2 group cursor-pointer w-max">
        <h2 className="text-xl md:text-2xl font-bold text-gray-100 group-hover:text-primeBlue transition-colors">
          {title}
        </h2>
        <ChevronRight className="w-5 h-5 text-transparent group-hover:text-primeBlue transition-colors" />
      </div>
      
      <div className="flex overflow-x-scroll scrollbar-hide space-x-3 md:space-x-4 py-4">
        {movies.map((movie) => (
           movie.poster_path && movie.backdrop_path && (
            <img
              key={movie.id}
              className={`object-cover rounded cursor-pointer transition-transform duration-300 hover:scale-105 hover:z-10 shadow-lg border-2 border-transparent hover:border-gray-400
                ${isLargeRow ? "h-64 md:h-80 min-w-[170px] md:min-w-[210px]" : "h-32 md:h-44 min-w-[220px] md:min-w-[300px]"}`}
              src={`${IMAGE_BASE_URL}${isLargeRow ? movie.poster_path : movie.backdrop_path}`}
              alt={movie.name}
              loading="lazy"
            />
          )
        ))}
      </div>
    </div>
  );
};

export default Row;