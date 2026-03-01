import { scrollToBottom } from './dom-utils.js';

export class MessagesManager {
    constructor(chat) {
        this.chat = chat;
    }

    renderChunk(chunk) {
        const role = chunk.annotations?.['chat.role'];
        const isWeb = chunk.producer === 'com.rxcafe.web-fetch' || chunk.annotations?.['web.source-url'];
        const isSystem = role === 'system';
        const isTelegram = chunk.annotations?.['client.type'] === 'telegram';
        const isVisualization = chunk.annotations?.['visualizer.type'] === 'rx-marbles';
        
        if (!role && chunk.annotations?.['session.name']) {
            this.chat.chunkElements.set(chunk.id, null);
            return;
        }
        
        if (isVisualization) {
            this.addVisualizationMessage(chunk);
            return;
        }

        console.log(`[RXCAFE] renderChunk id=${chunk.id} role=${role} content="${String(chunk.content ?? '').slice(0,60)}"`);
        
        if (chunk.contentType === 'binary') {
            const mimeType = chunk.content?.mimeType || '';
            console.log(`[RXCAFE] Rendering binary chunk, mimeType: ${mimeType}, role: ${role}`);
            if (mimeType.startsWith('image/')) {
                console.log('[RXCAFE] Calling addImageMessage');
                this.addImageMessage(role || 'assistant', chunk);
            } else if (mimeType.startsWith('audio/')) {
                console.log('[RXCAFE] Calling addAudioMessage');
                this.addAudioMessage(role || 'assistant', chunk);
            } else {
                console.warn('[RXCAFE] Unsupported binary chunk', chunk);
            }
            return;
        }

        if (isWeb) {
            this.addWebChunk(chunk);
        } else if (isSystem) {
            this.addSystemChunk(chunk, chunk.content);
        } else if (chunk.contentType === 'text') {
            if (role === 'user') {
                const el = this.chat.addMessage('user', chunk.content, chunk.id, chunk.annotations);
                
                if (isTelegram) {
                    this.addTelegramLabel(el);
                }

                if (chunk.annotations && chunk.annotations['com.rxcafe.example.sentiment']) {
                    this.chat.updateSentiment(el, chunk.annotations['com.rxcafe.example.sentiment']);
                }
            } else if (role === 'assistant') {
                if (chunk.annotations?.['tool.name']) {
                    this.addToolCallMessage(chunk);
                } else {
                    const el = this.chat.addMessage('assistant', chunk.content, chunk.id, chunk.annotations);
                    if (chunk.annotations?.['com.rxcafe.tool-detection']?.hasToolCalls) {
                        this.addToolCallIndicator(el, chunk.annotations['com.rxcafe.tool-detection'].toolCalls);
                    }
                }
            }
        }
    }

    addVisualizationMessage(chunk) {
        const messageEl = document.createElement('div');
        this.chat._elCounter++;
        messageEl.dataset.elId = this.chat._elCounter;
        messageEl.dataset.chunkId = chunk.id;
        messageEl.className = 'message assistant visualization';
        
        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        
        const headerEl = document.createElement('div');
        headerEl.className = 'visualization-header';
        
        const iconSpan = document.createElement('span');
        iconSpan.className = 'visualization-icon';
        iconSpan.textContent = '📊';
        
        const titleSpan = document.createElement('span');
        titleSpan.className = 'visualization-title';
        titleSpan.textContent = `RxMarbles Visualization: ${chunk.annotations['visualizer.agent']}`;
        
        headerEl.appendChild(iconSpan);
        headerEl.appendChild(titleSpan);
        contentEl.appendChild(headerEl);
        
        const vizContainer = document.createElement('div');
        vizContainer.className = 'visualization-container';
        vizContainer.style.cssText = `
            width: 100%;
            height: 400px;
            margin-top: 0.5rem;
            border-radius: 0.5rem;
            overflow: hidden;
        `;
        
        const visualizer = document.createElement('rx-marbles-visualizer');
        visualizer.pipeline = chunk.annotations['visualizer.pipeline'];
        visualizer.chunks = this.chat.rawChunks;
        vizContainer.appendChild(visualizer);
        
        contentEl.appendChild(vizContainer);
        messageEl.appendChild(contentEl);
        
        messageEl.addEventListener('contextmenu', (e) => this.chat.showContextMenu(e, chunk.id));
        
        this.chat.messagesEl.appendChild(messageEl);
        this.chat.chunkElements.set(chunk.id, messageEl);
        scrollToBottom(this.chat.messagesEl);
    }

