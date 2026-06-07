const fs = require('fs');

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
let largestBookSize = 0;
let largestBookName = '';

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
    const bookSize = fs.statSync(book.filePath).size;
    
    console.log(`  Actual Chapters: ${actualChapters}`);
    console.log(`  Expected Chapters: ${book.chapterCount}`);
    console.log(`  Match: ${actualChapters === book.chapterCount ? 'PASS' : 'FAIL'}`);
    console.log(`  Verses: ${actualVerses}`);
    console.log(`  File Size: ${bookSize} bytes`);
    
    totalChapters += actualChapters;
    totalVerses += actualVerses;
    
    if (bookSize > largestBookSize) {
      largestBookSize = bookSize;
      largestBookName = book.name;
    }
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
console.log('Largest Book:', largestBookName);
console.log('Largest Book Size:', largestBookSize, 'bytes');

// Validate Genesis 1:1
console.log('\n=== Genesis 1:1 Validation ===');
const genesisData = JSON.parse(fs.readFileSync('data/bible/genesis.json', 'utf-8'));
const genesis1_1 = genesisData.chapters[0].verses[0];
console.log('Genesis 1:1 ID:', genesis1_1.id);
console.log('Genesis 1:1 Translation:', genesis1_1.verse.translation.substring(0, 50) + '...');
console.log('Genesis 1:1 Has all required fields:', !!genesis1_1.meaning && !!genesis1_1.interpretation && !!genesis1_1.explanation && !!genesis1_1.reasoning && !!genesis1_1.tension && !!genesis1_1.contrast && !!genesis1_1.analogy && !!genesis1_1.real_life && !!genesis1_1.practice && !!genesis1_1.perspectives && !!genesis1_1.cross_links && !!genesis1_1.meta && !!genesis1_1.insight ? 'PASS' : 'FAIL');

// Validate Exodus 1:1
console.log('\n=== Exodus 1:1 Validation ===');
const exodusData = JSON.parse(fs.readFileSync('data/bible/exodus.json', 'utf-8'));
const exodus1_1 = exodusData.chapters[0].verses[0];
console.log('Exodus 1:1 ID:', exodus1_1.id);
console.log('Exodus 1:1 Translation:', exodus1_1.verse.translation.substring(0, 50) + '...');
console.log('Exodus 1:1 Has all required fields:', !!exodus1_1.meaning && !!exodus1_1.interpretation && !!exodus1_1.explanation && !!exodus1_1.reasoning && !!exodus1_1.tension && !!exodus1_1.contrast && !!exodus1_1.analogy && !!exodus1_1.real_life && !!exodus1_1.practice && !!exodus1_1.perspectives && !!exodus1_1.cross_links && !!exodus1_1.meta && !!exodus1_1.insight ? 'PASS' : 'FAIL');

console.log('\n=== Validation Complete ===');
