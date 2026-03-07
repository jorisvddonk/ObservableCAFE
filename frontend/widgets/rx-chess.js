import { LitElement, html, css } from 'https://cdn.jsdelivr.net/npm/lit@3/+esm';

const PIECE_SYMBOLS = {
  'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔',
  'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚',
};

export class RxChess extends LitElement {
  static properties = {
    fen: { type: String },
    currentPlayer: { type: String },
    isCheck: { type: Boolean },
    gameOver: { type: Boolean },
    winner: { type: String },
    moveHistory: { type: Array },
    invalidMove: { type: String },
    chunkId: { type: String }
  };

  static styles = css`
    :host {
      display: block;
    }
    
    .chess-card {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border-radius: 12px;
      padding: 16px;
      color: white;
      max-width: 320px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    }
    
    .chess-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    
    .chess-title {
      font-size: 1rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .chess-status {
      font-size: 0.8rem;
      opacity: 0.8;
    }
    
    .chess-status.check {
      color: #ff6b6b;
      font-weight: 600;
    }
    
    .board-container {
      display: flex;
      justify-content: center;
      margin: 8px 0;
    }
    
    .board {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      grid-template-rows: repeat(8, 1fr);
      width: 240px;
      height: 240px;
      border: 3px solid #5c4033;
      border-radius: 4px;
      overflow: hidden;
    }
    
    .square {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      cursor: default;
    }
    
    .square.light {
      background: #f0d9b5;
      color: #333;
    }
    
    .square.dark {
      background: #b58863;
      color: #333;
    }
    
    .square.white-piece {
      color: #fff;
      text-shadow: 0 0 2px #000, 0 0 2px #000;
    }
    
    .square.black-piece {
      color: #000;
    }
    
    .move-info {
      display: flex;
      justify-content: space-between;
      margin-top: 12px;
      font-size: 0.85rem;
    }
    
    .current-turn {
      font-weight: 500;
    }
    
    .move-count {
      opacity: 0.7;
    }
    
    .game-over {
      text-align: center;
      padding: 8px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      margin-top: 8px;
      font-weight: 600;
    }
    
    .game-over.white-win {
      color: #a8e6cf;
    }
    
    .game-over.black-win {
      color: #ff8b94;
    }
    
    .game-over.draw {
      color: #ffe66d;
    }
    
    .invalid-move {
      text-align: center;
      padding: 8px;
      background: rgba(231, 76, 60, 0.2);
      border: 1px solid rgba(231, 76, 60, 0.4);
      border-radius: 6px;
      margin-top: 8px;
      font-size: 0.85rem;
      color: #ff8b94;
    }
  `;

  constructor() {
    super();
    this.fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    this.currentPlayer = 'white';
    this.isCheck = false;
    this.gameOver = false;
    this.winner = null;
    this.moveHistory = [];
    this.invalidMove = '';
  }

  _parseFen() {
    const parts = this.fen.split(' ')[0];
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
    const turnText = this.currentPlayer === 'white' ? 'White to move' : 'Black to move';
    
    return html`
      <div class="chess-card" data-chunk-id=${this.chunkId}>
        <div class="chess-header">
          <div class="chess-title">♟️ Chess</div>
          <div class="chess-status ${this.isCheck ? 'check' : ''}">
            ${this.isCheck ? 'CHECK!' : turnText}
          </div>
        </div>
        
        <div class="board-container">
          <div class="board">
            ${board.map((row, rowIdx) => 
              row.map((piece, colIdx) => {
                const isLight = (rowIdx + colIdx) % 2 === 0;
                const symbol = piece ? PIECE_SYMBOLS[piece] : '';
                
                return html`
                  <div class="square ${isLight ? 'light' : 'dark'} ${piece ? (piece === piece.toUpperCase() ? 'white-piece' : 'black-piece') : ''}">
                    ${symbol}
                  </div>
                `;
              })
            )}
          </div>
        </div>
        
        ${this.gameOver ? html`
          <div class="game-over ${this.winner === 'white' ? 'white-win' : this.winner === 'black' ? 'black-win' : 'draw'}">
            ${this.winner === 'white' ? 'White wins!' : this.winner === 'black' ? 'Black wins!' : 'Draw!'}
          </div>
        ` : ''}
        
        ${this.invalidMove ? html`
          <div class="invalid-move">⚠️ ${this.invalidMove}</div>
        ` : ''}
        
        <div class="move-info">
          <span class="current-turn">${turnText}</span>
          <span class="move-count">${this.moveHistory.length} moves</span>
        </div>
      </div>
    `;
  }
}

customElements.define('rx-chess', RxChess);
