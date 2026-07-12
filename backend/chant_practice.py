"""Offline chant-practice transcription and token-level comparison."""

from __future__ import annotations

import os
import re
import tempfile
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Protocol


class ChantPracticeError(RuntimeError):
    """Base error for the chant-practice workflow."""


class ChantPracticeUnavailable(ChantPracticeError):
    """The configured local transcription runtime is not ready."""


class ChantTranscriber(Protocol):
    name: str

    def transcribe(self, audio_path: Path) -> str:
        """Return the locally recognized text for an audio file."""


@dataclass
class FasterWhisperTranscriber:
    """Lazy faster-whisper adapter that never downloads a model at runtime."""

    model_path: str | None
    device: str = "auto"
    compute_type: str = "int8"
    language: str = "sa"
    name: str = "faster-whisper"
    _model: Any = None

    def _load_model(self) -> Any:
        if self._model is not None:
            return self._model
        if not self.model_path:
            raise ChantPracticeUnavailable(
                "No offline speech model is configured. Set CHANT_PRACTICE_MODEL_PATH to a local faster-whisper model directory."
            )

        path = Path(self.model_path)
        if not path.exists():
            raise ChantPracticeUnavailable(
                f"The configured offline speech model was not found: {path}"
            )

        try:
            from faster_whisper import WhisperModel
        except ImportError as error:
            raise ChantPracticeUnavailable(
                "faster-whisper is not installed. Install backend requirements before using Chant Practice."
            ) from error

        self._model = WhisperModel(str(path), device=self.device, compute_type=self.compute_type)
        return self._model

    def transcribe(self, audio_path: Path) -> str:
        model = self._load_model()
        try:
            segments, _ = model.transcribe(
                str(audio_path),
                language=self.language,
                beam_size=5,
                vad_filter=False,
                condition_on_previous_text=False,
            )
            return " ".join(segment.text.strip() for segment in segments if segment.text.strip())
        except Exception as error:
            raise ChantPracticeError(f"Offline transcription failed: {error}") from error


def normalize_chant_text(text: str) -> str:
    normalized = unicodedata.normalize("NFC", text or "").lower()
    normalized = re.sub(r"[\u0964\u0965|,.;:!?()\[\]{}\"']", " ", normalized)
    normalized = re.sub(r"[0-9\u0966-\u096f]", " ", normalized)
    return " ".join(normalized.split())


def compare_chant_text(expected: str, recognized: str) -> dict[str, Any]:
    expected_words = normalize_chant_text(expected).split()
    recognized_words = normalize_chant_text(recognized).split()
    matcher = SequenceMatcher(a=expected_words, b=recognized_words, autojunk=False)

    missing: list[str] = []
    extra: list[str] = []
    differences: list[dict[str, list[str] | str]] = []
    matched_words = 0

    for tag, expected_start, expected_end, recognized_start, recognized_end in matcher.get_opcodes():
        expected_part = expected_words[expected_start:expected_end]
        recognized_part = recognized_words[recognized_start:recognized_end]
        if tag == "equal":
            matched_words += len(expected_part)
        elif tag == "delete":
            missing.extend(expected_part)
            differences.append({"type": "missing", "expected": expected_part, "recognized": []})
        elif tag == "insert":
            extra.extend(recognized_part)
            differences.append({"type": "extra", "expected": [], "recognized": recognized_part})
        elif tag == "replace":
            missing.extend(expected_part)
            extra.extend(recognized_part)
            differences.append({"type": "different", "expected": expected_part, "recognized": recognized_part})

    denominator = max(len(expected_words), len(recognized_words), 1)
    accuracy = round((matched_words / denominator) * 100)
    return {
        "recognized": recognized.strip(),
        "expected": expected.strip(),
        "accuracy": accuracy,
        "missing": missing,
        "extra": extra,
        "differences": differences,
    }


class ChantPracticeService:
    """Coordinates a swappable offline recognizer and deterministic comparison."""

    def __init__(self, transcriber: ChantTranscriber):
        self.transcriber = transcriber

    @classmethod
    def from_environment(cls) -> "ChantPracticeService":
        provider = os.getenv("CHANT_PRACTICE_PROVIDER", "faster-whisper").lower()
        if provider != "faster-whisper":
            raise ValueError(f"Unsupported CHANT_PRACTICE_PROVIDER: {provider}")
        return cls(
            FasterWhisperTranscriber(
                model_path=os.getenv("CHANT_PRACTICE_MODEL_PATH"),
                device=os.getenv("CHANT_PRACTICE_DEVICE", "auto"),
                compute_type=os.getenv("CHANT_PRACTICE_COMPUTE_TYPE", "int8"),
                language=os.getenv("CHANT_PRACTICE_LANGUAGE", "sa"),
            )
        )

    def evaluate(self, expected: str, audio_bytes: bytes, suffix: str = ".webm") -> dict[str, Any]:
        if not audio_bytes:
            raise ChantPracticeError("No recording was received.")

        with tempfile.NamedTemporaryFile(suffix=suffix or ".webm", delete=False) as audio_file:
            audio_file.write(audio_bytes)
            audio_path = Path(audio_file.name)

        try:
            recognized = self.transcriber.transcribe(audio_path)
            return compare_chant_text(expected, recognized)
        finally:
            audio_path.unlink(missing_ok=True)