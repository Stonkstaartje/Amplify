const trackList = document.getElementById("tracks-list");
const searchInput = document.getElementById("search");
const uploadForm = document.getElementById("upload-form");
const uploadFeedback = document.getElementById("upload-feedback");
const uploadModal = document.getElementById("upload-modal");
const dragOverlay = document.getElementById("drag-overlay");
const playerInfo = document.getElementById("player-info");
const playerArtist = document.getElementById("player-artist");
const playerQuality = document.getElementById("player-quality-subtle");
const playerCover = document.getElementById("player-cover");
const trackListTitle = document.getElementById("track-list-title");
const playlistDetails = document.getElementById("playlist-details");
const playlistModal = document.getElementById("playlist-modal");
const playlistForm = document.getElementById("playlist-form");
const playlistFeedback = document.getElementById("playlist-feedback");
const playlistList = document.getElementById("playlist-list");
const audioPlayer = document.getElementById("audio-player");
const playPauseButton = document.getElementById("play-pause");
const seekBar = document.getElementById("seek");
const volumeSlider = document.getElementById("volume");
const currentTimeLabel = document.getElementById("current-time");
const durationLabel = document.getElementById("duration");
const prevButton = document.getElementById("prev-track");
const nextButton = document.getElementById("next-track");
const trackCountLabel = document.getElementById("track-count");
const fileInput = uploadForm.querySelector('[name="audio"]');
const API_BASE = "/api";

const optionsMenu = document.createElement("div");
optionsMenu.className = "track-options-menu hidden";
optionsMenu.innerHTML =
  '<button type="button" class="track-options-item" data-action="add">Toevoegen aan playlist</button><button type="button" class="track-options-item hidden" data-action="remove">Verwijder uit deze playlist</button><button type="button" class="track-options-item track-options-item--danger" data-action="delete">Permanent verwijderen</button>';
document.body.appendChild(optionsMenu);
const playlistMenu = document.createElement("div");
playlistMenu.className = "track-options-menu hidden";
playlistMenu.innerHTML =
  '<div class="playlist-submenu-header">Toevoegen aan playlist</div><div id="playlist-menu-items"></div>';
document.body.appendChild(playlistMenu);
const playlistOptionsMenu = document.createElement("div");
playlistOptionsMenu.className = "track-options-menu hidden";
playlistOptionsMenu.innerHTML =
  '<button type="button" class="track-options-item track-options-item--danger" data-action="delete-playlist">Playlist verwijderen</button>';
document.body.appendChild(playlistOptionsMenu);

const confirmationModal = document.createElement("div");
confirmationModal.className = "modal-backdrop";
confirmationModal.id = "confirmation-modal";
confirmationModal.setAttribute("role", "dialog");
confirmationModal.setAttribute("aria-modal", "true");
confirmationModal.setAttribute("aria-labelledby", "confirmation-title");
confirmationModal.innerHTML = `
  <div class="modal-dialog confirmation-dialog">
    <h2 id="confirmation-title">Weet je het zeker?</h2>
    <p id="confirmation-message" class="confirmation-message"></p>
    <div class="confirmation-actions">
      <button type="button" class="confirmation-cancel">Annuleren</button>
      <button type="button" class="confirmation-delete">Verwijderen</button>
    </div>
  </div>`;
document.body.appendChild(confirmationModal);
const confirmationTitle = confirmationModal.querySelector("#confirmation-title");
const confirmationMessage = confirmationModal.querySelector(
  "#confirmation-message",
);
const confirmationCancel = confirmationModal.querySelector(".confirmation-cancel");
const confirmationDelete = confirmationModal.querySelector(".confirmation-delete");
let resolveConfirmation = null;

let tracks = [],
  playlists = [],
  activePlaylist = null,
  currentTrackId = null,
  selectedTrackId = null,
  isSeeking = false,
  pendingPlaybackPosition = 0,
  lastSavedPlaybackSecond = -1;
const escapeHtml = (value = "") =>
  String(value).replace(
    /[&<>'"]/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#039;",
        '"': "&quot;",
      })[char],
  );
const formatTime = (seconds) =>
  `${Math.floor(Number(seconds || 0) / 60)}:${Math.floor(
    Number(seconds || 0) % 60,
  )
    .toString()
    .padStart(2, "0")}`;
