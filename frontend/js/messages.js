import { scrollToBottom } from './dom-utils.js';

// Import Lit widget components
import { RxMessageText } from '../widgets/rx-message-text.js';
import { RxMessageImage } from '../widgets/rx-message-image.js';
import { RxMessageAudio } from '../widgets/rx-message-audio.js';
import { RxMessageFile } from '../widgets/rx-message-file.js';
import { RxMessageWeb } from '../widgets/rx-message-web.js';
import { RxMessageTool } from '../widgets/rx-message-tool.js';
import { RxMessageSystem } from '../widgets/rx-message-system.js';
import { RxMessageVisualization } from '../widgets/rx-message-visualization.js';
import { RxMessageCode } from '../widgets/rx-message-code.js';
import { RxMessageDiff } from '../widgets/rx-message-diff.js';
import { RxQuickResponses } from '../widgets/rx-quick-responses.js';
import { RxWeather } from '../widgets/rx-weather.js';
import { RxVegaGraph } from '../widgets/rx-vega-graph.js';
import { RxChess } from '../widgets/rx-chess.js';
import { RxMessageError } from '../widgets/rx-message-error.js';

// Constants for annotation keys and element names
const ANNOTATIONS = {
    CHAT_ROLE: 'chat.role',
    PRODUCER: 'com.rxcafe.web-fetch',
    WEB_SOURCE_URL: 'web.source-url',
    CLIENT_TYPE: 'client.type',
    VISUALIZER_TYPE: 'visualizer.type',
    CODE_LANGUAGE: 'code.language',
    DIFF_TYPE: 'diff.type',
    WEATHER_DATA: 'weather.data',
    VEGA_SPEC: 'vega.spec',
    CHESS_FEN: 'chess.fen',
    SESSION_NAME: 'session.name',
    ERROR_MESSAGE: 'error.message',
    TOOL_NAME: 'tool.name',
    TOOL_RESULTS: 'tool.results',
    TOOL_DETECTION: 'com.rxcafe.tool-detection',
    SENTIMENT: 'com.rxcafe.example.sentiment',
    QUICK_RESPONSES: 'com.rxcafe.quickResponses',
    TRUST_LEVEL: 'security.trust-level',
    IMAGE_DESCRIPTION: 'image.description',
    AUDIO_DESCRIPTION: 'audio.description',
    FILE_NAME: 'file.name',
    DOCUMENT_FILENAME: 'document.filename',
    DIFF_OLD_CONTENT: 'diff.oldContent',
    DIFF_NEW_CONTENT: 'diff.newContent',
    DIFF_OLD_FILENAME: 'diff.oldFilename',
    DIFF_NEW_FILENAME: 'diff.newFilename',
    DIFF_LANGUAGE: 'diff.language',
    VISUALIZER_AGENT: 'visualizer.agent',
    VISUALIZER_PIPELINE: 'visualizer.pipeline',
    WEATHER_LOCATION: 'weather.location',
    WEATHER_TIMEZONE: 'weather.timezone',
    VEGA_TITLE: 'vega.title',
    CHESS_TURN: 'chess.turn',
    CHESS_IS_CHECK: 'chess.isCheck',
    CHESS_GAME_OVER: 'chess.gameOver',
    CHESS_WINNER: 'chess.winner',
    CHESS_MOVE_HISTORY: 'chess.moveHistory',
    CHESS_INVALID: 'chess.invalid',
    CHESS_INVALID_MOVE: 'chess.invalidMove',
    LLM_BACKEND: 'llm.backend'
};

