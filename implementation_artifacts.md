# Bible Splitting Implementation Artifacts

## A. Extraction Script

```javascript
const fs = require('fs');
const path = require('path');

// Load the bible.json file
const bible = JSON.parse(fs.readFileSync('data/bible.json', 'utf8'));

console.log(`Total books: ${bible.books.length}`);
console.log(`Total chapters: ${bible.books.reduce((sum, book) => sum + book.chapters.length, 0)}`);
console.log(`Total verses: ${bible.books.reduce((sum, book) => sum + book.chapters.reduce((s, ch) => s + ch.verses.length, 0), 0)}`);

// Extract each book into its own file
bible.books.forEach((book, index) => {
  const bookData = {
    id: book.name.toLowerCase().replace(/\s+/g, '_'),
    name: book.name,
    chapters: book.chapters
  };
  
  const filename = `data/bible/${book.name.toLowerCase().replace(/\s+/g, '_')}.json`;
  fs.writeFileSync(filename, JSON.stringify(bookData, null, 2), 'utf-8');
  console.log(`Extracted: ${book.name} (${book.chapters.length} chapters) -> ${filename}`);
});

console.log('Book extraction complete.');
```

**Command to run locally:**
```bash
node extract_bible_books.js
```

## Expected Output Structure

### Individual Book Files (data/bible/)
```json
{
  "id": "genesis",
  "name": "Genesis",
  "chapters": [
    {
      "name": "Chapter 1",
      "verses": [...]
    }
  ]
}
```

### Output Summary
- 66 book files in `data/bible/`
- Each file contains only its chapters and verses
- All metadata preserved (meaning, interpretation, explanation, etc.)
- Chapter and verse counts preserved

---

## B. Lightweight bible.json Index Template

```json
{
  "id": "bible",
  "name": "Bible",
  "language": "english",
  "tradition": "Christian/Jewish",
  "bookCount": 66,
  "books": [
    {
      "id": "genesis",
      "name": "Genesis",
      "chapterCount": 50,
      "filePath": "data/bible/genesis.json"
    },
    {
      "id": "exodus",
      "name": "Exodus",
      "chapterCount": 40,
      "filePath": "data/bible/exodus.json"
    }
  ]
}
```

---

## C. script.js Modifications

### Add Book Cache to State
```javascript
const state = {
  metadata: null,
  scriptureCache: {},
  bookCache: {}  // NEW: Cache for individual Bible books
};
```

### Add getBookData Function
```javascript
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
```

### Modify getScriptureData for Bible Lazy Loading
```javascript
async function getScriptureData(scriptureId) {
  if (state.scriptureCache[scriptureId]) {
    return state.scriptureData[scriptureId];
  }
  
  const meta = await fetchMetadata();
  const bookInfo = meta[scriptureId];
  if (!bookInfo) {
    throw new Error(`ScriptureID "${scriptureId}" is not registered in metadata.`);
  }
  
  try {
    const res = await fetchWithRetry(bookInfo.filePath);
    const data = await res.json();
    
    // For Bible, return index only (books loaded separately)
    state.scriptureCache[scriptureId] = data;
    return data;
  } catch (err) {
    throw new Error(`Failed to load scripture file for "${scriptureId}": ${err.message}`);
  }
}
```

### Modify loadChapters for Bible Book Selection
```javascript
// In loadChapters(), after getting scriptureData:
if (scriptureData.books) {
  const bookIndex = route.book;
  
  if (bookIndex === null || isNaN(bookIndex) || bookIndex < 0 || bookIndex >= scriptureData.books.length) {
    // Step 1: Render Books List
    // ... existing code ...
  } else {
    // Step 2: Load specific book data for selected book
    const data = await getBookData(scriptureId, bookIndex);
    // Use data.chapters instead of scriptureData.books[bookIndex].chapters
    const book = data.books[0]; // getBookData returns combined data with one book in books array
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
}
```

