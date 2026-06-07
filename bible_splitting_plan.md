# Bible Splitting Implementation Plan

## Objective
Split `bible.json` into individual book files (genesis.json, exodus.json, etc.) while maintaining current system functionality.

## Current Structure Analysis

### bible.json
```json
{
  "id": "bible",
  "name": "Bible",
  "books": [
    {
      "name": "Genesis",
      "chapters": [...]
    },
    {
      "name": "Exodus",
      "chapters": [...]
    }
  ]
}
```

### scriptures-meta.json
```json
{
  "bible": {
    "id": "bible",
    "name": "Bible",
    "filePath": "data/bible.json"
  }
}
```

### script.js Loading
- `getScriptureData(scriptureId)` loads the entire bible.json file
- All books loaded at once regardless of which book user selects

## Proposed New Structure

### Option 1: Index + Individual Books (Recommended)

**New bible.json (Index File)**
```json
{
  "id": "bible",
  "name": "Bible",
  "language": "english",
  "tradition": "Christian/Jewish",
  "books": [
    {
      "id": "genesis",
      "name": "Genesis",
      "filePath": "data/bible/genesis.json",
      "chapterCount": 50
    },
    {
      "id": "exodus",
      "name": "Exodus",
      "filePath": "data/bible/exodus.json",
      "chapterCount": 40
    }
  ]
}
```

**Individual Book Files (data/bible/)**
- `genesis.json` - contains only Genesis chapters and verses
- `exodus.json` - contains only Exodus chapters and verses
- etc.

**Book File Structure**
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

**No changes to scriptures-meta.json** - still points to `data/bible.json`

### script.js Changes Required

1. Update `getScriptureData(scriptureId)` to:
   - Load bible.json (index) first
   - If user has selected a book (from query param `?b=`), load that specific book file
   - Otherwise return the index (for book selection page)

2. Add new function `getBookData(scriptureId, bookIndex)`:
   - Loads bible.json index
   - Loads specific book file
   - Returns combined data structure (index + selected book)

3. Update routing to pass book index to data loading functions

## Implementation Steps

### Phase 1: Prepare File Structure
1. Create directory: `data/bible/`
2. Backup original bible.json to `data/bible.json.backup`

### Phase 2: Extract Individual Books
1. Write script to extract each book from bible.json
2. Create individual book files: genesis.json, exodus.json, etc.
3. Validate each book file structure

### Phase 3: Create Index File
1. Create new bible.json with book metadata
2. Include: id, name, filePath, chapterCount for each book

### Phase 4: Update script.js
1. Add `getBookData(scriptureId, bookIndex)` function
2. Update `getScriptureData(scriptureId)` to handle book selection
3. Update render functions to use new loading pattern
4. Test book selection and verse rendering

### Phase 5: Testing
1. Test book selection page loads correctly
2. Test chapter selection page loads correctly
3. Test verse viewer loads correctly
4. Test navigation between books/chapters/verses
5. Test other scriptures (bhagavad-gita, quran, etc.) still work

### Phase 6: Cleanup
1. Remove original bible.json (keep backup)
2. Update documentation if needed

## Advantages of This Approach

1. **Lazy Loading**: Only load the book user is viewing
2. **Faster Initial Load**: bible.json index is small
3. **Scalability**: Easy to add/remove books
4. **Backward Compatible**: Script changes are minimal
5. **Maintainable**: Individual book files are easier to edit

## Risks and Mitigations

**Risk**: Breaking existing functionality
- **Mitigation**: Keep backup, test thoroughly, rollback if needed

**Risk**: Increased complexity in script.js
- **Mitigation**: Keep changes minimal, add comments, test all paths

**Risk**: File path issues
- **Mitigation**: Use relative paths, test on different environments

## Estimated Effort

- Phase 1: 5 minutes
- Phase 2: 30 minutes (script + execution)
- Phase 3: 10 minutes
- Phase 4: 30 minutes
- Phase 5: 20 minutes
- Phase 6: 5 minutes

Total: ~1.5-2 hours
