// Chess Analyzer Background Service Worker (Manifest V3 Compatible)
console.log('♟️ Chess Analyzer Background Worker started');

let analysisQueue = [];
let offscreenReady = false;

// Create offscreen document to run Stockfish (Web Workers don't work in service workers)
async function setupOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
        console.log('✓ Offscreen document already exists');
        offscreenReady = true;
        return;
    }

    try {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['WORKERS'],
            justification: 'Run Stockfish chess engine in a Web Worker'
        });
        offscreenReady = true;
        console.log('✓ Offscreen document created for Stockfish');
    } catch (error) {
        console.error('❌ Failed to create offscreen document:', error);
        throw error;
    }
}

// Handle messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📨 Received:', request.action);

    if (request.action === 'analyze') {
        handleAnalyzeRequest(request, sendResponse);
        return true; // Async response
    }

    if (request.action === 'analysis-complete') {
        handleAnalysisComplete(request);
        return false;
    }

    if (request.action === 'ping') {
        sendResponse({ status: 'ok', offscreenReady });
        return false;
    }
});

async function handleAnalyzeRequest(request, sendResponse) {
    try {
        await setupOffscreenDocument();

        const requestId = Date.now() + Math.random();
        
        // Store callback
        analysisQueue.push({
            id: requestId,
            callback: sendResponse
        });


        // Forward to offscreen document
        chrome.runtime.sendMessage({
            target: 'offscreen',
            action: 'analyze',
            id: requestId,
            fen: request.fen,
            depth: request.depth || 18,
            lines: request.lines || 3
        });

    } catch (error) {
        console.error('❌ Analysis error:', error);
        sendResponse({ error: error.message });
    }
}

function handleAnalysisComplete(data) {
    const request = analysisQueue.find(r => r.id === data.id);
    if (request) {
        console.log('✅ Analysis complete:', data.moves.length, 'moves');
        request.callback({ moves: data.moves });
        analysisQueue = analysisQueue.filter(r => r.id !== data.id);
    }
}

// Initialize
setupOffscreenDocument().catch(console.error);