    addTelegramLabel(messageEl) {
        if (!messageEl) return;
        let labelEl = messageEl.querySelector('.telegram-label');
        if (!labelEl) {
            labelEl = document.createElement('div');
            labelEl.className = 'message-meta telegram-label';
            labelEl.textContent = 'via Telegram';
            labelEl.style.fontSize = '0.65rem';
            labelEl.style.marginTop = '0.2rem';
            labelEl.style.fontStyle = 'italic';
            labelEl.style.textAlign = 'right';
            labelEl.style.opacity = '0.8';
            messageEl.querySelector('.message-content').appendChild(labelEl);
        }
    }

    addToolCallMessage(chunk) {
        const toolName = chunk.annotations?.['tool.name'];
        const toolResult = chunk.annotations?.['tool.results'];
        const toolDetection = chunk.annotations?.['com.rxcafe.tool-detection'];

        const messageEl = document.createElement('div');
        this.chat._elCounter++;
        messageEl.dataset.elId = this.chat._elCounter;
        messageEl.dataset.chunkId = chunk.id;
        messageEl.className = 'message assistant tool-call';

        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';

        const headerEl = document.createElement('div');
        headerEl.className = 'tool-call-header';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'tool-icon';
        iconSpan.textContent = '🔧';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'tool-name';
        nameSpan.textContent = toolName || 'Unknown Tool';

        headerEl.appendChild(iconSpan);
        headerEl.appendChild(nameSpan);
        contentEl.appendChild(headerEl);

        if (toolDetection?.toolCalls?.length > 0) {
            const toolCall = toolDetection.toolCalls[0];
            const paramsEl = document.createElement('div');
            paramsEl.className = 'tool-params';
            paramsEl.textContent = JSON.stringify(toolCall.parameters, null, 2);
            contentEl.appendChild(paramsEl);
        }

        if (toolResult !== undefined) {
            const resultEl = document.createElement('div');
            resultEl.className = 'tool-result';
            resultEl.textContent = typeof toolResult === 'object' 
                ? JSON.stringify(toolResult, null, 2)
                : String(toolResult);
            contentEl.appendChild(resultEl);
        }

        if (chunk.content) {
            const textEl = document.createElement('div');
            textEl.className = 'message-body';
            textEl.style.marginTop = '0.5rem';
            textEl.textContent = chunk.content;
            contentEl.appendChild(textEl);
        }

        messageEl.appendChild(contentEl);
        messageEl.addEventListener('contextmenu', (e) => this.chat.showContextMenu(e, chunk.id));

        this.chat.messagesEl.appendChild(messageEl);
        this.chat.chunkElements.set(chunk.id, messageEl);
        scrollToBottom(this.chat.messagesEl);
    }

    addToolCallIndicator(messageEl, toolCalls) {
        if (!messageEl || !toolCalls?.length) return;

        let metaEl = messageEl.querySelector('.message-meta');
        if (!metaEl) {
            metaEl = document.createElement('div');
            metaEl.className = 'message-meta';
            const contentEl = messageEl.querySelector('.message-content');
            if (contentEl) {
                contentEl.appendChild(metaEl);
            }
        }

        toolCalls.forEach((toolCall) => {
            const toolIndicator = document.createElement('div');
            toolIndicator.className = 'tool-call-indicator';
            toolIndicator.style.cssText = 'font-size: 0.7rem; margin-top: 0.4rem; padding: 0.4rem; background-color: rgba(139, 92, 246, 0.1); border-radius: 0.25rem; color: #8b5cf6;';

            let paramsText = '';
            if (toolCall.parameters && Object.keys(toolCall.parameters).length > 0) {
                paramsText = ` → ${JSON.stringify(toolCall.parameters)}`;
            }

            toolIndicator.innerHTML = `<span style="margin-right: 0.25rem;">🔧</span>${toolCall.name}${paramsText}`;
            metaEl.appendChild(toolIndicator);
        });
    }

