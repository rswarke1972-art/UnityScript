// Central App State & Cache
const state = {
  metadata: null,
  scriptureCache: {},
  bookCache: {},
  audioCapabilities: null
};

// ------------------ UTILS & RETRY FETCH ------------------

async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      console.warn(`Fetch attempt ${i + 1} failed for ${url}. Retrying in ${delay}ms...`, err);
      await new Promise(res => setTimeout(res, delay));
      delay *= 2; // exponential backoff
    }
  }
}

async function fetchMetadata() {
  if (state.metadata) return state.metadata;
  try {
    const res = await fetchWithRetry("data/scriptures-meta.json");
    state.metadata = await res.json();
    return state.metadata;
  } catch (err) {
    throw new Error(`Could not load scriptures metadata: ${err.message}`);
  }
}

async function getScriptureData(scriptureId) {
  if (state.scriptureCache[scriptureId]) {
    return state.scriptureCache[scriptureId];
  }

  const meta = await fetchMetadata();
  const bookInfo = meta[scriptureId];
  if (!bookInfo) {
    throw new Error(`Scripture ID "${scriptureId}" is not registered in metadata.`);
  }

  try {
    const res = await fetchWithRetry(bookInfo.filePath);
    const data = await res.json();
    state.scriptureCache[scriptureId] = data;
    return data;
  } catch (err) {
    throw new Error(`Failed to load scripture file for "${scriptureId}": ${err.message}`);
  }
}

async function getAudioCapability(scriptureId) {
  if (state.audioCapabilities === null) {
    try {
      const response = await fetchWithRetry("data/audio/audio-capabilities.json", { cache: "no-cache" });
      state.audioCapabilities = await response.json();
    } catch (error) {
      console.warn("Unable to load audio capabilities.", error);
      state.audioCapabilities = {};
    }
  }

  return state.audioCapabilities[scriptureId] || null;
}

function renderAudioControls(capability) {
  if (!capability) return "";

  const aiLabel = capability.aiLabel || "AI Audio";
  const humanLabel = capability.humanLabel || "Human Audio";
  const aiAvailable = capability.ai === "vagdhenu";
  const aiControl = aiAvailable
    ? `
        <button id="chantBtn" class="level-btn" type="button">
          &#129302; ${aiLabel}
        </button>
        <button id="downloadBtn" class="level-btn" type="button" disabled>
          &#11015; Download
        </button>`
    : `
        <div class="audio-unavailable" role="status">
          <button class="level-btn" type="button" disabled>&#129302; ${aiLabel}</button>
          <span>Not available.</span>
        </div>`;
  const humanControl = capability.human
    ? `
        <button id="humanChantBtn" class="level-btn" type="button">
          &#128250; ${humanLabel}
        </button>`
    : "";

  return `
    <section class="collapsible-section" data-section-key="audio" data-section-label="Audio">
      <div class="chant-controls audio-controls">
        <button id="audioMenuBtn" class="level-btn" type="button" aria-expanded="false" aria-controls="audioOptions" onclick="toggleAudioOptions()">
          &#127911; Audio
        </button>
        <div id="audioOptions" class="audio-options" hidden>
          ${aiControl}
          ${humanControl}
        </div>
      </div>
    </section>`;
}
async function getBookData(scriptureId, bookIndex) {
  const cacheKey = `${scriptureId}_book_${bookIndex}`;
  if (state.bookCache[cacheKey]) {
    return state.bookCache[cacheKey];
  }

  const meta = await fetchMetadata();
  const bookInfo = meta[scriptureId];
  if (!bookInfo) {
    throw new Error(`Scripture ID "${scriptureId}" is not registered in metadata.`);
  }

  try {
    const res = await fetchWithRetry(bookInfo.filePath);
    const indexData = await res.json();

    // Extract book metadata
    const bookMeta = indexData.books[bookIndex];
    if (!bookMeta) {
      throw new Error(`Book index ${bookIndex + 1} does not exist in index.`);
    }

    // Load the specific book file
    const bookRes = await fetchWithRetry(bookMeta.filePath);
    const bookData = await bookRes.json();

    // Combine index + book data for compatibility
    const combinedData = {
      ...indexData,
      books: [bookData]
    };

    state.bookCache[cacheKey] = combinedData;
    return combinedData;
  } catch (err) {
    throw new Error(`Failed to load book ${bookIndex + 1}: ${err.message}`);
  }
}

// ------------------ ROUTING UTILS ------------------

function parseQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    scriptureId: params.get('s'),
    book: params.get('b') ? parseInt(params.get('b'), 10) - 1 : null,     // 0-indexed
    chapter: params.get('c') ? parseInt(params.get('c'), 10) - 1 : null, // 0-indexed
    verse: params.get('v') ? parseInt(params.get('v'), 10) - 1 : null     // 0-indexed
  };
}

// ------------------ LOADING & ERROR VIEWS ------------------

function showLoading() {
  const app = document.getElementById("app");
  if (app) {
    app.innerHTML = `
      <div class="loading-container" style="padding: 50px 20px;">
        <div class="spinner"></div>
        <p style="margin-top: 15px; font-size: 16px; opacity: 0.8;">Loading divine wisdom...</p>
      </div>
    `;
  }
}

function showError(message, details = "") {
  const app = document.getElementById("app");
  if (app) {
    app.innerHTML = `
      <div class="card error-card" style="border: 1px solid #d97706; background: #1a0f02; color: #ffd27a;">
        <h2 style="color: #ffb347; margin-top: 0;">⚠️ Operation Error</h2>
        <p style="font-size: 15px; line-height: 1.6;">${message}</p>
        ${details ? `<pre style="background: rgba(0,0,0,0.4); padding: 10px; border-radius: 8px; font-size: 12px; overflow-x: auto; color: #ff8c00; text-align: left;">${details}</pre>` : ""}
        <div class="nav" style="justify-content: center; margin-top: 20px;">
          <button onclick="window.location.href='index.html'">⬅ Back to Home</button>
        </div>
      </div>
    `;
  }
}

// ------------------ PWA INTEGRATION ------------------

let deferredPrompt = null;

function setupPWA() {
  // Create status banner element dynamically
  const banner = document.createElement("div");
  banner.id = "pwa-status-banner";
  banner.className = "pwa-banner";
  document.body.insertBefore(banner, document.body.firstChild);

  // Monitor online status
  function updateOnlineStatus() {
    const isOnline = navigator.onLine;
    if (isOnline) {
      banner.innerText = "🟢 Back Online - Content Synced";
      banner.className = "pwa-banner online";
      setTimeout(() => {
        banner.style.display = "none";
      }, 3000);
    } else {
      banner.innerText = "📴 Reading Offline Mode";
      banner.className = "pwa-banner offline";
      banner.style.display = "block";
    }
  }

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // Run initial check
  if (!navigator.onLine) {
    updateOnlineStatus();
  }

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then((reg) => {
          console.log('[PWA] Service Worker registered with scope:', reg.scope);

          // Handle updates
          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  showUpdateBanner();
                }
              }
            };
          };
        })
        .catch((err) => console.error('[PWA] Service Worker registration failed:', err));
    });
  }

  // PWA Install Event Handler
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  // iOS Safari Prompt detection
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isIOS && !isStandalone) {
    showIOSInstallInstruction();
  }
}

