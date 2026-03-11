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
     * Try multiple DOM selectors to extract the move list.
     * Returns an ordered array of cleaned SAN move strings.
     * Tries each strategy in turn and stops as soon as one yields valid moves.
     * NOTE: We check the number of extracted *valid* moves, not raw element count —
     * container elements can match a selector but still fail validation.
     */
    _tryExtractMoves() {
        const validMovePattern = /^([NBRQK]?[a-h]?[1-8]?x?[a-h][1-8](=[NBRQ])?|O-O(-O)?)$/;

        const cleanMove = (text) => text
            .replace(/[!?]+$/g, '')
            .replace(/[+#]$/g, '')
            .replace(/\d+\.\d+s/g, '')
            .replace(/\d+m\s*\d+s/g, '')
            .replace(/^\d+\.+\s*/g, '')
            .replace(/^\d+\s*/g, '')
            .trim();

        const parseElements = (elements) => {
            const moves = [];
            for (const el of elements) {
                const text = el.textContent.trim();
                if (!text || /^\d+\.?$/.test(text) || text === '...' || text.length > 20) continue;
                const clean = cleanMove(text);
                if (!clean || !validMovePattern.test(clean)) {
                    if (DEBUG) console.log(`  skip: "${text}" → "${clean}"`);
                    continue;
                }
                if (DEBUG) console.log(`  ✓ move: "${clean}"`);
                moves.push(clean);
            }
            return moves;
        };

        // Attempt 1: [data-ply] — chess.com's individual half-move nodes (most reliable)
        const byPly = document.querySelectorAll('[data-ply]');
        if (byPly.length > 0) {
            const moves = parseElements(byPly);
            if (moves.length > 0) {
                if (DEBUG) console.log(`✓ Got ${moves.length} moves from [data-ply]`);
                return moves;
            }
        }

        // Attempt 2: .vertical-move-list leaf nodes (the .node spans inside the list)
        const verticalList = document.querySelector('.vertical-move-list');
        if (verticalList) {
            // Query for .node spans — these are the leaf text nodes, not row containers
            const nodeSpans = verticalList.querySelectorAll('.node');
            if (nodeSpans.length > 0) {
                const moves = parseElements(nodeSpans);
                if (moves.length > 0) {
                    if (DEBUG) console.log(`✓ Got ${moves.length} moves from .vertical-move-list .node`);
                    return moves;
                }
            }
            // If .node gave nothing, try any element inside the list
            const allChildren = verticalList.querySelectorAll('[class*="move-"]');
            if (allChildren.length > 0) {
                const moves = parseElements(allChildren);
                if (moves.length > 0) {
                    if (DEBUG) console.log(`✓ Got ${moves.length} moves from .vertical-move-list [class*="move-"]`);
                    return moves;
                }
            }
        }

        // Attempt 3: generic move-list container, direct children only
        const moveList = document.querySelector('[class*="move-list"], [class*="moveList"]');
        if (moveList) {
            const children = Array.from(moveList.children).filter(el =>
                el.textContent.length > 0 && el.textContent.length < 20
            );
            const moves = parseElements(children);
            if (moves.length > 0) {
                if (DEBUG) console.log(`✓ Got ${moves.length} moves from generic move-list`);
                return moves;
            }
        }

        if (DEBUG) console.log('⚠️ No moves found by any selector');
        return [];
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

    watchForPositionChanges() {
        let lastFEN = '';
        let lastMoveCount = 0;
        let previousMoveCount = 0;

        const checkPosition = () => {
            const now = Date.now();
            if (now - this.lastCheckedTime < 200) {
                return;
            }
            this.lastCheckedTime = now;

            const positionData = this.extractFEN();
            const currentFEN = positionData.fen;

            if (currentFEN !== lastFEN || positionData.moveNumber !== lastMoveCount) {
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