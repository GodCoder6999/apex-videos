// Add imports at the top of Banner.jsx
import YouTube from 'react-youtube';
import movieTrailer from 'movie-trailer';

// Inside your Banner component, add this state and effect:
const [trailerUrl, setTrailerUrl] = useState('');
const [playVideo, setPlayVideo] = useState(false);

useEffect(() => {
  if (movie) {
    const title = movie.title || movie.name || movie.original_name;
    movieTrailer(title, { id: true })
      .then((url) => {
        setTrailerUrl(url);
        // Delay playing the video by 3 seconds so the user sees the backdrop first
        setTimeout(() => setPlayVideo(true), 3000); 
      })
      .catch(() => setTrailerUrl(''));
  }
}, [movie]);

// Update the background image rendering in the return statement:
{/* Background image or Trailer */}
<div className="absolute inset-0 w-full h-full overflow-hidden">
  {playVideo && trailerUrl ? (
    <div className="absolute top-1/2 left-1/2 w-[150%] h-[150%] -translate-x-1/2 -translate-y-1/2 pointer-events-none">
      <YouTube 
        videoId={trailerUrl} 
        opts={{
          height: '100%',
          width: '100%',
          playerVars: { autoplay: 1, mute: isMuted ? 1 : 0, controls: 0, loop: 1, playlist: trailerUrl },
        }} 
        className="w-full h-full"
      />
    </div>
  ) : (
    <motion.div
      key={movie.id}
      variants={bgFade}
      initial="hidden"
      animate="visible"
      className="absolute inset-0 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: `url("${IMAGE_BASE_URL}${movie.backdrop_path}")` }}
    />
  )}
</div>
