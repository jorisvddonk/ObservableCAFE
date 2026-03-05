import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3/+esm';

export class RxMessageDiff extends LitElement {
  static properties = {
    role: { type: String, reflect: true },
    oldContent: { type: String },
    newContent: { type: String },
    oldFilename: { type: String },
    newFilename: { type: String },
    language: { type: String },
    diffType: { type: String },
    chunkId: { type: String }
  };

  static styles = css`
    :host {
      display: block;
      align-self: flex-start;
      max-width: 95%;
    }
    
    :host([role="user"]) {
      align-self: flex-end;
    }
    
    .diff-container {
      background-color: var(--assistant-bubble, #f3f4f6);
      color: var(--assistant-text, #1f2937);
      border-radius: 1rem;
      border-bottom-left-radius: 0.25rem;
      overflow: hidden;
      animation: fadeIn 0.2s ease-out;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
    }
    
    :host([role="user"]) .diff-container {
      background-color: var(--user-bubble, #3b82f6);
      color: var(--user-text, white);
      border-bottom-left-radius: 1rem;
      border-bottom-right-radius: 0.25rem;
    }
    
    @keyframes fadeIn { 
      from { opacity: 0; transform: translateY(10px); } 
      to { opacity: 1; transform: translateY(0); } 
    }
    
    .diff-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.5rem 0.75rem;
      background-color: rgba(0, 0, 0, 0.05);
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      font-size: 0.8rem;
    }
    
    .diff-meta {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }
    
    .diff-filename {
      font-weight: 600;
      font-family: monospace;
    }
    
    .diff-stats {
      display: flex;
      gap: 0.5rem;
      font-size: 0.7rem;
    }
    
    .stat-added {
      color: #16a34a;
      font-weight: 600;
    }
    
    .stat-removed {
      color: #dc2626;
      font-weight: 600;
    }
    
    .diff-actions {
      display: flex;
      gap: 0.25rem;
    }
    
    .diff-action-btn {
      background: none;
      border: none;
      padding: 0.25rem 0.5rem;
      cursor: pointer;
      border-radius: 0.25rem;
      font-size: 0.8rem;
      opacity: 0.7;
      transition: opacity 0.15s, background-color 0.15s;
    }
    
    .diff-action-btn:hover {
      opacity: 1;
      background-color: rgba(0, 0, 0, 0.1);
    }
    
    .diff-wrapper {
      overflow-x: auto;
      max-height: 500px;
    }
    
    .diff-table {
      display: table;
      width: 100%;
      font-size: 0.85rem;
      line-height: 1.5;
    }
    
    .diff-row {
      display: table-row;
    }
    
    .diff-row:hover {
      background-color: rgba(0, 0, 0, 0.02);
    }
    
    .diff-gutter {
      display: table-cell;
      text-align: right;
      padding: 0.125rem 0.5rem;
      color: var(--text-secondary, #6b7280);
      background-color: rgba(0, 0, 0, 0.02);
      border-right: 1px solid rgba(0, 0, 0, 0.1);
      user-select: none;
      min-width: 2rem;
      font-size: 0.75rem;
    }
    
    .diff-gutter.old {
      border-right: none;
    }
    
    .diff-marker {
      display: table-cell;
      width: 1rem;
      text-align: center;
      user-select: none;
      font-weight: bold;
    }
    
     .diff-content {
       display: table-cell;
       padding: 0.125rem 0.5rem;
       white-space: pre;
       width: 100%;
       color: var(--assistant-text, #1f2937);
     }
    
     /* Line states */
     .diff-row.added {
       background-color: var(--diff-added-bg, #dcfce7);
     }
     
     .diff-row.added .diff-gutter {
       background-color: var(--diff-added-gutter, #bbf7d0);
     }
     
     .diff-row.added .diff-marker {
       color: var(--diff-added-text, #16a34a);
     }
     
     .diff-row.removed {
       background-color: var(--diff-removed-bg, #fee2e2);
     }
     
     .diff-row.removed .diff-gutter {
       background-color: var(--diff-removed-gutter, #fecaca);
     }
     
     .diff-row.removed .diff-marker {
       color: var(--diff-removed-text, #dc2626);
     }
     
     .diff-row.context {
       color: var(--text-secondary, #6b7280);
     }
     
     .diff-row.header {
       background-color: var(--diff-header-bg, #e0e7ff);
     }
     
     .diff-row.header .diff-content {
       color: var(--diff-header-text, #3730a3);
       font-weight: 600;
     }
    
    /* Split diff view */
    .split-diff {
      display: flex;
    }
    
    .split-panel {
      flex: 1;
      overflow-x: auto;
    }
    
    .split-panel.old {
      border-right: 2px solid rgba(0, 0, 0, 0.1);
    }
    
    .split-header {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      background-color: rgba(0, 0, 0, 0.05);
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    }
    
    .split-header.old {
      color: #dc2626;
    }
    
    .split-header.new {
      color: #16a34a;
    }
    
     /* Syntax highlighting in diff */
     .diff-content .keyword { color: var(--diff-keyword, #d73a49); font-weight: bold; }
     .diff-content .string { color: var(--diff-string, #032f62); }
     .diff-content .comment { color: var(--diff-comment, #6a737d); font-style: italic; }
     .diff-content .number { color: var(--diff-number, #005cc5); }
     .diff-content .function { color: var(--diff-function, #6f42c1); }
     
     .diff-row.added .diff-content .string { color: var(--diff-added-string, #047857); }
     .diff-row.removed .diff-content .string { color: var(--diff-removed-string, #991b1b); }
    
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
    this.oldContent = '';
    this.newContent = '';
    this.oldFilename = '';
    this.newFilename = '';
    this.language = '';
    this.diffType = 'unified';
    this.chunkId = '';
  }

  _computeDiff() {
    const oldLines = this.oldContent.split('\n');
    const newLines = this.newContent.split('\n');
    
    // Simple LCS-based diff
    const result = [];
    let oldIdx = 0;
    let newIdx = 0;
    
    // Use a simple approach: compare line by line
    while (oldIdx < oldLines.length || newIdx < newLines.length) {
      const oldLine = oldLines[oldIdx];
      const newLine = newLines[newIdx];
      
      if (oldIdx >= oldLines.length) {
        // Remaining lines are all added
        result.push({ type: 'added', oldNum: '', newNum: newIdx + 1, content: newLine });
        newIdx++;
      } else if (newIdx >= newLines.length) {
        // Remaining lines are all removed
        result.push({ type: 'removed', oldNum: oldIdx + 1, newNum: '', content: oldLine });
        oldIdx++;
      } else if (oldLine === newLine) {
        // Lines match
        result.push({ type: 'context', oldNum: oldIdx + 1, newNum: newIdx + 1, content: oldLine });
        oldIdx++;
        newIdx++;
      } else {
        // Lines differ - check if it's a removal or addition
        // Look ahead to see if this old line appears later in new
        const oldLineInNew = newLines.indexOf(oldLine, newIdx);
        const newLineInOld = oldLines.indexOf(newLine, oldIdx);
        
        if (oldLineInNew === -1 || (newLineInOld !== -1 && newLineInOld < oldLineInNew)) {
          // This is a modification: remove old, add new
          result.push({ type: 'removed', oldNum: oldIdx + 1, newNum: '', content: oldLine });
          oldIdx++;
        } else {
          result.push({ type: 'added', oldNum: '', newNum: newIdx + 1, content: newLine });
          newIdx++;
        }
      }
    }
    
    return result;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _highlightLine(line) {
    // Simple syntax highlighting
    let highlighted = this._escapeHtml(line);
    
    // Keywords
    highlighted = highlighted.replace(
      /\b(function|const|let|var|if|else|for|while|return|import|export|class|interface|type|async|await)\b/g,
      '<span class="keyword">$1</span>'
    );
    
    // Strings
    highlighted = highlighted.replace(
      /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g,
      '<span class="string">$1</span>'
    );
    
    // Comments
    highlighted = highlighted.replace(
      /(\/\/[^\n]*)/g,
      '<span class="comment">$1</span>'
    );
    
    return highlighted;
  }

  _copyToClipboard() {
    const text = this.diffType === 'unified' 
      ? this._formatUnifiedDiff()
      : `--- ${this.oldFilename || 'old'}\n+++ ${this.newFilename || 'new'}\n${this.oldContent}\n${this.newContent}`;
    
    navigator.clipboard.writeText(text).then(() => {
      const toast = this.shadowRoot.querySelector('.copied-toast');
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1500);
    });
  }

  _formatUnifiedDiff() {
    const diff = this._computeDiff();
    let output = `--- ${this.oldFilename || 'old'}\n+++ ${this.newFilename || 'new'}\n`;
    
    for (const line of diff) {
      const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';
      output += prefix + line.content + '\n';
    }
    
    return output;
  }

  _onContextMenu(e) {
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('diff-contextmenu', {
      detail: { originalEvent: e, chunkId: this.chunkId },
      bubbles: true,
      composed: true
    }));
  }

  _renderUnifiedDiff() {
    const diff = this._computeDiff();
    
    const added = diff.filter(d => d.type === 'added').length;
    const removed = diff.filter(d => d.type === 'removed').length;
    
    return html`
      <div class="diff-container" @contextmenu=${this._onContextMenu}>
        <div class="diff-header">
          <div class="diff-meta">
            <span class="diff-filename">${this.newFilename || this.oldFilename || 'diff'}</span>
            <div class="diff-stats">
              <span class="stat-added">+${added}</span>
              <span class="stat-removed">-${removed}</span>
            </div>
          </div>
          <div class="diff-actions">
            <button class="diff-action-btn" @click=${this._copyToClipboard} title="Copy diff">
              📋 Copy
            </button>
          </div>
        </div>
        <div class="diff-wrapper">
          <div class="diff-table">
            ${diff.map(line => html`
              <div class="diff-row ${line.type}">
                <span class="diff-gutter old">${line.oldNum}</span>
                <span class="diff-gutter">${line.newNum}</span>
                <span class="diff-marker">
                  ${line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                <span class="diff-content">${this._highlightLine(line.content)}</span>
              </div>
            `)}
          </div>
        </div>
        <div class="copied-toast">Copied!</div>
      </div>
    `;
  }

  _renderSplitDiff() {
    const oldLines = this.oldContent.split('\n');
    const newLines = this.newContent.split('\n');
    
    return html`
      <div class="diff-container" @contextmenu=${this._onContextMenu}>
        <div class="diff-header">
          <div class="diff-meta">
            <span class="diff-filename">${this.newFilename || this.oldFilename || 'diff'}</span>
          </div>
          <div class="diff-actions">
            <button class="diff-action-btn" @click=${this._copyToClipboard} title="Copy diff">
              📋 Copy
            </button>
          </div>
        </div>
        <div class="split-diff">
          <div class="split-panel old">
            <div class="split-header old">${this.oldFilename || 'Old'}</div>
            <div class="diff-wrapper">
              <div class="diff-table">
                ${oldLines.map((line, i) => html`
                  <div class="diff-row">
                    <span class="diff-gutter">${i + 1}</span>
                    <span class="diff-content">${this._highlightLine(line)}</span>
                  </div>
                `)}
              </div>
            </div>
          </div>
          <div class="split-panel new">
            <div class="split-header new">${this.newFilename || 'New'}</div>
            <div class="diff-wrapper">
              <div class="diff-table">
                ${newLines.map((line, i) => html`
                  <div class="diff-row">
                    <span class="diff-gutter">${i + 1}</span>
                    <span class="diff-content">${this._highlightLine(line)}</span>
                  </div>
                `)}
              </div>
            </div>
          </div>
        </div>
        <div class="copied-toast">Copied!</div>
      </div>
    `;
  }

  render() {
    return this.diffType === 'split' 
      ? this._renderSplitDiff()
      : this._renderUnifiedDiff();
  }
}

customElements.define('rx-message-diff', RxMessageDiff);