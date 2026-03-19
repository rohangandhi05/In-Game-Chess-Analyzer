// Chess Analyzer Background Service Worker (Manifest V3)

let analysisQueue = [];

async function setupOffscreenDocument() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
        return;
    }

    try {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['WORKERS'],
            justification: 'Run Stockfish chess engine in a Web Worker'
        });
    } catch (error) {
        console.error('Failed to create offscreen document:', error);
        throw error;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyze') {
        handleAnalyzeRequest(request, sendResponse);
        return true;
    }

    if (request.action === 'analysis-complete') {
        handleAnalysisComplete(request);
        return false;
    }
});

async function handleAnalyzeRequest(request, sendResponse) {
    try {
        await setupOffscreenDocument();

        const requestId = Date.now() + Math.random();
        analysisQueue.push({ id: requestId, callback: sendResponse });

        chrome.runtime.sendMessage({
            target: 'offscreen',
            action: 'analyze',
            id: requestId,
            fen: request.fen,
            depth: request.depth || 18,
            lines: request.lines || 3
        });

    } catch (error) {
        console.error('Analysis request failed:', error);
        sendResponse({ error: error.message });
    }
}

function handleAnalysisComplete(data) {
    const request = analysisQueue.find(r => r.id === data.id);
    if (request) {
        request.callback({ moves: data.moves });
        analysisQueue = analysisQueue.filter(r => r.id !== data.id);
    }
}

setupOffscreenDocument().catch(console.error);