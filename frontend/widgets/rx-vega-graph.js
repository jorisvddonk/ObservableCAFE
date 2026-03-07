import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3/+esm';

export class RxVegaGraph extends LitElement {
  static properties = {
    spec: { type: Object },
    chunkId: { type: String },
    title: { type: String }
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
      border-left: 4px solid #8b5cf6;
      background-color: #f5f3ff;
    }
    
    @keyframes fadeIn { 
      from { opacity: 0; transform: translateY(10px); } 
      to { opacity: 1; transform: translateY(0); } 
    }
    
    .graph-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid var(--border-color, #e5e7eb);
    }
    
    .graph-icon {
      font-size: 1.2rem;
    }
    
    .graph-title {
      font-weight: 600;
      font-size: 0.9rem;
      color: #8b5cf6;
    }
    
    .graph-container {
      width: 100%;
      min-height: 300px;
      margin-top: 0.5rem;
      border-radius: 0.5rem;
      overflow: hidden;
    }
    
    .graph-container vega-embed {
      width: 100%;
    }
    
    .error-message {
      padding: 1rem;
      background-color: rgba(239, 68, 68, 0.1);
      border: 1px solid #ef4444;
      border-radius: 0.5rem;
      color: #ef4444;
      font-size: 0.875rem;
    }
    
    /* Dark theme support */
    @media (prefers-color-scheme: dark) {
      .message {
        background-color: #1e1b4b;
        border-left-color: #a78bfa;
      }
      
      .graph-title {
        color: #a78bfa;
      }
    }
    
    /* Responsive */
    @media (max-width: 768px) {
      .graph-container {
        min-height: 250px;
      }
    }
    
    @media (max-width: 480px) {
      .message {
        max-width: 95%;
      }
      
      .graph-container {
        min-height: 200px;
      }
    }
  `;

  constructor() {
    super();
    this.spec = null;
    this.chunkId = '';
    this.title = 'Vega Graph';
    this._embedLoaded = false;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._initialData) {
      this.spec = this._initialData.spec;
      this.chunkId = this._initialData.chunkId;
      this.title = this._initialData.title || 'Vega Graph';
      delete this._initialData;
    }
    this._loadVegaEmbed();
  }

  async _loadVegaEmbed() {
    if (this._embedLoaded) return;
    
    try {
      if (!window.vegaEmbed) {
        await new Promise((resolve, reject) => {
          const vegaScript = document.createElement('script');
          vegaScript.src = 'https://cdn.jsdelivr.net/npm/vega@5/build/vega.min.js';
          vegaScript.onload = () => {
            const vlScript = document.createElement('script');
            vlScript.src = 'https://cdn.jsdelivr.net/npm/vega-lite@5/build/vega-lite.min.js';
            vlScript.onload = () => {
              const embedScript = document.createElement('script');
              embedScript.src = 'https://cdn.jsdelivr.net/npm/vega-embed@6/build/vega-embed.min.js';
              embedScript.onload = resolve;
              embedScript.onerror = reject;
              document.head.appendChild(embedScript);
            };
            vlScript.onerror = reject;
            document.head.appendChild(vlScript);
          };
          vegaScript.onerror = reject;
          document.head.appendChild(vegaScript);
        });
      }
      this._embedLoaded = true;
      this.requestUpdate();
    } catch (e) {
      console.error('[RXCAFE] Failed to load Vega Embed:', e);
    }
  }

  updated(changedProperties) {
    if (changedProperties.has('spec') && this.spec && this._embedLoaded) {
      this._renderGraph();
    }
  }

  async _renderGraph() {
    const container = this.shadowRoot?.querySelector('#vega-container');
    if (!container || !window.vegaEmbed) return;

    try {
      container.innerHTML = '';
      const embed = window.vegaEmbed;
      await embed(container, this.spec, {
        actions: false,
        renderer: 'svg',
        theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default'
      });
    } catch (e) {
      console.error('[RXCAFE] Vega render error:', e);
      container.innerHTML = `<div class="error-message">Failed to render graph: ${e.message}</div>`;
    }
  }

  _onContextMenu(e) {
    e.preventDefault();
    this.dispatchEvent(new CustomEvent('vega-contextmenu', {
      bubbles: true,
      composed: true,
      detail: { chunkId: this.chunkId, originalEvent: e }
    }));
  }

  render() {
    return html`
      <div class="message" data-chunk-id=${this.chunkId} @contextmenu=${this._onContextMenu}>
        <div class="graph-header">
          <span class="graph-icon">📈</span>
          <div class="graph-title">${this.title}</div>
        </div>
        <div class="graph-container" id="vega-container">
          ${!this._embedLoaded ? html`<div style="padding: 1rem; color: var(--text-secondary, #6b7280);">Loading graph...</div>` : ''}
        </div>
      </div>
    `;
  }
}

customElements.define('rx-vega-graph', RxVegaGraph);
