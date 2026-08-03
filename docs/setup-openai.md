# OpenAI API key (ears and voice)

Hearth uses OpenAI for two things only:

- **Speech-to-text** — transcribing what you say (`gpt-4o-transcribe` by default)
- **Text-to-speech** — the assistant's voice (`gpt-4o-mini-tts`, voice selectable in Settings)

The thinking is all Claude; this key is just audio in/out.

## Get a key

1. Go to [platform.openai.com](https://platform.openai.com) and sign in.
2. Add a payment method under **Settings → Billing** (a $5 minimum credit goes a very long way).
3. **API keys → Create new secret key**, name it `hearth`, copy the `sk-…` value.
4. Paste it into Hearth → **Settings → Voice**, then hit **Test voice**.

## Cost

Both models are billed per audio minute/character and are cheap: normal daily household use is
typically **well under $0.10/day**. If you want to trim further, switch transcription to
`gpt-4o-mini-transcribe` in Settings.

## Picking a voice

Settings → Voice has a dropdown (`nova` is the default; `coral`, `ash`, and `sage` are also nice
for a home assistant). **Test voice** plays a sample instantly.
