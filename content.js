console.log('🔥 Chess Analyzer Content Script loaded:', Date.now());

// Set to true to see verbose per-element extraction logs in the console
const DEBUG = false;

// Wait for Chess.js to be available
function waitForChess() {
    if (typeof Chess !== 'undefined') {
        console.log('✓ Chess constructor found');
        initializeAnalyzer();
        return;
    }

    console.log('⏳ Waiting for Chess constructor...');
    let attempts = 0;
    const maxAttempts = 50;

    const checkInterval = setInterval(() => {
        attempts++;

        if (typeof Chess !== 'undefined') {
            console.log('✓ Chess constructor available after', attempts * 100, 'ms');
            clearInterval(checkInterval);
            initializeAnalyzer();
        } else if (attempts >= maxAttempts) {
            console.error('❌ Chess constructor not found after 5 seconds');
            clearInterval(checkInterval);
            showError('chess.js failed to load. Please check the extension installation.');
        }
    }, 100);
}

function showError(message) {
    const errorOverlay = document.createElement('div');
    errorOverlay.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #dc3545;
        color: white;
        padding: 15px;
        border-radius: 8px;
        z-index: 10000;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    `;
    errorOverlay.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 10px;">❌ Chess Analyzer Error</div>
        <div style="font-size: 13px;">${message}</div>
        <button onclick="this.parentElement.remove()" style="margin-top: 10px; padding: 5px 10px; background: white; color: #dc3545; border: none; border-radius: 4px; cursor: pointer;">Close</button>
    `;
    document.body.appendChild(errorOverlay);
}

function initializeAnalyzer() {
    const analyzer = new ChessAnalyzer();
    if (typeof window !== 'undefined') window.__chessAnalyzer = analyzer;
}

class ChessAnalyzer {
    constructor() {
        this.overlay = null;
        this.currentFEN = '';
        this.gameChess = null;
        this.isAnalyzing = false;
        this.lastMoves = [];
        this.moveHistory = [];
        this.currentAnalysisId = 0;
        this.pendingAnalysis = null;
        this.lastCheckedTime = 0;
        this.myColor = null;
        this.colorDetected = false;
        this.waitingForFirstMove = true;

        console.log('♟️ Chess Analyzer initializing...');
        this.init();
    }

    init() {
        this.createOverlay();
        this.watchForPositionChanges();
        console.log('✓ Chess Analyzer ready - select your color using the buttons in the overlay');
    }

