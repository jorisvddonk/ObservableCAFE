import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3/+esm';

export class RxMessageWeb extends LitElement {
  static properties = {
    content: { type: String },
    sourceUrl: { type: String },
    trusted: { type: Boolean },
    chunkId: { type: String }
  };

  static styles = css`
    :host {
      display: block;
    }
    
    .message {
      max-width: 80%;
      padding: 1rem 1.25rem;
      border-radius: 1rem;
      animation: fadeIn 0.2s ease-out;
      align-self: flex-start;
      border-left: 4px solid var(--web-border-default, #e5e7eb);
      background-color: var(--web-bg-default, #f9fafb);
    }
    
    @keyframes fadeIn { 
      from { opacity: 0; transform: translateY(10px); } 
      to { opacity: 1; transform: translateY(0); } 
    }
    
    .message.trusted {
      border-left-color: var(--web-border-trusted, #10b981);
      background-color: var(--web-bg-trusted, #d1fae5);
    }
    
    .message.untrusted {
      border-left-color: var(--web-border-untrusted, #ef4444);
      background-color: var(--web-bg-untrusted, #fee2e2);
    }
    
    .web-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border-color, #e5e7eb);
      flex-wrap: wrap;
    }
    
    .web-source {
      font-size: 0.75rem;
      color: var(--text-secondary, #6b7280);
      font-weight: 500;
      flex: 1;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .trust-badge {
      font-size: 0.625rem;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    
    .trust-badge.trusted {
      background-color: #10b981;
      color: white;
    }
    
    .trust-badge.untrusted {
      background-color: #ef4444;
      color: white;
    }
    
    .trust-toggle {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border: 1px solid var(--border-color, #e5e7eb);
      background-color: var(--surface-color, white);
      color: var(--text-color, #1f2937);
      border-radius: 0.25rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    
    .trust-toggle:hover {
      background-color: var(--bg-color, #f9fafb);
      border-color: var(--primary-color, #3b82f6);
    }
    
    .message-content {
      white-space: pre-wrap;
      word-wrap: break-word;
      line-height: 1.5;
    }
  `;

  constructor() {
    super();
    this.content = '';
    this.sourceUrl = '';
    this.trusted = false;
    this.chunkId = '';
  }

  _handleTrustToggle() {
    this.dispatchEvent(new CustomEvent('trust-toggle', {
      detail: { chunkId: this.chunkId, trusted: !this.trusted },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    return html`
      <div class="message ${this.trusted ? 'trusted' : 'untrusted'}" data-chunk-id=${this.chunkId}>
        <div class="web-header">
          <span class="web-source">Web: ${this.sourceUrl}</span>
          <span class="trust-badge ${this.trusted ? 'trusted' : 'untrusted'}">
            ${this.trusted ? 'Trusted' : 'Untrusted'}
          </span>
          <button class="trust-toggle" @click=${this._handleTrustToggle}>
            ${this.trusted ? 'Untrust' : 'Trust'}
          </button>
        </div>
        <div class="message-content">${this.content}</div>
      </div>
    `;
  }
}

customElements.define('rx-message-web', RxMessageWeb);
