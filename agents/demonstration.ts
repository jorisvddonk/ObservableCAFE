import type { AgentDefinition, AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { createTextChunk, createNullChunk, createBinaryChunk, annotateChunk } from '../lib/chunk.js';

const DEMO_CHUNKS: Array<{ delay: number; generate: (session: AgentSessionContext) => Chunk | Chunk[] }> = [
  {
    delay: 300,
    generate: () => createTextChunk(
      '🎉 Welcome to the Demonstration Agent! 🎉\n\nThis agent showcases all the different widgets and content types supported by ObservableCAFE. Let\'s take a tour!',
      'demonstration',
      { 'chat.role': 'assistant', 'parsers.markdown.enabled': true }
    )
  },
  {
    delay: 1000,
    generate: () => createTextChunk(
      '📝 **Text Messages**\n\nRegular text messages with markdown support! You can use *italic*, **bold**, and `code` formatting.',
      'demonstration',
      { 'chat.role': 'assistant', 'com.rxcafe.quickResponses': ['Next →', 'Stop Demo'], 'parsers.markdown.enabled': true }
    )
  },
  {
    delay: 2000,
    generate: () => createTextChunk(
      '💻 **Code Block**\n\nHere\'s some code with syntax highlighting:',
      'demonstration',
      { 'chat.role': 'assistant', 'parsers.markdown.enabled': true }
    )
  },
  {
    delay: 2300,
    generate: () => createTextChunk(
      `function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

// Usage
console.log(greet("World"));`,
      'demonstration',
      { 
        'chat.role': 'assistant',
        'code.language': 'typescript',
        'code.filename': 'greeting.ts'
      }
    )
  },
  {
    delay: 3200,
    generate: () => createTextChunk(
      '📊 **Diff View**\n\nShowing changes between two versions:',
      'demonstration',
      { 'chat.role': 'assistant', 'parsers.markdown.enabled': true }
    )
  },
  {
    delay: 3500,
    generate: () => createTextChunk(
      `- const add = (a, b) => a + b;
+ const add = (a: number, b: number): number => a + b;`,
      'demonstration',
      {
        'chat.role': 'assistant',
        'diff.type': 'unified',
        'diff.oldContent': 'const add = (a, b) => a + b;',
        'diff.newContent': 'const add = (a: number, b: number): number => a + b;',
        'diff.language': 'typescript'
      }
    )
  },
  {
    delay: 4300,
    generate: () => createTextChunk(
      '🎲 **Dice Rolls**\n\nLet\'s roll some dice!',
      'demonstration',
      { 'chat.role': 'assistant', 'parsers.markdown.enabled': true }
    )
  },
  {
    delay: 4600,
    generate: () => {
      const dice = [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1];
      const total = dice.reduce((a, b) => a + b, 0);
      return createTextChunk(
        `🎲 Rolled 2d6: ${dice.join(' + ')} = ${total}`,
        'demonstration',
        {
          'chat.role': 'assistant',
          'dice.rolls': dice,
          'dice.diceTypes': ['d6', 'd6'],
          'dice.total': total,
          'dice.notation': '2d6'
        }
      );
    }
  },
  {
    delay: 5300,
    generate: () => createTextChunk(
      '🔧 **Tool Calls**\n\nI can call tools like dice roller:',
      'demonstration',
      { 'chat.role': 'assistant', 'parsers.markdown.enabled': true }
    )
  },
  {
    delay: 5600,
    generate: () => {
      const roll = Math.floor(Math.random() * 20) + 1;
      return createTextChunk(
        `🎲 1d20 = ${roll}`,
        'demonstration',
        {
          'chat.role': 'assistant',
          'tool.name': 'rollDice',
          'tool.results': { notation: '1d20', total: roll, dice: [roll] },
          'com.rxcafe.tool-detection': {
            hasToolCalls: true,
            toolCalls: [{ name: 'rollDice', args: { notation: '1d20' } }]
          }
        }
      );
    }
  },
  {
    delay: 6300,
    generate: () => createTextChunk(
      '🌐 **Web Content**\n\nI can fetch and display web content:',
      'demonstration',
      { 'chat.role': 'assistant', 'parsers.markdown.enabled': true }
    )
  },
  {
    delay: 6600,
    generate: () => createTextChunk(
      '📰 Latest News: AI models are getting smarter every day!',
      'demonstration',
      {
        'chat.role': 'assistant',
        'web.source-url': 'https://example.com/news',
        'security.trust-level': { trusted: false, reason: 'Demo content' }
      }
    )
  },
  {
    delay: 7300,
    generate: () => createTextChunk(
      '📋 **Quick Responses**\n\nI can offer quick response buttons:',
      'demonstration',
      { 
        'chat.role': 'assistant',
        'com.rxcafe.quickResponses': ['Option A', 'Option B', 'Option C'],
        'parsers.markdown.enabled': true
      }
    )
  },
  {
    delay: 8000,
    generate: () => createTextChunk(
      '💡 **System Prompts**\n\nInternal system messages (not shown in chat):',
      'demonstration',
      { 'chat.role': 'system', 'session.name': 'demonstration-session', 'parsers.markdown.enabled': true }
    )
  },
  {
    delay: 8500,
    generate: () => createNullChunk(
      'demonstration',
      { 'session.name': 'Demonstration Agent Session' }
    )
  },
  {
    delay: 9000,
    generate: () => createTextChunk(
      '🔄 **Pipeline Visualization**\n\nRxJS marble diagram representation:',
      'demonstration',
      {
        'chat.role': 'assistant',
        'visualizer.type': 'rx-marbles',
        'visualizer.agent': 'demonstration',
        'visualizer.pipeline': [
          { stream: 'input', events: [{ time: 0, value: 'a', type: 'N' }, { time: 10, value: 'b', type: 'N' }] },
          { stream: 'output', events: [{ time: 30, value: 'a', type: 'N' }, { time: 40, value: 'b', type: 'N' }] }
        ],
        'parsers.markdown.enabled': true
      }
    )
  },
  {
    delay: 10000,
    generate: () => createTextChunk(
      '😊 **Sentiment Analysis**\n\nI can analyze the sentiment of messages:',
      'demonstration',
      { 'chat.role': 'assistant', 'parsers.markdown.enabled': true }
    )
  },
  {
    delay: 10300,
    generate: () => createTextChunk(
      'Hello! I am having an amazing day!',
      'demonstration',
      {
        'chat.role': 'user',
        'com.rxcafe.example.sentiment': { score: 0.9, label: 'positive' },
        'parsers.markdown.enabled': true
      }
    )
  },
  {
    delay: 11000,
    generate: () => createTextChunk(
      '🖼️ **Images**\n\n(I cannot generate real images in this demo, but the widget supports: PNG, JPEG, GIF, WebP, SVG)',
      'demonstration',
      { 'chat.role': 'assistant', 'parsers.markdown.enabled': true }
    )
  },
  {
    delay: 11500,
    generate: () => {
      const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">
  <rect fill="#4a90d9" width="200" height="100" rx="10"/>
  <text fill="white" font-family="sans-serif" font-size="24" x="50%" y="55%" text-anchor="middle">Demo Image</text>
</svg>`;
      const encoder = new TextEncoder();
      return createBinaryChunk(
        encoder.encode(svgData),
        'image/svg+xml',
        'demonstration',
        {
          'chat.role': 'assistant',
          'image.description': 'A blue rounded rectangle with demo text'
        }
      );
    }
  },
  {
    delay: 12200,
    generate: () => createTextChunk(
      '🔊 **Audio**\n\n(Audio playback widget for voice/sound)',
      'demonstration',
      { 'chat.role': 'assistant', 'parsers.markdown.enabled': true }
    )
  },
  {
    delay: 12600,
    generate: () => {
      const silentAudio = new Uint8Array([0x00, 0x00, 0x00, 0x00]); // Minimal valid WAV header placeholder
      return createBinaryChunk(
        silentAudio,
        'audio/wav',
        'demonstration',
        {
          'chat.role': 'assistant',
          'audio.description': 'Audio placeholder (no actual audio in demo)'
        }
      );
    }
  },
  {
    delay: 13100,
    generate: () => createTextChunk(
      '📁 **Files**\n\nI can display files with download capability:',
      'demonstration',
      { 'chat.role': 'assistant', 'parsers.markdown.enabled': true }
    )
  },
  {
    delay: 13500,
    generate: () => {
      const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF header
      return createBinaryChunk(
        pdfData,
        'application/pdf',
        'demonstration',
        {
          'chat.role': 'assistant',
          'file.name': 'document.pdf'
        }
      );
    }
  },
  {
    delay: 14000,
    generate: () => {
      const zipData = new Uint8Array([0x50, 0x4B, 0x03, 0x04]); // PK zip header
      return createBinaryChunk(
        zipData,
        'application/zip',
        'demonstration',
        {
          'chat.role': 'assistant',
          'file.name': 'archive.zip'
        }
      );
    }
  },
  {
    delay: 14500,
    generate: () => createTextChunk(
      '🌤️ **Weather Widget**\n\nReal-time weather information with forecast:',
      'demonstration',
      { 'chat.role': 'assistant', 'parsers.markdown.enabled': true }
    )
  },
  {
    delay: 14900,
    generate: () => {
      const weatherData = {
        location: { latitude: 51.5074, longitude: -0.1278 },
        current: {
          time: new Date().toISOString(),
          temperature: 15,
          weathercode: 2,
          windspeed: 12,
          winddirection: 180
        },
        daily: Array.from({ length: 7 }, (_, i) => {
          const date = new Date();
          date.setDate(date.getDate() + i + 1);
          return {
            date: date.toISOString(),
            maxTemp: 15 + Math.random() * 10,
            minTemp: 5 + Math.random() * 5,
            weathercode: Math.floor(Math.random() * 4)
          };
        })
      };
      return createTextChunk(
        JSON.stringify(weatherData),
        'demonstration',
        {
          'chat.role': 'assistant',
          'weather.data': true,
          'weather.location': 'London, UK',
          'weather.timezone': 'Europe/London'
        }
      );
    }
  },
  {
    delay: 15500,
    generate: () => createTextChunk(
      '✨ **That\'s All!**\n\nThis demo covered:\n• Text messages\n• Code blocks with syntax highlighting\n• Diff views\n• Dice rolls\n• Tool calls\n• Web content\n• Quick response buttons\n• System prompts\n• Pipeline visualization (Rx marbles)\n• Sentiment analysis\n• Images (binary)\n• Audio (binary)\n• Files (binary)\n• Weather widget\n\nThanks for watching! 🎉',
      'demonstration',
      { 'chat.role': 'assistant', 'com.rxcafe.quickResponses': ['Restart Demo'], 'parsers.markdown.enabled': true }
    )
  }
];

export const demonstrationAgent: AgentDefinition = {
  name: 'demonstration',
  description: 'Demonstrates all supported chat widgets and content types',
  configSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  supportedUIs: ['chat'],
  
  initialize(session: AgentSessionContext) {
    console.log(`[Demonstration] Starting demonstration for session ${session.id}`);
    
    let currentIndex = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    const runDemo = () => {
      if (currentIndex >= DEMO_CHUNKS.length) {
        console.log(`[Demonstration] Demo complete for session ${session.id}`);
        return;
      }
      
      const { delay, generate } = DEMO_CHUNKS[currentIndex];
      const chunks = generate(session);
      
      if (Array.isArray(chunks)) {
        for (const chunk of chunks) {
          session.outputStream.next(chunk);
        }
      } else {
        session.outputStream.next(chunks);
      }
      
      currentIndex++;
      
      if (currentIndex < DEMO_CHUNKS.length) {
        const nextDelay = DEMO_CHUNKS[currentIndex].delay - delay;
        timeoutId = setTimeout(runDemo, nextDelay);
      }
    };
    
    timeoutId = setTimeout(runDemo, DEMO_CHUNKS[0].delay);
    
    session.pipelineSubscription = {
      unsubscribe: () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        console.log(`[Demonstration] Stopped demonstration for session ${session.id}`);
      }
    } as any;
  },
  
  destroy(session: AgentSessionContext) {
    console.log(`[Demonstration] Destroying demonstration agent for session ${session.id}`);
    if (session.pipelineSubscription) {
      session.pipelineSubscription.unsubscribe();
    }
  }
};

export default demonstrationAgent;
