const express = require('express');
const multer = require('multer');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

dotenv.config();

const PORT = parseInt(process.env.PORT, 10) || 3000;
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_NAME = process.env.DB_NAME || 'ra121790_amplify';
const DB_USER = process.env.DB_USER || 'ra121790_amplify';
const DB_PASS = process.env.DB_PASS || 'AwTLgn7up2ZPWSGUXtQg';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_MB, 10) || 100;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const COVER_LOOKUP_TIMEOUT_MS = parseInt(process.env.COVER_LOOKUP_TIMEOUT_MS, 10) || 2000;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: ALLOWED_ORIGIN === '*' ? true : ALLOWED_ORIGIN }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

const db = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function ensurePlaylistSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS playlists (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      description TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  const [descriptionColumn] = await db.query("SHOW COLUMNS FROM playlists LIKE 'description'");
  if (!descriptionColumn.length) {
    await db.query("ALTER TABLE playlists ADD COLUMN description TEXT DEFAULT '' AFTER name");
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id INT NOT NULL,
      track_id INT NOT NULL,
      added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (playlist_id, track_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // Prioritize lossless/high-quality formats: FLAC > WAV > ALAC > MP3 320k
    const allowed = file.fieldname === 'cover'
      ? ['.jpg', '.jpeg', '.png', '.webp']
      : ['.flac', '.wav', '.mp3', '.ogg', '.m4a', '.aac', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

// Estimate audio bitrate quality
function estimateAudioQuality(filesize, durationSeconds) {
  if (durationSeconds <= 0) return 'unknown';
  const kilobitsPerSecond = (filesize * 8) / (1000 * durationSeconds);
  
  if (kilobitsPerSecond >= 256) return 'lossless'; // FLAC, WAV
  if (kilobitsPerSecond >= 224) return 'very_high';  // 320kbps MP3
  if (kilobitsPerSecond >= 160) return 'high';       // 192-256kbps
  if (kilobitsPerSecond >= 96) return 'medium';      // 128-192kbps
  return 'low';                                       // < 128kbps
}

function mapAudioMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.mp3': return 'audio/mpeg';
    case '.wav': return 'audio/wav';
    case '.ogg': return 'audio/ogg';
    case '.m4a': return 'audio/mp4';
    case '.aac': return 'audio/aac';
    case '.flac': return 'audio/flac';
    case '.webm': return 'audio/webm';
    default: return 'application/octet-stream';
  }
}

// Automatisch een albumhoes zoeken via de (gratis, key-loze) iTunes Search API
// wanneer de gebruiker zelf geen hoesfoto heeft geüpload. Faalt dit, dan blijft
// de track gewoon zonder cover staan en kan die later handmatig toegevoegd worden.
async function fetchAlbumArt(artist, title, timeoutMs = COVER_LOOKUP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const query = encodeURIComponent(`${artist} ${title}`);
    const searchResponse = await fetch(
      `https://itunes.apple.com/search?term=${query}&media=music&entity=song&limit=1`,
      { signal: controller.signal },
    );
    if (!searchResponse.ok) return null;

    const data = await searchResponse.json();
    const artworkUrl100 = data.results?.[0]?.artworkUrl100;
    if (!artworkUrl100) return null;

    // iTunes geeft standaard een 100x100 thumbnail; deze URL-vorm ondersteunt
    // ook grotere afmetingen door het formaat in de bestandsnaam te vervangen.
    const artworkUrl = artworkUrl100.replace('100x100', '600x600');
    const imageResponse = await fetch(artworkUrl, { signal: controller.signal });
    if (!imageResponse.ok) return null;

    return Buffer.from(await imageResponse.arrayBuffer());
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error(`Albumart ophalen mislukt voor "${artist} - ${title}":`, error.message);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

function saveCoverBuffer(buffer) {
  const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.jpg`;
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), buffer);
  return filename;
}

app.get('/api/tracks', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    let query = 'SELECT id, title, artist, album, duration_seconds, filename, cover_filename, created_at FROM tracks';
    const params = [];
    if (q) {
      query += ' WHERE title LIKE ? OR artist LIKE ? OR album LIKE ?';
      const needle = `%${q}%`;
      params.push(needle, needle, needle);
    }
    query += ' ORDER BY created_at DESC';
    const [rows] = await db.query(query, params);
    res.json({ tracks: rows });
  } catch (error) {
    res.status(500).json({ error: 'Kan tracks niet ophalen' });
  }
});

app.post('/api/tracks', upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'cover', maxCount: 1 }]), async (req, res) => {
  const audioFile = req.files?.audio?.[0];
  const coverFile = req.files?.cover?.[0];
  if (!audioFile) {
    return res.status(400).json({ error: 'Geen audio bestand geüpload' });
  }

  const { title = '', artist = 'Onbekend', album = '', duration_seconds = 0 } = req.body;
  const trackTitle = title.trim() || path.parse(audioFile.originalname).name;
  const trackArtist = artist.trim() || 'Onbekend';

  let coverFilename = coverFile?.filename || null;

  try {
    const [result] = await db.execute(
      'INSERT INTO tracks (title, artist, album, duration_seconds, filename, cover_filename) VALUES (?, ?, ?, ?, ?, ?)',
      [trackTitle, trackArtist, album.trim(), Number(duration_seconds) || 0, audioFile.filename, coverFilename]
    );
    const [rows] = await db.query('SELECT id, title, artist, album, duration_seconds, filename, cover_filename, created_at FROM tracks WHERE id = ?', [result.insertId]);

    if (!coverFilename) {
      void (async () => {
        const artBuffer = await fetchAlbumArt(trackArtist, trackTitle);
        if (!artBuffer) return;
        const savedCoverFilename = saveCoverBuffer(artBuffer);
        await db.execute('UPDATE tracks SET cover_filename = ? WHERE id = ?', [savedCoverFilename, result.insertId]);
      })();
    }

    res.status(201).json({ track: rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Kon track niet opslaan' });
  }
});

app.get('/api/playlists', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, name, description, created_at FROM playlists ORDER BY created_at DESC');
    res.json({ playlists: rows });
  } catch (error) {
    console.error('Playlists ophalen mislukt:', error.message);
    res.status(500).json({ error: 'Kan playlists niet ophalen' });
  }
});

app.post('/api/playlists', async (req, res) => {
  const { name = '', description = '' } = req.body;
  const trimmedName = name.trim();

  if (!trimmedName) {
    return res.status(400).json({ error: 'Naam is verplicht' });
  }

  try {
    const [result] = await db.execute(
      'INSERT INTO playlists (name, description) VALUES (?, ?)',
      [trimmedName, description.trim()]
    );
    const [rows] = await db.query('SELECT id, name, description, created_at FROM playlists WHERE id = ?', [result.insertId]);
    res.status(201).json({ playlist: rows[0] });
  } catch (error) {
    console.error('Playlist aanmaken mislukt:', error.message);
    res.status(500).json({ error: 'Kan playlist niet opslaan' });
  }
});

app.delete('/api/playlists/:id', async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM playlists WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Playlist niet gevonden' });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Playlist verwijderen mislukt:', error.message);
    res.status(500).json({ error: 'Kan playlist niet verwijderen' });
  }
});

app.get('/api/playlists/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, name, description, created_at FROM playlists WHERE id = ?', [req.params.id]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Playlist niet gevonden' });
    }
    res.json({ playlist: rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Kan playlist niet ophalen' });
  }
});

app.get('/api/playlists/:id/tracks', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT t.id, t.title, t.artist, t.album, t.duration_seconds, t.filename, t.cover_filename, t.created_at
       FROM playlist_tracks pt
       JOIN tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ?
       ORDER BY pt.added_at DESC`,
      [req.params.id]
    );
    res.json({ tracks: rows });
  } catch (error) {
    res.status(500).json({ error: 'Kan playlist tracks niet ophalen' });
  }
});

