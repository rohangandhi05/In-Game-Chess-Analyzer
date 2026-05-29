# Chess Real-Time Analyzer

## What It Does
A Chrome browser extension that overlays real-time chess analysis on Chess.com games. It uses the Stockfish engine to evaluate positions and suggest the best move while you play or review games.

> **For educational and analysis use only.** Do not use during rated or competitive games — this violates Chess.com's Terms of Service.

## Tech Stack
- **Type:** Chrome Extension (Manifest V3)
- **Engine:** Stockfish (compiled to JS via stockfish.js)
- **Libraries:** chess.js (move generation/validation)
- **Components:** content script, background service worker, offscreen document, popup UI

## How It Works

### Architecture
1. **Content Script** (`content.js`) — injects an overlay onto Chess.com and reads board state from the DOM
2. **Offscreen Document** (`offscreen.js`) — runs Stockfish in a background context (required by MV3 to use Web Workers)
3. **Background Service Worker** (`background.js`) — coordinates messages between content script and Stockfish
4. **Popup** (`popup.html/js`) — UI to toggle analysis and display evaluation

### Flow
```
Chess.com DOM → content.js reads position → background.js relays FEN →
Stockfish (offscreen) evaluates → best move + eval sent back → overlay displayed
```

## Files
| File | Purpose |
|---|---|
| `content.js` | Board reading + overlay rendering |
| `stockfish.js` | Stockfish engine (WASM/JS) |
| `chess.js` | Chess move logic |
| `background.js` | Message routing |
| `offscreen.js` | Stockfish worker host |

## Tags
#chrome-extension #chess #stockfish #javascript #ai
