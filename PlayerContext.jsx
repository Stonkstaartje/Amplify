import { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';
import { api } from '../api';

const PlayerContext = createContext(null);

export function PlayerProvider({ children }) {
  const audioRef = useRef(new Audio());
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);

  const current = index >= 0 ? queue[index] : null;

  useEffect(() => {
    const audio = audioRef.current;
    const onTime = () => setProgress(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnd = () => next();
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue, index]);

  useEffect(() => {
    audioRef.current.volume = volume;
  }, [volume]);

  const playTrackList = useCallback((tracks, startIndex = 0) => {
    setQueue(tracks);
    setIndex(startIndex);
  }, []);

  useEffect(() => {
    if (!current) return;
    const audio = audioRef.current;
    audio.src = api.streamUrl(current.id);
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!current) return;
    if (audio.paused) { audio.play(); setIsPlaying(true); }
    else { audio.pause(); setIsPlaying(false); }
  };

  const next = () => setIndex((i) => (i + 1 < queue.length ? i + 1 : i));
  const prev = () => setIndex((i) => (i > 0 ? i - 1 : i));

  const seek = (time) => {
    audioRef.current.currentTime = time;
    setProgress(time);
  };

  return (
    <PlayerContext.Provider
      value={{ current, isPlaying, progress, duration, volume, setVolume, playTrackList, togglePlay, next, prev, seek, hasNext: index + 1 < queue.length, hasPrev: index > 0 }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export const usePlayer = () => useContext(PlayerContext);