    addSystemChunk(chunk, prompt) {
        this.chat.addRawChunk(chunk);
        
        const messageEl = document.createElement('div');
        messageEl.className = 'message system-prompt';
        messageEl.dataset.chunkId = chunk.id;
        
        const headerEl = document.createElement('div');
        headerEl.className = 'system-header';
        headerEl.innerHTML = '<span class="system-label">⚙️ System Prompt</span>';
        
        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        contentEl.textContent = prompt;
        
        messageEl.appendChild(headerEl);
        messageEl.appendChild(contentEl);
        
        this.chat.messagesEl.appendChild(messageEl);
        this.chat.chunkElements.set(chunk.id, messageEl);
        scrollToBottom(this.chat.messagesEl);
    }

    addWebChunk(chunk) {
        this.chat.addRawChunk(chunk);
        
        const isTrusted = chunk.annotations?.['security.trust-level']?.trusted === true;
        const sourceUrl = chunk.annotations?.['web.source-url'] || 'Unknown source';
        
        const messageEl = document.createElement('div');
        messageEl.className = `message web ${isTrusted ? 'trusted' : 'untrusted'}`;
        messageEl.dataset.chunkId = chunk.id;
        
        const headerEl = document.createElement('div');
        headerEl.className = 'web-header';
        
        const sourceEl = document.createElement('span');
        sourceEl.className = 'web-source';
        sourceEl.textContent = `Web: ${sourceUrl}`;
        
        const trustBadge = document.createElement('span');
        trustBadge.className = `trust-badge ${isTrusted ? 'trusted' : 'untrusted'}`;
        trustBadge.textContent = isTrusted ? 'Trusted' : 'Untrusted';
        
        const trustToggle = document.createElement('button');
        trustToggle.className = 'trust-toggle';
        trustToggle.textContent = isTrusted ? 'Untrust' : 'Trust';
        trustToggle.onclick = () => this.chat.toggleTrustFromButton(chunk.id, !isTrusted);
        
        headerEl.appendChild(sourceEl);
        headerEl.appendChild(trustBadge);
        headerEl.appendChild(trustToggle);
        
        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        contentEl.textContent = chunk.content;
        
        messageEl.appendChild(headerEl);
        messageEl.appendChild(contentEl);
        
        messageEl.addEventListener('contextmenu', (e) => this.chat.showContextMenu(e, chunk.id));
        
        this.chat.messagesEl.appendChild(messageEl);
        this.chat.chunkElements.set(chunk.id, messageEl);
        scrollToBottom(this.chat.messagesEl);
        
        if (!isTrusted) {
            this.chat.addSystemMessage('Web content added but NOT trusted. Right-click and select "Trust Chunk" to include in LLM context, or click the Trust button.');
        }
    }

