const express = require('express');
const cors = require('cors');
const torrentStream = require('torrent-stream');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
ffmpeg.setFfmpegPath(ffmpegPath);
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());

app.use('/hls', express.static(path.join(__dirname, 'public', 'hls')));

const sessions = new Map();

app.get('/hls-start', (req, res) => {
    const magnet = req.query.magnet;
    if (!magnet) {
        return res.status(400).send('Missing magnet link');
    }

    const sessionId = uuidv4();
    const hlsDir = path.join(__dirname, 'public', 'hls', sessionId);
    fs.mkdirSync(hlsDir, { recursive: true });

    const engine = torrentStream(magnet, { 
        tmp: path.join(__dirname, 'tmp'),
        path: path.join(__dirname, 'downloads') 
    });

    let headersSent = false;

    engine.on('ready', () => {
        let file = engine.files.reduce((a, b) => a.length > b.length ? a : b);
        console.log(`Starting Torrent: ${file.name}`);

        const stream = file.createReadStream();
        const hlsManifest = path.join(hlsDir, 'index.m3u8');
        
        const command = ffmpeg(stream)
            .outputOptions([
                '-map 0:v:0', // Embed Primary Video
                '-map 0:a?',  // Extract ALL embedded audio tracks
                '-c:v copy',  // Copy video stream safely (low CPU usage)
                '-c:a aac',   // Convert Audio to standard browser AAC
                '-b:a 192k',
                // Package specifically to HLS manifest standard to support multiple audios natively
                '-f hls',
                '-hls_time 8',
                '-hls_list_size 0',
                '-hls_allow_cache 1',
                `-hls_segment_filename ${path.join(hlsDir, 'segment_%03d.ts')}`
            ])
            .on('start', () => {
                console.log(`FFmpeg started for session ${sessionId}`);
                setTimeout(() => {
                    if(!headersSent) {
                        headersSent = true;
                        res.json({
                            url: `http://localhost:4000/hls/${sessionId}/index.m3u8`,
                            sessionId
                        });
                    }
                }, 8000); // 8 second buffer for FFmpeg to write the first chunk + m3u8
            })
            .on('error', (err) => {
                console.error(`FFmpeg extraction Error:`, err);
                if(!headersSent) {
                    headersSent = true;
                    res.status(500).json({ error: 'FFmpeg transcode stream crashed' });
                }
            })
            .save(hlsManifest);

        sessions.set(sessionId, { engine, command, dir: hlsDir });
    });

    engine.on('error', (err) => {
        if(!headersSent) {
            headersSent = true;
            res.status(500).json({ error: 'Failed to stream torrent payload' });
        }
    });
});

app.get('/stop', (req, res) => {
    const { sessionId } = req.query;
    const session = sessions.get(sessionId);
    if (session) {
        session.command.kill('SIGKILL');
        session.engine.destroy();
        fs.rmSync(session.dir, { recursive: true, force: true });
        sessions.delete(sessionId);
        res.send('Stopped');
    } else {
        res.status(404).send('Not found');
    }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Netflix-Style Multi-Audio Transcoder initialized on port ${PORT}`));
