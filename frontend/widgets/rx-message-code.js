import { LitElement, html, css } from 'https://esm.sh/lit@3.3.2';
import { unsafeHTML } from 'https://esm.sh/lit@3.3.2/directives/unsafe-html.js';

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
      background: transparent;
    }
    
    code {
      font-family: inherit;
      background: transparent;
    }
    
    /* Prism token colors - light theme */
    :host-context(.light) .token.comment,
    :host-context(.light) .token.prolog,
    :host-context(.light) .token.doctype,
    :host-context(.light) .token.cdata { color: #6a737d; }
    
    :host-context(.light) .token.punctuation { color: #24292e; }
    
    :host-context(.light) .token.property,
    :host-context(.light) .token.tag,
    :host-context(.light) .token.boolean,
    :host-context(.light) .token.number,
    :host-context(.light) .token.constant,
    :host-context(.light) .token.symbol { color: #005cc5; }
    
    :host-context(.light) .token.selector,
    :host-context(.light) .token.attr-name,
    :host-context(.light) .token.string,
    :host-context(.light) .token.char,
    :host-context(.light) .token.builtin { color: #032f62; }
    
    :host-context(.light) .token.operator,
    :host-context(.light) .token.entity,
    :host-context(.light) .token.url,
    :host-context(.light) .language-css .token.string,
    :host-context(.light) .style .token.string { color: #d73a49; }
    
    :host-context(.light) .token.atrule,
    :host-context(.light) .token.attr-value,
    :host-context(.light) .token.keyword { color: #d73a49; }
    
    :host-context(.light) .token.function,
    :host-context(.light) .token.class-name { color: #6f42c1; }
    
    :host-context(.light) .token.regex,
    :host-context(.light) .token.important,
    :host-context(.light) .token.variable { color: #e36209; }
    
    /* Dark theme */
    :host-context(.dark) .token.comment,
    :host-context(.dark) .token.prolog,
    :host-context(.dark) .token.doctype,
    :host-context(.dark) .token.cdata { color: #8b949e; }
    
    :host-context(.dark) .token.punctuation { color: #c9d1d9; }
    
    :host-context(.dark) .token.property,
    :host-context(.dark) .token.tag,
    :host-context(.dark) .token.boolean,
    :host-context(.dark) .token.number,
    :host-context(.dark) .token.constant,
    :host-context(.dark) .token.symbol { color: #79c0ff; }
    
    :host-context(.dark) .token.selector,
    :host-context(.dark) .token.attr-name,
    :host-context(.dark) .token.string,
    :host-context(.dark) .token.char,
    :host-context(.dark) .token.builtin { color: #a5d6ff; }
    
    :host-context(.dark) .token.operator,
    :host-context(.dark) .token.entity,
    :host-context(.dark) .token.url,
    :host-context(.dark) .language-css .token.string,
    :host-context(.dark) .style .token.string { color: #ff7b72; }
    
    :host-context(.dark) .token.atrule,
    :host-context(.dark) .token.attr-value,
    :host-context(.dark) .token.keyword { color: #ff7b72; }
    
    :host-context(.dark) .token.function,
    :host-context(.dark) .token.class-name { color: #d2a8ff; }
    
    :host-context(.dark) .token.regex,
    :host-context(.dark) .token.important,
    :host-context(.dark) .token.variable { color: #ffa657; }
    
    /* User role - override colors */
    :host([role="user"]) .token.comment { color: #aaaaaa; }
    :host([role="user"]) .token.string { color: #a8e6cf; }
    :host([role="user"]) .token.number { color: #88d8b0; }
    :host([role="user"]) .token.keyword { color: #ff8b94; }
    :host([role="user"]) .token.function { color: #d4a5ff; }
    :host([role="user"]) .token.operator { color: #ffccbc; }
    
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
    const languageMap = {
      'js': 'javascript',
      'ts': 'typescript',
      'py': 'python',
      'sh': 'bash',
      'shell': 'bash',
      'yml': 'yaml',
      'html': 'markup',
      'xml': 'markup'
    };
    
    const prismLang = languageMap[lang] || lang || 'plaintext';
    
    if (Prism.languages[prismLang]) {
      return Prism.highlight(code, Prism.languages[prismLang], prismLang);
    }
    
    return this._escapeHtml(code);
  }

  _renderWithLineNumbers(code) {
    const lines = code.split('\n');
    const highlighted = this._highlightCode(code, this.language);
    const highlightedLines = highlighted.split('\n');
    
    return lines.map((line, i) => html`
      <div class="line-row">
        <span class="line-num">${i + 1}</span>
        <span class="line-content">${unsafeHTML(highlightedLines[i] || '')}</span>
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