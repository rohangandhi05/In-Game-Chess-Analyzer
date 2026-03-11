// Offscreen Document - Runs Stockfish in a Web Worker
console.log('🔧 Offscreen document loaded');

let stockfish = null;
let currentAnalysis = { moves: [], depth: 0 };
let analysisCallback = null;
let isInitialized = false;

// Initialize Stockfish
function initStockfish() {
    if (stockfish) {
        console.log('✓ Stockfish already initialized');
        return;
    }

    console.log('🚀 Initializing Stockfish...');

    try {
        const stockfishUrl = chrome.runtime.getURL('stockfish.js');
        stockfish = new Worker(stockfishUrl);

        stockfish.onerror = (error) => {
            console.error('❌ Stockfish error:', error);
        };

        stockfish.onmessage = (event) => {
            const line = event.data;

            if (line === 'uciok') {
                console.log('✓ UCI initialized');
            }

            if (line === 'readyok') {
                console.log('✓ Stockfish ready');
                isInitialized = true;
            }

            if (line.startsWith('info depth')) {
                const move = parseInfoLine(line);
                if (move) {
                    const idx = move.pvIndex - 1;
                    currentAnalysis.moves[idx] = move;
                    currentAnalysis.depth = move.depth;
                }
            }

            // what is the credit use for this work???

            if (line.startsWith('bestmove') && analysisCallback) {
                const validMoves = currentAnalysis.moves.filter(Boolean);
                console.log('✅ Analysis done:', validMoves.length, 'moves');
                analysisCallback(validMoves);
                analysisCallback = null;
            }
        };

        // Initialize UCI
        stockfish.postMessage('uci');
        stockfish.postMessage('setoption name MultiPV value 3');
        stockfish.postMessage('setoption name Threads value 2');
        stockfish.postMessage('isready');

        console.log('✓ Stockfish initialization started');

    } catch (error) {
        console.error('❌ Failed to init Stockfish:', error);
    }
}

function parseInfoLine(line) {
    const depthMatch = line.match(/depth (\d+)/);
    const pvMatch = line.match(/multipv (\d+)/);
    const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
    const pvMovesMatch = line.match(/ pv (.+)/);

    if (!depthMatch || !pvMatch || !scoreMatch || !pvMovesMatch) {
        return null;
    }

    const depth = parseInt(depthMatch[1]);
    const pvIndex = parseInt(pvMatch[1]);
    const scoreType = scoreMatch[1];
    const scoreValue = parseInt(scoreMatch[2]);
    const moves = pvMovesMatch[1].split(' ');

    let score, scoreClass;

    if (scoreType === 'mate') {
        const mateIn = Math.abs(scoreValue);
        score = scoreValue > 0 ? `M${mateIn}` : `-M${mateIn}`;
        scoreClass = scoreValue > 0 ? 'winning' : 'losing';
    } else {
        const cp = scoreValue / 100;
        score = cp >= 0 ? `+${cp.toFixed(1)}` : cp.toFixed(1);

        if (cp > 2) scoreClass = 'winning';
        else if (cp > 0.5) scoreClass = 'positive';
        else if (cp > -0.5) scoreClass = 'neutral';
        else if (cp > -2) scoreClass = 'negative';
        else scoreClass = 'losing';
    }

    return {
        move: moves[0],
        score,
        scoreClass,
        depth,
        pvIndex,
        pv: moves.slice(0, 5).join(' ')
    };
}

function analyze(fen, depth, lines) {
    console.log(`🔍 Analyzing: depth=${depth}, lines=${lines}`);

    if (!stockfish) {
        initStockfish();
    }

    currentAnalysis = { moves: [], depth: 0 };

    return new Promise((resolve) => {
        let hasReturned = false;
        const minDepth = 8; // Return results as soon as we hit depth 8 for speed
        
        const timeout = setTimeout(() => {
            console.warn('⚠️ Analysis timeout');
            clearInterval(checkDepth); // prevent orphaned interval
            if (!hasReturned) {
                hasReturned = true;
                resolve(currentAnalysis.moves.filter(Boolean));
            }
        }, 20000); // Reduced timeout to 20 seconds

        analysisCallback = (moves) => {
            if (!hasReturned) {
                clearTimeout(timeout);
                hasReturned = true;
                resolve(moves);
            }
        };

        // Check if we should return early (at lower depth for speed)
        const checkDepth = setInterval(() => {
            if (currentAnalysis.depth >= minDepth && 
                currentAnalysis.moves.length >= lines && 
                !hasReturned) {
                console.log(`⚡ Quick result at depth ${currentAnalysis.depth}`);
                clearInterval(checkDepth);
                if (!hasReturned) {
                    hasReturned = true;
                    clearTimeout(timeout);
                    resolve(currentAnalysis.moves.filter(Boolean));
                    stockfish.postMessage('stop'); // Stop analysis since we have enough
                }
            }
        }, 100);

        stockfish.postMessage('stop');
        stockfish.postMessage(`setoption name MultiPV value ${lines}`);
        stockfish.postMessage(`position fen ${fen}`);
        stockfish.postMessage(`go depth ${depth}`);
    });
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.target !== 'offscreen') return;

    console.log('📨 Offscreen received:', request.action);

    if (request.action === 'analyze') {
        analyze(request.fen, request.depth, request.lines)
            .then(moves => {
                // Send result back to background script
                chrome.runtime.sendMessage({
                    action: 'analysis-complete',
                    id: request.id,
                    moves
                });
            })
            .catch(error => {
                console.error('Analysis error:', error);
                chrome.runtime.sendMessage({
                    action: 'analysis-complete',
                    id: request.id,
                    moves: [],
                    error: error.message
                });
            });
    }
});

// Initialize on load
initStockfish();