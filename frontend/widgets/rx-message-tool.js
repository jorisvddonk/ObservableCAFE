import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3/+esm';

export class RxMessageTool extends LitElement {
  static properties = {
    toolName: { type: String },
    toolResult: { type: String },
    toolCalls: { type: Array },
    content: { type: String },
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
      background-color: var(--assistant-bubble, #f3f4f6);
      border: 1px solid var(--border-color, #e5e7eb);
    }
    
    @keyframes fadeIn { 
      from { opacity: 0; transform: translateY(10px); } 
      to { opacity: 1; transform: translateY(0); } 
    }
    
    .tool-call-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }
    
    .tool-icon {
      font-size: 1rem;
    }
    
    .tool-name {
      color: var(--text-color, #1f2937);
    }
    
    .tool-params {
      font-family: monospace;
      font-size: 0.75rem;
      background-color: rgba(0, 0, 0, 0.05);
      padding: 0.5rem;
      border-radius: 0.25rem;
      margin-bottom: 0.5rem;
      white-space: pre-wrap;
      overflow-x: auto;
    }
    
    .tool-result {
      font-family: monospace;
      font-size: 0.75rem;
      background-color: rgba(139, 92, 246, 0.1);
      padding: 0.5rem;
      border-radius: 0.25rem;
      white-space: pre-wrap;
      overflow-x: auto;
    }
    
    .message-body {
      margin-top: 0.5rem;
      white-space: pre-wrap;
      word-wrap: break-word;
      line-height: 1.5;
    }
    
    .tool-call-indicator {
      font-size: 0.7rem;
      margin-top: 0.4rem;
      padding: 0.4rem;
      background-color: rgba(139, 92, 246, 0.1);
      border-radius: 0.25rem;
      color: #8b5cf6;
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
  `;

  constructor() {
    super();
    this.toolName = '';
    this.toolResult = '';
    this.toolCalls = [];
    this.content = '';
    this.chunkId = '';
  }

  render() {
    return html`
      <div class="message" data-chunk-id=${this.chunkId}>
        <div class="tool-call-header">
          <span class="tool-icon">🔧</span>
          <span class="tool-name">${this.toolName || 'Unknown Tool'}</span>
        </div>
        
        ${this.toolCalls?.length > 0 ? html`
          <div class="tool-params">${JSON.stringify(this.toolCalls[0].parameters, null, 2)}</div>
        ` : ''}
        
        ${this.toolResult ? html`
          <div class="tool-result">${typeof this.toolResult === 'object' ? JSON.stringify(this.toolResult, null, 2) : this.toolResult}</div>
        ` : ''}
        
        ${this.content ? html`
          <div class="message-body">${this.content}</div>
        ` : ''}
      </div>
    `;
  }
}

customElements.define('rx-message-tool', RxMessageTool);
