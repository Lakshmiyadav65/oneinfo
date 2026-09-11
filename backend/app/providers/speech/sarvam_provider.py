import base64

import httpx

from app.core.errors import AppError

_ENDPOINT = "https://api.sarvam.ai/text-to-speech"

# bulbul:v3 takes 2500 characters. A scene's dialogue is one or two
# sentences, so this is a guard against a malformed prompt rather than a
# real limit any storyboard would approach.
MAX_CHARACTERS = 2500


class SarvamSpeechError(AppError):
    code = "PROVIDER_TIMEOUT"
    status_code = 502


class SarvamSpeechProvider:
    """
    Sarvam's Indian-language text to speech.

    Chosen for the one thing Veo cannot do: say a Telugu line in a voice
    that sounds like a person from Hyderabad rather than a model that has
    mostly heard English. The audio comes back base64 in `audios[0]`.
    """

    def __init__(
        self,
        api_key: str,
        model: str = "bulbul:v3",
        speaker: str = "shubh",
        sample_rate: int = 24000,
    ):
        self._api_key = api_key
        self._model = model
        # Lower case, and the API is strict about it.
        self._speaker = speaker.lower()
        self._sample_rate = sample_rate

    async def synthesize(self, text: str, *, language_code: str, pace: float) -> bytes:
        spoken = text.strip()
        if not spoken:
            raise SarvamSpeechError("There is no dialogue to speak in this scene.")
        if len(spoken) > MAX_CHARACTERS:
            raise SarvamSpeechError(
                f"That line is {len(spoken)} characters, past the "
                f"{MAX_CHARACTERS} this voice will read in one go."
            )

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                _ENDPOINT,
                headers={"api-subscription-key": self._api_key},
                json={
                    "text": spoken,
                    "language_code": language_code,
                    "model": self._model,
                    "speaker": self._speaker,
                    "pace": round(pace, 2),
                    "speech_sample_rate": self._sample_rate,
                    "output_audio_codec": "wav",
                },
            )

        if response.status_code == 401 or response.status_code == 403:
            raise SarvamSpeechError(
                "Sarvam refused the API key. Check SARVAM_API_KEY in the backend .env."
            )
        if response.status_code >= 400:
            # The body carries the reason, and it is usually the actionable
            # part - an unsupported speaker, or a language the model does
            # not have. Passed through rather than replaced with "502".
            raise SarvamSpeechError(
                f"Sarvam returned {response.status_code}: {response.text[:300]}"
            )

        audios = response.json().get("audios") or []
        if not audios:
            raise SarvamSpeechError("Sarvam returned no audio for that line.")
        return base64.b64decode(audios[0])