const ELEMENT_TAGS = {
    RX_MESSAGE_TEXT: 'rx-message-text',
    RX_MESSAGE_CODE: 'rx-message-code',
    RX_MESSAGE_DIFF: 'rx-message-diff',
    RX_MESSAGE_VISUALIZATION: 'rx-message-visualization',
    RX_MESSAGE_TOOL: 'rx-message-tool',
    RX_MESSAGE_SYSTEM: 'rx-message-system',
    RX_WEATHER: 'rx-weather',
    RX_VEGA_GRAPH: 'rx-vega-graph',
    RX_CHESS: 'rx-chess',
    RX_MESSAGE_WEB: 'rx-message-web',
    RX_MESSAGE_IMAGE: 'rx-message-image',
    RX_MESSAGE_AUDIO: 'rx-message-audio',
    RX_MESSAGE_FILE: 'rx-message-file',
    RX_MESSAGE_ERROR: 'rx-message-error',
    RX_QUICK_RESPONSES: 'rx-quick-responses'
};

const CONTENT_TYPES = {
    BINARY_REF: 'binary-ref',
    BINARY: 'binary',
    NULL: 'null',
    TEXT: 'text'
};

const ROLES = {
    USER: 'user',
    ASSISTANT: 'assistant',
    SYSTEM: 'system'
};

const VISUALIZER_TYPES = {
    RX_MARBLES: 'rx-marbles'
};

const CHESS_TURNS = {
    WHITE: 'w',
    BLACK: 'b'
};

export class MessagesManager {
    constructor(chat) {
        this.chat = chat;
    }

    // Utility method to convert binary data to Uint8Array and create blob
    convertBinaryDataToBlob(content, mimeType) {
        if (!content || !content.data) {
            throw new Error('Binary chunk missing data');
        }

        const { data } = content;
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
            throw new Error('Invalid binary data format');
        }

