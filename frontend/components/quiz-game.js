import { LitElement, html, css } from 'lit';
import { classMap } from 'lit/directives/class-map.js';

/**
 * QuizGame - A Lit-based web component for the quiz game
 * 
 * This component is self-contained and communicates via events:
 * - 'quiz-answer' - Dispatched when user selects an answer
 * - 'quiz-start' - Dispatched when user wants to start a new quiz
 * - 'quiz-help' - Dispatched when user wants help
 * - 'quiz-switch-ui' - Dispatched when user wants to switch UI mode
 * 
 * It accepts chunks via the handleChunk() method or 'chunk-received' event.
 */
export class QuizGame extends LitElement {
  static properties = {
    sessionId: { type: String },
    token: { type: String },
    apiBaseUrl: { type: String, attribute: 'api-base-url' },
    _currentQuestion: { state: true },
    _options: { state: true },
    _score: { state: true },
    _totalAnswered: { state: true },
    _inQuiz: { state: true },
    _feedback: { state: true },
    _isCorrect: { state: true },
    _isAnswering: { state: true },
    _selectedIndex: { state: true },
    _history: { state: true },
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #fff;
      font-family: system-ui, -apple-system, sans-serif;
      overflow: hidden;
    }

    .quiz-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      background: rgba(0, 0, 0, 0.3);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .quiz-header h2 {
      margin: 0;
      font-size: 1.5rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .quiz-icon {
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

    .quiz-stats {
      display: flex;
      justify-content: center;
      gap: 24px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-size: 1.8rem;
      font-weight: bold;
      color: #ffd93d;
    }

    .stat-label {
      font-size: 0.75rem;
      opacity: 0.7;
      text-transform: uppercase;
    }

    .quiz-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 24px;
      overflow-y: auto;
    }

    .welcome-screen {
      text-align: center;
      max-width: 400px;
    }

    .welcome-icon {
      font-size: 5rem;
      margin-bottom: 16px;
      animation: bounce 1s ease infinite;
    }

    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }

