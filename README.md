# DropDash — eBay Dropshipping Dashboard

A lightweight, AI-powered dashboard for managing your eBay dropshipping business. No server required — runs entirely in the browser.

## Features

- **Product research** — AI analyses a niche and returns avg margin, competition level, trend, and a full opportunity write-up
- **Listing creator** — generates an 80-char keyword title, description, sell price, item specifics, and search tags from a product name and cost price
- **Order tracker** — add eBay orders manually, track status through the fulfilment pipeline, see running profit and margin totals (persisted in localStorage)
- **Supplier workflow** — generates a ready-to-paste order message for Syncee, AliExpress, or direct supplier email

## Setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/dropdash.git
cd dropdash
```

### 2. Get an Anthropic API key

Sign up at [console.anthropic.com](https://console.anthropic.com) and create an API key. You'll need a small amount of credit — typical usage costs fractions of a penny per request.

### 3. Open the app

Open `index.html` directly in your browser — no build step, no server needed.

On first use the app will prompt you for your Anthropic API key. It's stored in your browser's `localStorage` and is only ever sent to `api.anthropic.com`.

### Deploying to Cloudflare Pages (optional)

1. Push this repo to GitHub
2. In Cloudflare Pages, connect the repo and deploy — build command is blank, output directory is `/`
3. Done — the app is live at `your-project.pages.dev`

## Stack

- Vanilla HTML / CSS / JS — zero dependencies, zero build step
- [Anthropic Claude API](https://docs.anthropic.com) (`claude-sonnet-4-6`) for AI features
- `localStorage` for order persistence

## File structure

```
dropdash/
├── index.html   # App shell and markup
├── style.css    # All styles (dark mode included)
├── app.js       # All logic and API calls
└── README.md
```

## Notes

- Orders persist in your browser's localStorage — they won't sync across devices or browsers
- Your API key is stored locally and never leaves your machine (except in requests to api.anthropic.com)
- The app works offline for the order tracker; AI features require an internet connection

## License

MIT