function showUpdateBanner() {
  const banner = document.getElementById("pwa-status-banner");
  if (banner) {
    banner.innerText = "✨ New Version Available! Click to Reload.";
    banner.className = "pwa-banner update";
    banner.style.display = "block";
    banner.onclick = () => {
      window.location.reload();
    };
  }
}

function showInstallBanner() {
  if (document.getElementById("pwa-install-banner")) return;

  const banner = document.createElement("div");
  banner.id = "pwa-install-banner";
  banner.className = "pwa-install-banner";
  banner.innerHTML = `
    <div class="pwa-install-content">
      <span>📲 Install UnityScript for offline access!</span>
      <div class="pwa-install-actions">
        <button id="pwa-install-btn" class="level-btn mini-btn">Install</button>
        <button id="pwa-close-install-btn" class="back-btn mini-btn" style="margin: 0;">Later</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById("pwa-install-btn").onclick = () => {
    banner.style.display = "none";
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          showInstallSuccessFeedback();
        }
        deferredPrompt = null;
      });
    }
  };

  document.getElementById("pwa-close-install-btn").onclick = () => {
    banner.style.display = "none";
  };
}

function showIOSInstallInstruction() {
  if (document.getElementById("pwa-ios-banner")) return;

  const banner = document.createElement("div");
  banner.id = "pwa-ios-banner";
  banner.className = "pwa-install-banner";
  banner.innerHTML = `
    <div class="pwa-install-content">
      <span>📱 Add to Home Screen: tap the Share button <img src="icons/icon-72.png" style="width: 16px; height: 16px; vertical-align: middle; border-radius: 4px;"> then "Add to Home Screen"</span>
      <button id="pwa-close-ios-btn" class="back-btn mini-btn" style="margin: 0; padding: 4px 10px;">Dismiss</button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById("pwa-close-ios-btn").onclick = () => {
    banner.style.display = "none";
  };
}

function showInstallSuccessFeedback() {
  const banner = document.getElementById("pwa-status-banner");
  if (banner) {
    banner.innerText = "🎉 UnityScript successfully installed!";
    banner.className = "pwa-banner online";
    banner.style.display = "block";
    setTimeout(() => {
      banner.style.display = "none";
    }, 4000);
  }
}

// ------------------ STARTUP BOOTSTRAP ------------------

document.addEventListener("DOMContentLoaded", () => {
  setupPWA();

  const path = window.location.pathname;

  if (path.includes("chapters.html")) {
    loadChapters();
  } else if (path.includes("verses.html")) {
    loadVerses();
  } else if (path.includes("viewer.html")) {
    renderVerse();
  } else {
    // Default to index page
    loadBooks();
  }
});

// ------------------ HOME PAGE (BOOKS) ------------------

async function loadBooks() {
  const app = document.getElementById("app");
  if (!app) return;

  showLoading();
  try {
    const meta = await fetchMetadata();
    app.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "grid";

    for (const [id, book] of Object.entries(meta)) {
      const btn = document.createElement("button");
      btn.className = "level-btn";
      btn.innerText = book.name;

      btn.onclick = async () => {
        showLoading();
        try {
          const scriptureData = await getScriptureData(id);
          // Sync state with localStorage for backwards compatibility
          localStorage.setItem("scriptureId", id);
          window.location.href = `chapters.html?s=${id}`;
        } catch (err) {
          showError("Could not load selected scripture data", err.message);
        }
      };
      grid.appendChild(btn);
    }
    app.appendChild(grid);
  } catch (err) {
    showError("Could not display scripture books list", err.message);
  }
}

// ------------------ CHAPTERS SCREEN ------------------

async function loadChapters() {
  const app = document.getElementById("app");
  if (!app) return;

  showLoading();
  try {
    const route = parseQueryParams();
    // Fallback lookup chain: query parameter first, then localStorage
    const scriptureId = route.scriptureId || localStorage.getItem("scriptureId");

    if (!scriptureId) {
      window.location.href = "index.html";
      return;
    }

    const scriptureData = await getScriptureData(scriptureId);

    // Sync state
    localStorage.setItem("scriptureId", scriptureId);

    app.innerHTML = "";

    const backBtn = document.querySelector(".nav button");
    const headerTitle = document.querySelector(".header h1");
    const subtitle = document.querySelector(".subtitle");

    if (scriptureData.books) {
      // Books-enabled flow (e.g. Bible)
      const bookIndex = route.book;

      if (bookIndex === null || isNaN(bookIndex) || bookIndex < 0 || bookIndex >= scriptureData.books.length) {
        // Step 1: Render Books List
        if (headerTitle) headerTitle.innerText = `📖 ${scriptureData.name}`;
        if (subtitle) subtitle.innerText = "Choose a Book";
        if (backBtn) {
          backBtn.onclick = () => { window.location.href = "index.html"; };
          backBtn.innerText = "⬅ Back to Scriptures";
        }

        const pathDiv = document.createElement("div");
        pathDiv.className = "path";
        pathDiv.innerText = scriptureData.name;
        app.appendChild(pathDiv);

        const grid = document.createElement("div");
        grid.className = "grid";

        scriptureData.books.forEach((book, i) => {
          const btn = document.createElement("button");
          btn.className = "level-btn";
          btn.innerText = book.name;

          btn.onclick = () => {
            localStorage.setItem("bookIndex", i);
            window.location.href = `chapters.html?s=${scriptureId}&b=${i + 1}`;
          };

          grid.appendChild(btn);
        });
        app.appendChild(grid);
      } else {
        // Step 2: Render Chapters List for Selected Book
        // Load specific book data for lazy loading (Bible only)
        let book;
        if (scriptureId === 'bible' && scriptureData.books[bookIndex].filePath) {
          const data = await getBookData(scriptureId, bookIndex);
          book = data.books[0];
        } else {
          book = scriptureData.books[bookIndex];
        }

        if (headerTitle) headerTitle.innerText = `📖 ${book.name}`;
        if (subtitle) subtitle.innerText = "Choose a Chapter";
        if (backBtn) {
          backBtn.onclick = () => { window.location.href = `chapters.html?s=${scriptureId}`; };
          backBtn.innerText = "⬅ Back to Books";
        }

        const pathDiv = document.createElement("div");
        pathDiv.className = "path";
        pathDiv.innerText = `${scriptureData.name} ➔ ${book.name}`;
        app.appendChild(pathDiv);

        const grid = document.createElement("div");
        grid.className = "grid";

        book.chapters.forEach((ch, i) => {
          const btn = document.createElement("button");
          btn.className = "level-btn";
          btn.innerText = ch.name;

          btn.onclick = () => {
            localStorage.setItem("bookIndex", bookIndex);
            localStorage.setItem("chapterIndex", i);
            window.location.href = `verses.html?s=${scriptureId}&b=${bookIndex + 1}&c=${i + 1}`;
          };

          grid.appendChild(btn);
        });
        app.appendChild(grid);
      }
    } else {
      // Flat Chapters flow
      if (headerTitle) headerTitle.innerText = `📖 ${scriptureData.name}`;
      if (subtitle) subtitle.innerText = "Choose a Chapter";
      if (backBtn) {
        backBtn.onclick = () => { window.location.href = "index.html"; };
        backBtn.innerText = "⬅ Back to Scriptures";
      }

      const pathDiv = document.createElement("div");
      pathDiv.className = "path";
      pathDiv.innerText = scriptureData.name;
      app.appendChild(pathDiv);

      const grid = document.createElement("div");
      grid.className = "grid";

      scriptureData.chapters.forEach((ch, i) => {
        const btn = document.createElement("button");
        btn.className = "level-btn";
        btn.innerText = ch.name;

        btn.onclick = () => {
          localStorage.setItem("chapterIndex", i);
          window.location.href = `verses.html?s=${scriptureId}&c=${i + 1}`;
        };

        grid.appendChild(btn);
      });
      app.appendChild(grid);
    }
  } catch (err) {
    showError("Failed to render chapters list", err.message);
  }
}