### Modify loadVerses for Bible Lazy Loading
```javascript
// In loadVerses(), after getting scriptureId:
if (scriptureData.books) {
  bookIndex = route.book;
  if (bookIndex === null) {
    const storedBookIdx = localStorage.getItem("bookIndex");
    bookIndex = storedBookIdx !== null ? parseInt(storedBookIdx, 10) : null;
  }
  
  // Load specific book data if bookIndex is set
  if (bookIndex !== null && !isNaN(bookIndex)) {
    const data = await getBookData(scriptureId, bookIndex);
    scriptureData = data; // Replace index with book data
  }
}
```

### Modify renderVerse for Bible Lazy Loading
```javascript
// In renderVerse(), after getting scriptureId:
if (scriptureData.books) {
  bookIndex = route.book;
  if (bookIndex === null) {
    const storedBookIdx = localStorage.getItem("bookIndex");
    bookIndex = storedBookIdx !== null ? parseInt(storedBookIdx, 10) : null;
  }
  
  // Load specific book data if bookIndex is set
  if (bookIndex !== null && !isNaN(bookIndex)) {
    const data = await getBookData(scriptureId, bookIndex);
    scriptureData = data; // Replace index with book data
  }
}
```

---

## D. Validation Script

```javascript
const fs = require('fs');

// Load original bible.json
const originalBible = JSON.parse(fs.readFileSync('data/bible.json', 'utf-8'));

// Load the new bible.json index
const newIndex = JSON.parse(fs.readFileSync('data/bible.json', 'utf-8'));

// Validate index structure
console.log('=== Bible Index Validation ===');
console.log('Index ID:', newIndex.id);
console.log('Index Name:', newIndex.name);
console.log('Book Count:', newIndex.bookCount);
console.log('Expected Book Count: 66');
console.log('Match:', newIndex.bookCount === 66 ? 'PASS' : 'FAIL');

// Validate each book entry
console.log('\n=== Book Entry Validation ===');
let totalChapters = 0;
let totalVerses = 0;

newIndex.books.forEach((book, index) => {
  console.log(`\nBook ${index + 1}: ${book.name}`);
  console.log(`  ID: ${book.id}`);
  console.log(`  Chapter Count: ${book.chapterCount}`);
  console.log(`  File Path: ${book.filePath}`);
  
  // Check if book file exists
  if (!fs.existsSync(book.filePath)) {
    console.log(`  FAIL: Book file not found: ${book.filePath}`);
  } else {
    console.log(`  PASS: Book file exists`);
    
    // Load and validate book file
    const bookData = JSON.parse(fs.readFileSync(book.filePath, 'utf-8'));
    const actualChapters = bookData.chapters.length;
    const actualVerses = bookData.chapters.reduce((sum, ch) => sum + ch.verses.length, 0);
    
    console.log(`  Actual Chapters: ${actualChapters}`);
    console.log  Expected Chapters: ${book.chapterCount}`);
    console.log  Match: ${actualChapters === book.chapterCount ? 'PASS' : 'FAIL');
    
    totalChapters += actualChapters;
    totalVerses += actualVerses;
  }
});

console.log('\n=== Total Validation ===');
console.log('Expected Books: 66');
console.log('Actual Books:', newIndex.books.length);
console.log('Match:', newIndex.books.length === 66 ? 'PASS' : 'FAIL');
console.log('Expected Chapters: 1189');
console.log('Actual Chapters:', totalChapters);
console.log('Match:', totalChapters === 1189 ? 'PASS' : 'FAIL');
console.log('Expected Verses: 31012');
console.log('Actual Verses:', totalVerses);
console.log('Match:', totalVerses === 31012 ? 'PASS' : 'FAIL');