    createOverlay() {
        const existing = document.getElementById('chess-overlay');
        if (existing) existing.remove();

        this.overlay = document.createElement('div');
        this.overlay.id = 'chess-overlay';
        this.overlay.innerHTML = `
            <div class="overlay-header">
                <span class="overlay-title">🔍 Position Analysis</span>
                <div class="status-dot waiting"></div>
            </div>
            <div class="color-selector" style="padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; gap: 8px; align-items: center;">
                <span style="font-size: 11px; color: rgba(255,255,255,0.7);">I'm playing:</span>
                <button class="color-btn" data-color="w" style="padding: 6px 12px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; color: white; cursor: pointer; font-size: 11px;">⚪ White</button>
                <button class="color-btn" data-color="b" style="padding: 6px 12px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; color: white; cursor: pointer; font-size: 11px;">⚫ Black</button>
            </div>
            <div class="move-log-section">
                <div class="move-log-title">Recent Moves</div>
                <div class="move-log-items">
                    <div class="move-log-placeholder">Waiting for moves...</div>
                </div>
            </div>
            <div class="best-move-section">
                <div class="best-move-label">Best Move</div>
                <div class="best-move-value">--</div>
                <div class="best-move-eval neutral">Select your color above</div>
            </div>
            <div style="padding: 12px; font-size: 10px; font-family: monospace; color: rgba(255,255,255,0.5); border-top: 1px solid rgba(255,255,255,0.1); max-height: 100px; overflow-y: auto; word-break: break-all;" id="debug-fen">
                FEN: Starting position
            </div>
        `;
        document.body.appendChild(this.overlay);
        
        // Add click handlers for color buttons
        const colorButtons = this.overlay.querySelectorAll('.color-btn');
        colorButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                
                // Update button styles
                colorButtons.forEach(b => {
                    b.style.background = 'rgba(255,255,255,0.2)';
                    b.style.borderColor = 'rgba(255,255,255,0.3)';
                });
                btn.style.background = 'rgba(66, 135, 245, 0.6)';
                btn.style.borderColor = 'rgba(66, 135, 245, 1)';
                
                // Set color
                this.myColor = color;
                this.colorDetected = true;
                console.log(`🎯 Set your color to: ${color === 'w' ? 'WHITE' : 'BLACK'}`);
                this.updateBestMove('--', `You are ${color === 'w' ? 'White' : 'Black'}`, 'neutral');
                
                // Trigger immediate analysis
                const positionData = this.extractFEN();
                this.analyzePosition(positionData.fen, positionData.moveNumber);
            });
        });
        
        console.log('✓ Overlay created');
    }

    updateStatus(statusClass) {
        const statusDot = this.overlay.querySelector('.status-dot');
        if (statusDot) {
            statusDot.className = `status-dot ${statusClass}`;
        }
    }

    updateDebugFEN(fen) {
        const debugDiv = document.getElementById('debug-fen');
        if (debugDiv) {
            debugDiv.textContent = `FEN: ${fen}`;
        }
    }

    updateMoveLog(move, player, timestamp) {
        this.moveHistory.push({
            move: move,
            player: player,
            timestamp: timestamp || Date.now()
        });

        if (this.moveHistory.length > 2) {
            this.moveHistory = this.moveHistory.slice(-2);
        }

        const logContainer = this.overlay.querySelector('.move-log-items');
        if (!logContainer) return;

        if (this.moveHistory.length === 0) {
            logContainer.innerHTML = '<div class="move-log-placeholder">Waiting for moves...</div>';
            return;
        }

        logContainer.innerHTML = '';
        this.moveHistory.forEach((item, index) => {
            const logEntry = document.createElement('div');
            logEntry.className = 'move-log-entry';
            logEntry.innerHTML = `
                <span class="move-log-player">${item.player}:</span>
                <span class="move-log-move">${item.move}</span>
            `;
            logContainer.appendChild(logEntry);
        });
    }

    formatMoveReadable(moveDetails) {
        if (!moveDetails) return null;

        const pieceNames = {
            'p': 'Pawn',
            'n': 'Knight',
            'b': 'Bishop',
            'r': 'Rook',
            'q': 'Queen',
            'k': 'King'
        };

        const pieceName = pieceNames[moveDetails.piece] || 'Piece';
        const targetSquare = moveDetails.to;

        if (moveDetails.flags.includes('k')) {
            return 'Castle Kingside';
        }
        if (moveDetails.flags.includes('q')) {
            return 'Castle Queenside';
        }

        if (moveDetails.captured) {
            return `${pieceName} takes ${targetSquare}`;
        }

        return `${pieceName} to ${targetSquare}`;
    }

    // Enhanced move parser that handles ALL chess notation formats
    tryMove(chess, moveText) {
        // Try 1: Standard notation as-is
        try {
            const result = chess.move(moveText, { sloppy: true });
            if (result) return result;
        } catch (e) {
            // Continue to other strategies
        }

        // Get all legal moves for reference
        const legalMoves = chess.moves({ verbose: true });
        
        if (DEBUG) console.log(`   ⚠️ "${moveText}" failed standard parsing, trying alternatives...`);

        // Try 2: Handle captures - "xd4", "Rxd4", "exd4", "axb5" formats
        if (moveText.includes('x')) {
            const parts = moveText.split('x');
            const targetSquare = parts[1];
            const prefix = parts[0];
            
            let captures = legalMoves.filter(m => m.to === targetSquare && m.captured);
            
            if (prefix) {
                if (/^[NBRQK]/.test(prefix)) {
                    const piece = prefix[0].toLowerCase();
                    captures = captures.filter(m => m.piece === piece);
                }
                else if (/^[a-h]$/.test(prefix)) {
                    const fromFile = prefix[0];
                    captures = captures.filter(m => m.piece === 'p' && m.from[0] === fromFile);
                }
            }
            
            if (captures.length > 0) {
                if (DEBUG) console.log(`   ✓ Using capture: ${captures[0].san}`);
                return chess.move(captures[0].san);
            }
        }

        // Try 3: Handle castling
        if (moveText.toLowerCase() === 'o-o' || moveText === '0-0') {
            const castling = legalMoves.find(m => m.flags.includes('k'));
            if (castling) return chess.move(castling.san);
        }
        if (moveText.toLowerCase() === 'o-o-o' || moveText === '0-0-0') {
            const castling = legalMoves.find(m => m.flags.includes('q'));
            if (castling) return chess.move(castling.san);
        }

        // Try 4: Direct square match (for notation like "d4", "e8", "c8")
        if (/^[a-h][1-8]$/.test(moveText)) {
            const targetSquare = moveText;
            const moves = legalMoves.filter(m => m.to === targetSquare);
            
            if (moves.length > 0) {
                const priorityOrder = ['p', 'n', 'b', 'r', 'q', 'k'];
                for (const piece of priorityOrder) {
                    const move = moves.find(m => m.piece === piece);
                    if (move) {
                        if (DEBUG) console.log(`   ✓ Square-only: ${move.san}`);
                        return chess.move(move.san);
                    }
                }
            }
        }

        // Try 5: File-ambiguous moves like "fd2" (piece from f-file to d2)
        const fileDisambig = moveText.match(/^([a-h])([a-h][1-8])$/);
        if (fileDisambig) {
            const fromFile = fileDisambig[1];
            const targetSquare = fileDisambig[2];
            const moves = legalMoves.filter(m => m.from[0] === fromFile && m.to === targetSquare);
            if (moves.length > 0) {
                if (DEBUG) console.log(`   ✓ File-disambiguated: ${moves[0].san}`);
                return chess.move(moves[0].san);
            }
        }

        // Try 6: Last resort - find any move matching the target square
        const targetMatch = moveText.match(/[a-h][1-8]/);
        if (targetMatch) {
            const target = targetMatch[0];
            const moves = legalMoves.filter(m => m.to === target);
            if (moves.length > 0) {
                if (DEBUG) console.log(`   ⚠️ Best-guess move to ${target}: ${moves[0].san}`);
                return chess.move(moves[0].san);
            }
        }

        if (DEBUG) console.log(`   ❌ No valid interpretation found for "${moveText}"`);
        return null;
    }

    processMoveList(processedMoves) {
        let moveCount = 0;
        const movesApplied = [];
        let lastMoveText = null;
        let lastMoveDetails = null;
        let failedMoves = [];

        for (let i = 0; i < processedMoves.length; i++) {
            const move = processedMoves[i];
            
            const result = this.tryMove(this.gameChess, move);
            if (result) {
                moveCount++;
                movesApplied.push(result.san);
                lastMoveText = result.san;
                lastMoveDetails = {
                    san: result.san,
                    from: result.from,
                    to: result.to,
                    piece: result.piece,
                    captured: result.captured || null,
                    flags: result.flags
                };
                if (DEBUG) console.log(`  ${moveCount}. ✓ ${move} → ${result.san}`);
            } else {
                console.warn(`  ⚠️ Move failed: "${move}" — skipping`);
                failedMoves.push(move);
            }
        }

        const fen = this.gameChess.fen();
        this.lastMoves = movesApplied;
        
        if (failedMoves.length > 0) {
            console.warn(`⚠️ ${failedMoves.length} move(s) failed: ${failedMoves.join(', ')}`);
        }

        this.updateDebugFEN(fen);

        return {
            fen: fen,
            lastMove: lastMoveText,
            lastMoveDetails: lastMoveDetails,
            moveNumber: moveCount,
            turn: this.gameChess.turn(),
            movesApplied: movesApplied,
            failedMoves,
            totalRaw: processedMoves.length
        };
    }

    /**
     * Debug: run a full parse check and log a short summary. Call from console: __chessAnalyzer.runParseCheck()
     * @returns {{ ok: boolean, applied: number, total: number, failed: string[], fen: string, summary: string }}
     */
    runParseCheck() {
        console.log('🔍 Running parse check...');
        const result = this.extractFEN();
        const failed = result.failedMoves || [];
        const total = result.totalRaw ?? result.movesApplied?.length ?? 0;
        const ok = failed.length === 0 && result.moveNumber === total;
        const summary = failed.length
            ? `⚠️ ${result.moveNumber}/${total} moves applied. Failed: ${failed.join(', ')}`
            : `✓ ${result.moveNumber} moves applied. FEN: ${result.fen}`;
        const out = {
            ok,
            applied: result.moveNumber,
            total,
            failed,
            fen: result.fen,
            summary
        };
        console.log('Parse check result:', out);
        return out;
    }

    extractFEN() {
        try {
            if (DEBUG) console.log('🔍 STARTING MOVE EXTRACTION');
            
            this.gameChess = new Chess();

            // STRATEGY 1: Try to find PGN data in the page
            let pgnText = null;
            const pgnElements = document.querySelectorAll('[data-pgn], [class*="pgn"]');
            for (const el of pgnElements) {
                if (el.dataset.pgn) {
                    pgnText = el.dataset.pgn;
                    if (DEBUG) console.log('✓ Found PGN in data attribute');
                    break;
                }
                if (el.textContent.includes('1.') && el.textContent.includes('[Event')) {
                    pgnText = el.textContent;
                    if (DEBUG) console.log('✓ Found PGN in element text');
                    break;
                }
            }
            
            if (pgnText) {
                if (DEBUG) console.log('📜 Extracting moves from PGN');
                const moveMatches = pgnText.match(/\d+\.\s*([a-zA-Z0-9=+#\-x]+)(?:\s+([a-zA-Z0-9=+#\-x]+))?/g);
                if (moveMatches) {
                    const pgnMoves = [];
                    moveMatches.forEach(match => {
                        const moves = match.replace(/\d+\.\s*/, '').split(/\s+/);
                        pgnMoves.push(...moves.filter(m => m.length > 0));
                    });
                    if (DEBUG) console.log(`✓ Extracted ${pgnMoves.length} moves from PGN:`, pgnMoves.join(' '));
                    return this.processMoveList(pgnMoves);
                }
            }

            // STRATEGY 2: Extract moves from DOM, trying selectors in order of reliability.
            // IMPORTANT: we check processedMoves.length after each attempt, NOT moveElements.length.
            // A selector can return container elements that all fail validation — we must keep trying.
            const processedMoves = this._tryExtractMoves();

            if (DEBUG) console.log(`✓ Processed ${processedMoves.length} valid moves`);
            if (DEBUG) console.log('📝 Move sequence:', processedMoves.join(' '));

            return this.processMoveList(processedMoves);

        } catch (error) {
            console.error('❌ CRITICAL ERROR in extractFEN:', error);
            return {
                fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
                lastMove: null,
                lastMoveDetails: null,
                moveNumber: 0,
                turn: 'w',
                movesApplied: []
            };
        }
    }

    /**
     * Get only the direct text content of an element, ignoring child element text.
     * Chess.com embeds clocks and annotations in child spans inside move nodes.
     * Using full textContent picks those up; this function avoids that.
     */
    _directText(el) {
        let text = '';
        for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent;
            }
        }
        return text.trim() || el.textContent.trim(); // fall back to full text if no direct text
    }

    /**
     * Clean a raw text string extracted from the DOM into a pure SAN move.
     * Handles: move numbers, annotations, clocks in all common formats.
     */
    _cleanMoveText(text) {
        return text
            .replace(/[!?✓✗★]+/g, '')           // annotations and symbols
            .replace(/[+#]/g, '')                 // check/checkmate symbols
            .replace(/\d+:\d+(:\d+)?/g, '')       // clocks: 0:30, 1:23, 1:23:45
            .replace(/\d+\.\d+s/g, '')            // 0.5s
            .replace(/\d+m\s*\d+s/g, '')          // 1m 30s
            .replace(/^\d+\.{1,3}\s*/g, '')       // "1. " or "1... "
            .replace(/^\d+\s*/g, '')              // leading move numbers
            .trim();
    }

    /**
     * Try multiple DOM selectors to extract the move list.
     * Runs ALL selectors and returns the result with the most valid moves.
     * This is intentionally "best of all" rather than "first that works" —
     * a selector might return 1 valid move early in the game but miss later ones.
     */
    _tryExtractMoves() {
        const validMovePattern = /^([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](=[NBRQ])?|O-O(-O)?)$/;

        const parseElements = (elements, useDirectText = false) => {
            const moves = [];
            for (const el of elements) {
                // Use direct text nodes to avoid clock/annotation child elements
                const raw = useDirectText ? this._directText(el) : el.textContent.trim();
                if (!raw || raw === '...') continue;

                const clean = this._cleanMoveText(raw);

                // Length and pattern check on the CLEANED text
                if (!clean || clean.length === 0 || clean.length > 10) continue;
                if (/^\d+\.?$/.test(clean)) continue; // pure move number
                if (!validMovePattern.test(clean)) {
                    if (DEBUG) console.log(`  skip: "${raw}" → "${clean}"`);
                    continue;
                }
                if (DEBUG) console.log(`  ✓ move: "${clean}"`);
                moves.push(clean);
            }
            return moves;
        };

        const candidates = [];

        // --- Selector 1: [data-ply] with direct text (avoids clock children) ---
        const byPly = document.querySelectorAll('[data-ply]');
        if (byPly.length > 0) {
            candidates.push({
                name: '[data-ply] (direct text)',
                moves: parseElements(byPly, true)
            });
            // Also try with full textContent + cleaning as a backup
            candidates.push({
                name: '[data-ply] (full text)',
                moves: parseElements(byPly, false)
            });
        }

        // --- Selector 2: .vertical-move-list .node ---
        const verticalList = document.querySelector('.vertical-move-list');
        if (verticalList) {
            const nodeSpans = verticalList.querySelectorAll('.node');
            if (nodeSpans.length > 0) {
                candidates.push({
                    name: '.vertical-move-list .node (direct)',
                    moves: parseElements(nodeSpans, true)
                });
                candidates.push({
                    name: '.vertical-move-list .node (full)',
                    moves: parseElements(nodeSpans, false)
                });
            }

            // Also try [class*="move-"] within vertical list
            const moveEls = verticalList.querySelectorAll('[class*="move-"]');
            if (moveEls.length > 0) {
                candidates.push({
                    name: '.vertical-move-list [class*="move-"] (direct)',
                    moves: parseElements(moveEls, true)
                });
            }
        }

        // --- Selector 3: [data-node-id] (another chess.com attribute) ---
        const byNodeId = document.querySelectorAll('[data-node-id]');
        if (byNodeId.length > 0) {
            candidates.push({
                name: '[data-node-id] (direct)',
                moves: parseElements(byNodeId, true)
            });
        }

        // --- Selector 4: generic spans inside any move-list container ---
        const moveList = document.querySelector('[class*="move-list"], [class*="moveList"]');
        if (moveList) {
            const allSpans = moveList.querySelectorAll('span');
            if (allSpans.length > 0) {
                candidates.push({
                    name: 'move-list spans (direct)',
                    moves: parseElements(allSpans, true)
                });
            }
        }

        if (candidates.length === 0) {
            if (DEBUG) console.log('⚠️ No selectors matched any elements');
            return [];
        }

        // Pick the candidate with the MOST valid moves
        const best = candidates.reduce((a, b) => a.moves.length >= b.moves.length ? a : b);

        if (best.moves.length > 0) {
            console.log(`📋 ${best.moves.length} move(s) via "${best.name}": ${best.moves.join(' ')}`);
        } else {
            console.log('⚠️ All selectors returned 0 valid moves');
        }

        return best.moves;
    }

    isGameOver(chessInstance) {
        try {
            if (typeof chessInstance.isGameOver === 'function') {
                return chessInstance.isGameOver();
            }
            if (typeof chessInstance.game_over === 'function') {
                return chessInstance.game_over();
            }
            return chessInstance.in_checkmate() || 
                   chessInstance.in_stalemate() || 
                   chessInstance.in_threefold_repetition() || 
                   chessInstance.insufficient_material();
        } catch (e) {
            console.warn('Could not check game over status:', e);
            return false;
        }
    }

    async analyzePosition(fen, moveNumber) {
        this.currentAnalysisId++;
        const analysisId = this.currentAnalysisId;

        let testChess;
        try {
            testChess = new Chess(fen);
            const currentTurn = testChess.turn();

            if (this.colorDetected && this.myColor !== null) {
                if (currentTurn !== this.myColor) {
                    this.updateStatus('waiting');
                    this.updateBestMove('--', 'Opponent\'s Turn', 'neutral');
                    this.isAnalyzing = false;
                    return;
                }
            } else {
                this.updateBestMove('--', 'Select your color', 'neutral');
                this.isAnalyzing = false;
                return;
            }
            
            if (this.isGameOver(testChess)) {
                this.updateBestMove('--', 'Game Over', 'neutral');
                this.updateStatus('waiting');
                this.isAnalyzing = false;
                return;
            }

            console.log(`🎯 Analyzing move ${moveNumber} | FEN: ${fen}`);
        } catch (e) {
            console.error('❌ Invalid FEN:', fen, e);
            this.updateBestMove('--', 'Invalid Position', 'neutral');
            this.updateStatus('error');
            this.isAnalyzing = false;
            return;
        }

        this.isAnalyzing = true;
        this.updateStatus('analyzing');
        this.updateBestMove('--', 'Analyzing...', 'neutral');

        try {
            const response = await new Promise((resolve, reject) => {
                if (!chrome.runtime?.id) {
                    reject(new Error('Extension context lost - please reload the page'));
                    return;
                }
                
                chrome.runtime.sendMessage({
                    action: 'analyze',
                    fen: fen,
                    depth: 12,
                    lines: 3
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error('Extension connection lost - please reload the page'));
                    } else {
                        resolve(response);
                    }
                });
            });

            if (analysisId !== this.currentAnalysisId) {
                if (DEBUG) console.log(`⏭️ Analysis #${analysisId} outdated, discarding`);
                return;
            }

            if (response.error) {
                console.error('❌ Analysis error:', response.error);
                this.updateStatus('error');
                this.updateBestMove('--', 'Error', 'neutral');
            } else if (response.moves && response.moves.length > 0) {
                const bestMove = response.moves[0];
                console.log(`✅ Best move: ${bestMove.move} (${bestMove.score})`);
                this.displayAnalysis(response.moves);
                this.updateStatus('ready');
            } else {
                console.warn('⚠️ No moves returned');
                this.updateStatus('waiting');
                this.updateBestMove('--', 'No moves', 'neutral');
            }
        } catch (error) {
            if (analysisId === this.currentAnalysisId) {
                console.error(`❌ Analysis #${analysisId} failed:`, error);
                
                // Check if it's a context invalidation error
                if (error.message.includes('Extension') || error.message.includes('context')) {
                    this.updateStatus('error');
                    this.updateBestMove('⚠️', 'Reload page', 'neutral');
                    
                    // Show warning overlay
                    const warningDiv = document.createElement('div');
                    warningDiv.style.cssText = `
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        background: #dc3545;
                        color: white;
                        padding: 20px 30px;
                        border-radius: 12px;
                        z-index: 100000;
                        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
                        font-family: -apple-system, sans-serif;
                        text-align: center;
                    `;
                    warningDiv.innerHTML = `
                        <div style="font-size: 18px; font-weight: bold; margin-bottom: 10px;">⚠️ Extension Reloaded</div>
                        <div style="font-size: 14px; margin-bottom: 15px;">Please reload this page to reconnect</div>
                        <button onclick="location.reload()" style="padding: 8px 20px; background: white; color: #dc3545; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Reload Page</button>
                    `;
                    document.body.appendChild(warningDiv);
                } else {
                    this.updateStatus('error');
                    this.updateBestMove('--', 'Error', 'neutral');
                }
            }
        } finally {
            if (analysisId === this.currentAnalysisId) {
                this.isAnalyzing = false;
                this.pendingAnalysis = null;
            }
        }
        
        console.log(`🎯 ═══════════════════════════════════════════\n`);
    }

    displayAnalysis(moves) {
        if (moves.length === 0) {
            this.updateBestMove('--', 'No moves', 'neutral');
            return;
        }

        const bestMove = moves[0];
        const algebraicMove = this.uciToAlgebraic(bestMove.move);
        this.updateBestMove(algebraicMove, bestMove.score, bestMove.scoreClass);
    }

    updateBestMove(move, evaluation, evalClass) {
        const moveValue = this.overlay.querySelector('.best-move-value');
        const evalDiv = this.overlay.querySelector('.best-move-eval');

        if (moveValue) moveValue.textContent = move;
        if (evalDiv) {
            evalDiv.textContent = evaluation;
            evalDiv.className = `best-move-eval ${evalClass}`;
        }
    }

    uciToAlgebraic(uciMove) {
        try {
            const tempChess = new Chess(this.currentFEN);
            const from = uciMove.substring(0, 2);
            const to = uciMove.substring(2, 4);
            const promotion = uciMove.length > 4 ? uciMove[4] : undefined;

            const move = tempChess.move({
                from: from,
                to: to,
                promotion: promotion
            });

            if (move) {
                return this.formatMoveReadable({
                    san: move.san,
                    from: move.from,
                    to: move.to,
                    piece: move.piece,
                    captured: move.captured,
                    flags: move.flags
                }) || move.san;
            }
        } catch (e) {
            console.warn('Could not convert UCI to algebraic:', uciMove, e);
        }

        return uciMove;
    }

    /**
     * Read piece positions directly from chess.com's board elements.
     * Returns a FEN piece-placement string (e.g. "rnbqkbnr/pppppppp/...")
     * This is independent of the move list DOM and works as a reliable change detector.
     * Note: does NOT include castling rights, en passant, or move counts.
     */
    _fenFromBoard() {
        // Chess.com piece elements have classes like "piece wp square-52"
        // where 'w'/'b' = color, 'p'/'n'/'b'/'r'/'q'/'k' = type,
        // and square-XY where X=file(1=a..8=h), Y=rank(1..8)
        const pieceEls = document.querySelectorAll('[class*="piece "]');
        if (pieceEls.length < 2) return null;

        const board = {};
        for (const el of pieceEls) {
            const classes = el.className.split(/\s+/);
            let pieceCode = null, squareCode = null;
            for (const cls of classes) {
                if (/^[wb][pnbrqk]$/.test(cls)) pieceCode = cls;
                if (/^square-[1-8][1-8]$/.test(cls)) squareCode = cls;
            }
            if (!pieceCode || !squareCode) continue;
            const file = parseInt(squareCode[7]);
            const rank = parseInt(squareCode[8]);
            const sq = String.fromCharCode(96 + file) + rank;
            board[sq] = pieceCode[0] === 'w' ? pieceCode[1].toUpperCase() : pieceCode[1];
        }

        if (Object.keys(board).length < 2) return null;

        const ranks = [];
        for (let rank = 8; rank >= 1; rank--) {
            let s = '', empty = 0;
            for (let file = 1; file <= 8; file++) {
                const piece = board[String.fromCharCode(96 + file) + rank];
                if (piece) { if (empty) { s += empty; empty = 0; } s += piece; }
                else empty++;
            }
            if (empty) s += empty;
            ranks.push(s);
        }
        return ranks.join('/');
    }

    watchForPositionChanges() {
        let lastFEN = '';
        let lastMoveCount = 0;
        let previousMoveCount = 0;
        let lastBoardFEN = '';

        const checkPosition = () => {
            const now = Date.now();
            if (now - this.lastCheckedTime < 200) {
                return;
            }
            this.lastCheckedTime = now;

            // Quick check: did the board pieces actually change?
            // This is independent of move list parsing and catches changes
            // even when the DOM move list hasn't updated yet.
            const boardFEN = this._fenFromBoard();
            const boardChanged = boardFEN && boardFEN !== lastBoardFEN;

            const positionData = this.extractFEN();
            const currentFEN = positionData.fen;

            // Update board FEN tracker regardless
            if (boardFEN) lastBoardFEN = boardFEN;

            // Detect a change: either the full FEN changed, the move count changed,
            // OR the board pieces changed but move extraction returned the same FEN
            // (move list DOM might lag behind the board animation)
            const positionChanged = currentFEN !== lastFEN || positionData.moveNumber !== lastMoveCount;
            const boardOnlyChanged = boardChanged && !positionChanged;

            if (positionChanged) {
                let playerName = 'Unknown';
                if (positionData.moveNumber > lastMoveCount) {
                    const isWhiteToMove = positionData.turn === 'w';
                    playerName = isWhiteToMove ? 'Black' : 'White';

                    if (positionData.lastMoveDetails) {
                        const readableMove = this.formatMoveReadable(positionData.lastMoveDetails);
                        this.updateMoveLog(readableMove || positionData.lastMove, playerName, Date.now());
                    } else if (positionData.lastMove) {
                        this.updateMoveLog(positionData.lastMove, playerName, Date.now());
                    }

                    console.log(`🔄 ${playerName} played ${positionData.lastMove || '?'} (move ${positionData.moveNumber})`);
                }

                previousMoveCount = lastMoveCount;
                lastFEN = currentFEN;
                lastMoveCount = positionData.moveNumber;
                this.currentFEN = currentFEN;

                this.analyzePosition(currentFEN, positionData.moveNumber);
            } else if (boardOnlyChanged) {
                // The board pieces moved but the move list DOM didn't update yet.
                // This can happen when the move list lags behind the board animation.
                // Force a re-check on the next tick to pick up the move list update.
                console.log('⚡ Board changed but move list not updated yet — retrying shortly');
                this.lastCheckedTime = 0; // bypass the 200ms gate on next call
            }
        };

        setInterval(checkPosition, 500);

        let debounceTimer = null;
        const observer = new MutationObserver(() => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(checkPosition, 300);
        });

        setTimeout(() => {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
            console.log('✓ Position monitoring started');
        }, 1000);

        setTimeout(checkPosition, 1000);
    }
}

waitForChess();