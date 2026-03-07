/**
 * Chess UI Adapter
 * 
 * This module provides a lightweight adapter that:
 * 1. Creates and manages the <chess-board> Lit component
 * 2. Handles events between the component and the main app
 * 3. Loads chunks into the component when switching to chess view
 */

import { ChessBoard } from '../components/chess-board.js';

export class ChessUIAdapter {
  constructor(chat) {
    this.chat = chat;
    this.component = null;
    this.container = null;
    this._chunkHandler = null;
  }

  /**
   * Initialize the chess UI for a session
   */
  init(sessionId) {
    this.container = document.getElementById('dice-view');
    if (!this.container) {
      console.error('[ChessUI] Container #dice-view not found');
      return;
    }

    this.container.innerHTML = '';

    this.component = document.createElement('chess-board');
    this.component.sessionId = sessionId;
    this.component.token = this.chat.token;
    this.component.apiBaseUrl = window.location.origin;

    if (this.chat.rawChunks) {
      this.component.loadHistory(this.chat.rawChunks);
    }

    this.container.appendChild(this.component);

    this._bindEvents();

    this._chunkHandler = (e) => {
      const { chunk, sessionId: chunkSessionId } = e.detail;
      if (chunkSessionId === sessionId && this.component) {
        this.component.handleChunk(chunk);
      }
    };
    document.addEventListener('rxcafe:chunk', this._chunkHandler);
  }

  /**
   * Clean up the chess UI
   */
  destroy() {
    if (this._chunkHandler) {
      document.removeEventListener('rxcafe:chunk', this._chunkHandler);
      this._chunkHandler = null;
    }

    if (this.component) {
      this.component.remove();
      this.component = null;
    }

    this.container = null;
  }

  /**
   * Bind to component events
   */
  _bindEvents() {
    if (!this.component) return;

    this.component.addEventListener('chess-switch-ui', (e) => {
      if (e.detail.mode === 'chat' && this.chat) {
        this.chat.switchUIMode('chat');
      }
    });

    this.component.addEventListener('chess-move', (e) => {
      console.log('[ChessUI] Move requested:', e.detail.move);
    });

    this.component.addEventListener('chess-new-game', () => {
      console.log('[ChessUI] New game requested');
    });
  }

  handleChunk(chunk) {
    if (this.component) {
      this.component.handleChunk(chunk);
    }
  }
}

window.ChessUIAdapter = ChessUIAdapter;
