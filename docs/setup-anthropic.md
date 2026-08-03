# Anthropic API key (the assistant's brain)

Hearth talks to Claude through the Anthropic API. This is **separate billing from a claude.ai
subscription** — you need an API key from the developer console.

## Get a key

1. Go to [console.anthropic.com](https://console.anthropic.com) and sign in (create an account if
   needed).
2. Add a payment method / credits under **Billing** if you haven't before.
3. Go to **API keys → Create key**, name it `hearth`, and copy the `sk-ant-…` value.
4. Paste it into Hearth → **Settings → Assistant brain**.

## Model & cost notes

- The default model is **`claude-fable-5`** (what you asked for — Anthropic's most capable model).
  Pricing is $10 per million input tokens / $50 per million output tokens. A typical short voice
  exchange is a few thousand tokens; heavy daily use is usually cents-to-a-few-dollars per day.
  Hearth uses prompt caching and a low default "effort" setting to keep responses fast and cheap.
- Want cheaper? Change the model in Settings to **`claude-opus-5`** ($5/$25) — still excellent for
  this use.
- Web search ("who won last night?") uses Anthropic's hosted search tool and bills a small
  per-search fee on top of tokens.

## Two things worth knowing about Fable 5

- **Data retention**: Claude Fable 5 requires standard 30-day API data retention. If your API
  organization is configured for zero data retention, every request returns a 400 error — switch
  the model to `claude-opus-5` in that case.
- **Safety fallback**: rarely, Fable 5's safety classifiers decline a request. Hearth automatically
  retries those on Claude Opus 4.8 server-side, so you still get an answer.
