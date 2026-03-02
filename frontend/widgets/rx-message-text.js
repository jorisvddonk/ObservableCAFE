import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3/+esm';

export class RxMessageText extends LitElement {
  static properties = {
    role: { type: String, reflect: true },
    content: { type: String },
    chunkId: { type: String },
    annotations: { type: Object },
    pending: { type: Boolean },
    streaming: { type: Boolean }
  };

  _getSentimentDisplay() {
    const sentiment = this.annotations?.['com.rxcafe.example.sentiment'];
    if (!sentiment) return null;
    const score = parseFloat(sentiment.score) || 0;
    const emoji = score > 0.3 ? '😊' : (score < -0.3 ? '☹️' : '😐');
    return `Sentiment: ${emoji} (${score.toFixed(2)}) - ${sentiment.explanation}`;
  }

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
    
    .message {
      max-width: 80%;
      padding: 1rem 1.25rem;
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
    
    .message.streaming { 
      border-left: 3px solid var(--primary-color, #3b82f6); 
    }
    
    .message-content { 
      white-space: normal;
      word-wrap: break-word; 
      line-height: 1.5; 
    }
    
    .message-body {
      white-space: pre-wrap;
    }
    
    .message-body code {
      background-color: rgba(0, 0, 0, 0.1);
      padding: 0.125rem 0.25rem;
      border-radius: 0.25rem;
      font-family: monospace;
    }
    
    .message.assistant .message-body code {
      background-color: rgba(0, 0, 0, 0.05);
    }
    
    .loading-indicator {
      display: inline-flex;
      gap: 0.25rem;
      padding: 0.5rem;
    }
    
    .loading-indicator span {
      width: 0.5rem;
      height: 0.5rem;
      background-color: currentColor;
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out both;
    }
    
    .loading-indicator span:nth-child(1) { animation-delay: -0.32s; }
    .loading-indicator span:nth-child(2) { animation-delay: -0.16s; }
    
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }
    
    :host([streaming]) .message-body::after {
      content: '▊';
      animation: blink 1s infinite;
    }
    
    @keyframes blink {
      0%, 50% { opacity: 1; }
      51%, 100% { opacity: 0; }
    }
    
    .message-meta {
      font-size: 0.7rem;
      margin-top: 0.4rem;
      padding: 0.4rem;
      background-color: rgba(0,0,0,0.05);
      border-radius: 0.25rem;
    }
    
    .telegram-label {
      font-size: 0.65rem;
      margin-top: 0.2rem;
      font-style: italic;
      text-align: right;
      opacity: 0.8;
    }

    .message-body table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.5rem 0;
      font-size: 0.9rem;
    }

    .message-body table th,
    .message-body table td {
      border: 1px solid var(--table-border-color, #d1d5db);
      padding: 0.5rem 0.75rem;
      text-align: left;
    }

    .message-body table th {
      font-weight: 600;
    }

    .message-body table tr:hover {
      background-color: rgba(0, 0, 0, 0.05);
    }

    .message-body thead {
      border-bottom: 2px solid var(--table-border-color, #d1d5db);
    }
  `;

  constructor() {
    super();
    this.role = 'assistant';
    this.content = '';
    this.chunkId = '';
    this.annotations = {};
    this.pending = false;
    this.streaming = false;
  }

  renderMessageBody() {
    const content = this.content || '';
    if (this.annotations?.['parsers.markdown.enabled'] && typeof marked !== 'undefined') {
      return html`<div class="message-body" .innerHTML=${marked.parse(content)}></div>`;
    }
    return html`<div class="message-body">${content}</div>`;
  }

  _renderToolCallIndicators() {
    const toolCalls = this.annotations?.['toolCallIndicators'] || [];
    if (!toolCalls.length) return '';
    
    return toolCalls.map(toolCall => {
      let paramsText = '';
      if (toolCall.parameters && Object.keys(toolCall.parameters).length > 0) {
        paramsText = ` → ${JSON.stringify(toolCall.parameters)}`;
      }
      return html`
        <div class="tool-call-indicator" style="font-size: 0.7rem; margin-top: 0.4rem; padding: 0.4rem; background-color: rgba(139, 92, 246, 0.1); border-radius: 0.25rem; color: #8b5cf6; display: flex; align-items: center; gap: 0.25rem;">
          <span>🔧</span>${toolCall.name}${paramsText}
        </div>
      `;
    });
  }

  render() {
    const sentimentDisplay = this._getSentimentDisplay();
    const isTelegram = this.annotations?.['client.type'] === 'telegram';
    const streamingClass = this.streaming ? 'streaming' : '';

    return html`
      <div class="message ${this.role} ${streamingClass}" data-chunk-id=${this.chunkId}>
        <div class="message-content">
          ${this.pending && !this.content ? html`
            <div class="loading-indicator">
              <span></span><span></span><span></span>
            </div>
          ` : this.renderMessageBody()}
          ${sentimentDisplay ? html`<div class="message-meta sentiment-meta">${sentimentDisplay}</div>` : ''}
          ${this._renderToolCallIndicators()}
          ${isTelegram ? html`<div class="message-meta telegram-label">via Telegram</div>` : ''}
        </div>
      </div>
    `;
  }
}

customElements.define('rx-message-text', RxMessageText);
