import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3/+esm';

export class RxMessageImage extends LitElement {
  static properties = {
    role: { type: String, reflect: true },
    src: { type: String },
    alt: { type: String },
    description: { type: String },
    chunkId: { type: String }
  };

  static styles = css`
    :host {
      display: block;
    }
    
    :host([role="user"]) {
      align-self: flex-end;
    }
    
    :host([role="assistant"]) {
      align-self: flex-start;
    }
    
    :host([role="user"]) {
      align-self: flex-end;
    }
    
    :host([role="assistant"]) {
      align-self: flex-start;
    }
    
    .message {
      max-width: 80%;
      padding: 0.5rem;
      border-radius: 1rem;
      animation: fadeIn 0.2s ease-out;
    }
    
    @keyframes fadeIn { 
      from { opacity: 0; transform: translateY(10px); } 
      to { opacity: 1; transform: translateY(0); } 
    }
    
    .message.user { 
      align-self: flex-end; 
      background-color: var(--user-bubble, #3b82f6); 
      color: var(--user-text, white); 
      border-bottom-right-radius: 0.25rem; 
    }
    
    .message.assistant { 
      align-self: flex-start; 
      background-color: var(--assistant-bubble, #f3f4f6); 
      color: var(--assistant-text, #1f2937); 
      border-bottom-left-radius: 0.25rem; 
    }
    
    .message-content {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      white-space: pre-wrap;
      word-wrap: break-word;
      line-height: 1.5;
    }
    
    img {
      max-width: 100%;
      border-radius: 0.5rem;
      display: block;
    }
    
    .caption {
      font-size: 0.875rem;
      opacity: 0.8;
    }
  `;

  constructor() {
    super();
    this.role = 'assistant';
    this.src = '';
    this.alt = 'Image';
    this.description = '';
    this.chunkId = '';
  }

  render() {
    return html`
      <div class="message ${this.role}" data-chunk-id=${this.chunkId}>
        <div class="message-content">
          <img src=${this.src} alt=${this.alt}>
          ${this.description ? html`<div class="caption">${this.description}</div>` : ''}
        </div>
      </div>
    `;
  }
}

customElements.define('rx-message-image', RxMessageImage);
