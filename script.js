let data = {};

// ------------------ LOAD DATA ------------------

async function loadData() {
  const res = await fetch("data/bhagavad-gita.json");
  return await res.json();
}

// ------------------ START ------------------

document.addEventListener("DOMContentLoaded", async () => {

  const page = window.location.pathname;

  // ✅ DO NOT load data on index page
  if (
  page.includes("index.html") ||
  page === "/" ||
  page.endsWith("/")
) {
  loadBooks();
  return;
}

  // ✅ Load only when needed
  try {
    data = await loadData();
  } catch (e) {
    console.warn("Data load failed, using localStorage instead");
  }

  if (page.includes("chapters.html")) loadChapters();
  else if (page.includes("verses.html")) loadVerses();
  else if (page.includes("viewer.html")) renderVerse();
});

// ------------------ BOOKS ------------------

async function loadBooks() {
  const app = document.getElementById("app");

  app.innerHTML = ""; // ✅ IMPORTANT RESET

  const files = [
    "bhagavad-gita.json",
    "quran.json",
    "dhammapada.json",
    "upanishads.json",
    "bible.json",
    "torah.json",
    "rigved.json",
    "gurbani.json"
  ];

  let loaded = 0;

  for (let file of files) {
    try {
      const res = await fetch("data/" + file);

      if (!res.ok) throw new Error(file);

      const book = await res.json();

      const btn = document.createElement("button");
      btn.className = "level-btn";
      btn.innerText = book.name;

      btn.onclick = () => {
        localStorage.setItem("scripture", JSON.stringify(book));
        window.location.href = "chapters.html";
      };

      app.appendChild(btn);
      loaded++;

    } catch (err) {
      console.error("❌ Failed:", file);
    }
  }

  // ✅ fallback if nothing loads
  if (loaded === 0) {
    app.innerHTML = "<p style='color:white'>Nothing loaded ❌</p>";
  }
}
// ------------------ CHAPTERS ------------------

function loadChapters() {
  const app = document.getElementById("app");
  const data = JSON.parse(localStorage.getItem("scripture"));

  data.chapters.forEach((ch, i) => {
    const btn = document.createElement("button");
    btn.innerText = ch.name;

    btn.onclick = () => {
      localStorage.setItem("chapterIndex", i);
      window.location.href = "verses.html";
    };

    app.appendChild(btn);
  });
}

// ------------------ VERSES ------------------

function loadVerses() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  // ✅ ALWAYS use selected book
  const data = JSON.parse(localStorage.getItem("scripture"));

  const chapterIndex = parseInt(localStorage.getItem("chapterIndex"));
  const chapter = data.chapters[chapterIndex];

  if (!chapter || !chapter.verses) {
    app.innerHTML = "<p>Error loading verses</p>";
    return;
  }

  chapter.verses.forEach((v, i) => {
    const btn = document.createElement("button");
    btn.className = "level-btn";
    btn.innerText = "Verse " + (i + 1);

    btn.onclick = () => {
      localStorage.setItem("verseIndex", i);
      window.location.href = "viewer.html";
    };

    app.appendChild(btn);
  });
}

// ------------------ VIEWER ------------------

function renderVerse() {
  const app = document.getElementById("app");

  const data = JSON.parse(localStorage.getItem("scripture"));
  const chapterIndex = parseInt(localStorage.getItem("chapterIndex"));
  const verseIndex = parseInt(localStorage.getItem("verseIndex"));

  const chapter = data.chapters[chapterIndex];
  const v = chapter.verses[verseIndex];

  const totalVerses = chapter.verses.length;

  app.innerHTML = `
    <div class="card">

      <!-- ✅ MAIN VERSE (ORIGINAL FIRST) -->
      <h2 class="verse-original">
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

</div>
` : ""}
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

  // ✅ NAVIGATION LOGIC (AFTER render)
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  if (verseIndex > 0) {
    prevBtn.onclick = () => {
      localStorage.setItem("verseIndex", verseIndex - 1);
      location.reload();
    };
  } else {
    prevBtn.disabled = true;
    prevBtn.style.opacity = "0.3";
  }

  if (verseIndex < totalVerses - 1) {
    nextBtn.onclick = () => {
      localStorage.setItem("verseIndex", verseIndex + 1);
      location.reload();
    };
  } else {
    nextBtn.disabled = true;
    nextBtn.style.opacity = "0.3";
  }
}

function formatText(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>") // bold
    .replace(/\*(.*?)\*/g, "<i>$1</i>");   // italic
}