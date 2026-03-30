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
    <div className="min-h-screen bg-[#0f171e] text-white pb-10">
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/movies" element={<Movies />} />
        <Route path="/tv-shows" element={<TVShows />} />
        <Route path="/detail/:type/:id" element={<MovieDetail />} />
        <Route path="/play/:type/:id" element={<Player />} />
      </Routes>
    </div>
  );
}

export default App;
