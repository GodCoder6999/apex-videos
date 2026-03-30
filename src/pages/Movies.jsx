import React from 'react';
import Banner from '../components/Banner';
import Row from '../components/Row';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

function Movies() {
  return (
    <>
      <Banner fetchUrl={`/trending/movie/week?api_key=${API_KEY}&language=en-US`} />
      <div className="-mt-12 md:-mt-20 relative z-20 pb-10">
        <Row title="Trending Movies" fetchUrl={`/trending/movie/week?api_key=${API_KEY}&language=en-US`} isLargeRow />
        <Row title="Top Rated Movies" fetchUrl={`/movie/top_rated?api_key=${API_KEY}&language=en-US`} />
        <Row title="Action Thrillers" fetchUrl={`/discover/movie?api_key=${API_KEY}&with_genres=28`} />
        <Row title="Comedy Specials" fetchUrl={`/discover/movie?api_key=${API_KEY}&with_genres=35`} />
        <Row title="Horror Movies" fetchUrl={`/discover/movie?api_key=${API_KEY}&with_genres=27`} />
      </div>
    </>
  );
}

export default Movies;