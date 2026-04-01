// src/pages/MovieDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Row from '../components/Row';

const API_KEY        = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL       = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/original";

const MovieDetail = () => {
  const { type = 'movie', id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [movie,         setMovie]         = useState(location.state?.movie || null);
  const [activeTab,     setActiveTab]     = useState('related');
  const [error,         setError]         = useState(false);
  const [trailerKey,    setTrailerKey]    = useState(null);
  const [trailerLoaded, setTrailerLoaded] = useState(false);
  const [showTrailer,   setShowTrailer]   = useState(false);
  const [isMuted,       setIsMuted]       = useState(true);
  const trailerTimer = useRef(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    setTrailerKey(null);
    setTrailerLoaded(false);
    setShowTrailer(false);
    clearTimeout(trailerTimer.current);

    if (id) {
      fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}&language=en-US`)
        .then(res => res.json())
        .then(data => {
          if (data.success === false || data.errors) {
            setError(true);
          } else {
            setMovie(data);
          }
        })
        .catch(() => setError(true));
    }
  }, [id, type]);

  // Fetch trailer once movie loads
  useEffect(() => {
    if (!movie || !id) return;
    fetch(`${BASE_URL}/${type}/${id}/videos?api_key=${API_KEY}&language=en-US`)
      .then(r => r.json())
      .then(d => {
        const trailer = d.results?.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
        if (trailer) {
          setTrailerKey(trailer.key);
          trailerTimer.current = setTimeout(() => setShowTrailer(true), 1500);
        }
      })
      .catch(() => {});
    return () => clearTimeout(trailerTimer.current);
  }, [movie, id, type]);

  const scrollToSection = (sectionId) => {
    setActiveTab(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (error) {
    return (
      <div className="min-h-screen bg-[#0f171e] flex flex-col items-center justify-center text-white">
        <h2 className="text-2xl font-bold mb-4">Oops! We couldn't find this title.</h2>
        <button onClick={() => navigate('/')} className="bg-primeBlue px-6 py-2 rounded font-bold">Go Back Home</button>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen bg-[#0f171e] flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primeBlue border-t-transparent rounded-full animate-spin"></div>
          <p className="font-bold text-gray-400">Loading details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f171e] relative text-gray-300 font-sans selection:bg-primeBlue selection:text-white pb-20">

      {/* ── HERO BACKGROUND ── */}
      <div className="absolute top-0 left-0 w-full h-[85vh] overflow-hidden pointer-events-none">
        {/* Static backdrop — always visible */}
        <div
          className="absolute inset-0 bg-cover bg-right-top opacity-50"
          style={{
            backgroundImage: `url("${IMAGE_BASE_URL}${movie.backdrop_path}")`,
            maskImage: 'linear-gradient(to right, transparent, black 40%)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 40%)',
          }}
        />

        {/* Trailer iframe — fades in over backdrop */}
        {trailerKey && showTrailer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: trailerLoaded ? 0.6 : 0 }}
            transition={{ duration: 1 }}
            className="absolute inset-0"
            style={{
              maskImage: 'linear-gradient(to right, transparent 5%, black 45%)',
              WebkitMaskImage: 'linear-gradient(to right, transparent 5%, black 45%)',
            }}
          >
            <iframe
              key={`${trailerKey}-${isMuted}`}
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&loop=1&playlist=${trailerKey}&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3`}
              className="w-full h-full scale-[1.1]"
              allow="autoplay; encrypted-media"
              onLoad={() => setTrailerLoaded(true)}
              title="detail-trailer"
              style={{ border: 'none', pointerEvents: 'none' }}
            />
          </motion.div>
        )}

        {/* Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f171e] via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f171e] via-[#0f171e]/90 to-transparent w-[60vw]" />
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 pt-[100px] px-6 md:px-12 lg:px-16 max-w-[1600px] mx-auto">

        {/* Logo Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-black ml-0.5" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <span className="text-white font-bold tracking-widest text-sm">APEXVIDEOS</span>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl lg:text-[54px] font-extrabold text-white mb-10 tracking-tight leading-tight w-full lg:w-[70%] drop-shadow-lg">
          {movie.title || movie.name}
        </h1>

        <div className="flex flex-col lg:flex-row gap-12 lg:gap-8 justify-between">

          {/* ── LEFT COLUMN ── */}
          <div className="w-full lg:w-[320px] flex-shrink-0 flex flex-col gap-3">

            {/* Icon buttons */}
            <div className="flex items-center gap-2 mb-2">
              {[
                { title: 'Watch Party', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[18px] h-[18px]"><rect x="2" y="4" width="20" height="14" rx="2"/><path d="M8 18v3h8v-3M10 9l5 3-5 3V9z"/></svg> },
                { title: 'Add to Watchlist', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-6 h-6"><path d="M12 5v14M5 12h14"/></svg> },
                { title: 'Like', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg> },
                { title: 'Dislike', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg> },
                { title: 'Share', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> },
              ].map(btn => (
                <button key={btn.title} title={btn.title}
                  className="w-[42px] h-[42px] rounded-full border-2 border-gray-400/80 flex items-center justify-center hover:bg-white/10 hover:border-white text-white transition-all">
                  {btn.icon}
                </button>
              ))}
            </div>

            {/* Play */}
            <button
              onClick={() => navigate(`/play/${type}/${id}`)}
              className="w-[320px] bg-white text-black h-[52px] rounded flex items-center justify-center gap-2 font-bold text-[17px] hover:bg-gray-200 transition-colors">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M8 5v14l11-7z"/></svg> Play
            </button>

            {/* Subscribe */}
            <div className="w-[320px] bg-[#33373d]/80 rounded p-[14px] flex justify-between items-center cursor-pointer hover:bg-[#40454c] transition-colors border border-transparent hover:border-white/20">
              <span className="text-primeBlue font-bold text-[17px] tracking-wide">prime</span>
              <span className="text-white text-sm font-bold">Subscribe</span>
            </div>

            <button className="w-[320px] bg-[#33373d]/80 rounded p-[14px] flex justify-center items-center text-white text-[15px] font-bold cursor-pointer hover:bg-[#40454c] transition-colors">
              More ways to watch
            </button>

            <div className="flex items-center gap-2 mt-1">
              <div className="bg-primeBlue rounded-full w-4 h-4 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" className="w-2.5 h-2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <span className="text-gray-200 font-bold text-[13px]">Apex Player (with ads)</span>
            </div>

            {/* Mute toggle — only when trailer playing */}
            <AnimatePresence>
              {trailerKey && showTrailer && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  onClick={() => setIsMuted(m => !m)}
                  className="w-[320px] mt-2 bg-[#33373d]/60 rounded p-[12px] flex items-center gap-3 text-white text-[14px] font-bold cursor-pointer hover:bg-[#40454c] transition-colors border border-white/10"
                >
                  {isMuted ? <VolumeX className="w-5 h-5 text-gray-400" /> : <Volume2 className="w-5 h-5 text-primeBlue" />}
                  {isMuted ? 'Unmute Trailer' : 'Mute Trailer'}
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="w-full flex-grow flex flex-col md:flex-row gap-8 justify-between lg:pl-4">

            <div className="max-w-[700px]">
              <div className="flex items-center gap-2 text-[#23d46a] font-bold text-[15px] mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                Spent 18 weeks in Top 10
              </div>

              <p className="text-white text-[16.5px] font-medium leading-[1.6] mb-4">
                {movie.overview}
              </p>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[14px] font-bold text-[#8197a4]">
                <span className="text-white border-b border-transparent hover:border-white cursor-pointer">
                  {movie.genres?.[0]?.name || 'Drama'}
                </span>
                {movie.genres?.[1] && <><span className="text-gray-500">•</span><span className="text-white border-b border-transparent hover:border-white cursor-pointer">{movie.genres[1].name}</span></>}
                <span className="ml-3">IMDb {(movie.vote_average || 7).toFixed(1)}/10</span>
                <span>{movie.release_date?.substring(0,4) || movie.first_air_date?.substring(0,4) || '2024'}</span>
                <span>{movie.runtime ? `${Math.floor(movie.runtime/60)}h ${movie.runtime%60}m` : (movie.number_of_seasons ? `${movie.number_of_seasons} Season${movie.number_of_seasons > 1 ? 's' : ''}` : '')}</span>
              </div>
            </div>

            <div className="flex flex-col items-start md:items-end gap-1.5 min-w-[200px] text-[13px] font-bold text-[#8197a4] text-left md:text-right">
              <div>Cast: <span className="text-white hover:underline cursor-pointer">{movie.credits?.cast?.[0]?.name || 'Unknown'}</span>, <span className="text-white hover:underline cursor-pointer">{movie.credits?.cast?.[1]?.name || ''}</span></div>
              <div className="flex items-center gap-2 mt-1">
                <span className="bg-white/10 text-white px-1.5 py-[2px] rounded text-[11px] border border-white/20">U/A 13+</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div className="flex gap-8 border-b border-gray-600/50 mt-16 mb-8">
          {['related', 'details'].map(tab => (
            <button
              key={tab}
              onClick={() => scrollToSection(tab)}
              className={`pb-3 text-[17px] font-bold transition-colors capitalize ${activeTab === tab ? 'text-white border-b-2 border-white' : 'text-[#8197a4] hover:text-white'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Related row */}
        <div id="related" className="scroll-mt-32">
          <Row title="Customers also watched" fetchUrl={`/${type}/${id}/recommendations?api_key=${API_KEY}&language=en-US`} />
          <Row title="More like this" fetchUrl={`/${type}/${id}/similar?api_key=${API_KEY}&language=en-US`} />
        </div>

        {/* Details grid */}
        <div id="details" className="mt-16 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 scroll-mt-32">

          <div className="flex flex-col gap-6">
            <div className="bg-[#19232e] rounded-lg p-6 md:p-8">
              <h3 className="text-white font-extrabold text-xl mb-2">{movie.title || movie.name}</h3>
              <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-[#8197a4] mb-4">
                {movie.genres?.map((g, i) => (
                  <React.Fragment key={g.id}>
                    {i > 0 && <span className="text-gray-500">•</span>}
                    <span className="text-white hover:underline cursor-pointer">{g.name}</span>
                  </React.Fragment>
                ))}
                <span className="ml-3">IMDb {(movie.vote_average || 7).toFixed(1)}/10</span>
                <span>{movie.release_date?.substring(0,4) || movie.first_air_date?.substring(0,4)}</span>
                {movie.runtime && <span>{Math.floor(movie.runtime/60)}h {movie.runtime%60}m</span>}
                <span className="bg-white/10 px-1 py-0.5 rounded text-[10px] text-white ml-1 border border-white/20">UHD</span>
              </div>
              <p className="text-[#8197a4] text-[15px] font-medium leading-[1.6]">{movie.overview}</p>
            </div>

            <div className="bg-[#19232e] rounded-lg p-6 md:p-8">
              <h3 className="text-white font-extrabold text-xl mb-6">Creators and Cast</h3>
              <div className="flex flex-col gap-4 text-[15px]">
                {movie.credits?.crew?.filter(c => c.job === 'Director').slice(0,2).length > 0 && (
                  <div className="grid grid-cols-[100px_1fr] md:grid-cols-[140px_1fr] gap-4">
                    <span className="text-white font-bold">Directors</span>
                    <span className="text-[#8197a4] font-medium">
                      {movie.credits.crew.filter(c => c.job === 'Director').slice(0,3).map(d => d.name).join(', ')}
                    </span>
                  </div>
                )}
                {movie.credits?.cast?.length > 0 && (
                  <div className="grid grid-cols-[100px_1fr] md:grid-cols-[140px_1fr] gap-4">
                    <span className="text-white font-bold">Cast</span>
                    <span className="text-[#8197a4] font-medium leading-relaxed">
                      {movie.credits.cast.slice(0,6).map((c, i) => (
                        <React.Fragment key={c.id}>
                          {i > 0 && ', '}
                          <span className="hover:text-white hover:underline cursor-pointer">{c.name}</span>
                        </React.Fragment>
                      ))}
                    </span>
                  </div>
                )}
                {movie.production_companies?.length > 0 && (
                  <div className="grid grid-cols-[100px_1fr] md:grid-cols-[140px_1fr] gap-4">
                    <span className="text-white font-bold">Studio</span>
                    <span className="text-[#8197a4] font-medium">
                      {movie.production_companies.slice(0,2).map(c => c.name).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="bg-[#19232e] rounded-lg p-6 md:p-8">
              <h3 className="text-white font-extrabold text-xl mb-4">Content advisory</h3>
              <div className="inline-block bg-white/10 text-white px-1.5 py-[2px] rounded text-[11px] font-bold border border-white/20 mb-3">U/A 13+</div>
              <p className="text-[#8197a4] text-[15px] font-medium">violence, foul language, sexual content, alcohol use</p>
            </div>

            {movie.spoken_languages?.length > 0 && (
              <div className="bg-[#19232e] rounded-lg p-6 md:p-8">
                <h3 className="text-white font-extrabold text-xl mb-4">Audio languages</h3>
                <p className="text-[#8197a4] text-[15px] font-medium">
                  {movie.spoken_languages.map(l => l.english_name).join(', ')}
                </p>
              </div>
            )}

            <div className="bg-[#19232e] rounded-lg p-6 md:p-8">
              <h3 className="text-white font-extrabold text-xl mb-4">Subtitles</h3>
              <p className="text-[#8197a4] text-[15px] font-medium">English, Hindi</p>
            </div>
          </div>
        </div>

        <div className="mt-12 text-[15px] text-[#8197a4] font-medium pb-8 border-b border-gray-600/50">
          By clicking play, you agree to our <span className="text-white hover:underline cursor-pointer">Terms of Use</span>.
        </div>

        <div className="py-8 flex flex-col gap-8">
          <div>
            <h4 className="text-white font-extrabold text-lg mb-4">Feedback</h4>
            <button className="bg-[#33373d]/80 hover:bg-[#40454c] text-white px-6 py-2.5 rounded font-bold transition-colors">Send us feedback</button>
          </div>
          <div>
            <h4 className="text-white font-extrabold text-lg mb-2">Support</h4>
            <a href="#" className="text-white hover:underline font-bold text-[15px]">Get Help</a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MovieDetail;
