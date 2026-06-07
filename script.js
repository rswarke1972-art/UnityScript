// Central App State & Cache
const state = {
  metadata: null,
  scriptureCache: {},
  bookCache: {}
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
        // Load specific book data for lazy loading
        const data = await getBookData(scriptureId, bookIndex);
        const book = data.books[0];
        
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
    
    if (scriptureData.books) {
      bookIndex = route.book;
      if (bookIndex === null) {
        const storedBookIdx = localStorage.getItem("bookIndex");
        bookIndex = storedBookIdx !== null ? parseInt(storedBookIdx, 10) : null;
      }
      
      // Load specific book data for lazy loading
      if (bookIndex !== null && !isNaN(bookIndex)) {
        scriptureData = await getBookData(scriptureId, bookIndex);
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
      const book = scriptureData.books[0];
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
    localStorage.setItem("scriptureId", scriptureId);
    
    let bookIndex = null;
    let chapterIndex = route.chapter;
    let verseIndex = route.verse;
    
    if (scriptureData.books) {
      bookIndex = route.book;
      if (bookIndex === null) {
        const storedBookIdx = localStorage.getItem("bookIndex");
        bookIndex = storedBookIdx !== null ? parseInt(storedBookIdx, 10) : null;
      }
      
      // Load specific book data for lazy loading
      if (bookIndex !== null && !isNaN(bookIndex)) {
        scriptureData = await getBookData(scriptureId, bookIndex);
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
      const book = scriptureData.books[0];
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
        <!-- ✅ MAIN VERSE (ORIGINAL FIRST) -->
        <h2 class="${originalClass}">
          ${v.verse.original 
            || v.verse.original_sanskrit 
            || v.verse.original_arabic 
            || v.verse.original_hebrew 
            || v.verse.original_sanskrit_accented
            || v.verse.original_gurmukhi
            || ""}
        </h2>
        
        <p class="transliteration"><i>${v.verse.transliteration || ""}</i></p>
        <p class="translation">${v.verse.translation}</p>
  
        <!-- SOURCE -->
        ${v.source ? `
        <div class="section">
          <h3>Source</h3>
          <p><b>Text:</b> ${v.source.text || ""}</p>
          <p><b>Speaker:</b> ${v.source.author_speaker || ""}</p>
          <p>${v.source.context || ""}</p>
        </div>` : ""}
  
        <!-- MEANING -->
        ${v.meaning ? `
        <div class="section">
          <h3>Meaning</h3>
          <p><b>Overall:</b> ${v.meaning.overall || ""}</p>
          <p><b>Word-by-word:</b> ${v.meaning.word_by_word || ""}</p>
        </div>` : ""}
  
        <!-- INTERPRETATION -->
        ${v.interpretation ? `
        <div class="section">
          <h3>Interpretation</h3>
          <p>${formatText(v.interpretation?.traditional)}</p>
          <p><b>Principle:</b> ${v.interpretation.core_principle || ""}</p>
          <p>${v.interpretation.psychological || ""}</p>
        </div>` : ""}
  
        <!-- EXPLANATION -->
        ${v.explanation ? `
        <div class="section">
          <h3>Explanation</h3>
          <p>${formatText(v.explanation?.simple)}</p>
          <p>${formatText(v.explanation?.deep)}</p>
        </div>` : ""}
  
        <!-- REASONING -->
        ${v.reasoning ? `
        <div class="section">
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
        <div class="section">
          <h3>Tension</h3>
          <p><b>Doubt:</b> ${v.tension.human_doubt || ""}</p>
          <p><b>Resolution:</b> ${v.tension.resolution || ""}</p>
        </div>` : ""}
  
        <!-- CONTRAST -->
        ${v.contrast ? `
        <div class="section">
          <h3>Contrast</h3>
          <p><b>Ignorance:</b> ${v.contrast.ignorance || ""}</p>
          <p><b>Wisdom:</b> ${v.contrast.wisdom || ""}</p>
        </div>` : ""}
  
        <!-- ANALOGY -->
        ${v.analogy ? `
        <div class="section">
          <h3>Analogy</h3>
          <p>${v.analogy}</p>
        </div>` : ""}
  
        <!-- REAL LIFE -->
        ${v.real_life ? `
        <div class="section">
          <h3>Real Life</h3>
          <p>${formatText(v.real_life)}</p>
        </div>` : ""}
  
        <!-- PRACTICE -->
        ${v.practice ? `
        <div class="section">
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
        <div class="section">
          <h3>Perspectives</h3>
          <p>${v.perspectives.spiritual || ""}</p>
          <p>${v.perspectives.philosophical || ""}</p>
          <p>${v.perspectives.practical || ""}</p>
          <p>${v.perspectives.leadership || ""}</p>
        </div>` : ""}
  
        <!-- CROSS LINKS -->
        ${v.cross_links ? `
        <div class="section">
          <h3>Cross Links</h3>
          <ul>
            ${(v.cross_links.similar_ideas || []).map(i => `
              <li><b>${i.text} ${i.reference}</b> — ${i.idea}</li>
            `).join("")}
          </ul>
        </div>` : ""}
  
        <!-- META -->
        ${v.meta ? `
        <div class="section">
          <h3>Meta</h3>
          <p><b>Theme:</b> ${v.meta.theme}</p>
          <p><b>Mode:</b> ${v.meta.mode}</p>
          <p><b>Difficulty:</b> ${v.meta.difficulty}</p>
        </div>` : ""}
  
        <!-- INSIGHT -->
        ${v.insight ? `
        <div class="section">
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