// ------------------ VERSES SCREEN ------------------

async function loadVerses() {
  const app = document.getElementById("app");
  if (!app) return;

  showLoading();
  try {
    const route = parseQueryParams();
    const scriptureId = route.scriptureId || localStorage.getItem("scriptureId");

    if (!scriptureId) {
      window.location.href = "index.html";
      return;
    }

    let scriptureData = await getScriptureData(scriptureId);
    localStorage.setItem("scriptureId", scriptureId);

    let bookIndex = null;
    let chapterIndex = route.chapter;
    let usedLazyLoading = false;

    if (scriptureData.books) {
      bookIndex = route.book;
      if (bookIndex === null) {
        const storedBookIdx = localStorage.getItem("bookIndex");
        bookIndex = storedBookIdx !== null ? parseInt(storedBookIdx, 10) : null;
      }

      // Load specific book data for lazy loading (Bible only)
      if (scriptureId === 'bible' && bookIndex !== null && !isNaN(bookIndex) && scriptureData.books[bookIndex].filePath) {
        scriptureData = await getBookData(scriptureId, bookIndex);
        usedLazyLoading = true;
      }
    }

    if (chapterIndex === null) {
      const storedIdx = localStorage.getItem("chapterIndex");
      chapterIndex = storedIdx !== null ? parseInt(storedIdx, 10) : null;
    }

    if (chapterIndex === null || isNaN(chapterIndex) || (scriptureData.books && (bookIndex === null || isNaN(bookIndex)))) {
      window.location.href = "index.html";
      return;
    }

    let chapter = null;
    let pathLabel = "";

    if (scriptureData.books) {
      const book = usedLazyLoading ? scriptureData.books[0] : scriptureData.books[bookIndex];
      if (!book) {
        throw new Error(`Book index ${bookIndex + 1} does not exist.`);
      }
      chapter = book.chapters[chapterIndex];
      if (!chapter) {
        throw new Error(`Chapter index ${chapterIndex + 1} does not exist in book "${book.name}".`);
      }
      localStorage.setItem("bookIndex", bookIndex);
      localStorage.setItem("chapterIndex", chapterIndex);
      pathLabel = `${scriptureData.name} ➔ ${book.name} ➔ ${chapter.name}`;
    } else {
      chapter = scriptureData.chapters[chapterIndex];
      if (!chapter) {
        throw new Error(`Chapter index ${chapterIndex + 1} does not exist in "${scriptureData.name}".`);
      }
      localStorage.setItem("chapterIndex", chapterIndex);
      pathLabel = `${scriptureData.name} ➔ ${chapter.name}`;
    }

    app.innerHTML = "";

    const pathDiv = document.createElement("div");
    pathDiv.className = "path";
    pathDiv.innerText = pathLabel;
    app.appendChild(pathDiv);

    const grid = document.createElement("div");
    grid.className = "grid";

    const verses = chapter.verses || [];
    verses.forEach((v, i) => {
      const btn = document.createElement("button");
      btn.className = "level-btn";
      btn.innerText = "Verse " + (i + 1);

      btn.onclick = () => {
        localStorage.setItem("verseIndex", i);
        if (scriptureData.books) {
          window.location.href = `viewer.html?s=${scriptureId}&b=${bookIndex + 1}&c=${chapterIndex + 1}&v=${i + 1}`;
        } else {
          window.location.href = `viewer.html?s=${scriptureId}&c=${chapterIndex + 1}&v=${i + 1}`;
        }
      };

      grid.appendChild(btn);
    });

    app.appendChild(grid);

    // Wire up navigation fallback URL cleanly
    const backBtn = document.querySelector(".nav button");
    if (backBtn) {
      if (scriptureData.books) {
        backBtn.onclick = () => {
          window.location.href = `chapters.html?s=${scriptureId}&b=${bookIndex + 1}`;
        };
        backBtn.innerText = "⬅ Back to Chapters";
      } else {
        backBtn.onclick = () => {
          window.location.href = `chapters.html?s=${scriptureId}`;
        };
        backBtn.innerText = "⬅ Back to Chapters";
      }
    }
  } catch (err) {
    showError("Failed to render verses grid", err.message);
  }
}

// ------------------ VIEWER SCREEN ------------------

