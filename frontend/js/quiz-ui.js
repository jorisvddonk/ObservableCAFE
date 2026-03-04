/**
 * Quiz UI Adapter
 * 
 * This module provides a lightweight adapter that:
 * 1. Creates and manages the <quiz-game> Lit component
 * 2. Handles events between the component and the main app
 * 3. Loads chunks into the component when switching to quiz view
 */

import { QuizGame } from '../components/quiz-game.js';

export class QuizUIAdapter {
  constructor(chat) {
    this.chat = chat;
    this.component = null;
    this.container = null;
    this._chunkHandler = null;
  }

  /**
   * Initialize the quiz UI for a session
   */
  init(sessionId) {
    this.container = document.getElementById('dice-view'); // Reuse the same container
    if (!this.container) {
      console.error('[QuizUI] Container #dice-view not found');
      return;
    }

    // Clear existing content
    this.container.innerHTML = '';

    // Create the Lit component
    this.component = document.createElement('quiz-game');
    this.component.sessionId = sessionId;
    this.component.token = this.chat.token;
    this.component.apiBaseUrl = window.location.origin;

    // Load history from chat's raw chunks
    if (this.chat.rawChunks) {
      this.component.loadHistory(this.chat.rawChunks);
    }

    // Append to container
    this.container.appendChild(this.component);

    // Set up event listeners
    this._bindEvents();

    // Set up chunk listener
    this._chunkHandler = (e) => {
      const { chunk, sessionId: chunkSessionId } = e.detail;
      const expectedSessionId = sessionId;
      console.log('[QuizUI] Received chunk event:', { chunkSessionId, expectedSessionId, producer: chunk?.producer, contentType: chunk?.contentType });
      // Use loose equality to handle string/number type differences
      if (chunkSessionId == expectedSessionId && this.component) {
        console.log('[QuizUI] Passing chunk to component');
        this.component.handleChunk(chunk);
      } else {
        console.log('[QuizUI] Chunk rejected:', { chunkSessionId, expectedSessionId, hasComponent: !!this.component });
      }
    };
    document.addEventListener('rxcafe:chunk', this._chunkHandler);
  }

  /**
   * Clean up the quiz UI
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

    // Handle UI mode switch request
    this.component.addEventListener('quiz-switch-ui', (e) => {
      if (e.detail.mode === 'chat' && this.chat) {
        this.chat.switchUIMode('chat');
      }
    });

    // Handle quiz events (for logging/debugging)
    this.component.addEventListener('quiz-start', (e) => {
      console.log('[QuizUI] Quiz started:', e.detail);
    });

    this.component.addEventListener('quiz-answer', (e) => {
      console.log('[QuizUI] Answer selected:', e.detail.answer);
    });

    this.component.addEventListener('quiz-help', () => {
      console.log('[QuizUI] Help requested');
    });
  }

  /**
   * Handle a chunk (called directly for initial load)
   */
  handleChunk(chunk) {
    if (this.component) {
      this.component.handleChunk(chunk);
    }
  }
}

// Export for module usage
window.QuizUIAdapter = QuizUIAdapter;
