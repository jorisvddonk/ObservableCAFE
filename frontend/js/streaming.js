export class StreamingManager {
    constructor(chat) {
        this.chat = chat;
        this.eventSource = null;
        this.reconnectTimer = null;
    }

    connect(sessionId) {
        this.disconnect();
        const url = this.chat.apiUrl(`/api/session/${sessionId}/stream`);
        console.log(`[RXCAFE] Opening EventSource: ${url}`);
        const es = new EventSource(url);
        this.eventSource = es;

        es.onopen = () => {
            console.log(`[RXCAFE] SSE connected for session ${sessionId}`);
        };

        es.onmessage = (event) => {
            console.log(`[RXCAFE] SSE raw event:`, event.data.slice(0, 120));
            try {
                const data = JSON.parse(event.data);
                console.log(`[RXCAFE] SSE parsed type="${data.type}"`, data.type === 'chunk' ? `id=${data.chunk?.id}` : '');
                this.handleMessage(data);
            } catch (e) {
                console.error('[RXCAFE] SSE parse error:', e, event.data);
            }
        };

        es.onerror = (err) => {
            if (es !== this.eventSource) return;
            console.warn(`[RXCAFE] SSE error/disconnect for session ${sessionId}`, err);
            es.close();
            this.eventSource = null;
            this.scheduleReconnect(sessionId);
        };
    }

    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.eventSource) {
            console.log(`[RXCAFE] disconnectStream: closing EventSource`);
            this.eventSource.close();
            this.eventSource = null;
        }
    }

    scheduleReconnect(sessionId) {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.chat.sessionId === sessionId) {
                console.log(`[RXCAFE] Reconnecting SSE for ${sessionId}...`);
                this.connect(sessionId);
            }
        }, 3000);
    }

    handleMessage(data) {
        const chat = this.chat;
        
        if (data.type === 'chunk') {
            const chunk = data.chunk;
            const role = chunk.annotations?.['chat.role'];

            // Always dispatch chunk event first so UI components can react
            // regardless of how the chat UI handles it
            const chunkEvent = new CustomEvent('rxcafe:chunk', {
                detail: { chunk, sessionId: chat.sessionId, uiMode: chat.uiMode },
                bubbles: true,
                composed: true
            });
            document.dispatchEvent(chunkEvent);

            if (chunk.contentType === 'null' && chunk.annotations?.['config.type'] === 'runtime') {
                chat.backend = chunk.annotations['config.backend'] || chat.backend;
                chat.model = chunk.annotations['config.model'] || chat.model;
                console.log(`[RXCAFE] Runtime config updated: backend=${chat.backend}, model=${chat.model}`);
                chat.updateHeaderInfo();
            }

            if (chunk.annotations?.['session.name']) {
                const newName = chunk.annotations['session.name'];
                console.log(`[RXCAFE] Session renamed to: ${newName}`);
                const session = chat.knownSessions.find(s => s.id === chat.sessionId);
                if (session) {
                    session.displayName = newName;
                    chat.renderSidebarSessionList();
                    chat.updateHeaderInfo();
                }
            }

            if (chat.chunkElements.has(chunk.id)) {
                const el = chat.chunkElements.get(chunk.id);
                if (el) {
                    console.log(`[RXCAFE] SSE: Updating existing chunk UI:`, chunk.id);
                    if (chunk.annotations['com.rxcafe.example.sentiment']) {
                        chat.updateSentiment(el, chunk.annotations['com.rxcafe.example.sentiment']);
                    }
                    if (chunk.annotations?.['chess.fen'] && el.fen !== undefined) {
                        el.fen = chunk.annotations['chess.fen'];
                        el.currentPlayer = (chunk.annotations['chess.turn'] || 'w') === 'w' ? 'white' : 'black';
                        el.isCheck = chunk.annotations['chess.isCheck'] || false;
                        el.gameOver = chunk.annotations['chess.gameOver'] || false;
                        el.winner = chunk.annotations['chess.winner'] || null;
                        el.moveHistory = chunk.annotations['chess.moveHistory'] || [];
                        el.invalidMove = chunk.annotations['chess.invalid'] ? (chunk.annotations['chess.invalidMove'] || 'Invalid move') : '';
                    } else if (chunk.contentType === 'text' && !el.classList?.contains('streaming')) {
                        chat.updateMessageContent(el, chunk.content, chunk.annotations);
                        if (chunk.annotations['com.rxcafe.example.sentiment']) {
                            chat.updateSentiment(el, chunk.annotations['com.rxcafe.example.sentiment']);
                        }
                    }
                }
                chat.addRawChunk(chunk);
                return;
            }

            if (role === 'user' && chat._pendingUserMsg) {
                console.log(`[RXCAFE] SSE user chunk claimed by pending element elId=${chat._pendingUserMsg.dataset.elId}, registering id:`, chunk.id);
                chat._pendingUserMsg.dataset.chunkId = chunk.id;
                chat.chunkElements.set(chunk.id, chat._pendingUserMsg);
                if (chunk.annotations['com.rxcafe.example.sentiment']) {
                    chat.updateSentiment(chat._pendingUserMsg, chunk.annotations['com.rxcafe.example.sentiment']);
                }
                chat._pendingUserMsg = null;
                chat.addRawChunk(chunk);
                chat.updateInspector();
                return;
            }

            const isFromConnectedAgent = chunk.producer?.startsWith('com.observablecafe.connected-agent');
            const isChess = chunk.annotations?.['chess.fen'];
            const isAssistantText = role === 'assistant' && chunk.contentType === 'text' && !isFromConnectedAgent && !isChess;

            console.log('[RXCAFE] handleChunk: role=', role, 'contentType=', chunk.contentType, 'currentMessageEl=', chat.currentMessageEl?.dataset?.elId, '_streamingEl=', chat._streamingEl?.dataset?.elId);

            if (isAssistantText) {
                let assistantEl = chat.currentMessageEl;
                
                // Look for an existing streaming element that might have the same content
                if (!assistantEl || assistantEl.tagName !== 'RX-MESSAGE-TEXT' || assistantEl.role !== 'assistant') {
                    const existingStreaming = chat.messagesEl?.querySelector?.('.streaming[role="assistant"]');
                    if (existingStreaming) {
                        console.log('[RXCAFE] handleChunk: reusing existing streaming element:', existingStreaming.dataset.elId);
                        assistantEl = existingStreaming;
                        chat.currentMessageEl = assistantEl;
                    }
                }
                
                // If still no element, look for the last assistant message element
                // This handles the case where HTTP streaming finished and removed the streaming class
                // before the SSE chunk arrived with the final content
                if (!assistantEl || assistantEl.tagName !== 'RX-MESSAGE-TEXT' || assistantEl.role !== 'assistant') {
                    const allMessages = chat.messagesEl?.querySelectorAll?.('rx-message-text[role="assistant"]');
                    if (allMessages && allMessages.length > 0) {
                        const lastAssistantEl = allMessages[allMessages.length - 1];
                        // Check if this element was just created (has no chunkId yet or was streaming)
                        if (!lastAssistantEl.dataset.chunkId || lastAssistantEl.classList.contains('streaming')) {
                            console.log('[RXCAFE] handleChunk: reusing last assistant element:', lastAssistantEl.dataset.elId);
                            assistantEl = lastAssistantEl;
                            chat.currentMessageEl = assistantEl;
                        }
                    }
                }
                
                console.log('[RXCAFE] isAssistantText check: assistantEl=', assistantEl?.dataset?.elId, 'role=', assistantEl?.role, '_streamingEl=', chat._streamingEl?.dataset?.elId);
                
                if (!assistantEl || assistantEl.tagName !== 'RX-MESSAGE-TEXT' || assistantEl.role !== 'assistant') {
                    console.log('[RXCAFE] Creating NEW assistant element, _streamingEl was:', chat._streamingEl?.dataset?.elId);
                    if (chat._streamingEl && chat._streamingEl.parentElement) {
                        console.log('[RXCAFE] Removing old _streamingEl:', chat._streamingEl.dataset.elId);
                        chat._streamingEl.remove();
                    }
                    assistantEl = chat.createMessageElement('assistant', '');
                    assistantEl.classList.add('streaming');
                    chat.messagesEl.appendChild(assistantEl);
                    chat._streamingEl = null;
                    chat.scrollToBottom();
                } else {
                    console.log('[RXCAFE] REUSING assistant element:', assistantEl.dataset.elId);
                    if (chat._streamingEl && chat._streamingEl !== assistantEl) {
                        console.log('[RXCAFE] Removing orphan _streamingEl:', chat._streamingEl.dataset.elId);
                        chat._streamingEl.remove();
                    }
                    chat._streamingEl = null;
                }
                
                // Remove streaming class to mark this as a finalized chunk
                assistantEl.classList.remove('streaming');
                
                chat.currentMessageEl = assistantEl;
                console.log(`[RXCAFE] SSE assistant chunk rendered in element elId=${assistantEl.dataset.elId}, registering id:`, chunk.id);
                assistantEl.dataset.chunkId = chunk.id;
                chat.chunkElements.set(chunk.id, assistantEl);
                assistantEl.dataset.annotations = JSON.stringify(chunk.annotations || {});
                chat.updateMessageContent(assistantEl, chunk.content, chunk.annotations);
                chat.messagesManager.addQuickResponses(assistantEl, chunk);
                chat.addRawChunk(chunk);
                chat.updateInspector();
                return;
            }

            console.log(`[RXCAFE] New chunk from stream, rendering:`, chunk.id, chunk.contentType, chunk.content?.mimeType);
            chat.addRawChunk(chunk);
            chat.renderChunk(chunk);
            chat.updateInspector();
        }
    }

    handleStreamData(data) {
        const chat = this.chat;
        switch (data.type) {
            case 'user':
                if (data.chunk) chat.addRawChunk(data.chunk);
                break;
            case 'chunk':
                if (data.chunk) chat.addRawChunk(data.chunk);
                break;
            case 'token':
                if (data.token) {
                    chat.currentContent += data.token;
                    
                    if (!chat.currentMessageEl || chat.currentMessageEl.tagName !== 'RX-MESSAGE-TEXT') {
                        console.log('[RXCAFE] TOKEN: Creating streaming element');
                        chat.currentMessageEl = chat.createMessageElement('assistant', '');
                        chat.currentMessageEl.classList.add('streaming');
                        chat.messagesEl.appendChild(chat.currentMessageEl);
                        chat._streamingEl = chat.currentMessageEl;
                        chat.scrollToBottom();
                    } else {
                        console.log('[RXCAFE] TOKEN: Reusing element:', chat.currentMessageEl.dataset.elId, 'role=', chat.currentMessageEl.role);
                    }
                    
                    const annotations = chat.currentMessageEl?.dataset.annotations 
                        ? JSON.parse(chat.currentMessageEl.dataset.annotations) 
                        : {};
                    chat.updateMessageContent(chat.currentMessageEl, chat.currentContent, annotations);
                }
                break;
            case 'error':
                if (chat.currentMessageEl) {
                    chat.showErrorInMessage(chat.currentMessageEl, data.error);
                }
                break;
            case 'finish':
            case 'done':
                break;
        }
    }
}