async function renderVerse() {
  const app = document.getElementById("app");
  if (!app) return;

  showLoading();
  try {
    const route = parseQueryParams();
    const scriptureId = route.scriptureId || localStorage.getItem("scriptureId");

    if (!scriptureId) {
      window.location.href = "index.html";
      return;
    }

    let scriptureData = await getScriptureData(scriptureId);
    const audioCapability = await getAudioCapability(scriptureId);
    localStorage.setItem("scriptureId", scriptureId);

    let bookIndex = null;
    let chapterIndex = route.chapter;
    let verseIndex = route.verse;
    let usedLazyLoading = false;

    if (scriptureData.books) {
      bookIndex = route.book;
      if (bookIndex === null) {
        const storedBookIdx = localStorage.getItem("bookIndex");
        bookIndex = storedBookIdx !== null ? parseInt(storedBookIdx, 10) : null;
      }

      // Load specific book data for lazy loading (Bible only)
      if (scriptureId === 'bible' && bookIndex !== null && !isNaN(bookIndex) && scriptureData.books[bookIndex].filePath) {
        scriptureData = await getBookData(scriptureId, bookIndex);
        usedLazyLoading = true;
      }
    }

    if (chapterIndex === null) {
      const storedIdx = localStorage.getItem("chapterIndex");
      chapterIndex = storedIdx !== null ? parseInt(storedIdx, 10) : null;
    }

    if (verseIndex === null) {
      const storedIdx = localStorage.getItem("verseIndex");
      verseIndex = storedIdx !== null ? parseInt(storedIdx, 10) : null;
    }

    if (chapterIndex === null || verseIndex === null || isNaN(chapterIndex) || isNaN(verseIndex) || (scriptureData.books && (bookIndex === null || isNaN(bookIndex)))) {
      window.location.href = "index.html";
      return;
    }

    let chapter = null;
    let bookName = "";

    if (scriptureData.books) {
      const book = usedLazyLoading ? scriptureData.books[0] : scriptureData.books[bookIndex];
      if (!book) {
        throw new Error(`Book index ${bookIndex + 1} does not exist.`);
      }
      bookName = book.name;
      chapter = book.chapters[chapterIndex];
      if (!chapter) {
        throw new Error(`Chapter index ${chapterIndex + 1} does not exist in book "${book.name}".`);
      }
      localStorage.setItem("bookIndex", bookIndex);
      localStorage.setItem("chapterIndex", chapterIndex);
      localStorage.setItem("verseIndex", verseIndex);
    } else {
      chapter = scriptureData.chapters[chapterIndex];
      if (!chapter) {
        throw new Error(`Chapter ${chapterIndex + 1} does not exist in "${scriptureData.name}".`);
      }
      localStorage.setItem("chapterIndex", chapterIndex);
      localStorage.setItem("verseIndex", verseIndex);
    }

    const v = chapter.verses?.[verseIndex];
    if (!v) {
      throw new Error(`Verse ${verseIndex + 1} does not exist in chapter "${chapter.name}".`);
    }

    const totalVerses = chapter.verses.length;

    // Update structural layout details
    const headerTitle = document.querySelector(".header h1");
    if (headerTitle) {
      if (scriptureData.books) {
        headerTitle.innerText = `${scriptureData.name} - ${bookName} - ${chapter.name}`;
      } else {
        headerTitle.innerText = `${scriptureData.name} - ${chapter.name}`;
      }
    }
    const subtitle = document.querySelector(".subtitle");
    if (subtitle) {
      subtitle.innerText = `Verse ${verseIndex + 1} of ${totalVerses}`;
    }

    // Detect special fonts using language indicators
    let originalClass = "verse-original";
    if (scriptureData.language === "arabic") originalClass += " arabic";
    else if (scriptureData.language === "punjabi") originalClass += " gurmukhi";
    else if (scriptureData.language === "chinese") originalClass += " chinese";
    else if (scriptureData.language === "japanese") originalClass += " japanese";

    app.innerHTML = `
      <div class="card">
        <div class="collapsible-toolbar" role="group" aria-label="Verse section controls">
          <button id="expandAllSectionsBtn" class="collapsible-toolbar-button" type="button">Expand All</button>
          <button id="collapseAllSectionsBtn" class="collapsible-toolbar-button" type="button">Collapse All</button>
        </div>
        <!-- ✅ MAIN VERSE (ORIGINAL FIRST) -->
        <section class="collapsible-section verse-primary-section" data-section-key="original-verse" data-section-label="Original Verse">
          <h2 class="${originalClass}">
            ${v.verse.original
              || v.verse.original_sanskrit
              || v.verse.original_arabic
              || v.verse.original_hebrew
              || v.verse.original_sanskrit_accented
              || v.verse.original_gurmukhi
              || ""}
          </h2>
        </section>

        <section class="collapsible-section" data-section-key="transliteration" data-section-label="Transliteration">
          <p class="transliteration"><i>${v.verse.transliteration || ""}</i></p>
        </section>

        <section class="collapsible-section" data-section-key="translation" data-section-label="Translation">
          <p class="translation">${v.verse.translation}</p>
        </section>

        <section class="collapsible-section" data-section-key="ai-study-companion" data-section-label="AI Study Companion">
          <div class="study-companion-controls">
            <button id="studyCompanionBtn" class="level-btn" type="button">&#128172; AI Study Companion</button>
          </div>
        </section>

        <section class="collapsible-section" data-section-key="chant-practice" data-section-label="Chant Practice">
          <div class="chant-practice-controls">
            <button id="chantPracticeBtn" class="level-btn" type="button">&#127897; Chant Practice</button>
          </div>
        </section>

${renderAudioControls(audioCapability)}

        <!-- SOURCE -->
        ${v.source ? `
        <div class="section collapsible-section">
          <h3>Source</h3>
          <p><b>Text:</b> ${v.source.text || ""}</p>
          <p><b>Speaker:</b> ${v.source.author_speaker || ""}</p>
          <p>${v.source.context || ""}</p>
        </div>` : ""}

        <!-- MEANING -->
        ${v.meaning ? `
        <div class="section collapsible-section">
          <h3>Meaning</h3>
          <p><b>Overall:</b> ${v.meaning.overall || ""}</p>
          <p><b>Word-by-word:</b> ${v.meaning.word_by_word || ""}</p>
        </div>` : ""}

        <!-- INTERPRETATION -->
        ${v.interpretation ? `
        <div class="section collapsible-section">
          <h3>Interpretation</h3>
          <p>${formatText(v.interpretation?.traditional)}</p>
          <p><b>Principle:</b> ${v.interpretation.core_principle || ""}</p>
          <p>${v.interpretation.psychological || ""}</p>
        </div>` : ""}

        <!-- EXPLANATION -->
        ${v.explanation ? `
        <div class="section collapsible-section">
          <h3>Explanation</h3>
          <p>${formatText(v.explanation?.simple)}</p>
          <p>${formatText(v.explanation?.deep)}</p>
        </div>` : ""}

        <!-- REASONING -->
        ${v.reasoning ? `
        <div class="section collapsible-section">
          <h3>Reasoning</h3>
          ${v.reasoning.logic ? `
            <p><b>Premise:</b> ${v.reasoning.logic.premise || ""}</p>
            <p><b>Observation:</b> ${v.reasoning.logic.observation || ""}</p>
            <p><b>Conclusion:</b> ${v.reasoning.logic.conclusion || ""}</p>
          ` : ""}
          ${v.reasoning.flow ? `
            <p><b>Flow:</b> ${v.reasoning.flow}</p>
          ` : ""}
        </div>` : ""}

        <!-- TENSION -->
        ${v.tension ? `
        <div class="section collapsible-section">
          <h3>Tension</h3>
          <p><b>Doubt:</b> ${v.tension.human_doubt || ""}</p>
          <p><b>Resolution:</b> ${v.tension.resolution || ""}</p>
        </div>` : ""}

        <!-- CONTRAST -->
        ${v.contrast ? `
        <div class="section collapsible-section">
          <h3>Contrast</h3>
          <p><b>Ignorance:</b> ${v.contrast.ignorance || ""}</p>
          <p><b>Wisdom:</b> ${v.contrast.wisdom || ""}</p>
        </div>` : ""}

        <!-- ANALOGY -->
        ${v.analogy ? `
        <div class="section collapsible-section">
          <h3>Analogy</h3>
          <p>${v.analogy}</p>
        </div>` : ""}

        <!-- REAL LIFE -->
        ${v.real_life ? `
        <div class="section collapsible-section">
          <h3>Real Life</h3>
          <p>${formatText(v.real_life)}</p>
        </div>` : ""}

        <!-- PRACTICE -->
        ${v.practice ? `
        <div class="section collapsible-section">
          <h3>Practice</h3>
          <ul>
            ${(v.practice.actions || []).map(a => `<li>${a}</li>`).join("")}
          </ul>
          <ul>
            ${(v.practice.reflection_questions || []).map(q => `<li>${q}</li>`).join("")}
          </ul>
        </div>` : ""}

        <!-- PERSPECTIVES -->
        ${v.perspectives ? `
        <div class="section collapsible-section">
          <h3>Perspectives</h3>
          <p>${v.perspectives.spiritual || ""}</p>
          <p>${v.perspectives.philosophical || ""}</p>
          <p>${v.perspectives.practical || ""}</p>
          <p>${v.perspectives.leadership || ""}</p>
        </div>` : ""}

        <!-- CROSS LINKS -->
        ${v.cross_links ? `
        <div class="section collapsible-section">
          <h3>Cross Links</h3>
          <ul>
            ${(v.cross_links.similar_ideas || []).map(i => `
              <li><b>${i.text} ${i.reference}</b> — ${i.idea}</li>
            `).join("")}
          </ul>
        </div>` : ""}

        <!-- META -->
        ${v.meta ? `
        <div class="section collapsible-section">
          <h3>Meta</h3>
          <p><b>Theme:</b> ${v.meta.theme}</p>
          <p><b>Mode:</b> ${v.meta.mode}</p>
          <p><b>Difficulty:</b> ${v.meta.difficulty}</p>
        </div>` : ""}

        <!-- INSIGHT -->
        ${v.insight ? `
        <div class="section collapsible-section">
          <h3>Insight</h3>
          <p>${v.insight}</p>
        </div>` : ""}

        <!-- NAV BUTTONS -->
        <div class="nav-buttons">
          <button id="prevBtn">⬅ Previous</button>
          <button id="nextBtn">Next ➡</button>
        </div>
      </div>
    `;

    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");

    const chantBtn = document.getElementById("chantBtn");
    const downloadBtn = document.getElementById("downloadBtn");
    const humanChantBtn = document.getElementById("humanChantBtn");
    const studyCompanionBtn = document.getElementById("studyCompanionBtn");
    const chantPracticeBtn = document.getElementById("chantPracticeBtn");

    if (verseIndex > 0) {
      prevBtn.onclick = () => {
        localStorage.setItem("verseIndex", verseIndex - 1);
        if (scriptureData.books) {
          window.location.href = `viewer.html?s=${scriptureId}&b=${bookIndex + 1}&c=${chapterIndex + 1}&v=${verseIndex}`;
        } else {
          window.location.href = `viewer.html?s=${scriptureId}&c=${chapterIndex + 1}&v=${verseIndex}`;
        }
      };
    } else {
      prevBtn.disabled = true;
      prevBtn.style.opacity = "0.3";
    }

    if (verseIndex < totalVerses - 1) {
      nextBtn.onclick = () => {
        localStorage.setItem("verseIndex", verseIndex + 1);
        if (scriptureData.books) {
          window.location.href = `viewer.html?s=${scriptureId}&b=${bookIndex + 1}&c=${chapterIndex + 1}&v=${verseIndex + 2}`;
        } else {
          window.location.href = `viewer.html?s=${scriptureId}&c=${chapterIndex + 1}&v=${verseIndex + 2}`;
        }
      };
    } else {
      nextBtn.disabled = true;
      nextBtn.style.opacity = "0.3";
    }

    // Sync the header back button
    const backBtn = document.querySelector(".nav button");
    if (backBtn) {
      backBtn.onclick = () => {
        if (scriptureData.books) {
          window.location.href = `verses.html?s=${scriptureId}&b=${bookIndex + 1}&c=${chapterIndex + 1}`;
        } else {
          window.location.href = `verses.html?s=${scriptureId}&c=${chapterIndex + 1}`;
        }
      };
    }

    if (chantBtn) {
      chantBtn.onclick = () => {
        playVerseAudio(v.id);
      };
    }

    if (downloadBtn) {
      downloadBtn.onclick = () => downloadVerseAudio(v.id);
    }

    if (humanChantBtn) {
      humanChantBtn.onclick = () => openHumanChant(
        v.id,
        chapterIndex + 1,
        scriptureId,
        audioCapability?.humanLabel || "Human Audio"
      );
    }
    if (studyCompanionBtn) {
      studyCompanionBtn.onclick = () => openStudyChat(v);
    }

    if (chantPracticeBtn) {
      chantPracticeBtn.onclick = () => openChantPractice(v);
    }
    initializeCollapsibleSections(app);
  } catch (err) {
    showError("Failed to display the selected verse detail", err.message);
  }
}

