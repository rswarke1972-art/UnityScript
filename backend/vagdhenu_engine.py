import os
import sys
import traceback
import uuid
import traceback
from typing import Optional

import soundfile as sf


class VagdhenuEngine:
    """
    Wrapper class for the Vagdhenu TTS engine.

    The heavy renderer is imported lazily so the FastAPI app can still start
    and serve cached audio even when local model assets are not installed.
    """

    def __init__(self, device: str = "cpu"):
        self.device = device
        self.renderer = None
        self.is_model_loaded = False
        self.output_dir = "audio_output"
        os.makedirs(self.output_dir, exist_ok=True)
        self._load_model()

    def _load_model(self):
        """Load the Vagdhenu model if all local assets are present."""
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            vagdhenu_dir = os.path.join(base_dir, "vagdhenu")
            vagdhenu_src = os.path.join(vagdhenu_dir, "src")
            bigvgan_src = os.path.join(vagdhenu_dir, "BigVGAN")

            for path in (vagdhenu_src, bigvgan_src):
                if os.path.exists(path) and path not in sys.path:
                    sys.path.insert(0, path)

            from render_core import Renderer

            voice_path = os.path.join(vagdhenu_dir, "models", "voice_steer_ema_2026-06-17.pt")
            voc_path = os.path.join(vagdhenu_dir, "models", "voc_bigvgan_EMA_2026-06-11.pth")
            bank_path = os.path.join(vagdhenu_src, "reference_bank", "bank.json")
            vocab_file = os.path.join(vagdhenu_dir, "models", "vocab.txt")

            for path, name in [
                (voice_path, "voice model"),
                (voc_path, "vocoder"),
                (bank_path, "reference bank"),
                (vocab_file, "vocab file"),
            ]:
                if not os.path.exists(path):
                    raise FileNotFoundError(f"{name} not found at {path}")

            self.renderer = Renderer(
                voice_path=voice_path,
                voc_path=voc_path,
                bank_path=bank_path,
                vocab_file=vocab_file,
                device=self.device,
            )

            self.is_model_loaded = True
            print(f"Vagdhenu model loaded successfully on {self.device}")

        except Exception as e:
            print(f"Vagdhenu model unavailable: {e}")
            self.is_model_loaded = False

    def is_loaded(self) -> bool:
        return self.is_model_loaded

    def generate_audio(
        self,
        text: str,
        meter: Optional[str] = None,
        output_path: Optional[str] = None,
    ) -> Optional[str]:
        """
        Generate audio from Sanskrit text.

        When output_path is supplied by the caller, audio is written directly
        to that deterministic cache file.
        """
        if not self.is_model_loaded or self.renderer is None:
            print("Vagdhenu model not loaded")
            return None

        try:
            if meter is None:
                meter = "anushtubh"

                print("\n===== DEBUG =====")
                print("TEXT:")
                print(repr(text))
                print()
                print("METER:", repr(meter))
                print("=================\n")

            sr, audio = self.renderer.render_one(text, meter=meter)

            if output_path is None:
                filename = f"{uuid.uuid4()}.wav"
                output_path = os.path.join(self.output_dir, filename)

            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            sf.write(output_path, audio, sr)

            return output_path

        except Exception:
            print("\n========== FULL TRACEBACK ==========")
            traceback.print_exc()
            print("====================================\n")
            return None
