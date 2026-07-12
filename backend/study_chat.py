"""Pluggable local-model support for verse-grounded study conversations."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class StudyChatError(RuntimeError):
    """Base error returned by a study-chat provider."""


class StudyChatUnavailable(StudyChatError):
    """The configured local model service cannot be reached."""


class StudyChatProvider(Protocol):
    name: str

    def answer(self, system_prompt: str, user_prompt: str) -> str:
        """Return a Markdown answer from the configured local model."""


@dataclass
class OllamaQwenProvider:
    """Qwen served through Ollama's local chat API."""

    model: str = "qwen3"
    endpoint: str = "http://127.0.0.1:11434/api/chat"
    timeout_seconds: int = 300
    name: str = "ollama-qwen3"

    def answer(self, system_prompt: str, user_prompt: str) -> str:
        payload = {
    "model": self.model,
    "stream": False,
    "messages": [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ],
    "think": False,
    "options": {
        "temperature": 0.2,
    },
}
        request = Request(
            self.endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                result = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            raise StudyChatError(f"The local Qwen 3 service returned HTTP {error.code}: {details}") from error
        except URLError as error:
            raise StudyChatUnavailable(
                "The local Qwen 3 service is unavailable. Start the configured local model provider and try again."
            ) from error

        answer = (result.get("message") or {}).get("content")
        if not isinstance(answer, str) or not answer.strip():
            raise StudyChatError("The local Qwen 3 service returned no chat content.")
        return answer.strip()


def _select_verse_context(context: dict[str, Any]) -> dict[str, Any]:
    """Keep prompts grounded in the study fields exposed by the viewer."""

    verse = context.get("verse") if isinstance(context.get("verse"), dict) else {}
    source = context.get("source") if isinstance(context.get("source"), dict) else {}
    meaning = context.get("meaning") if isinstance(context.get("meaning"), dict) else {}
    interpretation = context.get("interpretation") if isinstance(context.get("interpretation"), dict) else {}
    reasoning = context.get("reasoning") if isinstance(context.get("reasoning"), dict) else {}
    practice = context.get("practice") if isinstance(context.get("practice"), dict) else {}
    cross_links = context.get("cross_links") if isinstance(context.get("cross_links"), dict) else {}

    return {
        "id": context.get("id"),
        "verse": {
            "original": verse.get("original") or verse.get("original_sanskrit") or verse.get("original_arabic"),
            "transliteration": verse.get("transliteration"),
            "translation": verse.get("translation"),
        },
        "source": {
            "text": source.get("text"),
            "speaker": source.get("author_speaker"),
            "context": source.get("context"),
        },
        "meaning": meaning,
        "interpretation": interpretation,
        "reasoning": reasoning,
        "practice": practice,
        "cross_links": cross_links.get("similar_ideas") or [],
        "insight": context.get("insight"),
    }


class StudyChatService:
    """Creates grounded prompts independently of the selected local model runtime."""

    def __init__(self, provider: StudyChatProvider):
        self.provider = provider

    @classmethod
    def from_environment(cls) -> "StudyChatService":
        provider_name = os.getenv("STUDY_CHAT_PROVIDER", "ollama").lower()
        if provider_name != "ollama":
            raise ValueError(f"Unsupported STUDY_CHAT_PROVIDER: {provider_name}")

        return cls(
            OllamaQwenProvider(
                model=os.getenv("STUDY_CHAT_MODEL", "qwen3"),
                endpoint=os.getenv("STUDY_CHAT_OLLAMA_URL", "http://127.0.0.1:11434/api/chat"),
                timeout_seconds=int(os.getenv("STUDY_CHAT_TIMEOUT_SECONDS", "300")),
            )
        )

    def answer_verse_question(self, verse_id: str, context: dict[str, Any], question: str) -> str:
        if context.get("id") and context["id"] != verse_id:
            raise StudyChatError("The supplied verse context does not match verseId.")

        verse_context = _select_verse_context(context)
        system_prompt = """You are UnityScript's AI Study Companion. Answer in Markdown.

Base your answer primarily and explicitly on the supplied verse context. Use its meaning, interpretation, reasoning, practice, insight, and cross-links when relevant. When asked to compare with another scripture, use only the supplied cross-links and explain when they are insufficient. Do not add historical claims, quotations, scripture references, or interpretations that the supplied context does not support. If the context does not support an answer, say clearly: \"The supplied verse data does not provide enough information to answer that.\" Keep the response focused, respectful, and practical."""
        user_prompt = """Current verse context:
```json
%s
```

Student question: %s""" % (
            json.dumps(verse_context, ensure_ascii=False, indent=2),
            question.strip(),
        )
        return self.provider.answer(system_prompt, user_prompt)