    .welcome-title {
      font-size: 2rem;
      margin-bottom: 8px;
      background: linear-gradient(135deg, #ffd93d, #ff8b94);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .welcome-text {
      font-size: 1.1rem;
      opacity: 0.8;
      margin-bottom: 24px;
      line-height: 1.6;
    }

    .start-btn {
      padding: 16px 48px;
      font-size: 1.3rem;
      font-weight: bold;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      cursor: pointer;
      transition: all 0.3s;
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .start-btn:hover {
      transform: scale(1.05);
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
    }

    .question-container {
      width: 100%;
      max-width: 600px;
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .question-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .question-number {
      font-size: 0.9rem;
      opacity: 0.7;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .question-text {
      font-size: 1.4rem;
      line-height: 1.5;
      margin-bottom: 32px;
      padding: 24px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .options-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
    }

    @media (min-width: 480px) {
      .options-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    .option-btn {
      padding: 16px 20px;
      font-size: 1.1rem;
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.05);
      color: inherit;
      cursor: pointer;
      transition: all 0.2s;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .option-btn:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.4);
      transform: translateY(-2px);
    }

    .option-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .option-btn.correct {
      background: linear-gradient(135deg, #4ecdc4, #44b3ab);
      border-color: #4ecdc4;
    }

    .option-btn.incorrect {
      background: linear-gradient(135deg, #ff6b6b, #ee5a5a);
      border-color: #ff6b6b;
    }

    .option-letter {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      font-weight: bold;
      font-size: 0.9rem;
    }

    .feedback-container {
      margin-top: 24px;
      padding: 20px;
      border-radius: 12px;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .feedback-container.correct {
      background: rgba(78, 205, 196, 0.15);
      border: 1px solid rgba(78, 205, 196, 0.3);
    }

    .feedback-container.incorrect {
      background: rgba(255, 107, 107, 0.15);
      border: 1px solid rgba(255, 107, 107, 0.3);
    }

    .feedback-title {
      font-size: 1.2rem;
      font-weight: bold;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .feedback-text {
      opacity: 0.9;
      line-height: 1.5;
    }

    .result-screen {
      text-align: center;
      max-width: 400px;
      animation: slideIn 0.5s ease;
    }

    .result-emoji {
      font-size: 6rem;
      margin-bottom: 16px;
    }

    .result-title {
      font-size: 2rem;
      margin-bottom: 8px;
    }

    .result-score {
      font-size: 3rem;
      font-weight: bold;
      background: linear-gradient(135deg, #ffd93d, #ff8b94);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 8px;
    }

    .result-percentage {
      font-size: 1.5rem;
      opacity: 0.8;
      margin-bottom: 24px;
    }

    .result-message {
      font-size: 1.1rem;
      opacity: 0.9;
      margin-bottom: 24px;
    }

    .quiz-actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      padding: 16px;
      background: rgba(0, 0, 0, 0.2);
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .action-btn {
      padding: 10px 20px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.1);
      color: inherit;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .action-btn:hover {
      background: rgba(255, 255, 255, 0.2);
    }

    .progress-bar {
      width: 100%;
      height: 4px;
      background: rgba(255, 255, 255, 0.1);
      position: relative;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #667eea, #764ba2);
      transition: width 0.3s ease;
    }
  `;

  constructor() {
    super();
    this.sessionId = '';
    this.token = '';
    this.apiBaseUrl = window.location.origin;
    this._currentQuestion = '';
    this._options = [];
    this._score = 0;
    this._totalAnswered = 0;
    this._inQuiz = false;
    this._feedback = '';
    this._isCorrect = false;
    this._isAnswering = false;
    this._selectedIndex = -1;
    this._history = [];
    this._totalQuestions = 5;
    this._currentIndex = 0;
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

  async _sendMessage(message) {
    if (!this.sessionId) return;
    
    try {
      await fetch(this._apiUrl(`/api/chat/${this.sessionId}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
    } catch (error) {
      console.error('Quiz message failed:', error);
    }
  }

  _startQuiz() {
    this._sendMessage('start quiz');
    this.dispatchEvent(new CustomEvent('quiz-start', {
      detail: { sessionId: this.sessionId },
      bubbles: true,
      composed: true
    }));
  }

  _selectAnswer(option, index) {
    if (this._isAnswering) return;
    
    this._isAnswering = true;
    this._selectedIndex = index;
    
    this.dispatchEvent(new CustomEvent('quiz-answer', {
      detail: { answer: option, index, sessionId: this.sessionId },
      bubbles: true,
      composed: true
    }));

    this._sendMessage(option);
  }

  _showHelp() {
    this._sendMessage('help');
    this.dispatchEvent(new CustomEvent('quiz-help', {
      detail: { sessionId: this.sessionId },
      bubbles: true,
      composed: true
    }));
  }

  _switchToChat() {
    this.dispatchEvent(new CustomEvent('quiz-switch-ui', {
      detail: { mode: 'chat', sessionId: this.sessionId },
      bubbles: true,
      composed: true
    }));
  }

  /**
   * Public method to handle incoming chunks
   */
  handleChunk(chunk) {
    if (!chunk) return;

    const annotations = chunk.annotations || {};
    const producer = chunk.producer || '';
    const source = annotations['chunk.source'] || '';

    // Only handle quiz chunks from the quiz agent
    const isQuizChunk = producer === 'com.rxcafe.quiz' || 
                        source === 'com.rxcafe.quiz' ||
                        annotations['quiz.question'] !== undefined;
    
    if (!isQuizChunk && chunk.contentType === 'text') {
      const content = chunk.content?.toString() || '';
      // Also check content for quiz-related patterns
      if (!content.includes('Quiz') && !content.includes('🎯')) return;
    } else if (!isQuizChunk) {
      return;
    }

    if (chunk.contentType !== 'text') {
      console.log('[QuizGame] Ignoring non-text chunk');
      return;
    }

    const content = chunk.content?.toString() || '';

    console.log('[QuizGame] Processing chunk:', { producer, contentPreview: content.substring(0, 100), hasQuickResponses: !!annotations['com.rxcafe.quickResponses'] });

    // Parse quick responses if available
    if (annotations['com.rxcafe.quickResponses']) {
      console.log('[QuizGame] Setting options:', annotations['com.rxcafe.quickResponses']);
      this._options = annotations['com.rxcafe.quickResponses'];
    }

    // Check for question patterns
    if (content.includes('Quiz Time!') || content.includes('Next Question:')) {
      this._inQuiz = true;
      this._isAnswering = false;
      this._feedback = '';
      this._selectedIndex = -1;
      
      // Extract question text
      const questionMatch = content.match(/(?:Quiz Time!|Next Question:)\s*\n\n(.+?)(?:\n\n|$)/s);
      if (questionMatch) {
        this._currentQuestion = questionMatch[1].trim();
      } else {
        // Fallback: get everything after the header
        const lines = content.split('\n').filter(l => l.trim());
        const headerIndex = lines.findIndex(l => l.includes('Quiz Time!') || l.includes('Next Question:'));
        if (headerIndex >= 0 && lines[headerIndex + 1]) {
          this._currentQuestion = lines[headerIndex + 1];
        }
      }
      
      this._currentIndex++;
    }

    // Check for correct/wrong feedback
    if (content.includes('✅ *Correct!*')) {
      console.log('[QuizGame] Detected correct answer');
      this._isCorrect = true;
      this._score++;
      this._totalAnswered++;
      
      const explanationMatch = content.match(/✅ \*Correct!\*\s*\n\n(.+?)(?:\n\n|$)/s);
      if (explanationMatch) {
        this._feedback = explanationMatch[1].trim();
      }
      
      // Add to history
      this._history.push({
        question: this._currentQuestion,
        correct: true,
        answer: this._options[this._selectedIndex] || ''
      });
    } else if (content.includes('❌ *Wrong!*')) {
      console.log('[QuizGame] Detected wrong answer');
      this._isCorrect = false;
      this._totalAnswered++;
      
      const explanationMatch = content.match(/The correct answer was: \*(.+?)\*\s*\n\n(.+?)(?:\n\n|$)/s);
      if (explanationMatch) {
        this._feedback = `Correct: ${explanationMatch[1]}\n\n${explanationMatch[2]}`;
      }
      
      // Add to history
      this._history.push({
        question: this._currentQuestion,
        correct: false,
        answer: this._options[this._selectedIndex] || ''
      });
    }

    // Check for quiz complete
    if (content.includes('Quiz Complete!')) {
      this._inQuiz = false;
      
      const scoreMatch = content.match(/Final Score: (\d+)\/(\d+)/);
      if (scoreMatch) {
        this._score = parseInt(scoreMatch[1]);
        this._totalAnswered = parseInt(scoreMatch[2]);
      }
    }

    // Check for score update
    if (content.includes('Your Score')) {
      const scoreMatch = content.match(/Score: (\d+)\/(\d+)/);
      if (scoreMatch) {
        this._score = parseInt(scoreMatch[1]);
        this._totalAnswered = parseInt(scoreMatch[2]);
      }
    }

    this.requestUpdate();
  }

  /**
   * Load history from an array of chunks
   */
  loadHistory(chunks) {
    this._history = [];
    this._score = 0;
    this._totalAnswered = 0;
    this._inQuiz = false;

    for (const chunk of chunks) {
      this.handleChunk(chunk);
    }
  }

  _getPercentage() {
    if (this._totalAnswered === 0) return 0;
    return Math.round((this._score / this._totalAnswered) * 100);
  }

  _getResultEmoji() {
    const percentage = this._getPercentage();
    if (percentage >= 80) return '🏆';
    if (percentage >= 60) return '😊';
    if (percentage >= 40) return '😐';
    return '😢';
  }

  _getResultMessage() {
    const percentage = this._getPercentage();
    if (percentage >= 80) return 'Excellent! You\'re a quiz master!';
    if (percentage >= 60) return 'Good job! Keep it up!';
    if (percentage >= 40) return 'Not bad! Practice makes perfect!';
    return 'Keep trying! You\'ll do better next time!';
  }

  render() {
    return html`
      <div class="quiz-header">
        <h2><span class="quiz-icon">🎯</span> Quiz Game</h2>
        <button class="switch-btn" @click=${this._switchToChat}>Switch to Chat</button>
      </div>

      ${this._inQuiz ? html`
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${(this._currentIndex / this._totalQuestions) * 100}%"></div>
        </div>
      ` : ''}

      <div class="quiz-stats">
        <div class="stat">
          <div class="stat-value">${this._score}</div>
          <div class="stat-label">Correct</div>
        </div>
        <div class="stat">
          <div class="stat-value">${this._totalAnswered}</div>
          <div class="stat-label">Answered</div>
        </div>
        <div class="stat">
          <div class="stat-value">${this._getPercentage()}%</div>
          <div class="stat-label">Accuracy</div>
        </div>
      </div>

      <div class="quiz-content">
        ${!this._inQuiz && this._totalAnswered === 0 ? this._renderWelcome() : ''}
        ${this._inQuiz ? this._renderQuestion() : ''}
        ${!this._inQuiz && this._totalAnswered > 0 ? this._renderResults() : ''}
      </div>

      <div class="quiz-actions">
        <button class="action-btn" @click=${this._startQuiz}>
          ${this._totalAnswered > 0 ? '🔄 New Quiz' : '▶️ Start'}
        </button>
        <button class="action-btn" @click=${this._showHelp}>❓ Help</button>
      </div>
    `;
  }

  _renderWelcome() {
    return html`
      <div class="welcome-screen">
        <div class="welcome-icon">🎯</div>
        <h1 class="welcome-title">Quiz Game</h1>
        <p class="welcome-text">
          Test your knowledge with fun multiple choice questions!
          <br><br>
          Click "Start" to begin a new quiz.
        </p>
        <button class="start-btn" @click=${this._startQuiz}>Start Quiz</button>
      </div>
    `;
  }

  _renderQuestion() {
    const letters = ['A', 'B', 'C', 'D'];
    
    return html`
      <div class="question-container">
        <div class="question-header">
          <span class="question-number">Question ${this._currentIndex} of ${this._totalQuestions}</span>
        </div>
        
        <div class="question-text">${this._currentQuestion}</div>
        
        <div class="options-grid">
          ${this._options.map((option, index) => html`
            <button 
              class="option-btn ${classMap({ 
                correct: this._isAnswering && this._isCorrect && index === this._selectedIndex,
                incorrect: this._isAnswering && !this._isCorrect && index === this._selectedIndex
              })}"
              @click=${() => this._selectAnswer(option, index)}
              ?disabled=${this._isAnswering}
            >
              <span class="option-letter">${letters[index] || '?'}</span>
              <span>${option}</span>
            </button>
          `)}
        </div>

        ${this._feedback ? html`
          <div class="feedback-container ${classMap({ correct: this._isCorrect, incorrect: !this._isCorrect })}">
            <div class="feedback-title">
              ${this._isCorrect ? '✅ Correct!' : '❌ Wrong!'}
            </div>
            <div class="feedback-text">${this._feedback}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderResults() {
    return html`
      <div class="result-screen">
        <div class="result-emoji">${this._getResultEmoji()}</div>
        <h2 class="result-title">Quiz Complete!</h2>
        <div class="result-score">${this._score}/${this._totalAnswered}</div>
        <div class="result-percentage">${this._getPercentage()}%</div>
        <p class="result-message">${this._getResultMessage()}</p>
        <button class="start-btn" @click=${this._startQuiz}>Play Again</button>
      </div>
    `;
  }
}

customElements.define('quiz-game', QuizGame);