const storageKeys = {
  playlistId: "amplify:last-playlist-id",
  playback: "amplify:last-playback",
  volume: "amplify:volume",
};

function savePreference(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {
    // Private browsing or disabled storage should not stop the player.
  }
}

function loadPreference(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function closeConfirmation(confirmed = false) {
  confirmationModal.classList.remove("visible");
  resolveConfirmation?.(confirmed);
  resolveConfirmation = null;
}

function confirmAction(title, message) {
  confirmationTitle.textContent = title;
  confirmationMessage.textContent = message;
  confirmationModal.classList.add("visible");
  confirmationDelete.focus();
  return new Promise((resolve) => {
    resolveConfirmation = resolve;
  });
}

confirmationCancel.addEventListener("click", () => closeConfirmation(false));
confirmationDelete.addEventListener("click", () => closeConfirmation(true));
confirmationModal.addEventListener("click", (event) => {
  if (event.target === confirmationModal) closeConfirmation(false);
});

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Laden mislukt.");
  return response.json();
}
async function fetchTracks(query = "") {
  const url = new URL(`${API_BASE}/tracks`, location.origin);
  if (query) url.searchParams.set("q", query);
  return (await fetchJson(url)).tracks || [];
}
async function fetchPlaylists() {
  return (await fetchJson(`${API_BASE}/playlists`)).playlists || [];
}
async function fetchPlaylistTracks(id) {
  return (await fetchJson(`${API_BASE}/playlists/${id}/tracks`)).tracks || [];
}

async function loadPlaylists() {
  try {
    playlists = await fetchPlaylists();
    if (activePlaylist && !playlists.some((p) => p.id === activePlaylist.id)) {
      activePlaylist = null;
    }
    renderPlaylists();
  } catch (error) {
    console.error("Playlists laden mislukt:", error);
    playlistList.innerHTML =
      '<p class="playlist-empty">Playlists zijn tijdelijk niet beschikbaar.</p>';
  }
}
function renderPlaylists() {
  const allTracksButton = `<button type="button" class="playlist-item${activePlaylist ? "" : " active"}" data-all-tracks="true">Alle nummers</button>`;
  const playlistButtons = playlists
    .map(
      (playlist) =>
        `<div class="playlist-row${activePlaylist?.id === playlist.id ? " active" : ""}"><button type="button" class="playlist-item" data-id="${playlist.id}">${escapeHtml(playlist.name)}</button><button type="button" class="playlist-menu-button" data-id="${playlist.id}" aria-label="Opties voor ${escapeHtml(playlist.name)}">⋯</button></div>`,
    )
    .join("");

  playlistList.innerHTML =
    allTracksButton +
    (playlistButtons || '<p class="playlist-empty">Nog geen playlists.</p>');
  playlistList
    .querySelector('[data-all-tracks="true"]')
    .addEventListener("click", () => {
      searchInput.value = "";
      localStorage.removeItem(storageKeys.playlistId);
      loadTracks();
    });
  playlistList.querySelectorAll(".playlist-item[data-id]").forEach((button) => {
    button.addEventListener("click", () => openPlaylist(Number(button.dataset.id)));
  });
  playlistList.querySelectorAll(".playlist-menu-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const rect = button.getBoundingClientRect();
      showPlaylistOptionsMenu(Number(button.dataset.id), rect.right, rect.top);
    });
  });
}
async function openPlaylist(id) {
  const data = await fetchJson(`${API_BASE}/playlists/${id}`);
  activePlaylist = data.playlist;
  tracks = await fetchPlaylistTracks(id);
  selectedTrackId = null;
  trackListTitle.textContent = activePlaylist.name;
  playlistDetails.textContent =
    activePlaylist.description || "Geen beschrijving.";
  searchInput.value = "";
  savePreference(storageKeys.playlistId, id);
  renderPlaylists();
  renderTracks(tracks);
}

