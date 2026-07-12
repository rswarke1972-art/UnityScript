"use strict";

const elements = {
  scripture: document.getElementById("scriptureSelect"),
  chapter: document.getElementById("chapterSelect"),
  provider: document.getElementById("providerInput"),
  videoId: document.getElementById("videoIdInput"),
  loadVideo: document.getElementById("loadVideoButton"),
  dataStatus: document.getElementById("dataStatus"),
  playerFrame: document.getElementById("playerFrame"),
  currentTime: document.getElementById("currentTime"),
  verseId: document.getElementById("currentVerseId"),
  verseProgress: document.getElementById("verseProgress"),
  previous: document.getElementById("previousButton"),
  save: document.getElementById("saveButton"),
  next: document.getElementById("nextButton"),
  saveStatus: document.getElementById("saveStatus"),
  savedCount: document.getElementById("savedCount"),
  savedList: document.getElementById("savedList"),
  export: document.getElementById("exportButton")
};

const state = {
  catalogue: {},
  chapters: [],
  selectedScripture: null,
  selectedChapterIndex: 0,
  verseIndex: 0,
  timestamps: {},
  player: null,
  playerReady: false,
  timeTimer: null
};

function setStatus(target, message, isError = false) {
  target.textContent = message;
  target.classList.toggle("error", isError);
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = String(safeSeconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`.padStart(5, "0");
}

function extractVideoId(value) {
  const trimmed = value.trim();
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/) || trimmed.match(/^([A-Za-z0-9_-]{11})$/);
  return match ? match[1] : "";
}

function createProviderId(name) {
  const normalized = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || "provider-1";
}
function relativeDataPath(path) {
  return path.startsWith("data/") ? path : `data/${path.replace(/^\.\//, "")}`;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
  return response.json();
}

function chapterEntry(label, id, verses) {
  return { label, id, verses: (verses || []).filter((verse) => verse && verse.id) };
}

async function normaliseScripture(data) {
  if (Array.isArray(data.chapters)) {
    return data.chapters.map((chapter, index) => chapterEntry(chapter.name || `Chapter ${index + 1}`, index + 1, chapter.verses));
  }

  if (!Array.isArray(data.books)) return [];

  const collected = [];
  for (let bookIndex = 0; bookIndex < data.books.length; bookIndex += 1) {
    const book = data.books[bookIndex];
    let chapters = book.chapters;
    let bookName = book.name || bookDataName(book, bookIndex);
    if (!Array.isArray(chapters) && book.filePath) {
      const bookData = await fetchJson(relativeDataPath(book.filePath));
      chapters = bookData.chapters;
      bookName = book.name || bookData.name || bookDataName(book, bookIndex);
    }
    if (!Array.isArray(chapters)) continue;
    chapters.forEach((chapter, chapterIndex) => {
      const chapterName = chapter.name || `Chapter ${chapterIndex + 1}`;
      collected.push(chapterEntry(`${bookName} · ${chapterName}`, `${bookIndex + 1}-${chapterIndex + 1}`, chapter.verses));
    });
  }
  return collected;
}

function bookDataName(book, index) {
  return book.id || `Book ${index + 1}`;
}

function currentChapter() {
  return state.chapters[state.selectedChapterIndex] || null;
}

function populateChapterOptions() {
  elements.chapter.replaceChildren();
  state.chapters.forEach((chapter, index) => {
    const option = new Option(chapter.label, String(index));
    elements.chapter.add(option);
  });
  elements.chapter.disabled = state.chapters.length === 0;
}

function resetChapterState() {
  state.verseIndex = 0;
  state.timestamps = {};
  updateVerseUi();
  updateSavedList();
  setStatus(elements.saveStatus, "Ready to mark the first verse in this chapter.");
}

function updateVerseUi() {
  const chapter = currentChapter();
  const verses = chapter ? chapter.verses : [];
  const currentVerse = verses[state.verseIndex];
  elements.verseId.textContent = currentVerse ? currentVerse.id : "—";
  elements.verseProgress.textContent = verses.length ? `${state.verseIndex + 1} of ${verses.length}` : "0 of 0";
  elements.previous.disabled = !currentVerse || state.verseIndex === 0;
  elements.next.disabled = !currentVerse || state.verseIndex >= verses.length - 1;
  elements.save.disabled = !currentVerse || !state.playerReady;
  elements.export.disabled = !chapter || Object.keys(state.timestamps).length === 0;
}

function updateSavedList() {
  const entries = Object.entries(state.timestamps).sort(([, left], [, right]) => left.start - right.start);
  elements.savedCount.textContent = `${entries.length} saved`;
  elements.savedList.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "empty-message";
    empty.textContent = "No timestamps saved for this chapter yet.";
    elements.savedList.append(empty);
    return;
  }
  entries.forEach(([verseId, timestamp]) => {
    const item = document.createElement("li");
    const verse = document.createElement("span");
    verse.textContent = verseId;
    const time = document.createElement("time");
    time.textContent = formatTime(timestamp.start);
    item.append(verse, time);
    elements.savedList.append(item);
  });
}

function updatePlayerTime() {
  if (!state.playerReady || !state.player || typeof state.player.getCurrentTime !== "function") return;
  elements.currentTime.textContent = formatTime(state.player.getCurrentTime());
}

function startTimeUpdates() {
  window.clearInterval(state.timeTimer);
  state.timeTimer = window.setInterval(updatePlayerTime, 300);
}

function onYouTubeIframeAPIReady() {
  window.timestampStudioYouTubeReady = true;
}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

async function waitForYouTubeApi() {
  if (window.YT && window.YT.Player) return;
  await new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("The YouTube player API did not load. Check your network connection and try again.")), 10000);
    const check = window.setInterval(() => {
      if (window.YT && window.YT.Player) {
        window.clearInterval(check);
        window.clearTimeout(timeout);
        resolve();
      }
    }, 100);
  });
}

