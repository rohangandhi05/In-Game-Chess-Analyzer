// Offscreen Document — runs Stockfish in a Web Worker

let stockfish = null;
let currentAnalysis = { moves: [], depth: 0 };
let analysisCallback = null;

function initStockfish() {
    if (stockfish) return;

    try {
        const stockfishUrl = chrome.runtime.getURL('stockfish.js');
        stockfish = new Worker(stockfishUrl);

        stockfish.onerror = (error) => {
            console.error('Stockfish worker error:', error);
        };

        stockfish.onmessage = (event) => {
            const line = event.data;

            if (line === 'readyok') {
            }

            if (line.startsWith('info depth')) {
                const move = parseInfoLine(line);
                if (move) {
                    const idx = move.pvIndex - 1;
                    currentAnalysis.moves[idx] = move;
                    currentAnalysis.depth = move.depth;
                }
            }

            if (line.startsWith('bestmove') && analysisCallback) {
                const validMoves = currentAnalysis.moves.filter(Boolean);
                analysisCallback(validMoves);
                analysisCallback = null;
            }
        };

        stockfish.postMessage('uci');
        stockfish.postMessage('setoption name MultiPV value 3');
        stockfish.postMessage('setoption name Threads value 2');
        stockfish.postMessage('isready');

    } catch (error) {
        console.error('Failed to initialize Stockfish:', error);
    }
}

function parseInfoLine(line) {
    const depthMatch = line.match(/depth (\d+)/);
    const pvMatch = line.match(/multipv (\d+)/);
    const scoreMatch = line.match(/score (cp|mate) (-?\d+)/);
    const pvMovesMatch = line.match(/ pv (.+)/);

    if (!depthMatch || !pvMatch || !scoreMatch || !pvMovesMatch) return null;

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
        if (cp > 2)        scoreClass = 'winning';
        else if (cp > 0.5) scoreClass = 'positive';
        else if (cp > -0.5) scoreClass = 'neutral';
        else if (cp > -2)  scoreClass = 'negative';
        else               scoreClass = 'losing';
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
    if (!stockfish) initStockfish();

    currentAnalysis = { moves: [], depth: 0 };

    return new Promise((resolve) => {
        let hasReturned = false;
        const minDepth = 8;

        const timeout = setTimeout(() => {
            clearInterval(checkDepth);
            if (!hasReturned) {
                hasReturned = true;
                resolve(currentAnalysis.moves.filter(Boolean));
            }
        }, 20000);

        analysisCallback = (moves) => {
            if (!hasReturned) {
                clearTimeout(timeout);
                hasReturned = true;
                resolve(moves);
            }
        };

        const checkDepth = setInterval(() => {
            if (currentAnalysis.depth >= minDepth &&
                currentAnalysis.moves.length >= lines &&
                !hasReturned) {
                clearInterval(checkDepth);
                hasReturned = true;
                clearTimeout(timeout);
                resolve(currentAnalysis.moves.filter(Boolean));
                stockfish.postMessage('stop');
            }
        }, 100);

        stockfish.postMessage('stop');
        stockfish.postMessage(`setoption name MultiPV value ${lines}`);
        stockfish.postMessage(`position fen ${fen}`);
        stockfish.postMessage(`go depth ${depth}`);
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.target !== 'offscreen') return;

    if (request.action === 'analyze') {
        analyze(request.fen, request.depth, request.lines)
            .then(moves => {
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

initStockfish();