function formatText(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>") // bold
    .replace(/\*(.*?)\*/g, "<i>$1</i>");   // italic
}

window.UNITYSCRIPT_API_BASE =
"https://barrel-emerging-disclose-rolls.trycloudflare.com";

const VAGDHENU_API_BASE = window.UNITYSCRIPT_API_BASE || localStorage.getItem("unityscriptApiBase") || "http://127.0.0.1:8000";

let currentAudioUrl = null;
let currentAudioVerseId = null;

function setChantButtonState(label, disabled = false) {
  const btn = document.getElementById("chantBtn");
  if (!btn) return;

  btn.disabled = disabled;
  btn.innerHTML = label;
}

function setDownloadButtonState(disabled) {
  const btn = document.getElementById("downloadBtn");
  if (btn) btn.disabled = disabled;
}

async function requestVerseAudio(id) {
  const response = await fetch(`${VAGDHENU_API_BASE}/chant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.message || result.detail || "Audio generation failed.");
  }

  currentAudioUrl = `${VAGDHENU_API_BASE}${result.audio_path}`;
  currentAudioVerseId = id;
  setDownloadButtonState(false);

  return currentAudioUrl;
}

async function playVerseAudio(id) {
  setChantButtonState("Generating...", true);

  try {
    const audioUrl = currentAudioVerseId === id && currentAudioUrl
      ? currentAudioUrl
      : await requestVerseAudio(id);

    const audio = new Audio(audioUrl);
    await audio.play();

    setChantButtonState("&#9654; Play Again");
  } catch (e) {
    console.error(e);
    alert(e.message || "Unable to connect to Vagdhenu backend.");
    setChantButtonState("&#129302; AI Chant");
  }
}

async function downloadVerseAudio(id) {
  try {
    const audioUrl = currentAudioVerseId === id && currentAudioUrl
      ? currentAudioUrl
      : await requestVerseAudio(id);

    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = `${id}.wav`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    console.error(e);
    alert(e.message || "Unable to download verse audio.");
  }
}


function toggleAudioOptions() {
  const audioMenuButton = document.getElementById("audioMenuBtn");
  const audioOptions = document.getElementById("audioOptions");
  if (!audioMenuButton || !audioOptions) return;

  const isOpen = !audioOptions.hidden;
  audioOptions.hidden = isOpen;
  audioMenuButton.setAttribute("aria-expanded", String(!isOpen));
}
const humanChantTimestampCache = new Map();
const HUMAN_CHANT_PROVIDER_STORAGE_PREFIX = "unityscript-human-chant-provider:";
let humanChantPlayer = null;
let humanChantPlayerReady = null;
let humanChantApiPromise = null;
let humanChantLastFocusedElement = null;
let activeHumanChant = null;


function createHumanChantProviderId(provider, index) {
  const source = provider.id || provider.name || provider.provider || `provider-${index + 1}`;
  return String(source).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `provider-${index + 1}`;
}

function normalizeHumanChantProviders(chapterData) {
  const rawProviders = Array.isArray(chapterData?.providers) ? chapterData.providers : [chapterData];
  return rawProviders
    .filter((provider) => provider && provider.videoId)
    .map((provider, index) => ({
      id: createHumanChantProviderId(provider, index),
      name: provider.name || provider.provider || `Provider ${index + 1}`,
      videoId: provider.videoId,
      verses: provider.verses || {}
    }));
}

function getHumanChantProviderStorageKey(scriptureId, chapterNumber) {
  return `${HUMAN_CHANT_PROVIDER_STORAGE_PREFIX}${scriptureId}:chapter-${chapterNumber}`;
}

function getSavedHumanChantProvider(scriptureId, chapterNumber) {
  try {
    return localStorage.getItem(getHumanChantProviderStorageKey(scriptureId, chapterNumber));
  } catch (error) {
    console.warn("Unable to read Human Chant provider preference.", error);
    return null;
  }
}

function saveHumanChantProvider(scriptureId, chapterNumber, providerId) {
  try {
    localStorage.setItem(getHumanChantProviderStorageKey(scriptureId, chapterNumber), providerId);
  } catch (error) {
    console.warn("Unable to save Human Chant provider preference.", error);
  }
}

function getHumanChantModalElements() {
  return {
    modal: document.getElementById("humanChantModal"),
    close: document.getElementById("humanChantClose"),
    closeButton: document.getElementById("humanChantCloseButton"),
    title: document.getElementById("humanChantTitle"),
    status: document.getElementById("humanChantStatus"),
    provider: document.getElementById("humanChantProvider"),
    providerPicker: document.getElementById("humanChantProviderPicker"),
    providerSelect: document.getElementById("humanChantProviderSelect"),
    playerWrap: document.getElementById("humanChantPlayerWrap")
  };
}

function setupHumanChantModal() {
  const { modal, close, closeButton, providerSelect } = getHumanChantModalElements();
  if (!modal || modal.dataset.bound === "true") return;

  const closeModal = () => closeHumanChant();
  close.onclick = closeModal;
  closeButton.onclick = closeModal;
  modal.onclick = (event) => {
    if (event.target === modal) closeModal();
  };
  providerSelect.onchange = () => selectHumanChantProvider(providerSelect.value);
  modal.dataset.bound = "true";
}

function closeHumanChant() {
  const { modal } = getHumanChantModalElements();
  if (!modal) return;

  if (humanChantPlayer && typeof humanChantPlayer.pauseVideo === "function") {
    humanChantPlayer.pauseVideo();
  }
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  humanChantLastFocusedElement?.focus();
}

async function loadHumanChantTimestamps(scriptureId, chapterNumber) {
  const path = `data/audio/${scriptureId}/chapter${chapterNumber}.json`;
  if (humanChantTimestampCache.has(path)) return humanChantTimestampCache.get(path);

  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) return null;

  const timestamps = await response.json();
  humanChantTimestampCache.set(path, timestamps);
  return timestamps;
}

function loadHumanChantApi() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (humanChantApiPromise) return humanChantApiPromise;

  humanChantApiPromise = new Promise((resolve, reject) => {
    const existingCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      existingCallback?.();
      resolve();
    };

    const existingScript = document.querySelector('script[data-human-chant-api="true"]');
    if (existingScript) return;

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.dataset.humanChantApi = "true";
    script.onerror = () => reject(new Error("Unable to load the YouTube player."));
    document.head.append(script);
  });

  return humanChantApiPromise;
}

async function getHumanChantPlayer() {
  await loadHumanChantApi();
  if (humanChantPlayerReady) return humanChantPlayerReady;

  humanChantPlayerReady = new Promise((resolve, reject) => {
    humanChantPlayer = new window.YT.Player("humanChantPlayer", {
      playerVars: { rel: 0, modestbranding: 1 },
      events: {
        onReady: () => resolve(humanChantPlayer),
        onError: () => reject(new Error("YouTube could not load this Human Chant."))
      }
    });
  });

  return humanChantPlayerReady;
}

function renderHumanChantProviderPicker(providers, selectedProviderId) {
  const { providerPicker, providerSelect } = getHumanChantModalElements();
  providerSelect.replaceChildren();
  providers.forEach((provider) => providerSelect.add(new Option(provider.name, provider.id)));
  providerSelect.value = selectedProviderId;
  providerPicker.hidden = providers.length < 2;
}

async function selectHumanChantProvider(providerId) {
  const { status, provider, playerWrap } = getHumanChantModalElements();
  if (!activeHumanChant) return;

  if (humanChantPlayer && typeof humanChantPlayer.pauseVideo === "function") humanChantPlayer.pauseVideo();

  const selectedProvider = activeHumanChant.providers.find((candidate) => candidate.id === providerId) || activeHumanChant.providers[0];
  activeHumanChant.selectedProviderId = selectedProvider.id;
  saveHumanChantProvider(activeHumanChant.scriptureId, activeHumanChant.chapterNumber, selectedProvider.id);
  provider.textContent = selectedProvider.name;
  provider.hidden = false;
  playerWrap.hidden = true;
  status.hidden = false;
  status.textContent = `Loading ${activeHumanChant.label}...`;

  const verseTimestamp = selectedProvider.verses?.[activeHumanChant.verseId];
  const startSeconds = Number(verseTimestamp?.start);
  if (!Number.isFinite(startSeconds) || startSeconds < 0) {
    status.textContent = `${activeHumanChant.label} is not available for this verse with the selected provider yet.`;
    return;
  }

  try {
    const player = await getHumanChantPlayer();
    playerWrap.hidden = false;
    status.hidden = true;
    player.loadVideoById({ videoId: selectedProvider.videoId, startSeconds });
  } catch (error) {
    console.error(error);
    status.textContent = `${activeHumanChant.label} is not available for this verse with the selected provider yet.`;
  }
}

async function openHumanChant(verseId, chapterNumber, scriptureId, label) {
  setupHumanChantModal();
  const { modal, title, status, provider, playerWrap } = getHumanChantModalElements();
  if (!modal) return;

  const humanLabel = label || "Human Audio";
  humanChantLastFocusedElement = document.activeElement;
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  title.textContent = humanLabel;
  status.hidden = false;
  status.textContent = `Loading ${humanLabel}...`;
  provider.hidden = true;
  playerWrap.hidden = true;

  try {
    const chapterData = await loadHumanChantTimestamps(scriptureId, chapterNumber);
    const providers = normalizeHumanChantProviders(chapterData);
    if (!providers.length) {
      status.textContent = `${humanLabel} is not available for this verse yet.`;
      return;
    }

    const savedProviderId = getSavedHumanChantProvider(scriptureId, chapterNumber);
    const selectedProvider = providers.find((candidate) => candidate.id === savedProviderId) || providers[0];
    activeHumanChant = {
      scriptureId,
      chapterNumber,
      verseId,
      label: humanLabel,
      providers,
      selectedProviderId: selectedProvider.id
    };
    renderHumanChantProviderPicker(providers, selectedProvider.id);
    await selectHumanChantProvider(selectedProvider.id);
  } catch (error) {
    console.error(error);
    status.textContent = `${humanLabel} is not available for this verse yet.`;
  }
}
const AI_CHAT_API_BASE = window.UNITYSCRIPT_API_BASE || localStorage.getItem("unityscriptApiBase") || "http://127.0.0.1:8000";
let activeStudyVerse = null;
let studyChatHistory = [];
let studyChatLastFocusedElement = null;
let studyChatBusy = false;

function getStudyChatElements() {
  return {
    modal: document.getElementById("studyChatModal"),
    close: document.getElementById("studyChatClose"),
    closeButton: document.getElementById("studyChatCloseButton"),
    verse: document.getElementById("studyChatVerse"),
    messages: document.getElementById("studyChatMessages"),
    form: document.getElementById("studyChatForm"),
    question: document.getElementById("studyChatQuestion"),
    send: document.getElementById("studyChatSend"),
    loading: document.getElementById("studyChatLoading")
  };
}

function getStudyChatStorageKey(verseId) {
  return `unityscript-study-chat:${verseId}`;
}

function loadStudyChatHistory(verseId) {
  try {
    const stored = sessionStorage.getItem(getStudyChatStorageKey(verseId));
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.filter((message) => message && ["user", "assistant"].includes(message.role) && typeof message.content === "string") : [];
  } catch (error) {
    console.warn("Unable to load study chat history.", error);
    return [];
  }
}

function saveStudyChatHistory() {
  if (!activeStudyVerse) return;
  try {
    sessionStorage.setItem(getStudyChatStorageKey(activeStudyVerse.id), JSON.stringify(studyChatHistory));
  } catch (error) {
    console.warn("Unable to save study chat history.", error);
  }
}

function escapeStudyHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderStudyMarkdown(markdown) {
  return escapeStudyHtml(markdown)
    .replace(/^### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^# (.+)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

function renderStudyChatHistory() {
  const { messages } = getStudyChatElements();
  if (!messages) return;

  messages.replaceChildren();
  if (!studyChatHistory.length) {
    const empty = document.createElement("p");
    empty.className = "study-chat-empty";
    empty.textContent = "Ask a question about this verse, its meaning, or its practice.";
    messages.append(empty);
  }

  studyChatHistory.forEach((message) => {
    const item = document.createElement("article");
    item.className = `study-chat-message ${message.role}`;
    const label = document.createElement("p");
    label.className = "study-chat-role";
    label.textContent = message.role === "user" ? "You" : "AI Study Companion";
    const content = document.createElement("div");
    content.className = "study-chat-content";
    if (message.role === "assistant") {
      content.innerHTML = renderStudyMarkdown(message.content);
    } else {
      content.textContent = message.content;
    }
    item.append(label, content);
    messages.append(item);
  });

  messages.scrollTop = messages.scrollHeight;
}

function setStudyChatBusy(isBusy) {
  studyChatBusy = isBusy;
  const { question, send, loading } = getStudyChatElements();
  if (question) question.disabled = isBusy;
  if (send) send.disabled = isBusy;
  if (loading) loading.hidden = !isBusy;
}

function setupStudyChatModal() {
  const { modal, close, closeButton, form, question } = getStudyChatElements();
  if (!modal || modal.dataset.bound === "true") return;

  const closeModal = () => closeStudyChat();
  close.onclick = closeModal;
  closeButton.onclick = closeModal;
  modal.onclick = (event) => {
    if (event.target === modal) closeModal();
  };
  form.addEventListener("submit", sendStudyQuestion);
  question.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") form.requestSubmit();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });
  modal.dataset.bound = "true";
}

function openStudyChat(verse) {
  setupStudyChatModal();
  const { modal, verse: verseLabel, question } = getStudyChatElements();
  if (!modal) return;

  activeStudyVerse = verse;
  studyChatHistory = loadStudyChatHistory(verse.id);
  studyChatLastFocusedElement = document.activeElement;
  verseLabel.textContent = `Studying ${verse.id}`;
  renderStudyChatHistory();
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  question.focus();
}

function closeStudyChat() {
  const { modal } = getStudyChatElements();
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  studyChatLastFocusedElement?.focus();
}

async function sendStudyQuestion(event) {
  event.preventDefault();
  const { question } = getStudyChatElements();
  const text = question.value.trim();
  if (!activeStudyVerse || !text || studyChatBusy) return;

  studyChatHistory.push({ role: "user", content: text });
  saveStudyChatHistory();
  question.value = "";
  renderStudyChatHistory();
  setStudyChatBusy(true);

  try {
    const response = await fetch(`${AI_CHAT_API_BASE}/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "verse",
        verseId: activeStudyVerse.id,
        context: activeStudyVerse,
        question: text
      })
    });
    const result = await response.json();
    if (!response.ok || !result.success || !result.answer) {
      throw new Error(result.detail || result.message || "The Study Companion could not answer right now.");
    }
    studyChatHistory.push({ role: "assistant", content: result.answer });
  } catch (error) {
    console.error(error);
    studyChatHistory.push({ role: "assistant", content: `I could not reach the AI Study Companion. ${error.message}` });
  } finally {
    saveStudyChatHistory();
    renderStudyChatHistory();
    setStudyChatBusy(false);
    question.focus();
  }
}
const CHANT_PRACTICE_API_BASE = window.UNITYSCRIPT_API_BASE || localStorage.getItem("unityscriptApiBase") || "http://127.0.0.1:8000";
let activePracticeVerse = null;
let practiceRecorder = null;
let practiceStream = null;
let practiceChunks = [];
let practiceResult = null;
let practiceLastFocusedElement = null;