function updatePlayButton() {
  playPauseButton.textContent =
    !audioPlayer.src || audioPlayer.paused ? "▶" : "❚❚";
}
function updateQualityDisplay(quality) {
  playerQuality.textContent =
    {
      lossless: "Lossless",
      very_high: "Very High · 320 kbps",
      high: "High · 192–256 kbps",
      medium: "Medium · 128–192 kbps",
      low: "Low · <128 kbps",
    }[quality] || "";
  playerQuality.className = `player-quality player-quality-subtle ${quality || ""}`;
}
function updatePlayerCover(track) {
  playerCover.replaceChildren();
  if (!track.cover_filename) {
    playerCover.textContent = "♫";
    return;
  }
  const image = document.createElement("img");
  image.src = `/uploads/${encodeURIComponent(track.cover_filename)}`;
  image.alt = `Hoes van ${track.title}`;
  image.addEventListener("error", () => playerCover.replaceChildren("♫"));
  playerCover.appendChild(image);
}
function currentTrackIndex() {
  return tracks.findIndex((track) => track.id === currentTrackId);
}
function setTrack(index, { autoplay = true, position = 0 } = {}) {
  const track = tracks[index];
  if (!track) return;
  savePlayback();
  selectedTrackId = currentTrackId = track.id;
  pendingPlaybackPosition = position;
  lastSavedPlaybackSecond = -1;
  audioPlayer.src = `${API_BASE}/stream/${track.id}`;
  playerInfo.textContent = track.title || "";
  playerArtist.textContent = track.artist || "";
  updatePlayerCover(track);
  currentTimeLabel.textContent = "0:00";
  durationLabel.textContent = `-${formatTime(track.duration_seconds)}`;
  seekBar.value = 0;
  updateRangeFill(seekBar);
  audioPlayer.load();
  renderTracks(tracks);
  if (autoplay) audioPlayer.play().catch(updatePlayButton);
}
function formatDate(timestamp) {
  return timestamp
    ? new Intl.DateTimeFormat("nl-NL", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(timestamp))
    : "Onbekend";
}

function renderTracks(items) {
  tracks = items;
  trackCountLabel.textContent = `${tracks.length} ${tracks.length === 1 ? "nummer" : "nummers"}`;
  if (!tracks.length) {
    trackList.innerHTML = '<p class="empty-state">Geen tracks gevonden.</p>';
    return;
  }
  trackList.innerHTML = tracks
    .map(
      (track, index) =>
        `<div class="track-card${track.id === currentTrackId ? " active" : track.id === selectedTrackId ? " selected" : ""}" data-index="${index}"><div class="track-number" data-index="${index}"><span class="track-number-text">${index + 1}</span><span class="track-number-play">▶</span></div><div class="track-art">${track.cover_filename ? `<img src="/uploads/${encodeURIComponent(track.cover_filename)}" alt="">` : '<span class="track-art-icon">♫</span>'}</div><div class="track-title-cell"><div class="track-name">${escapeHtml(track.title)}</div><div class="track-card-meta">${escapeHtml(track.artist)}</div></div><div class="track-album">${escapeHtml(track.album || "Geen album")}</div><div class="track-date">${formatDate(track.created_at)}</div><div class="track-duration">${formatTime(track.duration_seconds)}</div><button type="button" class="track-menu-button" data-index="${index}" aria-label="Track opties">⋯</button></div>`,
    )
    .join("");
  trackList.querySelectorAll(".track-art img").forEach((image) =>
    image.addEventListener("error", () => {
      image.replaceWith(
        Object.assign(document.createElement("span"), {
          className: "track-art-icon",
          textContent: "♫",
        }),
      );
    }),
  );
  trackList.querySelectorAll(".track-card").forEach((card) => {
    const index = Number(card.dataset.index);
    card.addEventListener("click", () => {
      selectedTrackId = tracks[index].id;
      renderTracks(tracks);
    });
    card.addEventListener("dblclick", () => setTrack(index));
    card.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      showOptionsMenu(index, event.clientX, event.clientY);
    });
  });
  trackList.querySelectorAll(".track-number").forEach((el) =>
    el.addEventListener("click", (event) => {
      event.stopPropagation();
      setTrack(Number(el.dataset.index));
    }),
  );
  trackList.querySelectorAll(".track-menu-button").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const rect = button.getBoundingClientRect();
      showOptionsMenu(Number(button.dataset.index), rect.right, rect.top);
    }),
  );
}
function positionMenu(menu, x, y) {
  menu.style.left = `${Math.min(x, innerWidth - 224)}px`;
  menu.style.top = `${Math.min(y, innerHeight - 160)}px`;
  menu.style.transform = "none";
  menu.classList.remove("hidden");
}
function hideMenus() {
  optionsMenu.classList.add("hidden");
  playlistMenu.classList.add("hidden");
  playlistOptionsMenu.classList.add("hidden");
}

