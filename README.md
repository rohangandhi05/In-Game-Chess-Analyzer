# Chess Real-Time Analyzer

A **Chrome extension** (Manifest V3) that adds real-time position analysis to [Chess.com](https://www.chess.com) games. It infers the current board state, runs it through the Stockfish engine, and shows the best move (and evaluation) in a compact overlay—only when it’s your turn.

> **Disclaimer:** This is for **educational and unrated use only**. Using engine assistance during rated games violates Chess.com’s Terms of Service.

---

## Features

- **Live analysis** on Chess.com game and live pages
- **Best move** and evaluation (centipawns or mate) in an overlay
- **Color selection** (White / Black) so analysis runs only on your turn
- **Recent moves** display for context
- **Hide/Show** overlay (keyboard shortcut supported)
- **No server** — Stockfish runs locally in the browser via an offscreen document and Web Worker

---

## Installation

1. **Clone or download** this repo.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `chess-analyzer` folder.
5. Ensure the extension is enabled.

**Required:** The extension needs access to `https://www.chess.com/*` (configured in the manifest).

---

## Publishing to the Chrome Web Store

To distribute the extension so users can install it from the store (instead of loading unpacked), follow these steps.

### 1. Register a developer account

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Sign in with the Google account you want to use as the **developer account** (this cannot be changed later).
3. Accept the **Developer Agreement** and pay the **one-time registration fee** ($5 USD).
4. Complete any additional account setup if prompted.

After that, you can publish extensions under this account (subject to the 20-extension limit per account).

### 2. Prepare the extension package

- **Test locally:** Load the extension via **Load unpacked** on `chrome://extensions/` and confirm everything works on Chess.com.
- **Manifest:** Ensure `manifest.json` has a correct **name**, **description** (max 132 characters), **version**, and **icons** (16, 48, 128). Your current description is fine.
- **Version:** For the first upload, a version like `1.0.0` is fine. Each later update must use a **higher** version number (e.g. `1.0.1`, `1.1.0`).

**Create the ZIP file:**

- Include **only** the files needed to run the extension. The **manifest must be at the root** of the ZIP (not inside a subfolder).
- **Include:** `manifest.json`, `background.js`, `content.js`, `chess.js`, `stockfish.js`, `overlay.css`, `popup.html`, `popup.js`, `offscreen.html`, `offscreen.js`, and the `icons/` folder (with icon16.png, icon48.png, icon128.png).
- **Exclude:** `.git/`, `README.md`, `.cursor/`, and any other dev-only files (they are not needed at runtime and keep the package smaller).

From the project root you can build the zip with:

```bash
zip -r chess-analyzer.zip . -x ".git/*" -x "README.md" -x ".cursor/*" -x "*.zip"
```

Or create a folder (e.g. `dist`), copy only the listed files into it, then zip that folder’s **contents** (so `manifest.json` is at the root of the zip).

### 3. Upload the item

1. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), click **New item** (or **Add new item**).
2. Click **Choose file** and select your ZIP file.
3. Upload. If the manifest and ZIP are valid, you’ll be taken to the item’s dashboard page.

### 4. Fill out the listing and policy tabs

Use the left-hand menu to complete each section:

| Tab | What to provide |
|-----|------------------|
| **Store listing** | Short description, detailed description, category (e.g. Productivity or Fun), screenshots (often 1280x800 or 640x400), promo tile (440x280) if needed. Optional: video, small tile. |
| **Privacy** | Declare the extension’s **single purpose** (e.g. “Analyze chess positions on Chess.com”) and how you handle user data. Your extension does not send data to a server; say that it runs locally and does not collect personal data. |
| **Distribution** | Choose **Public** (visible in the store) or **Unlisted** (only install via direct link). Set regions if you want to limit countries. |
| **Test instructions** (if needed) | If reviewers need to test on Chess.com, you can add a note like: “Open any Chess.com live or play game, select White or Black in the overlay, and make a move to see analysis.” |

