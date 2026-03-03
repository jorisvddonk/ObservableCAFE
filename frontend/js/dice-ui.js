/**
 * Dice UI Adapter
 * 
 * This module provides a lightweight adapter that:
 * 1. Creates and manages the <dice-roller> Lit component
 * 2. Handles events between the component and the main app
 * 3. Loads chunks into the component when switching to dice view
 * 
 * The actual UI is implemented in the Lit component at ../components/dice-roller.js
 */

import { DiceRoller } from '../components/dice-roller.js';

export class DiceUIAdapter {
  constructor(chat) {
    this.chat = chat;
    this.component = null;
    this.container = null;
    this._chunkHandler = null;
  }

  /**
   * Initialize the dice UI for a session
   */
  init(sessionId) {
    this.container = document.getElementById('dice-view');
    if (!this.container) {
      console.error('[DiceUI] Container #dice-view not found');
      return;
    }

    // Clear existing content
    this.container.innerHTML = '';

    // Create the Lit component
    this.component = document.createElement('dice-roller');
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
      const { chunk, sessionId: chunkSessionId, uiMode } = e.detail;
      console.log('[DiceUI] Received chunk event:', { chunkSessionId, uiMode, annotation: chunk?.annotations?.['dice.notation'] });
      // Only filter by sessionId - uiMode might change during streaming
      if (chunkSessionId === sessionId && this.component) {
        console.log('[DiceUI] Passing chunk to component');
        this.component.handleChunk(chunk);
      }
    };
    document.addEventListener('rxcafe:chunk', this._chunkHandler);
  }

  /**
   * Clean up the dice UI
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
    this.component.addEventListener('dice-switch-ui', (e) => {
      if (e.detail.mode === 'chat' && this.chat) {
        this.chat.switchUIMode('chat');
      }
    });

    // Handle roll event (for logging/debugging)
    this.component.addEventListener('dice-roll', (e) => {
      console.log('[DiceUI] Roll requested:', e.detail.notation);
    });

    // Handle other events as needed
    this.component.addEventListener('dice-toggle-llm', (e) => {
      console.log('[DiceUI] LLM comments:', e.detail.enabled ? 'on' : 'off');
    });

    this.component.addEventListener('dice-clear', () => {
      console.log('[DiceUI] History cleared');
    });
  }

  /**
   * Handle a chunk (called directly for initial load)
   * @deprecated Use the event-based approach via rxcafe:chunk
   */
  handleChunk(chunk) {
    if (this.component) {
      this.component.handleChunk(chunk);
    }
  }
}

// Export for module usage
window.DiceUIAdapter = DiceUIAdapter;