function showPlaylistOptionsMenu(playlistId, x, y) {
  hideMenus();
  playlistOptionsMenu.dataset.playlistId = playlistId;
  positionMenu(playlistOptionsMenu, x, y);
}
function showOptionsMenu(index, x, y) {
  hideMenus();
  optionsMenu.dataset.index = index;
  optionsMenu
    .querySelector('[data-action="remove"]')
    .classList.toggle("hidden", !activePlaylist);
  positionMenu(optionsMenu, x, y);
}
function showPlaylistMenu(index) {
  const rect = optionsMenu.getBoundingClientRect();
  optionsMenu.classList.add("hidden");
  playlistMenu.dataset.index = index;
  playlistMenu.querySelector("#playlist-menu-items").innerHTML =
    playlists.length
      ? playlists
          .map(
            (p) =>
              `<button type="button" class="track-options-item" data-id="${p.id}">${escapeHtml(p.name)}</button>`,
          )
          .join("")
      : '<p class="playlist-menu-empty">Maak eerst een playlist.</p>';
  positionMenu(playlistMenu, rect.right + 6, rect.top);
}
async function addTrackToPlaylist(playlistId, index) {
  const track = tracks[index];
  if (!track) return;
  const response = await fetch(`${API_BASE}/playlists/${playlistId}/tracks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: track.id }),
  });
  hideMenus();
  if (!response.ok)
    alert(
      (await response.json().catch(() => ({}))).error || "Toevoegen mislukt.",
    );
}
async function removeTrackFromPlaylist(index) {
  if (!activePlaylist || !tracks[index]) return;
  await fetch(
    `${API_BASE}/playlists/${activePlaylist.id}/tracks/${tracks[index].id}`,
    { method: "DELETE" },
  );
  hideMenus();
  openPlaylist(activePlaylist.id);
}
async function deleteTrack(index) {
  if (!tracks[index]) return;
  const confirmed = await confirmAction(
    "Track permanent verwijderen?",
    `“${tracks[index].title}” wordt permanent verwijderd. Dit kan niet ongedaan worden gemaakt.`,
  );
  if (!confirmed) return;
  const response = await fetch(`${API_BASE}/tracks/${tracks[index].id}`, {
    method: "DELETE",
  });
  hideMenus();
  if (response.ok) loadTracks();
}

async function deletePlaylist() {
  const playlistId = Number(playlistOptionsMenu.dataset.playlistId);
  const playlist = playlists.find((item) => item.id === playlistId);
  if (!playlist) return;
  const confirmed = await confirmAction(
    "Playlist verwijderen?",
    `“${playlist.name}” wordt verwijderd. De tracks zelf blijven behouden.`,
  );
  if (!confirmed) return;

  const response = await fetch(`${API_BASE}/playlists/${playlistId}`, {
    method: "DELETE",
  });
  hideMenus();
  if (!response.ok) {
    alert((await response.json().catch(() => ({}))).error || "Verwijderen mislukt.");
    return;
  }

  if (activePlaylist?.id === playlistId) {
    localStorage.removeItem(storageKeys.playlistId);
    await loadTracks();
  }
  await loadPlaylists();
}
optionsMenu.addEventListener("click", (event) => {
  const action = event.target.dataset.action,
    index = Number(optionsMenu.dataset.index);
  if (action === "add") showPlaylistMenu(index);
  if (action === "remove") removeTrackFromPlaylist(index);
  if (action === "delete") deleteTrack(index);
});
playlistMenu.addEventListener("click", (event) => {
  if (event.target.dataset.id)
    addTrackToPlaylist(
      Number(event.target.dataset.id),
      Number(playlistMenu.dataset.index),
    );
});
playlistOptionsMenu.addEventListener("click", (event) => {
  if (event.target.dataset.action === "delete-playlist") deletePlaylist();
});
document.addEventListener("click", (event) => {
  if (
    !optionsMenu.contains(event.target) &&
    !playlistMenu.contains(event.target) &&
    !playlistOptionsMenu.contains(event.target)
  )
    hideMenus();
});

function updateRangeFill(range) {
  const percent =
    ((Number(range.value) - Number(range.min || 0)) /
      (Number(range.max || 100) - Number(range.min || 0))) *
    100;
  range.style.background = `linear-gradient(90deg, #1db954 ${percent}%, rgba(255,255,255,.12) ${percent}%)`;
}

function savePlayback() {
  if (!currentTrackId) return;
  savePreference(storageKeys.playback, {
    trackId: currentTrackId,
    position: Number(audioPlayer.currentTime || pendingPlaybackPosition || 0),
  });
}
playPauseButton.addEventListener("click", () => {
  if (audioPlayer.src)
    audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause();
});
prevButton.addEventListener("click", () => {
  const i = currentTrackIndex();
  if (i > 0) setTrack(i - 1);
});
nextButton.addEventListener("click", () => {
  const i = currentTrackIndex();
  if (i >= 0 && i < tracks.length - 1) setTrack(i + 1);
});
seekBar.addEventListener("input", () => {
  isSeeking = true;
  updateRangeFill(seekBar);
});
seekBar.addEventListener("change", () => {
  if (audioPlayer.duration)
    audioPlayer.currentTime =
      (Number(seekBar.value) / 100) * audioPlayer.duration;
  isSeeking = false;
});
volumeSlider.addEventListener("input", () => {
  audioPlayer.volume = Number(volumeSlider.value);
  savePreference(storageKeys.volume, audioPlayer.volume);
  updateRangeFill(volumeSlider);
});
audioPlayer.addEventListener("play", updatePlayButton);
audioPlayer.addEventListener("pause", () => {
  updatePlayButton();
  savePlayback();
});
audioPlayer.addEventListener("loadedmetadata", () => {
  if (pendingPlaybackPosition > 0) {
    audioPlayer.currentTime = Math.min(pendingPlaybackPosition, audioPlayer.duration || 0);
    pendingPlaybackPosition = 0;
  }
});
audioPlayer.addEventListener("loadstart", () => {
  const track = tracks[currentTrackIndex()];
  if (track)
    fetch(`${API_BASE}/stream/${track.id}`, { method: "HEAD" })
      .then((r) => updateQualityDisplay(r.headers.get("X-Audio-Quality")))
      .catch(() => updateQualityDisplay());
});
audioPlayer.addEventListener("timeupdate", () => {
  if (!audioPlayer.duration || isSeeking) return;
  seekBar.value = (audioPlayer.currentTime / audioPlayer.duration) * 100;
  currentTimeLabel.textContent = formatTime(audioPlayer.currentTime);
  durationLabel.textContent = `-${formatTime(audioPlayer.duration - audioPlayer.currentTime)}`;
  updateRangeFill(seekBar);
  if (Math.floor(audioPlayer.currentTime) !== lastSavedPlaybackSecond) {
    lastSavedPlaybackSecond = Math.floor(audioPlayer.currentTime);
    savePlayback();
  }
});
audioPlayer.addEventListener("ended", () => {
  const i = currentTrackIndex();
  if (i < tracks.length - 1) setTrack(i + 1);
});
async function loadTracks() {
  activePlaylist = null;
  trackListTitle.textContent = "Tracks";
  playlistDetails.textContent = "Alle nummers worden hier getoond.";
  try {
    renderTracks(await fetchTracks(searchInput.value.trim()));
  } catch (error) {
    trackList.innerHTML = `<p class="empty-state">${error.message}</p>`;
  }
  renderPlaylists();
}
searchInput.addEventListener("input", loadTracks);
function openModal(modal) {
  modal.classList.add("visible");
}
function closeModal(modal, form, feedback) {
  modal.classList.remove("visible");
  form.reset();
  feedback.textContent = "";
}
document
  .getElementById("open-upload-modal")
  .addEventListener("click", () => openModal(uploadModal));
document
  .getElementById("close-upload-modal")
  .addEventListener("click", () =>
    closeModal(uploadModal, uploadForm, uploadFeedback),
  );
document
  .getElementById("open-playlist-modal")
  .addEventListener("click", () => openModal(playlistModal));
document
  .getElementById("close-playlist-modal")
  .addEventListener("click", () =>
    closeModal(playlistModal, playlistForm, playlistFeedback),
  );
[uploadModal, playlistModal].forEach((modal) =>
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.classList.remove("visible");
  }),
);
window.addEventListener("keydown", (event) => {
  const target = event.target;
  const isInteractiveElement =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement ||
    target.isContentEditable;

  if (event.code === "Space" && !isInteractiveElement && audioPlayer.src) {
    event.preventDefault();
    if (audioPlayer.paused) audioPlayer.play();
    else audioPlayer.pause();
  }

  if (event.key === "Escape") {
    hideMenus();
    closeConfirmation(false);
    [uploadModal, playlistModal].forEach((modal) =>
      modal.classList.remove("visible"),
    );
  }
});
window.addEventListener("beforeunload", savePlayback);
function applyFileMetadata(file) {
  if (!file) return;
  const [artist, ...title] = file.name.replace(/\.[^.]+$/, "").split(" - ");
  if (title.length) {
    uploadForm.elements.artist.value = artist.trim();
    uploadForm.elements.title.value = title.join(" - ").trim();
  }
}
fileInput.addEventListener("change", () => applyFileMetadata(fileInput.files[0]));