        return new Blob([uint8], { type: mimeType });
    }

    // Utility method to set up binary reference properties on element
    setupBinaryRef(element, chunk, sessionId) {
        element.binaryRef = true;
        element.byteSize = chunk.content.byteSize;
        element.mimeType = chunk.content.mimeType;
        element.chunkId = chunk.content.chunkId;
        element.sessionId = sessionId;
    }

    // Utility method to create filename from annotations and mime type
    getFilenameFromAnnotations(annotations, mimeType) {
        return annotations?.[ANNOTATIONS.FILE_NAME] ||
               annotations?.[ANNOTATIONS.DOCUMENT_FILENAME] ||
               `file.${mimeType.split('/')[1] || 'bin'}`;
    }

    renderChunk(chunk) {
        // Handle special cases first
        if (!chunk.annotations?.[ANNOTATIONS.CHAT_ROLE] && chunk.annotations?.[ANNOTATIONS.SESSION_NAME]) {
            this.chat.chunkElements.set(chunk.id, null);
            return;
        }

        // For all other cases: create element, add to raw chunks, append to DOM
        // Note: addRawChunk may have already been called (e.g., in history loading)
        const existingIndex = this.chat.rawChunks.findIndex(c => c.id === chunk.id);
        if (existingIndex === -1) {
            this.chat.addRawChunk(chunk);
        }
        const element = this.createElement(chunk);

        if (element) {
            this.chat.messagesEl.appendChild(element);
            this.chat.chunkElements.set(chunk.id, element);

            // Handle text elements
            if (element.tagName.toLowerCase() === 'rx-message-text') {
                // Ensure content is properly set (for consistency with streaming)
                this.chat.updateMessageContent(element, chunk.content, chunk.annotations);

                // Add quick responses for assistant text messages
                if (chunk.annotations?.[ANNOTATIONS.CHAT_ROLE] === ROLES.ASSISTANT) {
                    this.addQuickResponses(element, chunk);
                }
            } else {
                scrollToBottom(this.chat.messagesEl);
            }
        }
    }


    createElement(chunk) {
        // Unified element creation for all widget types
        // Returns configured element without DOM operations

        if (chunk.contentType === CONTENT_TYPES.BINARY_REF || chunk.contentType === CONTENT_TYPES.BINARY) {
            return this._createBinaryElement(chunk);
        }

        if (chunk.annotations?.[ANNOTATIONS.CODE_LANGUAGE]) {
            return this._createCodeElement(chunk);
        }

        if (chunk.annotations?.[ANNOTATIONS.DIFF_TYPE]) {
            return this._createDiffElement(chunk);
        }

        if (chunk.annotations?.[ANNOTATIONS.VISUALIZER_TYPE] === VISUALIZER_TYPES.RX_MARBLES) {
            return this._createVisualizationElement(chunk);
        }

        if (chunk.annotations?.[ANNOTATIONS.WEATHER_DATA]) {
            return this._createWeatherElement(chunk);
        }

        if (chunk.annotations?.[ANNOTATIONS.VEGA_SPEC]) {
            return this._createVegaElement(chunk);
        }

        if (chunk.annotations?.[ANNOTATIONS.CHESS_FEN]) {
            return this._createChessElement(chunk);
        }

        if (chunk.producer === ANNOTATIONS.PRODUCER || chunk.annotations?.[ANNOTATIONS.WEB_SOURCE_URL]) {
            return this._createWebElement(chunk);
        }

        if (chunk.contentType === CONTENT_TYPES.NULL && chunk.annotations?.[ANNOTATIONS.ERROR_MESSAGE]) {
            return this._createErrorElement(chunk, chunk.annotations[ANNOTATIONS.ERROR_MESSAGE] || 'Unknown error', chunk.annotations[ANNOTATIONS.LLM_BACKEND] || '');
        }

        if (chunk.annotations?.[ANNOTATIONS.TOOL_NAME]) {
            return this._createToolElement(chunk);
        }

        // Default case for regular text chunks (only render text content with chat role)
        if (chunk.contentType === CONTENT_TYPES.TEXT &&
            (chunk.annotations?.[ANNOTATIONS.CHAT_ROLE] === ROLES.USER ||
             chunk.annotations?.[ANNOTATIONS.CHAT_ROLE] === ROLES.ASSISTANT)) {
            return this._createTextElement(chunk);
        }

        // Don't render any other chunk types as elements
        return null;
    }

    addQuickResponses(messageEl, chunk) {
        const quickResponses = chunk.annotations?.[ANNOTATIONS.QUICK_RESPONSES];
        if (!quickResponses || !Array.isArray(quickResponses) || quickResponses.length === 0) {
            return;
        }

        // Prevent duplicate quick responses for the same chunk
        const existingId = 'quick-responses-' + chunk.id;
        if (document.getElementById(existingId)) {
            return;
        }

        const quickResponsesEl = document.createElement(ELEMENT_TAGS.RX_QUICK_RESPONSES);
        quickResponsesEl.responses = quickResponses;
        quickResponsesEl.disabled = !this.chat.sessionId || this.chat.isGenerating;
        quickResponsesEl.id = existingId;

        quickResponsesEl.addEventListener('quick-response', (e) => {
            if (this.chat.messageInput) {
                this.chat.messageInput.value = e.detail.response;
                this.chat.sendMessage();
            }
        });

        this.chat.messagesEl.appendChild(quickResponsesEl);
        this.chat.scrollToBottom();
    }

    updateQuickResponsesState() {
        const allQuickResponses = this.chat.messagesEl?.querySelectorAll('rx-quick-responses');
        if (allQuickResponses) {
            allQuickResponses.forEach(el => {
                el.disabled = !this.chat.sessionId || this.chat.isGenerating;
            });
        }
    }

    addMessage(role, content, chunkId = null, annotations = {}) {
        const messageEl = this.chat.createMessageElement(role, content, annotations);
        if (chunkId) {
            messageEl.dataset.chunkId = chunkId;
            this.chat.chunkElements.set(chunkId, messageEl);
        }
        this.chat.messagesEl.appendChild(messageEl);
        scrollToBottom(this.chat.messagesEl);
        return messageEl;
    }

    _setCommonProperties(el, chunkId, role = null) {
        this.chat._elCounter++;
        el.dataset.elId = this.chat._elCounter;
        el.chunkId = chunkId;
        if (role) el.role = role;
    }

    _createBinaryElement(chunk) {
        const mimeType = chunk.content?.mimeType || '';
        const role = chunk.annotations?.[ANNOTATIONS.CHAT_ROLE] || ROLES.ASSISTANT;
        const isRef = chunk.contentType === CONTENT_TYPES.BINARY_REF;

        try {
            if (mimeType.startsWith('image/')) {
                return this._createImageElement(chunk, isRef, mimeType, role);
            } else if (mimeType.startsWith('audio/')) {
                return this._createAudioElement(chunk, isRef, mimeType, role);
            } else {
                return this._createFileElement(chunk, isRef, mimeType, role);
            }
        } catch (error) {
            console.error('[RXCAFE] Failed to create binary element:', error);
            return this._createErrorElement(chunk, `Failed to render binary content: ${error.message}`, '');
        }
    }

    _createImageElement(chunk, isRef, mimeType, role) {
        const imageEl = document.createElement(ELEMENT_TAGS.RX_MESSAGE_IMAGE);
        this._setCommonProperties(imageEl, chunk.id, role);
        imageEl.alt = chunk.annotations?.[ANNOTATIONS.IMAGE_DESCRIPTION] || 'Generated image';
        imageEl.description = chunk.annotations?.[ANNOTATIONS.IMAGE_DESCRIPTION] || '';

        if (isRef) {
            this.setupBinaryRef(imageEl, chunk, this.chat.sessionId);
        } else {
            const blob = this.convertBinaryDataToBlob(chunk.content, chunk.content.mimeType);
            imageEl.src = URL.createObjectURL(blob);
        }

        return imageEl;
    }

    _createAudioElement(chunk, isRef, mimeType, role) {
        const audioEl = document.createElement(ELEMENT_TAGS.RX_MESSAGE_AUDIO);
        this._setCommonProperties(audioEl, chunk.id, role);
        audioEl.description = chunk.annotations?.[ANNOTATIONS.AUDIO_DESCRIPTION] || '';

        if (isRef) {
            this.setupBinaryRef(audioEl, chunk, this.chat.sessionId);
        } else {
            const blob = this.convertBinaryDataToBlob(chunk.content, chunk.content.mimeType);
            const url = URL.createObjectURL(blob);
            audioEl.src = url;
        }

        return audioEl;
    }

    _createFileElement(chunk, isRef, mimeType, role) {
        const fileEl = document.createElement(ELEMENT_TAGS.RX_MESSAGE_FILE);
        this._setCommonProperties(fileEl, chunk.id, role);

        if (isRef) {
            this.setupBinaryRef(fileEl, chunk, this.chat.sessionId);
            fileEl.filename = this.getFilenameFromAnnotations(chunk.annotations, chunk.content.mimeType);
            fileEl.size = chunk.content.byteSize;
        } else {
            const blob = this.convertBinaryDataToBlob(chunk.content, chunk.content.mimeType);
            const url = URL.createObjectURL(blob);
            fileEl.filename = this.getFilenameFromAnnotations(chunk.annotations, chunk.content.mimeType);
            fileEl.mimeType = chunk.content.mimeType;
            fileEl.size = blob.size;
            fileEl.dataUrl = url;
        }

        return fileEl;
    }

    _createCodeElement(chunk) {
        const codeEl = document.createElement(ELEMENT_TAGS.RX_MESSAGE_CODE);
        this._setCommonProperties(codeEl, chunk.id, chunk.annotations?.[ANNOTATIONS.CHAT_ROLE] || ROLES.ASSISTANT);
        codeEl.content = chunk.content || '';
        codeEl.language = chunk.annotations?.[ANNOTATIONS.CODE_LANGUAGE] || '';
        codeEl.filename = chunk.annotations?.['code.filename'] || '';

        codeEl.addEventListener('code-contextmenu', (e) => {
            this.chat.showContextMenu(e.detail.originalEvent, e.detail.chunkId);
        });

        return codeEl;
    }

    _createDiffElement(chunk) {
        const diffEl = document.createElement(ELEMENT_TAGS.RX_MESSAGE_DIFF);
        this._setCommonProperties(diffEl, chunk.id, chunk.annotations?.[ANNOTATIONS.CHAT_ROLE] || ROLES.ASSISTANT);
        diffEl.oldContent = chunk.annotations?.[ANNOTATIONS.DIFF_OLD_CONTENT] || '';
        diffEl.newContent = chunk.annotations?.[ANNOTATIONS.DIFF_NEW_CONTENT] || chunk.content || '';
        diffEl.oldFilename = chunk.annotations?.[ANNOTATIONS.DIFF_OLD_FILENAME] || '';
        diffEl.newFilename = chunk.annotations?.[ANNOTATIONS.DIFF_NEW_FILENAME] || '';
        diffEl.language = chunk.annotations?.[ANNOTATIONS.DIFF_LANGUAGE] || '';
        diffEl.diffType = chunk.annotations?.[ANNOTATIONS.DIFF_TYPE] || 'unified';

        diffEl.addEventListener('diff-contextmenu', (e) => {
            this.chat.showContextMenu(e.detail.originalEvent, e.detail.chunkId);
        });

        return diffEl;
    }

    _createVisualizationElement(chunk) {
        const vizEl = document.createElement(ELEMENT_TAGS.RX_MESSAGE_VISUALIZATION);
        this._setCommonProperties(vizEl, chunk.id);

        vizEl._initialData = {
            chunkId: chunk.id,
            agentName: chunk.annotations?.[ANNOTATIONS.VISUALIZER_AGENT] || 'Unknown',
            pipeline: chunk.annotations?.[ANNOTATIONS.VISUALIZER_PIPELINE],
            chunks: this.chat.rawChunks
        };

        vizEl.addEventListener('viz-contextmenu', (e) => {
            this.chat.showContextMenu(e.detail.originalEvent, e.detail.chunkId);
        });

        return vizEl;
    }

    _createWeatherElement(chunk) {
        try {
            const weatherData = JSON.parse(chunk.content);
            const location = chunk.annotations?.[ANNOTATIONS.WEATHER_LOCATION] || '';
            const timezone = chunk.annotations?.[ANNOTATIONS.WEATHER_TIMEZONE] || '';

            const weatherEl = document.createElement(ELEMENT_TAGS.RX_WEATHER);
            this._setCommonProperties(weatherEl, chunk.id);
            weatherEl.weatherData = weatherData;
            weatherEl.location = location;
            weatherEl.timezone = timezone;

            return weatherEl;
        } catch (e) {
            console.error('[RXCAFE] Failed to create weather element:', e);
            return this._createErrorElement(chunk, chunk.annotations[ANNOTATIONS.ERROR_MESSAGE] || 'Failed to parse weather data', chunk.annotations[ANNOTATIONS.LLM_BACKEND] || '');
        }
    }

    _createVegaElement(chunk) {
        try {
            const spec = chunk.annotations?.[ANNOTATIONS.VEGA_SPEC];
            const title = chunk.annotations?.[ANNOTATIONS.VEGA_TITLE] || 'Vega Graph';

            const vegaEl = document.createElement(ELEMENT_TAGS.RX_VEGA_GRAPH);
            this._setCommonProperties(vegaEl, chunk.id);
            vegaEl._initialData = {
                chunkId: chunk.id,
                spec: spec,
                title: title
            };

            vegaEl.addEventListener('vega-contextmenu', (e) => {
                this.chat.showContextMenu(e.detail.originalEvent, e.detail.chunkId);
            });

            return vegaEl;
        } catch (e) {
            console.error('[RXCAFE] Failed to create vega graph element:', e);
            return this._createErrorElement(chunk, chunk.annotations[ANNOTATIONS.ERROR_MESSAGE] || 'Failed to render vega graph', chunk.annotations[ANNOTATIONS.LLM_BACKEND] || '');
        }
    }

    _createChessElement(chunk) {
        try {
            const fen = chunk.annotations?.[ANNOTATIONS.CHESS_FEN];
            const turn = chunk.annotations?.[ANNOTATIONS.CHESS_TURN] || CHESS_TURNS.WHITE;
            const isCheck = chunk.annotations?.[ANNOTATIONS.CHESS_IS_CHECK] || false;
            const gameOver = chunk.annotations?.[ANNOTATIONS.CHESS_GAME_OVER] || false;
            const winner = chunk.annotations?.[ANNOTATIONS.CHESS_WINNER] || null;
            const moveHistory = chunk.annotations?.[ANNOTATIONS.CHESS_MOVE_HISTORY] || [];
            const invalidMove = chunk.annotations?.[ANNOTATIONS.CHESS_INVALID] ?
                chunk.annotations[ANNOTATIONS.CHESS_INVALID_MOVE] || 'Invalid move' : '';

            const chessEl = document.createElement(ELEMENT_TAGS.RX_CHESS);
            this._setCommonProperties(chessEl, chunk.id);
            chessEl.fen = fen;
            chessEl.currentPlayer = turn === CHESS_TURNS.WHITE ? 'white' : 'black';
            chessEl.isCheck = isCheck;
            chessEl.gameOver = gameOver;
            chessEl.winner = winner;
            chessEl.moveHistory = moveHistory;
            chessEl.invalidMove = invalidMove;

            return chessEl;
        } catch (e) {
            console.error('[RXCAFE] Failed to create chess element:', e);
            return this._createErrorElement(chunk, chunk.annotations[ANNOTATIONS.ERROR_MESSAGE] || 'Failed to render chess board', chunk.annotations[ANNOTATIONS.LLM_BACKEND] || '');
        }
    }

    _createWebElement(chunk) {
        const isTrusted = chunk.annotations?.[ANNOTATIONS.TRUST_LEVEL]?.trusted === true;
        const sourceUrl = chunk.annotations?.[ANNOTATIONS.WEB_SOURCE_URL] || 'Unknown source';

        const webEl = document.createElement(ELEMENT_TAGS.RX_MESSAGE_WEB);
        webEl.content = chunk.content;
        webEl.sourceUrl = sourceUrl;
        webEl.trusted = isTrusted;
        webEl.chunkId = chunk.id;

        webEl.addEventListener('trust-toggle', (e) => {
            this.chat.toggleTrustFromButton(e.detail.chunkId, e.detail.trusted);
        });

        return webEl;
    }

    _createErrorElement(chunk, message, backend) {
        const errorEl = document.createElement(ELEMENT_TAGS.RX_MESSAGE_ERROR);
        this.chat._elCounter++;
        errorEl.dataset.elId = this.chat._elCounter;
        errorEl.message = message;
        errorEl.backend = backend;
        errorEl.chunkId = chunk.id;
        return errorEl;
    }

    _createToolElement(chunk) {
        const toolName = chunk.annotations?.[ANNOTATIONS.TOOL_NAME];
        const toolResult = chunk.annotations?.[ANNOTATIONS.TOOL_RESULTS];
        const toolDetection = chunk.annotations?.[ANNOTATIONS.TOOL_DETECTION];

        const toolEl = document.createElement(ELEMENT_TAGS.RX_MESSAGE_TOOL);
        this._setCommonProperties(toolEl, chunk.id);
        toolEl.toolName = toolName || 'Unknown Tool';
        toolEl.toolResult = toolResult;
        toolEl.toolCalls = toolDetection?.toolCalls || [];
        toolEl.content = chunk.content || '';

        return toolEl;
    }

    _createTextElement(chunk) {
        const textEl = document.createElement(ELEMENT_TAGS.RX_MESSAGE_TEXT);
        this._setCommonProperties(textEl, chunk.id, chunk.annotations?.[ANNOTATIONS.CHAT_ROLE] || ROLES.ASSISTANT);
        textEl.content = chunk.content || '';
        textEl.annotations = chunk.annotations || {};
        return textEl;
    }
}