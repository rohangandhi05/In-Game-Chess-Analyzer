# Chess Real-Time Analyzer

> **Disclaimer:** This extension is for **educational, training, and analysis use only**.  
> Do **not** use it for assistance in rated or competitive games. Using engines during rated games violates Chess.com’s Terms of Service and fair‑play rules.

---

## Demo

| | | |
|:---:|:---:|:---:|
| ![Overlay on Chess.com](icons/rsz_screenshot_2026-03-11_at_60905%20pm.png) | ![Analysis in action](icons/rsz_screenshot_2026-03-11_at_60942%20pm.png) | ![Best move & evaluation](icons/rsz_screenshot_2026-03-11_at_61629%20pm.png) |

*Screenshots: overlay on a Chess.com game, analysis panel, and best-move display.*

---

## Overview

Chess Real-Time Analyzer is a **Chrome extension** (Manifest V3) for [Chess.com](https://www.chess.com) that:

- Watches your current Chess.com game.
- Infers the current board position.
- Runs the position through a local Stockfish engine.
- Shows a small overlay with the **best move** and **evaluation**, only when it’s **your turn**.

Everything runs locally in your browser – no moves or positions are sent to a backend server.

---

## Installation

- Install the extension from the **Chrome Web Store**.  
  - (Once your listing is live, put the store URL here, for example: `https://chrome.google.com/webstore/detail/...`.)
- Ensure it’s **enabled** in `chrome://extensions/`.

---

## Using the extension

1. Go to a Chess.com **live game** or **play** page:
   - `https://www.chess.com/game/live/...`
   - `https://www.chess.com/play/...`
2. After the page loads, an **analysis overlay** appears in the top‑right.
3. Click **White** or **Black** in the overlay to indicate which side you’re playing.
4. On **your turns**, the overlay will:
   - Show the **best move** (in chess notation).
   - Show an **evaluation** (e.g. `+0.8`, `M3`) with color indicating advantage.
5. Use the **Hide** button if you want to temporarily remove the overlay without disabling the extension.

The popup (clicking the extension icon) shows a simple status and a reminder about educational use only.

---

## General guidelines

- **Use it on your own games for learning**, review, and experimentation.
- Prefer **unrated / casual games**, analysis boards, or post‑game review.
- **Do not** use this or any other engine to gain an unfair advantage in rated or competitive games.
- Be aware that Chess.com’s fair‑play systems may detect and act on engine‑assisted play.

---

## High-level internals (for developers)

- **Content script (`content.js`)** injects the overlay, reads the board state and game info from the Chess.com page, and requests analysis when it’s your turn.
- **Background service worker (`background.js`)** manages an offscreen document that can host a Web Worker under Manifest V3.
- **Offscreen page (`offscreen.html` + `offscreen.js`)** runs **Stockfish** (via `stockfish.js` as a Web Worker) and returns best moves and scores to the content script.
- **chess.js** is used in the page to validate moves and handle FEN/board logic; Stockfish handles the actual evaluation.

If you’re only here to use the extension, you can ignore this section; it’s just a rough map for anyone reading the code.

---

## License & credits

- Core engine: **Stockfish**, used under its respective license.
- Board logic: **chess.js** by jhlywa.
- This project’s source code is provided as‑is; if you redistribute, make sure you comply with the licenses of Stockfish and chess.js.