app.post('/api/playlists/:id/tracks', async (req, res) => {
  const playlistId = req.params.id;
  const { track_id } = req.body;

  if (!track_id) {
    return res.status(400).json({ error: 'Track ID is verplicht' });
  }

  try {
    const [playlist] = await db.query('SELECT id FROM playlists WHERE id = ?', [playlistId]);
    if (!playlist[0]) {
      return res.status(404).json({ error: 'Playlist niet gevonden' });
    }

    const [track] = await db.query('SELECT id FROM tracks WHERE id = ?', [track_id]);
    if (!track[0]) {
      return res.status(404).json({ error: 'Track niet gevonden' });
    }

    await db.execute(
      'INSERT IGNORE INTO playlist_tracks (playlist_id, track_id) VALUES (?, ?)',
      [playlistId, track_id]
    );

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Kan track niet aan playlist toevoegen' });
  }
});

app.delete('/api/playlists/:playlistId/tracks/:trackId', async (req, res) => {
  try {
    await db.execute('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?', [req.params.playlistId, req.params.trackId]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Kan track niet uit playlist verwijderen' });
  }
});

app.get('/api/stream/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT filename, duration_seconds FROM tracks WHERE id = ?', [req.params.id]);
    const track = rows[0];
    if (!track) {
      return res.status(404).send('Track niet gevonden');
    }

    const filePath = path.join(UPLOAD_DIR, track.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Bestand niet gevonden');
    }

    const stat = fs.statSync(filePath);
    const total = stat.size;
    const range = req.headers.range;
    const contentType = mapAudioMimeType(track.filename);
    
    // Estimate quality for monitoring
    const audioQuality = estimateAudioQuality(total, track.duration_seconds);

    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);
    
    // Optimize for streaming: cache in browser for 30 days
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.setHeader('X-Audio-Quality', audioQuality);

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
      const chunkSize = (end - start) + 1;
      const stream = fs.createReadStream(filePath, { start, end, highWaterMark: 64 * 1024 });

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', chunkSize);
      stream.pipe(res);
    } else {
      res.setHeader('Content-Length', total);
      const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
      stream.pipe(res);
    }
  } catch (error) {
    res.status(500).send('Stream fout');
  }
});

