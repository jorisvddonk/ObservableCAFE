import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3/+esm';

export class RxQuickResponses extends LitElement {
  static properties = {
    responses: { type: Array },
    disabled: { type: Boolean }
  };

  static styles = css`
    :host {
      display: block;
      margin-top: 0.5rem;
    }

    .quick-responses {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .quick-response-btn {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 1rem;
      border: 1px solid var(--border-color, #e5e7eb);
      background-color: var(--surface-color, #ffffff);
      color: var(--text-color, #1f2937);
      cursor: pointer;
      transition: all 150ms ease-in-out;
    }

    :host([disabled]) .quick-response-btn {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .quick-response-btn:hover:not(:disabled) {
      background-color: var(--primary-color, #2563eb);
      color: var(--user-text, #ffffff);
      border-color: var(--primary-color, #2563eb);
    }

    .quick-response-btn:active:not(:disabled) {
      transform: scale(0.95);
    }
  `;

  constructor() {
    super();
    this.responses = [];
    this.disabled = false;
  }

  _handleResponse(response) {
    if (this.disabled) return;
    
    this.dispatchEvent(new CustomEvent('quick-response', {
      detail: { response },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    if (!this.responses || this.responses.length === 0) {
      return html``;
    }

    return html`
      <div class="quick-responses">
        ${this.responses.map(response => html`
          <button 
            class="quick-response-btn" 
            @click=${() => this._handleResponse(response)}
            ?disabled=${this.disabled}
          >${response}</button>
        `)}
      </div>
    `;
  }
}

customElements.define('rx-quick-responses', RxQuickResponses);