function getChantPracticeElements() {
  return {
    modal: document.getElementById("chantPracticeModal"),
    close: document.getElementById("chantPracticeClose"),
    closeButton: document.getElementById("chantPracticeCloseButton"),
    verseId: document.getElementById("chantPracticeVerseId"),
    expected: document.getElementById("chantPracticeExpected"),
    start: document.getElementById("chantPracticeStart"),
    stop: document.getElementById("chantPracticeStop"),
    status: document.getElementById("chantPracticeStatus"),
    recognized: document.getElementById("chantPracticeRecognized"),
    compare: document.getElementById("chantPracticeCompare"),
    feedback: document.getElementById("chantPracticeFeedback"),
    accuracy: document.getElementById("chantPracticeAccuracy"),
    expectedDiff: document.getElementById("chantPracticeExpectedDiff"),
    recognizedDiff: document.getElementById("chantPracticeRecognizedDiff"),
    details: document.getElementById("chantPracticeDetails")
  };
}

function getPracticeVerseText(verse) {
  return (
    verse?.verse?.original
    || verse?.verse?.original_sanskrit
    || verse?.verse?.original_arabic
    || verse?.verse?.original_hebrew
    || ""
  ).trim();
}

function setChantPracticeStatus(message) {
  const { status } = getChantPracticeElements();
  if (status) status.textContent = message;
}

