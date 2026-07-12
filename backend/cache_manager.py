"""
CacheManager - Manages audio file caching for generated verses.

This module provides a cache-first architecture for audio files, ensuring
that each verse is generated only once and subsequent requests return
the cached audio immediately.
"""

import re
from pathlib import Path
from typing import Optional


SAFE_PATH_PART = re.compile(r"[^A-Za-z0-9_.-]")


class CacheManager:
    """Manages deterministic WAV caching by scripture and verse ID."""

    def __init__(self, cache_dir="audio_cache"):
        self.cache_dir = Path(cache_dir).resolve()
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _safe_part(self, value: str) -> str:
        cleaned = SAFE_PATH_PART.sub("_", value or "")
        cleaned = cleaned.strip("._")

        if not cleaned:
            raise ValueError("Cache path part cannot be empty.")

        return cleaned

    def _get_cache_path(self, scripture_name: str, verse_id: str) -> Path:
        scripture = self._safe_part(scripture_name)
        verse = self._safe_part(verse_id)
        scripture_dir = self.cache_dir / scripture
        scripture_dir.mkdir(parents=True, exist_ok=True)
        return scripture_dir / f"{verse}.wav"

    def get_cache_file(self, scripture_name: str, verse_id: str) -> str:
        """Return the absolute file path where this verse audio belongs."""
        return str(self._get_cache_path(scripture_name, verse_id))

    def exists(self, scripture_name: str, verse_id: str) -> bool:
        return self._get_cache_path(scripture_name, verse_id).is_file()

    def get_cached_audio(self, scripture_name: str, verse_id: str) -> Optional[str]:
        if not self.exists(scripture_name, verse_id):
            return None

        scripture = self._safe_part(scripture_name)
        verse = self._safe_part(verse_id)
        return f"/audio/{scripture}/{verse}.wav"

    def resolve_audio_path(self, scripture_name: str, filename: str) -> Optional[Path]:
        scripture = self._safe_part(scripture_name)
        requested = (self.cache_dir / scripture / filename).resolve()
        scripture_root = (self.cache_dir / scripture).resolve()

        if requested == scripture_root or scripture_root not in requested.parents:
            return None

        return requested

    def save_audio(self, scripture_name: str, verse_id: str, audio_data: bytes) -> str:
        cache_path = self._get_cache_path(scripture_name, verse_id)
        cache_path.write_bytes(audio_data)
        return self.get_cached_audio(scripture_name, verse_id)

    def save_audio_from_file(self, scripture_name: str, verse_id: str, source_path: str) -> str:
        import shutil

        cache_path = self._get_cache_path(scripture_name, verse_id)
        shutil.copy(source_path, cache_path)
        return self.get_cached_audio(scripture_name, verse_id)

    def clear_cache(self, scripture_name: Optional[str] = None):
        import shutil

        if scripture_name:
            scripture_dir = self.cache_dir / self._safe_part(scripture_name)
            if scripture_dir.exists():
                shutil.rmtree(scripture_dir)
            scripture_dir.mkdir(parents=True, exist_ok=True)
            return

        if self.cache_dir.exists():
            shutil.rmtree(self.cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def get_cache_stats(self) -> dict:
        stats = {
            "total_files": 0,
            "total_size_bytes": 0,
            "scriptures": {},
        }

        if not self.cache_dir.exists():
            return stats

        for scripture_path in self.cache_dir.iterdir():
            if not scripture_path.is_dir():
                continue

            scripture_stats = {
                "file_count": 0,
                "size_bytes": 0,
            }

            for audio_path in scripture_path.glob("*.wav"):
                if audio_path.is_file():
                    file_size = audio_path.stat().st_size
                    scripture_stats["file_count"] += 1
                    scripture_stats["size_bytes"] += file_size
                    stats["total_files"] += 1
                    stats["total_size_bytes"] += file_size

            stats["scriptures"][scripture_path.name] = scripture_stats

        return stats
