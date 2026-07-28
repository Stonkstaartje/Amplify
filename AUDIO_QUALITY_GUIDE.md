# Amplify Audio Quality Guide

## Waarom Spotify beter klinkt

Spotify bereikt premium geluidskwaliteit door:

### 1. **Codec & Bitrate Optimization**
- **Ogg Vorbis** codec (niet MP3)
- Spotify Premium: 320 kbps (64 kB/s)
- Spotify Standard: 160 kbps (20 kB/s)
- Spotify Free: 96 kbps (12 kB/s)

### 2. **Source Quality**
- Opgestelde audio: FLAC (lossless), WAV, ALAC
- Vermijd: MP3 128kbps, AAC 64kbps
- Ideaal: Original source van mastering engineer

### 3. **Streaming Optimization**
- HTTP/2 multiplexing
- Edge caching (CDN)
- Adaptive bitrate (minder buffering)
- Range requests (snelle seek)

### 4. **Audio Processing**
- Loudness normalization (LUFS metering)
- Dynamic range optimization
- Frequency response balancing
- Peak limiting

---

## Amplify Kwaliteit Verbetering

### Stap 1: Upload Alleen FLAC/WAV
Wijzig `.env`:
```
# Alleen lossless formats toestaan
AUDIO_QUALITY_MODE=lossless
```

### Stap 2: Bestandsgrootte Validatie
**Minimale bestandsgrootten voor kwaliteit:**
- 3 minuten nummer:
  - Lossless (FLAC): ~80-120 MB
  - 320 kbps MP3: ~7.5 MB
  - 192 kbps MP3: ~4.5 MB
  - 128 kbps MP3: ~3 MB

**Server checkt automatisch:**
```javascript
const audioQuality = estimateAudioQuality(filesize, durationSeconds);
// Retourneert: 'lossless' | 'very_high' | 'high' | 'medium' | 'low'
```

### Stap 3: Client Headers
Server stuurt audio quality info:
```
X-Audio-Quality: [lossless|very_high|high|medium|low]
Cache-Control: public, max-age=2592000, immutable
```

### Stap 4: Geoptimaliseerde Streaming
- 64KB buffer (highWaterMark) voor vloeiend afspelen
- HTTP 206 range requests voor snelle seek
- Browser cache 30 dagen (geen re-download)

---

## Praktische Tips

### Voor Gebruikers (Upload Richtlijnen)
1. **Voorkeur formaten:**
   - FLAC (beste kwaliteit, grotere bestanden)
   - WAV (ongecomprimeerd, zeer groot)
   - MP3 320kbps (goed compromis)

2. **Vermijden:**
   - MP3 128kbps (artefacten hoorbaar)
   - Opnieuw gecomprimeerde files (twee keer MP3)
   - YouTube MP3 downloads

3. **Check bitrate:**
   ```bash
   # Windows PowerShell
   $file = "song.mp3"
   ffprobe -v error -show_entries format=duration,bit_rate -of default=noprint_wrappers=1:nokey=1:noinherit=1 $file
   
   # Linus/Mac
   ffprobe -v error -show_entries format=duration,bit_rate -of default $file
   ```

### Voor Development (Toekomstige Verbeteringen)
1. **FFmpeg integratie** (transcode FLAC → MP3 voor download):
   ```bash
   npm install fluent-ffmpeg
   ```

2. **LAME MP3 encoder** (320kbps optimization):
   ```bash
   npm install lamejs
   ```

3. **Audio Normalisatie** (LUFS metering):
   ```bash
   npm install loudness-meter
   ```

4. **Playlist Auto-Optimizing**:
   - Detecteer low-quality files
   - Waarschuw gebruiker
   - Suggest re-upload van bron

---

## Audio Quality Tier Indicators

In UI kunnen we tonen:
```
🎵 Lossless (FLAC/WAV)  - Best
💎 Very High (320kbps)   - Excellent
⭐ High (192-256kbps)    - Good
✓ Medium (128-192kbps)   - Fair
⚠ Low (<128kbps)         - Poor
```

---

## Huidige Implementatie Status

✅ **Gedaan:**
- Prioriteit voor FLAC/WAV formats
- Audio bitrate estimation
- Optimized streaming buffers
- Browser caching headers
- Quality monitoring headers

🔜 **Volgende:**
- FFmpeg FLAC → MP3 transcoding
- LUFS loudness normalization
- Auto-detect and warn on low quality
- Playlist analyzer tool

---

## Referenties
- [Spotify Audio Quality](https://support.spotify.com/us/article/high-quality-streaming/)
- [Ogg Vorbis Codec](https://xiph.org/vorbis/)
- [HTTP Range Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
