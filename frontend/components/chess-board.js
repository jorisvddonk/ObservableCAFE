import { LitElement, html, css } from 'lit';

const PIECE_SYMBOLS = {
  'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔',
  'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚',
};

export class ChessBoard extends LitElement {
  static properties = {
    sessionId: { type: String },
    token: { type: String },
    apiBaseUrl: { type: String, attribute: 'api-base-url' },
    _fen: { state: true },
    _selectedSquare: { state: true },
    _possibleMoves: { state: true },
    _currentPlayer: { state: true },
    _gameOver: { state: true },
    _winner: { state: true },
    _moveHistory: { state: true },
    _isCheck: { state: true },
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--chess-bg, linear-gradient(135deg, #1a1a2e 0%, #16213e 100%));
      color: var(--chess-text, #fff);
      font-family: system-ui, -apple-system, sans-serif;
      overflow: hidden;
    }

    .chess-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .chess-header h2 {
      margin: 0;
      font-size: 1.5rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .chess-icon {
      font-size: 1.8rem;
    }

    .switch-btn {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: inherit;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .switch-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .game-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      overflow-y: auto;
    }

    .board-container {
      position: relative;
      margin: 20px 0;
    }

    .board {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      grid-template-rows: repeat(8, 1fr);
      width: min(80vw, 360px);
      height: min(80vw, 360px);
      border: 4px solid #5c4033;
      border-radius: 4px;
      overflow: hidden;
    }

    .square {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: min(7vw, 36px);
      cursor: pointer;
      position: relative;
      transition: all 0.15s;
    }

    .square.light {
      background: #f0d9b5;
      color: #333;
    }

    .square.dark {
      background: #b58863;
      color: #333;
    }

    .square.selected {
      background: #7fc97f !important;
      box-shadow: inset 0 0 0 3px #2e7d32;
    }

    .square.possible-move::after {
      content: '';
      position: absolute;
      width: 30%;
      height: 30%;
      background: rgba(0, 128, 0, 0.5);
      border-radius: 50%;
    }

    .square.possible-capture::after {
      content: '';
      position: absolute;
      width: 90%;
      height: 90%;
      border: 4px solid rgba(0, 128, 0, 0.5);
      border-radius: 50%;
      box-sizing: border-box;
    }

    .square.white-piece {
      color: #fff;
      text-shadow: 0 0 2px #000, 0 0 2px #000;
    }

    .square.black-piece {
      color: #000;
    }

    .square:hover {
      filter: brightness(1.1);
    }

    .status-bar {
      text-align: center;
      padding: 16px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      margin: 0 20px;
    }

    .status-text {
      font-size: 1.2rem;
      font-weight: bold;
    }

    .status-text.check {
      color: #ff6b6b;
      animation: pulse 1s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }

    .controls {
      display: flex;
      justify-content: center;
      gap: 12px;
      padding: 16px;
      flex-wrap: wrap;
    }

    .control-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
      transition: all 0.2s;
    }

    .new-game-btn {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .new-game-btn:hover {
      transform: scale(1.05);
    }

    .move-input {
      padding: 12px 16px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.3);
      color: inherit;
      font-size: 1rem;
      font-family: monospace;
      width: 120px;
      text-align: center;
    }

    .move-input:focus {
      outline: none;
      border-color: rgba(102, 126, 234, 0.8);
    }

    .move-history {
      padding: 16px;
      max-height: 120px;
      overflow-y: auto;
      background: rgba(0, 0, 0, 0.2);
      margin: 0 20px 20px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 0.85rem;
    }

    .move-row {
      display: flex;
      gap: 12px;
      margin-bottom: 4px;
    }

    .move-num {
      color: rgba(255, 255, 255, 0.5);
      width: 25px;
    }

    .help-text {
      text-align: center;
      padding: 8px;
      opacity: 0.7;
      font-size: 0.85rem;
    }

    .game-over-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 10;
      border-radius: 4px;
    }

    .game-over-text {
      font-size: 1.8rem;
      font-weight: bold;
      margin-bottom: 16px;
    }

    .game-over-text.white-win {
      color: #a8e6cf;
    }

    .game-over-text.black-win {
      color: #ff8b94;
    }

    .game-over-text.draw {
      color: #ffe66d;
    }

    @media (max-width: 400px) {
      .board {
        width: min(90vw, 320px);
        height: min(90vw, 320px);
      }
      .square {
        font-size: min(8vw, 28px);
      }
    }
  `;

  constructor() {
    super();
    this.sessionId = '';
    this.token = '';
    this.apiBaseUrl = window.location.origin;
    this._fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    this._selectedSquare = null;
    this._possibleMoves = [];
    this._currentPlayer = 'white';
    this._gameOver = false;
    this._winner = null;
    this._moveHistory = [];
    this._isCheck = false;
    this._chess = null;
    this._loadChess();
  }

  _loadChess() {
    if (typeof window !== 'undefined' && window.Chess) {
      this._chess = new window.Chess(this._fen);
      this._updateFromChess();
    } else {
      setTimeout(() => this._loadChess(), 100);
    }
  }

  _updateFromChess() {
    if (!this._chess) return;
    this._fen = this._chess.fen();
    this._currentPlayer = this._chess.turn() === 'w' ? 'white' : 'black';
    this._moveHistory = this._chess.history();
    this._isCheck = this._chess.isCheck();
    this._gameOver = this._chess.isCheckmate() || this._chess.isDraw();
    if (this._chess.isCheckmate()) {
      this._winner = this._chess.turn() === 'w' ? 'black' : 'white';
    } else {
      this._winner = null;
    }
    this.requestUpdate();
  }

  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('chunk-received', this._onChunkReceived);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListener('chunk-received', this._onChunkReceived);
  }

  _onChunkReceived(e) {
    if (e.detail) {
      this.handleChunk(e.detail);
    }
  }

  _apiUrl(path) {
    const url = new URL(path, this.apiBaseUrl);
    if (this.token) url.searchParams.set('token', this.token);
    return url.toString();
  }

  handleChunk(chunk) {
    if (!chunk) return;

    if (chunk.contentType === 'text' && chunk.annotations?.['chess.newGame']) {
      this._resetGame();
    }

    if (chunk.contentType === 'null' && chunk.annotations?.['chess.fen']) {
      this._fen = chunk.annotations['chess.fen'];
      if (this._chess) {
        this._chess.load(this._fen);
        this._updateFromChess();
      }
    }

    if (chunk.contentType === 'text') {
      if (chunk.annotations?.['chess.start'] || chunk.annotations?.['chess.newGame']) {
        this._resetGame();
      }
    }

    this.requestUpdate();
  }

  loadHistory(chunks) {
    this._resetGame();

    for (const chunk of chunks) {
      this.handleChunk(chunk);
    }
  }

  _resetGame() {
    this._fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    if (this._chess) {
      this._chess.reset();
      this._updateFromChess();
    }
    this._selectedSquare = null;
    this._possibleMoves = [];
    this.requestUpdate();
  }

  _getPieceAt(row, col) {
    if (!this._chess) return null;
    const board = this._chess.board();
    return board[row]?.[col];
  }

  _squareClick(row, col) {
    if (!this._chess || this._gameOver) return;
    
    const piece = this._getPieceAt(row, col);
    const pieceColor = piece ? (piece.color === 'w' ? 'white' : 'black') : null;
    
    if (this._selectedSquare) {
      const [selRow, selCol] = this._selectedSquare;
      const fromAlgebraic = this._algebraic(selRow, selCol);
      const toAlgebraic = this._algebraic(row, col);
      
      const isPossibleMove = this._possibleMoves.some(m => m.to === toAlgebraic);
      
      if (isPossibleMove) {
        this._makeMove(`${fromAlgebraic}${toAlgebraic}`);
        this._selectedSquare = null;
        this._possibleMoves = [];
      } else if (piece && pieceColor === this._currentPlayer) {
        this._selectedSquare = [row, col];
        this._possibleMoves = this._getPossibleMoves(selRow, selCol);
      } else {
        this._selectedSquare = null;
        this._possibleMoves = [];
      }
    } else if (piece && pieceColor === this._currentPlayer) {
      this._selectedSquare = [row, col];
      this._possibleMoves = this._getPossibleMoves(row, col);
    }
    
    this.requestUpdate();
  }

  _algebraic(row, col) {
    return String.fromCharCode(97 + col) + (8 - row);
  }

  _getPossibleMoves(row, col) {
    if (!this._chess) return [];
    const from = this._algebraic(row, col);
    const moves = this._chess.moves({ square: from, verbose: true });
    return moves.map(m => ({ to: m.to, captured: !!m.captured }));
  }

  _makeMove(move) {
    if (!this.sessionId) return;

    fetch(this._apiUrl(`/api/chat/${this.sessionId}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: move })
    });
  }

  _handleKeyDown(e) {
    if (e.key === 'Enter') {
      const input = e.target;
      const move = input.value.trim();
      if (move) {
        this._makeMove(move);
        input.value = '';
      }
    }
  }

  _newGame() {
    if (!this.sessionId) return;

    fetch(this._apiUrl(`/api/chat/${this.sessionId}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '!new' })
    });
  }

  _switchToChat() {
    this.dispatchEvent(new CustomEvent('chess-switch-ui', {
      detail: { mode: 'chat', sessionId: this.sessionId },
      bubbles: true,
      composed: true
    }));
  }

  _getStatusText() {
    if (this._gameOver) {
      if (this._winner === 'white') return 'Checkmate! White wins!';
      if (this._winner === 'black') return 'Checkmate! Black wins!';
      return 'Draw!';
    }
    
    const player = this._currentPlayer === 'white' ? 'White' : 'Black';
    let status = `${player} to move`;
    if (this._isCheck) {
      status += ' (CHECK!)';
    }
    return status;
  }

  _parseFen() {
    const parts = this._fen.split(' ')[0];
    const rows = parts.split('/');
    const board = [];
    
    for (const row of rows) {
      const boardRow = [];
      for (const char of row) {
        if (/\d/.test(char)) {
          for (let i = 0; i < parseInt(char); i++) {
            boardRow.push(null);
          }
        } else {
          boardRow.push(char);
        }
      }
      board.push(boardRow);
    }
    
    return board;
  }

  render() {
    const board = this._parseFen();
    
    return html`
      <div class="chess-header">
        <h2><span class="chess-icon">♟️</span> Chess</h2>
        <button class="switch-btn" @click=${this._switchToChat}>Chat</button>
      </div>

      <div class="game-area">
        <div class="board-container">
          ${this._gameOver ? html`
            <div class="game-over-overlay">
              <div class="game-over-text ${this._winner === 'white' ? 'white-win' : this._winner === 'black' ? 'black-win' : 'draw'}">
                ${this._winner === 'white' ? 'White Wins!' : this._winner === 'black' ? 'Black Wins!' : 'Draw!'}
              </div>
              <button class="control-btn new-game-btn" @click=${this._newGame}>New Game</button>
            </div>
          ` : ''}
          
          <div class="board">
            ${board.map((row, rowIdx) => 
              row.map((piece, colIdx) => {
                const isLight = (rowIdx + colIdx) % 2 === 0;
                const isSelected = this._selectedSquare && this._selectedSquare[0] === rowIdx && this._selectedSquare[1] === colIdx;
                const squareAlgebraic = this._algebraic(rowIdx, colIdx);
                const possibleMove = this._possibleMoves.find(m => m.to === squareAlgebraic);
                const isCapture = possibleMove?.captured;
                
                const displayPiece = piece ? (piece === piece.toUpperCase() ? 'P' : 'p').replace('P', piece).replace('p', piece) : '';
                const symbol = piece ? PIECE_SYMBOLS[piece] : '';
                
                return html`
                  <div 
                    class="square ${isLight ? 'light' : 'dark'} ${isSelected ? 'selected' : ''} ${possibleMove ? 'possible-move' : ''} ${isCapture ? 'possible-capture' : ''} ${piece ? (piece === piece.toUpperCase() ? 'white-piece' : 'black-piece') : ''}"
                    @click=${() => this._squareClick(rowIdx, colIdx)}
                  >
                    ${symbol}
                  </div>
                `;
              })
            )}
          </div>
        </div>

        <div class="status-bar">
          <div class="status-text ${this._isCheck ? 'check' : ''}">
            ${this._getStatusText()}
          </div>
        </div>

        <div class="controls">
          <button class="control-btn new-game-btn" @click=${this._newGame}>New Game</button>
          <input 
            class="move-input" 
            type="text" 
            placeholder="e4"
            @keydown=${this._handleKeyDown}
          />
        </div>

        <div class="help-text">
          Click a piece, then click destination
        </div>

        ${this._moveHistory.length > 0 ? html`
          <div class="move-history">
            ${this._moveHistory.map((move, i) => i % 2 === 0 ? html`
              <div class="move-row">
                <span class="move-num">${Math.floor(i / 2) + 1}.</span>
                <span>${move}</span>
                ${this._moveHistory[i + 1] ? html`<span>${this._moveHistory[i + 1]}</span>` : ''}
              </div>
            ` : '')}
          </div>
        ` : ''}
      </div>
    `;
  }
}

customElements.define('chess-board', ChessBoard);