async function loadVideo() {
  const videoId = extractVideoId(elements.videoId.value);
  if (!videoId) {
    setStatus(elements.dataStatus, "Enter a valid 11-character YouTube video ID or URL.", true);
    return;
  }

  elements.videoId.value = videoId;
  elements.loadVideo.disabled = true;
  setStatus(elements.dataStatus, "Loading YouTube player…");
  try {
    await waitForYouTubeApi();
    window.clearInterval(state.timeTimer);
    state.playerReady = false;
    if (state.player && typeof state.player.destroy === "function") state.player.destroy();
    elements.playerFrame.replaceChildren();
    const playerHost = document.createElement("div");
    playerHost.id = "youtubePlayer";
    elements.playerFrame.append(playerHost);
    state.player = new window.YT.Player("youtubePlayer", {
      videoId,
      playerVars: { rel: 0, modestbranding: 1 },
      events: {
        onReady: () => {
          state.playerReady = true;
          startTimeUpdates();
          updateVerseUi();
          setStatus(elements.dataStatus, "Video loaded. Start playback, then save each verse as it begins.");
        },
        onError: () => {
          state.playerReady = false;
          updateVerseUi();
          setStatus(elements.dataStatus, "YouTube could not load this video. Check that it exists and allows embedding.", true);
        }
      }
    });
  } catch (error) {
    setStatus(elements.dataStatus, error.message, true);
  } finally {
    elements.loadVideo.disabled = false;
  }
}

function moveVerse(direction) {
  const chapter = currentChapter();
  if (!chapter) return;
  state.verseIndex = Math.min(Math.max(state.verseIndex + direction, 0), chapter.verses.length - 1);
  updateVerseUi();
  setStatus(elements.saveStatus, "");
}

function saveTimestamp() {
  const chapter = currentChapter();
  const verse = chapter && chapter.verses[state.verseIndex];
  if (!verse || !state.playerReady) return;
  const start = Math.max(0, Math.floor(state.player.getCurrentTime()));
  state.timestamps[verse.id] = { start };
  updateSavedList();
  const isLastVerse = state.verseIndex === chapter.verses.length - 1;
  setStatus(elements.saveStatus, `${verse.id} saved at ${formatTime(start)}.${isLastVerse ? " This is the final verse in the chapter." : " Moving to the next verse."}`);
  if (!isLastVerse) state.verseIndex += 1;
  updateVerseUi();
}

function exportTimestamps() {
  const chapter = currentChapter();
  const videoId = extractVideoId(elements.videoId.value);
  if (!chapter || !videoId || Object.keys(state.timestamps).length === 0) return;
  const providerName = elements.provider.value.trim() || "Unnamed provider";
  const payload = {
    scripture: state.selectedScripture,
    chapter: chapter.id,
    chapterLabel: chapter.label,
    providers: [
      {
        id: createProviderId(providerName),
        name: providerName,
        videoId,
        verses: state.timestamps
      }
    ]
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const filename = `${state.selectedScripture}-${chapter.id}-${videoId}-timestamps.json`.replace(/[^A-Za-z0-9._-]/g, "-");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setStatus(elements.saveStatus, `Exported ${Object.keys(state.timestamps).length} timestamps.`);
}

async function selectScripture(scriptureId) {
  state.selectedScripture = scriptureId;
  elements.chapter.disabled = true;
  setStatus(elements.dataStatus, "Loading chapters…");
  try {
    const info = state.catalogue[scriptureId];
    const scripture = await fetchJson(info.filePath);
    state.chapters = await normaliseScripture(scripture);
    state.selectedChapterIndex = 0;
    populateChapterOptions();
    resetChapterState();
    setStatus(elements.dataStatus, `${state.chapters.length} chapters loaded for ${info.name}.`);
  } catch (error) {
    state.chapters = [];
    populateChapterOptions();
    resetChapterState();
    setStatus(elements.dataStatus, error.message, true);
  }
}

async function initialise() {
  try {
    state.catalogue = await fetchJson("data/scriptures-meta.json");
    elements.scripture.replaceChildren();
    Object.values(state.catalogue).forEach((scripture) => elements.scripture.add(new Option(scripture.name, scripture.id)));
    elements.scripture.disabled = false;
    await selectScripture(elements.scripture.value);
  } catch (error) {
    setStatus(elements.dataStatus, error.message, true);
  }
}

elements.scripture.addEventListener("change", () => selectScripture(elements.scripture.value));
elements.chapter.addEventListener("change", () => {
  state.selectedChapterIndex = Number(elements.chapter.value);
  resetChapterState();
});
elements.loadVideo.addEventListener("click", loadVideo);
elements.previous.addEventListener("click", () => moveVerse(-1));
elements.next.addEventListener("click", () => moveVerse(1));
elements.save.addEventListener("click", saveTimestamp);
elements.export.addEventListener("click", exportTimestamps);
document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "s" && !event.ctrlKey && !event.metaKey && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    saveTimestamp();
  }
});

updateSavedList();
initialise();
