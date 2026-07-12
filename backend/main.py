import asyncio
from pathlib import Path
from typing import Any, Literal, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from cache_manager import CacheManager
from repository.scripture_repository import ScriptureRepository
from vagdhenu_engine import VagdhenuEngine
from audio_providers import (
    AudioProviderRegistry,
    AudioProviderUnavailable,
    NullAudioProvider,
    PiperAudioProvider,
    VagdhenuAudioProvider,
)
from study_chat import StudyChatError, StudyChatService, StudyChatUnavailable
from chant_practice import ChantPracticeError, ChantPracticeService, ChantPracticeUnavailable

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"
AUDIO_CACHE_DIR = BACKEND_DIR / "audio_cache"

app = FastAPI(
    title="SanskritFlow API",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# -------------------------------------------------------
# Initialize components
# -------------------------------------------------------

scripture_repo = ScriptureRepository(
    scriptures_path=DATA_DIR,
)
scripture_repo.load()

# Verify critical verses are accessible
test_verses = ["gita_1_1", "bhagavad_gita_2_47", "dhammapada_1_1", "aitareya_1_7"]
print("=== Verse Verification ===")
for verse_id in test_verses:
    verse = scripture_repo.get_verse(verse_id)
    if verse:
        print(f"[OK] {verse_id}: found")
    else:
        print(f"[FAIL] {verse_id}: NOT FOUND")
print("==========================\n")

cache_manager = CacheManager(
    cache_dir=AUDIO_CACHE_DIR,
)

vagdhenu = VagdhenuEngine(
    device="cpu",
)
audio_providers = AudioProviderRegistry([
    VagdhenuAudioProvider(vagdhenu),
    PiperAudioProvider(),
    NullAudioProvider(),
])

study_chat = StudyChatService.from_environment()
chant_practice = ChantPracticeService.from_environment()

# -------------------------------------------------------
# Models
# -------------------------------------------------------

class ChantRequest(BaseModel):
    id: str
    provider: str = "vagdhenu"


class ChantResponse(BaseModel):
    success: bool
    audio_path: Optional[str] = None
    cached: bool = False
    message: Optional[str] = None
class AIChatRequest(BaseModel):
    mode: Literal["verse"]
    verseId: str = Field(min_length=1, max_length=200)
    context: dict[str, Any]
    question: str = Field(min_length=1, max_length=4000)


class AIChatResponse(BaseModel):
    success: bool
    answer: Optional[str] = None
    provider: Optional[str] = None
    message: Optional[str] = None
class ChantPracticeResponse(BaseModel):
    recognized: str
    expected: str
    accuracy: int
    missing: list[str]
    extra: list[str]
    differences: list[dict[str, Any]]
    provider: Optional[str] = None


# -------------------------------------------------------
# Routes
# -------------------------------------------------------

@app.get("/")
async def root():
    return {
        "message": "SanskritFlow Backend",
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "vagdhenu_loaded": vagdhenu.is_loaded(),
        "verses_loaded": len(scripture_repo.verses),
    }


@app.post("/chant", response_model=ChantResponse)
async def chant(request: ChantRequest):
    try:
        verse_info = scripture_repo.get_verse(request.id)

        if verse_info is None:
            return ChantResponse(
                success=False,
                message=f"Verse '{request.id}' not found.",
            )

        scripture = verse_info["scripture"]
        text = verse_info["text"]
        meter = verse_info.get("meter", "Anushtubh").lower()
        provider = audio_providers.get(request.provider)

        if request.provider == "vagdhenu":
            cached = cache_manager.get_cached_audio(scripture, request.id)
            if cached:
                return ChantResponse(
                    success=True,
                    audio_path=cached,
                    cached=True,
                )

        cache_file = cache_manager.get_cache_file(scripture, request.id)
        generated = provider.generate(
            text=text,
            meter=meter,
            output_path=cache_file,
        )

        if generated is None:
            return ChantResponse(
                success=False,
                message="Audio generation failed.",
            )

        return ChantResponse(
            success=True,
            audio_path=cache_manager.get_cached_audio(scripture, request.id),
            cached=False,
        )

    except AudioProviderUnavailable as error:
        return ChantResponse(
            success=False,
            message=str(error),
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=str(e),
        ) from e




@app.post("/chant/practice", response_model=ChantPracticeResponse)
async def chant_practice_endpoint(
    verseId: str = Form(..., min_length=1, max_length=200),
    audio: UploadFile = File(...),
):
    verse_info = scripture_repo.get_verse(verseId)
    if verse_info is None:
        raise HTTPException(status_code=404, detail=f"Verse '{verseId}' not found.")

    audio_bytes = await audio.read()
    if len(audio_bytes) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Recording is too large. Keep it under 25 MB.")

    suffix = Path(audio.filename or "recording.webm").suffix or ".webm"
    try:
        result = await asyncio.to_thread(
            chant_practice.evaluate,
            verse_info["text"],
            audio_bytes,
            suffix,
        )
        return ChantPracticeResponse(
            **result,
            provider=chant_practice.transcriber.name,
        )
    except ChantPracticeUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except ChantPracticeError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        await audio.close()
@app.post("/ai/chat", response_model=AIChatResponse)
async def ai_chat(request: AIChatRequest):
    try:
        answer = await asyncio.to_thread(
            study_chat.answer_verse_question,
            request.verseId,
            request.context,
            request.question,
        )
        return AIChatResponse(
            success=True,
            answer=answer,
            provider=study_chat.provider.name,
        )
    except StudyChatUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except StudyChatError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
@app.get("/audio/{scripture}/{filename:path}")
async def get_audio(scripture: str, filename: str):
    path = cache_manager.resolve_audio_path(scripture, filename)

    if path is None or not path.exists():
        raise HTTPException(
            status_code=404,
            detail="Audio not found.",
        )

    return FileResponse(
        path,
        media_type="audio/wav",
        filename=path.name,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
    )