app.get('/api/tracks/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, title, artist, album, duration_seconds, filename, cover_filename, created_at FROM tracks WHERE id = ?', [req.params.id]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Track niet gevonden' });
    }
    res.json({ track: rows[0] });
  } catch (error) {
    res.status(500).json({ error: 'Kan track niet ophalen' });
  }
});

app.patch('/api/tracks/:id', upload.single('cover'), async (req, res) => {
  const trackId = req.params.id;
  const { title = '', artist = '', album = '' } = req.body;
  const trimmedTitle = title.trim();
  const trimmedArtist = artist.trim();
  try {
    const [rows] = await db.query('SELECT cover_filename FROM tracks WHERE id = ?', [trackId]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Track niet gevonden' });
    }

    if (!trimmedTitle) {
      return res.status(400).json({ error: 'Titel is verplicht' });
    }
    if (!trimmedArtist) {
      return res.status(400).json({ error: 'Artiest is verplicht' });
    }

    const newCover = req.file ? req.file.filename : rows[0].cover_filename;
    await db.execute(
      'UPDATE tracks SET title = ?, artist = ?, album = ?, cover_filename = ? WHERE id = ?',
      [trimmedTitle, trimmedArtist, album.trim(), newCover, trackId],
    );

    if (req.file && rows[0].cover_filename) {
      const oldCoverPath = path.join(UPLOAD_DIR, rows[0].cover_filename);
      if (fs.existsSync(oldCoverPath)) {
        fs.unlinkSync(oldCoverPath);
      }
    }

    const [updatedRows] = await db.query('SELECT id, title, artist, album, duration_seconds, filename, cover_filename, created_at FROM tracks WHERE id = ?', [trackId]);
    res.json({ track: updatedRows[0] });
  } catch (error) {
    console.error('Track bewerken mislukt:', error.message);
    res.status(500).json({ error: 'Kan track niet bijwerken' });
  }
});

app.delete('/api/tracks/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT filename, cover_filename FROM tracks WHERE id = ?', [req.params.id]);
    if (!rows[0]) {
      return res.status(404).json({ error: 'Track niet gevonden' });
    }
    const filename = rows[0].filename;
    await db.execute('DELETE FROM tracks WHERE id = ?', [req.params.id]);
    const filePath = path.join(UPLOAD_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (rows[0].cover_filename) {
      const coverPath = path.join(UPLOAD_DIR, rows[0].cover_filename);
      if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath);
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Kon track niet verwijderen' });
  }
});

app.get('/health', (req, res) => {
  res.json({ ok: true, version: '1.0' });
});

async function startServer() {
  try {
    await ensurePlaylistSchema();
    console.log('Playlisttabellen zijn gecontroleerd.');
  } catch (error) {
    console.error('Playlisttabellen konden niet worden voorbereid:', error.message);
  }

  app.listen(PORT, () => {
    console.log(`Server gestart op http://localhost:${PORT}`);
  });
}

startServer();
