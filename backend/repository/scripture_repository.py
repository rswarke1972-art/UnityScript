import json
from pathlib import Path


class ScriptureRepository:
    def __init__(self, scriptures_path=None, enabled_scripture_ids=None):
        self.scriptures_path = Path(scriptures_path or "scriptures").resolve()
        self.enabled_scripture_ids = set(
    enabled_scripture_ids or {
        "bhagavad_gita",
        "dhammapada",
        "upanishads",
    }
)
        self.verses = {}

    def load(self):
        """Load UnityScript scripture JSON into memory."""
        self.verses.clear()

        if not self.scriptures_path.exists():
            print(f"Scriptures path not found: {self.scriptures_path}")
            return

        # Track loading statistics per scripture
        scripture_stats = {}

        for scripture_file in self.scriptures_path.glob("*.json"):
            # Skip backup files
            if "backup" in scripture_file.name.lower():
                continue
                
            initial_count = len(self.verses)
            self._load_unityscript_file(scripture_file)
            loaded_count = len(self.verses) - initial_count
            
            if loaded_count > 0:
                scripture_name = scripture_file.stem.replace("-", "_")
                scripture_stats[scripture_name] = loaded_count

        # Print startup diagnostics
        print("\n=== Scripture Repository Startup ===")
        for scripture, count in scripture_stats.items():
            print(f"Loaded {scripture}: {count} verses")
        print(f"Total indexed: {len(self.verses)} verses")
        print("====================================\n")

    def _load_unityscript_file(self, scripture_file):
        with scripture_file.open(encoding="utf-8") as f:
            data = json.load(f)

        scripture_id = data.get("id") or scripture_file.stem.replace("-", "_")
        if self.enabled_scripture_ids and scripture_id not in self.enabled_scripture_ids:
            return

        scripture = self._scripture_cache_name(scripture_id, data.get("name"), scripture_file.stem)
        
        # Handle both simple structure (chapters) and books structure (books -> chapters)
        if "books" in data:
            # Upanishads-style structure with multiple books
            books = data.get("books") or []
            for book in books:
                chapters = book.get("chapters") or []
                for chapter_index, chapter in enumerate(chapters, start=1):
                    for verse in chapter.get("verses") or []:
                        self._index_verse(verse, scripture, chapter_index)
        else:
            # Simple structure with direct chapters (Bhagavad Gita, Dhammapada)
            chapters = data.get("chapters") or []
            for chapter_index, chapter in enumerate(chapters, start=1):
                for verse in chapter.get("verses") or []:
                    self._index_verse(verse, scripture, chapter_index)

    def _index_verse(self, verse, scripture, chapter_index):
        """Index a single verse into the repository."""
        verse_id = verse.get("id")
        verse_body = verse.get("verse") or {}
        text = (
            verse_body.get("original")
            or verse_body.get("original_sanskrit")
            or verse_body.get("original_sanskrit_accented")
            or verse_body.get("original_pali")
            or verse.get("sanskrit")
        )

        if not verse_id or not text:
            return

        self.verses[verse_id] = {
            "scripture": scripture,
            "chapter": verse.get("chapter_number") or verse.get("chapter") or chapter_index,
            "verse": verse.get("verse_number") or verse.get("number") or verse.get("verse"),
            "text": text,
            "meter": verse.get("meter", "Anushtubh"),
        }

    def _load_legacy_directory(self, scripture_dir):
        metadata = scripture_dir / "metadata.json"

        if not metadata.exists():
            return

        with metadata.open(encoding="utf-8") as f:
            meta = json.load(f)

        scripture = self._scripture_cache_name(meta.get("id"), meta.get("name"), scripture_dir.name)
        chapter_count = int(meta.get("chapters") or 0)

        for i in range(1, chapter_count + 1):
            chapter_file = scripture_dir / f"chapter{i}.json"

            if not chapter_file.exists():
                continue

            with chapter_file.open(encoding="utf-8") as f:
                chapter = json.load(f)

            for verse in chapter.get("verses") or []:
                verse_id = verse.get("id")
                text = verse.get("sanskrit") or (verse.get("verse") or {}).get("original")

                if not verse_id or not text:
                    continue

                self.verses[verse_id] = {
                    "scripture": scripture,
                    "chapter": verse.get("chapter", i),
                    "verse": verse.get("verse"),
                    "text": text,
                    "meter": verse.get("meter", "Anushtubh"),
                }

    def _scripture_cache_name(self, scripture_id, scripture_name, fallback):
        normalized = (scripture_id or scripture_name or fallback or "").lower().replace("-", "_").replace(" ", "_")

        if normalized in {"bhagavad_gita", "gita", "bg"}:
            return "BhagavadGita"

        return "".join(part.capitalize() for part in normalized.split("_") if part)

    def get_verse(self, verse_id):
        return self.verses.get(verse_id)