// Validate Genesis 1:1
console.log('\n=== Genesis 1:1 Validation ===');
const genesisData = JSON.parse(fs.readFileSync('data/bible/genesis.json', 'utf-8'));
const genesis1_1 = genesisData.chapters[0].verses[0];
console.log('Genesis 1:1 ID:', genesis1_1.id);
console.log('Genesis 1:1 Translation:', genesis1_1.verse.translation.substring(0, 50) + '...');
console.log('Genesis 1:1 Has all required fields:', !!genesis1_1.meaning && !!genesis1_1.interpretation && !!genesis1_1.explanation && !!genesis_1_1.reasoning && !!genesis_1_1.tension && !!genesis_1_1.contrast && !!genesis_1_1.analogy && !!genesis_1_1.real_life && !!genesis_1_1.practice && !!genesis_1_1.perspectives && !!genesis_1_1.cross_links && !!genesis_1_1.meta && !!genesis_1_1.insight ? 'PASS' : 'FAIL');

// Validate Exodus 1:1
console.log('\n=== Exodus 1:1 Validation ===');
const exodusData = JSON.parse(fs.readFileSync('data/bible/exodus.json', 'utf-8'));
const exodus1_1 = exodusData.chapters[0].verses[0];
console.log('Exodus 1:1 ID:', exodus1_1.id);
console.log('Exodus 1:1 Translation:', exodus1_1.verse.translation.substring(0, 50) + '...');
console.log('Exodus 1:1 Has all required fields:', !!exodus1_1.meaning && !!exodus1_1.interpretation && !!exodus1_1.explanation && !!exodus1_1.reasoning && !!exodus1_1.tension && !!exodus1_1.contrast && !!exodus1_1.analogy && !!exodus1_1.real_life && !!exodus1_1.practice && !!exodus1_1.perspectives && !!exodus1_1.cross_links && !!exodus1_1.meta && !!exodus1_1.insight ? 'PASS' : 'FAIL');

console.log('\n=== Validation Complete ===');
```

**Command to run locally:**
```bash
node validate_bible_split.js
```

---

## E. Final Implementation Checklist

### Phase 1: Preparation
- [x] Analyzed bible.json structure
- [x] Analyzed script.js loading mechanism
- [x] Documented current schema and loading mechanism
- [x] Created backup of bible.json
- [x] Created data/bible/ directory

### Phase 2: Extraction
- [ ] Run extraction script locally: `node extract_bible_books.js`
- [ ] Verify 66 book files created in data/bible/
- [ ] Verify each book file has correct structure
- [ ] Validate verse counts: 31,012 total
- [ ] Validate chapter counts: 1,189 total
- [ ] Validate schema consistency

### Phase 3: Index Transformation
- [ ] Create lightweight bible.json index
- [ ] Include all 66 book entries with metadata
- [ ] Set bookCount to 66
- [ ] Include filePath for each book
- [ ] Validate index structure matches template

### Phase 4: script.js Modifications
- [ ] Add bookCache to state
- [ ] Add getBookData(scriptureId, bookIndex) function
- [ ] Modify getScriptureData for Bible lazy loading
- [ ] Modify loadChapters to use getBookData for selected book
- [ ] Modify loadVerses to use getBookData for selected book
- [ ] Modify renderVerse to use getBookData for selected book
- [ ] Test that other scriptures (bhagavad-gita, quran, dhammapada, upanishads) still work

### Phase 5: Validation
- [ ] Run validation script locally: `node validate_bible_split.js`
- [ ] Verify Genesis 1:1 loads correctly
- [ ] Verify Exodus 1:1 loads correctly
- [ ] Verify book selection page loads correctly
- [ ] Verify chapter selection page loads correctly
- [ ] Verify verse viewer loads correctly
- [ ] Test navigation between books/chapters/verses
- [ ] Test search functionality
- [ ] Test other scriptures still work

### Phase 6: Verification Report
- [ ] Original bible.json size: 224,362,856 bytes
- [ ] New bible.json index size
- [] Largest generated book file
- [ ] Total books preserved: 66
- [ ] Total chapters preserved: 1,189
- [ ] Total verses preserved: 31,012
- [ ] Genesis 1:1 validation result
- [ ] Exodus 1:1 validation result
- [ ] Search validation result
- [] Viewer validation result
- [] GitHub Pages compatibility status
- [] Final schema validation status

### Phase 7: Cleanup
- [ ] Remove original bible.json (keep backup)
- [ ] Keep backup file: bible.json.backup
- [ ] Document final structure
