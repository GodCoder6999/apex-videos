import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Movies from './pages/Movies';
import TVShows from './pages/TVShows';
import MovieDetail from './pages/MovieDetail';
import Player from './pages/Player';

function App() {
  return (
    <div className="min-h-screen bg-primeBg text-white pb-10">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/movies" element={<Movies />} />
        <Route path="/play/:type/:id" element={<Player />} />
        <Route path="/tv-shows" element={<TVShows />} />
        {/* Dynamic route that accepts either 'movie' or 'tv' */}
        <Route path="/detail/:type/:id" element={<MovieDetail />} />
      </Routes>
    </div>
  );
}

export default App;
