import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3/+esm';

export class RxMessageCode extends LitElement {
  static properties = {
    role: { type: String, reflect: true },
    content: { type: String },
    language: { type: String },
    filename: { type: String },
    chunkId: { type: String }
  };

  static styles = css`
    :host {
      display: block;
      align-self: flex-start;
      max-width: 90%;
    }
    
    :host([role="user"]) {
      align-self: flex-end;
    }
    
    .code-container {
      background-color: var(--assistant-bubble, #f3f4f6);
      color: var(--assistant-text, #1f2937);
      border-radius: 1rem;
      border-bottom-left-radius: 0.25rem;
      overflow: hidden;
      animation: fadeIn 0.2s ease-out;
    }
    
    :host([role="user"]) .code-container {
      background-color: var(--user-bubble, #3b82f6);
      color: var(--user-text, white);
      border-bottom-left-radius: 1rem;
      border-bottom-right-radius: 0.25rem;
    }
    
    @keyframes fadeIn { 
      from { opacity: 0; transform: translateY(10px); } 
      to { opacity: 1; transform: translateY(0); } 
    }
    
    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0.75rem;
      background-color: rgba(0, 0, 0, 0.05);
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      font-size: 0.8rem;
    }
    
    :host([role="user"]) .code-header {
      background-color: rgba(0, 0, 0, 0.1);
      border-bottom-color: rgba(0, 0, 0, 0.2);
    }
    
    .code-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .code-language {
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.7rem;
      padding: 0.125rem 0.375rem;
      background-color: rgba(0, 0, 0, 0.1);
      border-radius: 0.25rem;
    }
    
    .code-filename {
      font-family: monospace;
      opacity: 0.8;
    }
    
    .code-actions {
      display: flex;
      gap: 0.25rem;
    }
    
    .code-action-btn {
      background: none;
      border: none;
      padding: 0.25rem 0.5rem;
      cursor: pointer;
      border-radius: 0.25rem;
      font-size: 0.8rem;
      opacity: 0.7;
      transition: opacity 0.15s, background-color 0.15s;
    }
    
    .code-action-btn:hover {
      opacity: 1;
      background-color: rgba(0, 0, 0, 0.1);
    }
    
    .code-wrapper {
      overflow-x: auto;
      max-height: 500px;
    }
    
    pre {
      margin: 0;
      padding: 1rem;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
      font-size: 0.85rem;
      line-height: 1.5;
      tab-size: 2;
      white-space: pre;
      word-wrap: normal;
    }
    
    code {
      font-family: inherit;
    }
    
    /* Syntax highlighting colors - light theme */
    .keyword { color: #d73a49; font-weight: bold; }
    .string { color: #032f62; }
    .comment { color: #6a737d; font-style: italic; }
    .number { color: #005cc5; }
    .function { color: #6f42c1; }
    .operator { color: #d73a49; }
    .tag { color: #22863a; }
    .attr { color: #6f42c1; }
    
    :host([role="user"]) .keyword,
    :host([role="user"]) .operator { color: #ffcccb; }
    :host([role="user"]) .string { color: #90ee90; }
    :host([role="user"]) .comment { color: #cccccc; }
    :host([role="user"]) .number { color: #87ceeb; }
    :host([role="user"]) .function { color: #dda0dd; }
    :host([role="user"]) .tag { color: #98fb98; }
    :host([role="user"]) .attr { color: #dda0dd; }
    
    .line-numbers {
      display: table;
      width: 100%;
    }
    
    .line-row {
      display: table-row;
    }
    
    .line-num {
      display: table-cell;
      text-align: right;
      padding: 0 0.75rem;
      color: var(--text-secondary, #6b7280);
      background-color: rgba(0, 0, 0, 0.02);
      border-right: 1px solid rgba(0, 0, 0, 0.1);
      user-select: none;
      min-width: 2.5rem;
    }
    
    .line-content {
      display: table-cell;
      padding: 0 0.75rem;
    }
    
    .copied-toast {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background-color: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s;
    }
    
    .copied-toast.show {
      opacity: 1;
    }
  `;

  constructor() {
    super();
    this.role = 'assistant';
    this.content = '';
    this.language = '';
    this.filename = '';
    this.chunkId = '';
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _highlightCode(code, lang) {
    let highlighted = this._escapeHtml(code);
    
    const patterns = {
      comment: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|<!--[\s\S]*?-->)/g,
      string: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
      number: /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g,
      keyword: /\b(?:function|const|let|var|if|else|for|while|return|import|export|class|interface|type|async|await|try|catch|throw|new|this|typeof|instanceof|switch|case|break|continue|default|in|of|from|as)\b/g,
      function: /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?=\()/g,
      operator: /[{}\[\];(),.:+-/*%=<>!&|^~?]/g,
      tag: /(&lt;\/?[a-zA-Z][a-zA-Z0-9-]*)/g,
      attr: /\b([a-zA-Z-]+)(?==)/g
    };
    
    // Simple highlighting - replace in order of priority
    const tokens = [];
    let lastIndex = 0;
    
    // Find all matches
    for (const [type, pattern] of Object.entries(patterns)) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(code)) !== null) {
        tokens.push({
          type,
          start: match.index,
          end: match.index + match[0].length,
          text: match[0]
        });
      }
    }
    
    // Sort by position
    tokens.sort((a, b) => a.start - b.start);
    
    // Remove overlapping tokens
    const filtered = [];
    for (const token of tokens) {
      if (filtered.length === 0 || token.start >= filtered[filtered.length - 1].end) {
        filtered.push(token);
      }
    }
    
    // Rebuild with highlighting
    let result = '';
    lastIndex = 0;
    for (const token of filtered) {
      result += this._escapeHtml(code.slice(lastIndex, token.start));
      result += `<span class="${token.type}">${this._escapeHtml(token.text)}</span>`;
      lastIndex = token.end;
    }
    result += this._escapeHtml(code.slice(lastIndex));
    
    return result || highlighted;
  }

  _renderWithLineNumbers(code) {
    const lines = code.split('\n');
    const highlighted = this._highlightCode(code, this.language);
    const highlightedLines = highlighted.split('\n');
    
    return lines.map((line, i) => html`
      <div class="line-row">
        <span class="line-num">${i + 1}</span>
        <span class="line-content">${highlightedLines[i] || ''}</span>
      </div>
    `);
  }

  _copyToClipboard() {
    navigator.clipboard.writeText(this.content).then(() => {
      const toast = this.shadowRoot.querySelector('.copied-toast');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1500);
    });
  }

  _onContextMenu(e) {
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('code-contextmenu', {
      detail: { originalEvent: e, chunkId: this.chunkId },
      bubbles: true,
      composed: true
    }));
  }

  render() {
    const displayLang = this.language || 'text';
    
    return html`
      <div class="code-container" @contextmenu=${this._onContextMenu}>
        <div class="code-header">
          <div class="code-meta">
            <span class="code-language">${displayLang}</span>
            ${this.filename ? html`<span class="code-filename">${this.filename}</span>` : ''}
          </div>
          <div class="code-actions">
            <button class="code-action-btn" @click=${this._copyToClipboard} title="Copy code">
              📋 Copy
            </button>
          </div>
        </div>
        <div class="code-wrapper">
          <pre><code class="line-numbers">${this._renderWithLineNumbers(this.content)}</code></pre>
        </div>
        <div class="copied-toast">Copied!</div>
      </div>
    `;
  }
}

customElements.define('rx-message-code', RxMessageCode);