import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import Row from '../components/Row';

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/p/original";

const MovieDetail = () => {
  const { type = 'movie', id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [movie, setMovie] = useState(location.state?.movie || null);
  const [activeTab, setActiveTab] = useState('related');
  const [error, setError] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (id) {
      fetch(`${BASE_URL}/${type}/${id}?api_key=${API_KEY}&language=en-US`)
        .then(res => res.json())
        .then(data => {
          if (data.success === false || data.errors) setError(true);
          else setMovie(data);
        })
        .catch(() => setError(true));
    }
  }, [id, type]);

  const scrollToSection = (sectionId) => {
    setActiveTab(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (error) return (
    <div className="min-h-screen bg-[#0f171e] flex flex-col items-center justify-center text-white">
      <h2 className="text-2xl font-bold mb-4">Oops! We couldn't find this title.</h2>
      <button onClick={() => navigate('/')} className="bg-primeBlue px-6 py-2 rounded font-bold">Go Back Home</button>
    </div>
  );

  if (!movie) return (
    <div className="min-h-screen bg-[#0f171e] flex items-center justify-center text-white">
      <div className="w-12 h-12 border-4 border-primeBlue border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f171e] relative text-gray-300 font-sans pb-20">
      <div 
        className="absolute top-0 right-0 w-[75vw] h-[85vh] bg-cover bg-right-top opacity-50 pointer-events-none"
        style={{ 
          backgroundImage: `url("${IMAGE_BASE_URL}${movie.backdrop_path}")`,
          maskImage: 'linear-gradient(to right, transparent, black 40%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 40%)'
        }}
      />
      <div className="absolute top-0 left-0 w-full h-[85vh] bg-gradient-to-t from-[#0f171e] via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-0 left-0 w-[60vw] h-[85vh] bg-gradient-to-r from-[#0f171e] via-[#0f171e]/90 to-transparent pointer-events-none" />

      <div className="relative z-10 pt-[100px] px-6 md:px-12 lg:px-16 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-black ml-0.5" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <span className="text-white font-bold tracking-widest text-sm">MXPLAYER</span>
        </div>

        <h1 className="text-4xl md:text-5xl lg:text-[54px] font-extrabold text-white mb-10 tracking-tight leading-tight w-full lg:w-[70%]">
          {movie.title || movie.name}
        </h1>

        <div className="flex flex-col lg:flex-row gap-12 lg:gap-8 justify-between">
          <div className="w-full lg:w-[320px] flex-shrink-0 flex flex-col gap-3">
            <div className="flex items-center gap-2 mb-2">
              <button className="w-[42px] h-[42px] rounded-full border-2 border-gray-400/80 flex items-center justify-center hover:bg-white/10 hover:border-white text-white transition-all"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[18px] h-[18px]"><rect x="2" y="4" width="20" height="14" rx="2" ry="2"></rect><path d="M10 9l5 3-5 3V9z"></path></svg></button>
              <button className="w-[42px] h-[42px] rounded-full border-2 border-gray-400/80 flex items-center justify-center hover:bg-white/10 hover:border-white text-white transition-all"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-6 h-6"><path d="M12 5v14M5 12h14"></path></svg></button>
              <button className="w-[42px] h-[42px] rounded-full border-2 border-gray-400/80 flex items-center justify-center hover:bg-white/10 hover:border-white text-white transition-all"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg></button>
              <button className="w-[42px] h-[42px] rounded-full border-2 border-gray-400/80 flex items-center justify-center hover:bg-white/10 hover:border-white text-white transition-all"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path></svg></button>
              <button className="w-[42px] h-[42px] rounded-full border-2 border-gray-400/80 flex items-center justify-center hover:bg-white/10 hover:border-white text-white transition-all"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg></button>
            </div>

            <button onClick={() => navigate(`/play/${type}/${id}`)} className="w-[320px] bg-white text-black h-[52px] rounded flex items-center justify-center gap-2 font-bold text-[17px] hover:bg-gray-200 transition-colors">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M8 5v14l11-7z"/></svg> Play
            </button>

            <div className="w-[320px] bg-[#33373d]/80 rounded p-[14px] flex justify-between items-center cursor-pointer hover:bg-[#40454c] transition-colors">
              <span className="text-primeBlue font-bold text-[17px]">prime</span>
              <span className="text-white text-sm font-bold">Subscribe</span>
            </div>

            <button className="w-[320px] bg-[#33373d]/80 rounded p-[14px] flex justify-center items-center text-white text-[15px] font-bold hover:bg-[#40454c] transition-colors">More ways to watch</button>
            <div className="flex items-center gap-2 mt-1">
              <div className="bg-primeBlue rounded-full w-4 h-4 flex items-center justify-center"><svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="4" className="w-2.5 h-2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
              <span className="text-gray-200 font-bold text-[13px]">MX Player (with ads)</span>
            </div>
          </div>

          <div className="w-full flex-grow flex flex-col md:flex-row gap-8 justify-between lg:pl-4">
            <div className="max-w-[700px]">
              <div className="flex items-center gap-2 text-[#23d46a] font-bold text-[15px] mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg> Spent 18 weeks in Top 10
              </div>
              <p className="text-white text-[16.5px] font-medium leading-[1.6] mb-4">{movie.overview}</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[14px] font-bold text-[#8197a4]">
                <span className="text-white hover:underline cursor-pointer">Comedy</span> • <span className="text-white hover:underline cursor-pointer">Drama</span> • <span>Romantic</span>
                <span className="ml-3">IMDb {(movie.vote_average || 6.2).toFixed(1)}/10</span>
                <span>{movie.release_date?.substring(0,4) || "2024"}</span>
                <span>2 h 20 min</span>
              </div>
            </div>
            <div className="flex flex-col items-start md:items-end gap-1.5 min-w-[200px] text-[13px] font-bold text-[#8197a4] text-left md:text-right">
              <div>Cast: <span className="text-white cursor-pointer">Shahid Kapoor</span>, <span className="text-white cursor-pointer">Kriti Sanon</span></div>
              <div className="flex items-center gap-2 mt-1"><span className="bg-white/10 text-white px-1.5 py-[2px] rounded text-[11px] border border-white/20">U/A 13+</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-gray-400"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><line x1="9" y1="14" x2="15" y2="14"></line><line x1="9" y1="10" x2="15" y2="10"></line></svg></div>
            </div>
          </div>
        </div>

        <div className="flex gap-8 border-b border-gray-600/50 mt-16 mb-8">
          <button onClick={() => scrollToSection('related')} className={`pb-3 text-[17px] font-bold ${activeTab === 'related' ? 'text-white border-b-2 border-white' : 'text-[#8197a4]'}`}>Related</button>
          <button onClick={() => scrollToSection('details')} className={`pb-3 text-[17px] font-bold ${activeTab === 'details' ? 'text-white border-b-2 border-white' : 'text-[#8197a4]'}`}>Details</button>
        </div>

        <div id="related" className="scroll-mt-32">
          <Row title="Customers also watched" fetchUrl={`/${type}/${id}/recommendations?api_key=${API_KEY}&language=en-US`} />
        </div>

        <div id="details" className="mt-16 grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 scroll-mt-32">
          <div className="bg-[#19232e] rounded-lg p-8">
            <h3 className="text-white font-extrabold text-xl mb-6">Creators and Cast</h3>
            <div className="flex flex-col gap-4 text-[15px]">
              <div className="grid grid-cols-[140px_1fr] gap-4"><span className="text-white font-bold">Directors</span><span className="text-[#8197a4]">Amit Joshi</span></div>
              <div className="grid grid-cols-[140px_1fr] gap-4"><span className="text-white font-bold">Cast</span><span className="text-[#8197a4]">Shahid Kapoor, Kriti Sanon</span></div>
            </div>
          </div>
          <div className="bg-[#19232e] rounded-lg p-8"><h3 className="text-white font-extrabold text-xl mb-4">Content advisory</h3><p className="text-[#8197a4] text-[15px]">violence, foul language, sexual content</p></div>
        </div>
      </div>
    </div>
  );
};

export default MovieDetail;