    addImageMessage(role, chunk) {
        if (!chunk.content || !chunk.content.data) {
            console.error('[RXCAFE] Binary chunk missing data', chunk);
            return;
        }
        const { data, mimeType } = chunk.content;
        
        let uint8;
        if (data instanceof Uint8Array) {
            uint8 = data;
        } else if (Array.isArray(data)) {
            uint8 = new Uint8Array(data);
        } else if (typeof data === 'object' && data !== null) {
            if (data.type === 'Buffer' && Array.isArray(data.data)) {
                uint8 = new Uint8Array(data.data);
            } else {
                uint8 = new Uint8Array(Object.values(data));
            }
        } else {
            console.error('[RXCAFE] Invalid image data format', data);
            return;
        }

        const blob = new Blob([uint8], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const messageEl = document.createElement('div');
        this.chat._elCounter++;
        messageEl.dataset.elId = this.chat._elCounter;
        messageEl.dataset.chunkId = chunk.id;
        messageEl.className = `message ${role} image-message`;
        
        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        
        const img = document.createElement('img');
        img.src = url;
        img.alt = chunk.annotations?.['image.description'] || 'Generated image';
        img.style.maxWidth = '100%';
        img.style.borderRadius = '0.5rem';
        img.style.display = 'block';
        
        img.onload = () => URL.revokeObjectURL(url);
        
        contentEl.appendChild(img);
        
        if (chunk.annotations?.['image.description']) {
            const caption = document.createElement('div');
            caption.className = 'message-meta';
            caption.textContent = chunk.annotations['image.description'];
            contentEl.appendChild(caption);
        }
        
        messageEl.appendChild(contentEl);
        this.chat.messagesEl.appendChild(messageEl);
        this.chat.chunkElements.set(chunk.id, messageEl);
        scrollToBottom(this.chat.messagesEl);
    }

    addAudioMessage(role, chunk) {
        if (!chunk.content || !chunk.content.data) {
            console.error('[RXCAFE] Binary chunk missing data', chunk);
            return;
        }
        const { data, mimeType } = chunk.content;
        
        let uint8;
        if (data instanceof Uint8Array) {
            uint8 = data;
        } else if (Array.isArray(data)) {
            uint8 = new Uint8Array(data);
        } else if (typeof data === 'object' && data !== null) {
            if (data.type === 'Buffer' && Array.isArray(data.data)) {
                uint8 = new Uint8Array(data.data);
            } else {
                uint8 = new Uint8Array(Object.values(data));
            }
        } else {
            console.error('[RXCAFE] Invalid audio data format', data);
            return;
        }

        const blob = new Blob([uint8], { type: mimeType });
        const url = URL.createObjectURL(blob);
        console.log(`[RXCAFE] Created audio blob URL: ${url} (size: ${blob.size} bytes, type: ${mimeType})`);
        
        const messageEl = document.createElement('div');
        this.chat._elCounter++;
        messageEl.dataset.elId = this.chat._elCounter;
        messageEl.dataset.chunkId = chunk.id;
        messageEl.className = `message ${role} audio-message`;
        
        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        
        const audio = document.createElement('audio');
        audio.src = url;
        audio.controls = true;
        audio.style.width = '100%';
        audio.style.display = 'block';
        
        audio.onload = () => console.log('[RXCAFE] Audio loaded');
        audio.onerror = (e) => console.error('[RXCAFE] Audio error:', e);
        audio.onloadedmetadata = (e) => console.log('[RXCAFE] Audio metadata:', e.target.duration, 'seconds');
        
        contentEl.appendChild(audio);
        
        if (chunk.annotations?.['audio.description']) {
            const caption = document.createElement('div');
            caption.className = 'message-meta';
            caption.textContent = chunk.annotations['audio.description'];
            contentEl.appendChild(caption);
        }
        
        messageEl.appendChild(contentEl);
        this.chat.messagesEl.appendChild(messageEl);
        this.chat.chunkElements.set(chunk.id, messageEl);
        scrollToBottom(this.chat.messagesEl);
    }

    addMessage(role, content, chunkId = null, annotations = {}) {
        const messageEl = this.chat.createMessageElement(role, content, annotations);
        console.log(`[RXCAFE] addMessage elId=${messageEl.dataset.elId} role=${role} chunkId=${chunkId}`);
        if (chunkId) {
            messageEl.dataset.chunkId = chunkId;
            this.chat.chunkElements.set(chunkId, messageEl);
        }
        this.chat.messagesEl.appendChild(messageEl);
        scrollToBottom(this.chat.messagesEl);
        return messageEl;
    }

    updateSentiment(messageEl, sentiment) {
        if (!messageEl || !sentiment) return;
        console.log('[RXCAFE] updateSentiment called for element:', messageEl.dataset.elId, sentiment);
        
        let metaEl = messageEl.querySelector('.sentiment-meta');
        if (!metaEl) {
            metaEl = document.createElement('div');
            metaEl.className = 'message-meta sentiment-meta';
            metaEl.style.fontSize = '0.7rem';
            metaEl.style.marginTop = '0.4rem';
            metaEl.style.padding = '0.4rem';
            metaEl.style.backgroundColor = 'rgba(0,0,0,0.05)';
            metaEl.style.borderRadius = '0.25rem';
            messageEl.querySelector('.message-content').appendChild(metaEl);
        }
        
        const score = parseFloat(sentiment.score) || 0;
        const emoji = score > 0.3 ? '😊' : (score < -0.3 ? '☹️' : '😐');
        metaEl.textContent = `Sentiment: ${emoji} (${score.toFixed(2)}) - ${sentiment.explanation}`;
    }
}
