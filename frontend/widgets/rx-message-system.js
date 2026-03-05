import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3/+esm';

export class RxMessageSystem extends LitElement {
  static properties = {
    content: { type: String },
    chunkId: { type: String },
    type: { type: String } // 'system', 'system-prompt', 'error'
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
      margin-left: auto;
      margin-right: auto;
      text-align: center;
    }
    
    @keyframes fadeIn { 
      from { opacity: 0; transform: translateY(10px); } 
      to { opacity: 1; transform: translateY(0); } 
    }
    
    .message.system {
      color: var(--text-secondary, #6b7280);
      font-size: 0.875rem;
    }
    
     .message.system-prompt {
       background-color: var(--color-system-prompt, #fef3c7);
       border: 1px solid var(--web-border-default, #fcd34d);
       color: var(--text-color, #1f2937);
     }
    
    .system-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      font-weight: 500;
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--text-secondary, #6b7280);
    }
    
    .message-content {
      white-space: pre-wrap;
      word-wrap: break-word;
      line-height: 1.5;
    }
    
    .error-message {
      color: #dc2626;
      font-size: 0.875rem;
    }
  `;

  constructor() {
    super();
    this.content = '';
    this.chunkId = '';
    this.type = 'system';
  }

  render() {
    const isError = this.type === 'error';
    const isSystemPrompt = this.type === 'system-prompt';
    
    return html`
      <div class="message ${this.type}" data-chunk-id=${this.chunkId}>
        ${isSystemPrompt ? html`
          <div class="system-header">
            <span>⚙️</span>
            <span>System Prompt</span>
          </div>
        ` : ''}
        <div class="message-content ${isError ? 'error-message' : ''}">${this.content}</div>
      </div>
    `;
  }
}

customElements.define('rx-message-system', RxMessageSystem);