Read the [Store Listing](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) and [Privacy](https://developer.chrome.com/docs/webstore/privacy) docs for exact requirements and examples.

### 5. Submit for review

1. When all required sections are done, click **Submit for review**.
2. In the dialog you can choose whether the item **publishes automatically** after approval or stays **staged** until you click Publish.
3. Google will review the extension (often within a few days). You’ll get email about approval, rejection, or requested changes.

### 6. After approval

- If you chose automatic publish, the extension will go live once approved.
- If you chose deferred publish, open the item in the dashboard and use **Publish** when you’re ready.
- Share the **Chrome Web Store listing URL** with users so they can install with one click.

**Updating later:** Bump the **version** in `manifest.json`, create a new ZIP with the same rules, then in the dashboard use **Upload new package** for that item and submit again for review.

---

## Usage

1. Open a Chess.com **game** or **live** page, e.g.:
   - `https://www.chess.com/game/live/...`
   - `https://www.chess.com/play/...`
2. Wait for the **analysis overlay** to appear (top-right).
3. Click **White** or **Black** to set your color.
4. When it’s your turn, the extension will analyze the position and show the **best move** and evaluation.
5. Use **Hide** (or the keyboard shortcut) to collapse the overlay; reopen via the extension icon or shortcut if supported.

The **popup** (extension icon) shows whether you’re on a Chess.com page and reminds you that engine use in rated games is against the rules.

---

## Architecture

The extension has three main parts: the **content script** (in the page), the **background service worker**, and an **offscreen document** that hosts Stockfish.

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Chess.com page                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  content.js                                                        │  │
│  │  • Injects overlay UI                                              │  │
│  │  • Extracts current position (board read / PGN / move list)        │  │
│  │  • Detects turn, sends FEN to background for analysis             │  │
│  │  • Displays best move & evaluation                                 │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    chrome.runtime.sendMessage({ action: 'analyze', fen, depth, lines })
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  background.js (Service Worker)                                          │
│  • Creates/ reuses offscreen document                                    │
│  • Queues analyze requests, forwards to offscreen                         │
│  • Relays analysis-complete back to content script                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    chrome.runtime.sendMessage({ target: 'offscreen', action: 'analyze', ... })
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  offscreen.html + offscreen.js                                            │
│  • Creates Web Worker from stockfish.js                                  │  │
│  • UCI protocol: position fen, go depth N, parse info/bestmove           │  │
│  • Returns best line(s) with score and scoreClass                        │  │
└─────────────────────────────────────────────────────────────────────────┘
```

- **chess.js** (in the content script context) is used only for **board state and move validation**: building FEN from moves, replaying PGN/move lists, converting UCI to SAN, and checking game-over. It does **not** perform engine analysis.
- **Stockfish** (in the offscreen worker) does the actual **search** and returns the best move(s) and evaluation.

---

## How the current position is obtained

The content script tries several strategies so the extension keeps working even when Chess.com changes move-list markup or when only partial data is available.

### 1. Primary: read the board and ply count

- **Board:** The script inspects the **piece elements** on the board (e.g. by class or structure). Chess.com keeps piece placement in the DOM in sync with the game, so this is the most reliable source.
- **Ply count:** The script infers how many half-moves have been played (e.g. from a move counter or the last move index).
- From **piece placement** and **side to move** (derived from ply count), it builds:
  - **Placement** (e.g. `rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR`)
  - **Turn** (`w` or `b`)
  - **Castling** (from the current board state)
  - A **FEN** string is assembled and validated with `chess.js`. If valid, this FEN is used and **no move-text parsing** is needed.

This avoids fragile parsing of move notation from the move list.

### 2. Fallback: PGN in the page

- The script looks for PGN in the DOM (e.g. `[data-pgn]` or elements whose text looks like PGN with `[Event` and `1.`).
- It extracts move tokens with a regex and **replays them** with `chess.js` to get the current FEN.
- This path uses **full standard algebraic notation** (SAN), so it’s reliable when available.

### 3. Last resort: move list text extraction

- The script tries several **selectors** for move elements (e.g. `[data-ply]`, `.vertical-move-list .node`, `[data-node-id]`, move-list spans).
- For each selector it:
  - Reads **full `textContent`** from each element.
  - Cleans the text (removes move numbers, clocks, annotations, unicode pieces) via `_cleanMoveText`.
  - Keeps only strings that match a **valid move pattern** (SAN-like).
- It picks the **selector that yielded the most valid moves** and replays that list with `tryMove()` (see below) to get the FEN.

So: **board read first**, then **PGN**, then **scraped move list** with multiple selectors and “best of” choice.

---

## Move parsing (`tryMove`)

When the extension replays a move list (PGN or scraped text), it uses a single function `tryMove(chess, moveText)` that accepts many notation styles:

| Strategy | Examples |
|----------|----------|
| Standard SAN | `e4`, `Nf3`, `Bxf7+` |
| Captures | `exd5`, `Rxd4`, `Nxd2` (with optional piece/file prefix) |
| Castling | `O-O`, `O-O-O`, `0-0`, `0-0-0` |
| Square-only | `d4`, `e5` (disambiguated by piece priority: pawn first, then N, B, R, Q, K) |
| File disambiguation | `fd2` (piece on f-file to d2) |
| Best-guess | Any string containing a square `[a-h][1-8]`; picks a legal move to that square if unique or first match |

If a move fails (e.g. illegal or unparseable), it’s recorded in the **failed moves** list and the replayer continues with the rest. The final **FEN** is still used as long as the primary or PGN path didn’t already provide one.

---

## Analysis pipeline

1. **Content script** (e.g. on a timer and on DOM changes) calls `extractFEN()`.
2. **extractFEN()** returns the current **FEN** (and optional last-move info) using the strategies above.
3. If **color is set** and it’s **your turn**, the content script sends:
   - `action: 'analyze'`, `fen`, `depth` (e.g. 12), `lines` (e.g. 1).
4. **Background** ensures the offscreen document exists, assigns a request id, and forwards the message to **offscreen**.
5. **Offscreen** runs Stockfish in a worker:
   - `position fen <fen>`
   - `go depth <depth>`
   - Parses `info depth ...` (and optionally MultiPV) and `bestmove ...`.
6. Results (move in UCI, score, scoreClass) are sent back as `analysis-complete` to the background, which forwards to the content script’s callback.
7. **Content script** converts the best move from UCI to SAN (using `chess.js` and the current FEN), then updates the overlay (best move, evaluation, status).

Depth and number of lines can be tuned in the content script and background (e.g. depth 12, 1 line for speed).

---

## File structure

| File | Role |
|------|------|
| **manifest.json** | MV3 manifest: permissions (activeTab, storage, offscreen), host_permissions (chess.com), content_scripts, background service_worker, web_accessible_resources (stockfish, offscreen). |
| **content.js** | Content script: overlay, position extraction (board / PGN / move list), `tryMove`, analysis request/response, UCI→SAN, `runParseCheck`. |
| **overlay.css** | Styles for the overlay panel (layout, status dot, best move, move log, hide button). |
| **background.js** | Service worker: create/reuse offscreen document, handle `analyze` / `analysis-complete` / `ping`, queue and route messages. |
| **offscreen.html** | Minimal HTML that loads offscreen.js (required for the offscreen document). |
| **offscreen.js** | Loads Stockfish worker, UCI init, `position`/`go`, parses `info`/`bestmove`, returns moves with score and scoreClass. |
| **stockfish.js** | Stockfish Web Worker (WASM); speaks UCI over `postMessage`. |
| **chess.js** | [chess.js](https://github.com/jhlywa/chess.js) (minified): board state, FEN, move validation, SAN, game-over. Used only in the content script. |
| **popup.html** / **popup.js** | Extension popup: shows whether you’re on Chess.com and the educational-use warning. |
| **icons/** | Extension icons (16, 48, 128). |

---

## Debugging and verifying move parsing

- **Console:** Open DevTools (F12 or Cmd+Option+J) on a Chess.com game tab. The content script logs extraction strategy, number of moves, replay results, and final FEN/board.
- **Parse check:** The analyzer instance is exposed as `window.__chessAnalyzer`. In the console, run:
  ```js
  __chessAnalyzer.runParseCheck()
  ```
  This re-runs `extractFEN()` and prints a short summary: `ok` (all moves applied), `applied`, `total`, `failed` (list of move strings that didn’t parse), and `fen`. Use this to confirm that the current position is parsed correctly.
- **Verbose extraction logs:** In `content.js`, set `const DEBUG = true` at the top to get more per-element and per-move logs during board/PGN/move-list extraction.

---

## Tech stack

- **Chrome Extension Manifest V3** (service worker, offscreen API).
- **chess.js** (jhlywa/chess.js) for board logic and move handling in the page.
- **Stockfish** (Web Worker build) for engine analysis via UCI.
- **Vanilla JS**; no framework. Overlay is plain DOM + CSS.

---

## Limitations

- **Chess.com only:** Host permissions and selectors are tailored to Chess.com. Other sites would need different selectors or a different extraction strategy.
- **DOM-dependent:** If Chess.com changes the structure of the board or move list, the primary or fallback strategies may need updates (e.g. `_readBoard`, `_getPlyCount`, or the selectors in `_tryExtractMoves`).
- **Engine use policy:** Do not use this (or any engine) in rated games; the popup and this README are not a substitute for following Chess.com’s Terms of Service.

---

## License

Use and modify as you like. Stockfish and chess.js have their own licenses; ensure compliance if you redistribute.