function setupChantPracticeModal() {
  const { modal, close, closeButton, start, stop, compare } = getChantPracticeElements();
  if (!modal || modal.dataset.bound === "true") return;

  const closeModal = () => closeChantPractice();
  close.onclick = closeModal;
  closeButton.onclick = closeModal;
  start.onclick = startChantRecording;
  stop.onclick = stopChantRecording;
  compare.onclick = showChantPracticeFeedback;
  modal.onclick = (event) => {
    if (event.target === modal) closeModal();
  };
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });
  modal.dataset.bound = "true";
}

function openChantPractice(verse) {
  setupChantPracticeModal();
  const { modal, verseId, expected, start, stop, recognized, compare, feedback } = getChantPracticeElements();
  if (!modal) return;

  activePracticeVerse = verse;
  practiceResult = null;
  practiceLastFocusedElement = document.activeElement;
  verseId.textContent = `Practicing ${verse.id}`;
  expected.textContent = getPracticeVerseText(verse);
  recognized.textContent = "Record your chant to transcribe it locally.";
  recognized.classList.add("muted");
  start.disabled = !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder;
  stop.disabled = true;
  compare.disabled = true;
  feedback.hidden = true;
  setChantPracticeStatus(start.disabled ? "Recording is not supported in this browser." : "Ready to record.");
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  start.focus();
}

