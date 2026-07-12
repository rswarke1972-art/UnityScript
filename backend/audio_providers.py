from pathlib import Path
from typing import Protocol


class AudioProviderError(RuntimeError):
    """Base error raised by an audio provider."""


class AudioProviderUnavailable(AudioProviderError):
    """Raised when an audio provider is intentionally unavailable."""


class AudioProvider(Protocol):
    name: str

    def generate(self, *, text: str, meter: str, output_path: Path) -> str | None:
        """Generate audio into output_path and return the generated path."""


class VagdhenuAudioProvider:
    name = "vagdhenu"

    def __init__(self, engine) -> None:
        self.engine = engine

    def generate(self, *, text: str, meter: str, output_path: Path) -> str | None:
        return self.engine.generate_audio(
            text=text,
            meter=meter,
            output_path=str(output_path),
        )


class PiperAudioProvider:
    name = "piper"

    def generate(self, *, text: str, meter: str, output_path: Path) -> str | None:
        raise AudioProviderUnavailable("Piper is not configured yet.")


class NullAudioProvider:
    name = "none"

    def generate(self, *, text: str, meter: str, output_path: Path) -> str | None:
        raise AudioProviderUnavailable("AI audio is not available for this scripture.")


class AudioProviderRegistry:
    def __init__(self, providers: list[AudioProvider]) -> None:
        self._providers = {provider.name: provider for provider in providers}

    def get(self, name: str) -> AudioProvider:
        provider = self._providers.get(name)
        if provider is None:
            raise AudioProviderUnavailable(f"Audio provider '{name}' is not available.")
        return provider