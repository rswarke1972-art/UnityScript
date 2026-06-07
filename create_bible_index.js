const fs = require('fs');

// Load the bible.json file
const bible = JSON.parse(fs.readFileSync('data/bible.json', 'utf8'));

// Create the lightweight index
const bibleIndex = {
  "id": "bible",
  "name": "Bible",
  "language": "english",
  "tradition": "Christian/Jewish",
  "bookCount": bible.books.length,
  "books": bible.books.map((book, index) => ({
    "id": book.name.toLowerCase().replace(/\s+/g, '_'),
    "name": book.name,
    "chapterCount": book.chapters.length,
    "filePath": `data/bible/${book.name.toLowerCase().replace(/\s+/g, '_')}.json`
  }))
};

// Write the new index
fs.writeFileSync('data/bible.json', JSON.stringify(bibleIndex, null, 2), 'utf-8');
console.log('Bible index created successfully');
console.log(`Total books: ${bibleIndex.bookCount}`);
console.log('Index file size:', fs.statSync('data/bible.json').size, 'bytes');
