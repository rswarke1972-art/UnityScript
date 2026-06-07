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
  fs.writeFileSync(filename, JSON.stringify(bookData, null, 2), 'utf8');
  console.log(`Extracted: ${book.name} (${book.chapters.length} chapters) -> ${filename}`);
});

console.log('Book extraction complete.');