function stopPracticeStream() {
  practiceStream?.getTracks().forEach((track) => track.stop());
  practiceStream = null;
}

function closeChantPractice() {
  const { modal } = getChantPracticeElements();
  if (!modal) return;
  if (practiceRecorder?.state === "recording") practiceRecorder.stop();
  stopPracticeStream();
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  practiceLastFocusedElement?.focus();
}

function preferredPracticeMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function startChantRecording() {
  const { start, stop, compare, feedback } = getChantPracticeElements();
  if (!activePracticeVerse || practiceRecorder?.state === "recording") return;

  try {
    practiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = preferredPracticeMimeType();
    practiceRecorder = new MediaRecorder(practiceStream, mimeType ? { mimeType } : undefined);
    practiceChunks = [];
    practiceResult = null;
    compare.disabled = true;
    feedback.hidden = true;

    practiceRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) practiceChunks.push(event.data);
    };
    practiceRecorder.onstop = async () => {
      const recording = new Blob(practiceChunks, { type: practiceRecorder?.mimeType || "audio/webm" });
      stopPracticeStream();
      await submitChantPractice(recording);
    };
    practiceRecorder.start();
    start.disabled = true;
    stop.disabled = false;
    setChantPracticeStatus("Recording... recite the verse, then stop recording.");
  } catch (error) {
    console.error(error);
    stopPracticeStream();
    setChantPracticeStatus("Microphone access was not available.");
  }
}

function stopChantRecording() {
  const { stop } = getChantPracticeElements();
  if (practiceRecorder?.state !== "recording") return;
  stop.disabled = true;
  setChantPracticeStatus("Uploading recording for local transcription...");
  practiceRecorder.stop();
}

async function submitChantPractice(recording) {
  const { start, recognized, compare } = getChantPracticeElements();
  if (!activePracticeVerse) return;

  try {
    const form = new FormData();
    form.append("verseId", activePracticeVerse.id);
    form.append("audio", recording, "chant-practice.webm");
    const response = await fetch(`${CHANT_PRACTICE_API_BASE}/chant/practice`, {
      method: "POST",
      body: form
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "Local transcription failed.");

    practiceResult = result;
    recognized.textContent = result.recognized || "No words were recognized.";
    recognized.classList.remove("muted");
    compare.disabled = false;
    setChantPracticeStatus("Transcription complete. Select Compare to view feedback.");
  } catch (error) {
    console.error(error);
    recognized.textContent = error.message || "Local transcription failed.";
    recognized.classList.add("muted");
    setChantPracticeStatus("Chant Practice needs the configured local speech model.");
  } finally {
    start.disabled = false;
  }
}

function normalizePracticeToken(token) {
  return token.normalize("NFC").toLowerCase().replace(/[\u0964\u0965|,.;:!?()\[\]{}\"'0-9\u0966-\u096f]/g, "");
}

function escapePracticeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderPracticeText(text, flaggedWords, className) {
  const flagged = new Set(flaggedWords.map(normalizePracticeToken));
  return text.split(/(\s+)/).map((part) => {
    const token = normalizePracticeToken(part);
    const safe = escapePracticeHtml(part);
    return token && flagged.has(token) ? `<mark class="${className}">${safe}</mark>` : safe;
  }).join("");
}

function showChantPracticeFeedback() {
  const { feedback, accuracy, expectedDiff, recognizedDiff, details } = getChantPracticeElements();
  if (!practiceResult) return;

  feedback.hidden = false;
  accuracy.textContent = `Accuracy: ${practiceResult.accuracy}%`;
  expectedDiff.innerHTML = renderPracticeText(practiceResult.expected, practiceResult.missing || [], "practice-missing");
  recognizedDiff.innerHTML = renderPracticeText(practiceResult.recognized, practiceResult.extra || [], "practice-extra");

  const notes = [];
  if (practiceResult.missing?.length) notes.push(`Missing: ${practiceResult.missing.join(", ")}`);
  if (practiceResult.extra?.length) notes.push(`Extra or different: ${practiceResult.extra.join(", ")}`);
  details.textContent = notes.length ? notes.join(". ") : "No word-level differences found.";
}
const COLLAPSIBLE_SECTION_STORAGE_PREFIX = "unityscript-collapsible-section:";

function getCollapsibleSectionKey(section, label) {
  return section.dataset.sectionKey || `section-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function getStoredCollapsibleState(key) {
  try {
    return localStorage.getItem(`${COLLAPSIBLE_SECTION_STORAGE_PREFIX}${key}`) !== "closed";
  } catch (error) {
    console.warn("Unable to read section preference.", error);
    return true;
  }
}

function setCollapsibleSectionState(section, isOpen, persist = true) {
  const content = section.querySelector(":scope > .collapsible-section-content");
  const toggle = section.querySelector(":scope > .collapsible-section-heading button");
  if (!content || !toggle) return;

  content.hidden = !isOpen;
  section.classList.toggle("is-collapsed", !isOpen);
  toggle.setAttribute("aria-expanded", String(isOpen));
  toggle.querySelector(".collapsible-indicator").textContent = isOpen ? "Hide" : "Show";

  if (persist) {
    try {
      localStorage.setItem(`${COLLAPSIBLE_SECTION_STORAGE_PREFIX}${section.dataset.sectionKey}`, isOpen ? "open" : "closed");
    } catch (error) {
      console.warn("Unable to save section preference.", error);
    }
  }
}

function makeSectionCollapsible(section) {
  if (section.dataset.collapsibleReady === "true") return;

  const existingHeading = section.querySelector(":scope > h3");
  const label = section.dataset.sectionLabel || existingHeading?.textContent.trim() || "Section";
  const key = getCollapsibleSectionKey(section, label);
  const headingTag = existingHeading?.tagName.toLowerCase() || "h3";
  const heading = document.createElement(headingTag);
  const toggle = document.createElement("button");
  const labelSpan = document.createElement("span");
  const indicator = document.createElement("span");
  const content = document.createElement("div");

  section.dataset.sectionKey = key;
  section.dataset.collapsibleReady = "true";
  heading.className = "collapsible-section-heading";
  toggle.type = "button";
  toggle.className = "collapsible-section-toggle";
  labelSpan.textContent = label;
  indicator.className = "collapsible-indicator";
  toggle.append(labelSpan, indicator);
  heading.append(toggle);
  content.className = "collapsible-section-content";

  if (existingHeading) existingHeading.remove();
  while (section.firstChild) content.append(section.firstChild);
  section.append(heading, content);

  toggle.onclick = () => setCollapsibleSectionState(section, content.hidden);
  setCollapsibleSectionState(section, getStoredCollapsibleState(key), false);
}

function initializeCollapsibleSections(app) {
  const sections = Array.from(app.querySelectorAll(".collapsible-section"));
  sections.forEach(makeSectionCollapsible);

  const expandAll = document.getElementById("expandAllSectionsBtn");
  const collapseAll = document.getElementById("collapseAllSectionsBtn");
  if (expandAll) {
    expandAll.onclick = () => sections.forEach((section) => setCollapsibleSectionState(section, true));
  }
  if (collapseAll) {
    collapseAll.onclick = () => sections.forEach((section) => setCollapsibleSectionState(section, false));
  }
}