let dragCounter = 0;
function isFileDrag(event) {
  return event.dataTransfer && Array.from(event.dataTransfer.types).includes("Files");
}
window.addEventListener("dragenter", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragCounter++;
  dragOverlay.classList.add("visible");
});
window.addEventListener("dragover", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
});
window.addEventListener("dragleave", (event) => {
  if (!isFileDrag(event)) return;
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dragOverlay.classList.remove("visible");
  }
});
window.addEventListener("drop", (event) => {
  if (!isFileDrag(event)) return;
  event.preventDefault();
  dragCounter = 0;
  dragOverlay.classList.remove("visible");
  const file = Array.from(event.dataTransfer.files).find((f) =>
    f.type.startsWith("audio/"),
  );
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  fileInput.files = transfer.files;
  applyFileMetadata(file);
  openModal(uploadModal);
});
uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(uploadForm),
    file = fileInput.files[0];
  if (file) {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = URL.createObjectURL(file);
    await new Promise((resolve) => {
      audio.addEventListener("loadedmetadata", () => {
        formData.append("duration_seconds", Math.floor(audio.duration));
        URL.revokeObjectURL(audio.src);
        resolve();
      });
      audio.addEventListener("error", resolve);
    });
  }
  uploadFeedback.textContent = "Uploaden…";
  const response = await fetch(`${API_BASE}/tracks`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    uploadFeedback.textContent =
      (await response.json().catch(() => ({}))).error || "Upload mislukt.";
    return;
  }
  closeModal(uploadModal, uploadForm, uploadFeedback);
  loadTracks();
});
playlistForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const response = await fetch(`${API_BASE}/playlists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(new FormData(playlistForm))),
  });
  if (!response.ok) {
    playlistFeedback.textContent =
      (await response.json().catch(() => ({}))).error || "Opslaan mislukt.";
    return;
  }
  closeModal(playlistModal, playlistForm, playlistFeedback);
  loadPlaylists();
});
updateRangeFill(seekBar);
const savedVolume = loadPreference(storageKeys.volume, 1);
audioPlayer.volume = Math.min(1, Math.max(0, Number(savedVolume)));
volumeSlider.value = audioPlayer.volume;
updateRangeFill(volumeSlider);
updatePlayButton();

async function initializeApp() {
  await Promise.allSettled([loadTracks(), loadPlaylists()]);

  const savedPlaylistId = Number(loadPreference(storageKeys.playlistId));
  if (savedPlaylistId && playlists.some((playlist) => playlist.id === savedPlaylistId)) {
    await openPlaylist(savedPlaylistId);
  }

  const savedPlayback = loadPreference(storageKeys.playback);
  const trackIndex = tracks.findIndex(
    (track) => track.id === Number(savedPlayback?.trackId),
  );
  if (trackIndex >= 0) {
    setTrack(trackIndex, {
      autoplay: false,
      position: Number(savedPlayback.position) || 0,
    });
  }
}

initializeApp();
