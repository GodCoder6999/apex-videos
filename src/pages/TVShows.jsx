import React from 'react';
import Banner from '../components/Banner';
import Row from '../components/Row';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

function TVShows() {
  return (
    <>
      <Banner fetchUrl={`/trending/tv/week?api_key=${API_KEY}&language=en-US`} />
      <div className="-mt-12 md:-mt-20 relative z-20 pb-10">
        <Row title="Apex Originals and Exclusives" fetchUrl={`/discover/tv?api_key=${API_KEY}&with_networks=1024`} isLargeRow />
        <Row title="Trending TV Shows" fetchUrl={`/trending/tv/week?api_key=${API_KEY}&language=en-US`} />
        <Row title="Top Rated TV Shows" fetchUrl={`/tv/top_rated?api_key=${API_KEY}&language=en-US`} />
        <Row title="Comedy Series" fetchUrl={`/discover/tv?api_key=${API_KEY}&with_genres=35`} />
        <Row title="Drama Series" fetchUrl={`/discover/tv?api_key=${API_KEY}&with_genres=18`} />
      </div>
    </>
  );
}

export default TVShows;