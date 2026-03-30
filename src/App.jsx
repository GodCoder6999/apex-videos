import React from 'react';
import Navbar from './components/Navbar';
import Banner from './components/Banner';
import Row from './components/Row';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

const requests = {
  fetchTrending: `/trending/all/week?api_key=${API_KEY}&language=en-US`,
  fetchAmazonOriginals: `/discover/tv?api_key=${API_KEY}&with_networks=1024`,
  fetchTopRated: `/movie/top_rated?api_key=${API_KEY}&language=en-US`,
  fetchActionMovies: `/discover/movie?api_key=${API_KEY}&with_genres=28`,
  fetchComedyMovies: `/discover/movie?api_key=${API_KEY}&with_genres=35`,
};

function App() {
  return (
    <div className="min-h-screen bg-primeBg pb-10">
      <Navbar />
      <Banner />
      <div className="-mt-20 md:-mt-32 relative z-20">
        <Row title="Recommended movies" fetchUrl={requests.fetchTrending} />
        <Row title="Apex Originals and Exclusives" fetchUrl={requests.fetchAmazonOriginals} isLargeRow />
        <Row title="Top Rated Movies" fetchUrl={requests.fetchTopRated} />
        <Row title="Action Thrillers" fetchUrl={requests.fetchActionMovies} />
        <Row title="Comedy Specials" fetchUrl={requests.fetchComedyMovies} />
      </div>
    </div>
  );
}

export default App;