# Bible Current Structure Analysis

## Current Schema

### bible.json Structure
```json
{
  "id": "bible",
  "name": "Bible",
  "books": [
    {
      "name": "Genesis",
      "chapters": [
        {
          "name": "Chapter 1",
          "verses": [
            {
              "id": "genesis_1_1",
              "verse": {
                "original": "In the beginning God created the heaven and the earth.",
                "transliteration": null,
                "translation": "In the beginning, God created the heavens and the earth."
              },
              "source": {...},
              "meaning": {...},
              "interpretation": {...},
              "explanation": {...},
              "reasoning": {...},
              "tension": {...},
              "contrast": {...},
              "analogy": "...",
              "real_life": "...",
              "practice": {...},
              "perspectives": {...},
              "cross_links": {...},
              "meta": {...},
              "insight": "..."
            }
          ]
        }
      ]
    }
  ]
}
```

### Verse Schema Fields
- id
- verse.original
- verse.transliteration
- verse.translation
- source (text, tradition, author_speaker, type, context)
- meaning (word_by_word, overall)
- interpretation (traditional, core_principle, psychological)
- explanation (simple, deep)
- reasoning (logic.premise, logic.observation, logic.conclusion, flow)
- tension (human_doubt, resolution)
- contrast (ignorance, wisdom)
- analogy
- real_life
- practice (actions[], reflection_questions[])
- perspectives (spiritual, philosophical, practical, leadership)
- cross_links (similar_ideas[])
- meta (theme, mode, duality, principle_strength, difficulty)
- insight

## Current Loading Mechanism

### script.js Loading Flow

1. **Metadata Loading**
   - `fetchMetadata()` loads `data/scriptures-meta.json`
   - Contains file paths for each scripture

2. **Scripture Data Loading**
   - `getScriptureData(scriptureId)` loads the entire scripture JSON file
   - Currently loads entire 224MB bible.json at once
   - Caches in `state.scriptureCache`

3. **Navigation Flow**
   - **Book Selection**: `chapters.html?s=bible&b=1` (book index)
   - **Chapter Selection**: `verses.html?s=bible&b=1&c=1` (chapter index)
   - **Verse Selection**: `viewer.html?s=bible&b=1&c=1&v=1` (verse index)

4. **Routing**
   - `parseQueryParams()` extracts s, b, c, v parameters
   - Fallback to localStorage if query params missing
   - 0-indexed internally (stored as 1-indexed in URLs)

5. **Bible-Specific Logic**
   - Checks for `scriptureData.books` array (Bible has books, other scriptures have chapters directly)
   - Two-step navigation: books → chapters → verses
   - Other scriptures: chapters → verses (single level)

## Current Issues

1. **GitHub Pages Limitation**: bible.json is 224MB (exceeds 100MB limit)
2. **Performance**: Entire 224MB file loads even for viewing a single verse
3. **Scalability**: Adding more content will worsen the problem

## Navigation Parameters

- `s`: scripture ID (e.g., "bible")
- `b`: book index (1-66 for Bible)
- `c`: chapter index
- `v`: verse index

## Cache Strategy

- `state.scriptureCache[scriptureId]` caches entire scripture
- No book-level caching currently
- No lazy loading
