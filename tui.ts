/**
 * ObservableCAFE TUI - Terminal User Interface for chat
 * 
 * Usage:
 *   bun run tui.ts
 *   bun run tui.ts --backend ollama --model gemma3:1b
 */

import {
  TUI,
  ProcessTerminal,
  Container,
  Box,
  Text,
  Markdown,
  Input,
  Editor,
  Loader,
  Spacer,
  SelectList,
  SettingsList,
  type Component,
  type EditorTheme,
  type MarkdownTheme,
  type SelectItem,
  type SettingItem,
  type SettingsListTheme,
  CURSOR_MARKER,
  type Focusable,
  truncateToWidth,
  visibleWidth,
  matchesKey,
  Key,
} from "@mariozechner/pi-tui";
import chalk from "chalk";
import { createSession, loadAgentsFromDisk, addChunkToSession, listSessions, listAgents, getSession, deleteSession as coreDeleteSession, type Session, type CoreConfig } from './core.js';
import type { Chunk } from './lib/chunk.js';
import type { AgentDefinition } from './lib/agent.js';

const args = process.argv.slice(2);

function parseArgs(): { backend?: string; model?: string } {
  const result: { backend?: string; model?: string } = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--backend' && args[i + 1]) {
      result.backend = args[i + 1];
      i++;
    } else if (args[i] === '--model' && args[i + 1]) {
      result.model = args[i + 1];
      i++;
    }
  }
  
  return result;
}

const cliOptions = parseArgs();

export function getDefaultConfigWithArgs(): CoreConfig {
  return {
    backend: cliOptions.backend as 'kobold' | 'ollama' || 'ollama',
    koboldBaseUrl: process.env.KOBOLD_URL || 'http://localhost:5001',
    ollamaBaseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    ollamaModel: cliOptions.model || process.env.OLLAMA_MODEL || 'gemma3:1b',
    tracing: process.env.RXCAFE_TRACE === '1'
  };
}

interface Message {
  role: string;
  content: string;
  trusted?: boolean;
}

interface KnownSession {
  id: string;
  agentName: string;
  isBackground: boolean;
  displayName?: string;
}

type AppMode = 'chat' | 'sessions' | 'new-session' | 'settings';

class ChatApp implements Component, Focusable {
  private messages: Message[] = [];
  private session: Session | null = null;
  private config: CoreConfig;
  private loading = false;
  private _focused = false;
  private mode: AppMode = 'chat';
  private knownSessions: KnownSession[] = [];
  private agents: AgentDefinition[] = [];
  
  private header: Text;
  private messagesContainer: Container;
  private inputBox: Box;
  private input: Input;
  private loader: Loader;
  private sessionsList: SelectList;
  private settingsList: SettingsList;
  private settingsValues: Record<string, string> = {};
  
  private createSessionsList(): SelectList {
    const items: SelectItem[] = this.knownSessions.map(s => ({
      value: s.id,
      label: s.displayName || s.agentName,
      description: `${s.id.slice(0, 12)}...${s.id.slice(-4)} ${s.isBackground ? '[background]' : ''}`
    }));
    
    if (items.length === 0) {
      items.push({ value: '', label: 'No sessions', description: 'Create a new session' });
    }
    
    return new SelectList(items, 10, {
      selectedPrefix: (s) => chalk.yellow(s),
      selectedText: (s) => chalk.white(s),
      description: (s) => chalk.gray(s),
      scrollInfo: (s) => chalk.gray(s),
      noMatch: (s) => chalk.red(s),
    });
  }
  
  private tui: TUI;
  
  constructor(tui: TUI, config: CoreConfig) {
    this.tui = tui;
    this.config = config;
    
    const headerTheme = (s: string) => chalk.bold.cyan(s);
    this.header = new Text("", 1, 0, (s) => chalk.bgBlack(s));
    
    this.messagesContainer = new Container();
    
    this.input = new Input();
    this.input.onSubmit = (text) => {
      this.handleSubmit(text);
    };
    
    this.inputBox = new Box(1, 1, (s) => chalk.bgBlack(s));
    this.inputBox.addChild(this.input);
    
    this.loader = new Loader(
      tui,
      (s) => chalk.cyan(s),
      (s) => chalk.gray(s),
      "Thinking..."
    );
    
    this.sessionsList = new SelectList(
      [],
      10,
      {
        selectedPrefix: (s) => chalk.yellow(s),
        selectedText: (s) => chalk.white(s),
        description: (s) => chalk.gray(s),
        scrollInfo: (s) => chalk.gray(s),
        noMatch: (s) => chalk.red(s),
      }
    );
    this.sessionsList.onSelect = (item) => this.handleSessionSelect(item);
    this.sessionsList.onCancel = () => this.setMode('chat');
    
    const settingsTheme: SettingsListTheme = {
      label: (text, selected) => selected ? chalk.yellow(text) : chalk.white(text),
      value: (text, selected) => selected ? chalk.cyan(text) : chalk.gray(text),
      description: (text) => chalk.gray(text),
      cursor: chalk.yellow(">"),
      hint: (text) => chalk.gray(text),
    };
    
    this.settingsList = new SettingsList(
      [],
      10,
      settingsTheme,
      (id, value) => {
        this.settingsValues[id] = value;
        this.handleSettingChange(id, value);
      },
      () => this.setMode('chat')
    );
    
    this.updateHeader();
  }
  
  get focused(): boolean {
    return this._focused;
  }
  
  set focused(value: boolean) {
    if (this._focused !== value) {
      this._focused = value;
      this.input.focused = value;
      if (this.input.invalidate) this.input.invalidate();
      this.sessionsList.focused = value && (this.mode === 'sessions' || this.mode === 'new-session');
      this.settingsList.focused = value && (this.mode === 'new-session' || this.mode === 'settings');
      this.tui.requestRender();
    }
  }
  
  async init() {
    await loadAgentsFromDisk();
    
    this.agents = listAgents();
    
    const runtimeConfig: { backend?: string; model?: string } = {};
    if (parseArgs().backend) runtimeConfig.backend = parseArgs().backend;
    if (parseArgs().model) runtimeConfig.model = parseArgs().model;
    
    // Load existing sessions
    const sessionIds = listSessions();
    this.knownSessions = sessionIds.map(id => {
      const s = getSession(id);
      return {
        id,
        agentName: s?.agentName || 'default',
        isBackground: s?.isBackground || false,
        displayName: s?.displayName,
      };
    });
    
    if (this.knownSessions.length > 0) {
      // Switch to most recent session
      const mostRecent = this.knownSessions[0];
      await this.switchToSession(mostRecent.id);
    } else {
      // Create a new session
      this.session = await createSession(this.config, { runtimeConfig });
      this.updateHeader();
      
      this.session.outputStream.subscribe({
        next: (chunk) => this.handleChunk(chunk),
        error: (err) => {
          this.addMessage('system', `Error: ${err.message}`);
          this.loading = false;
          this.loader.stop();
          this.tui.requestRender();
        }
      });
      
      this.session.errorStream.subscribe({
        next: (err) => {
          this.addMessage('system', `Pipeline Error: ${err.message}`);
          this.loading = false;
          this.loader.stop();
          this.tui.requestRender();
        }
      });
      
      this.knownSessions.push({
        id: this.session.id,
        agentName: this.session.agentName,
        isBackground: false,
      });
      
      this.addMessage('system', `Connected to ${this.session.backend} (${this.session.model || 'default model'})`);
      this.addMessage('system', 'Commands: /clear, /history, /sessions, /new, /quit');
    }
    
    this.tui.requestRender();
  }
  
  private handleChunk(chunk: Chunk) {
    if (chunk.contentType === 'text') {
      const role = chunk.annotations['chat.role'];
      if (role === 'assistant') {
        this.addMessage('assistant', chunk.content as string);
      } else if (role === 'user') {
        this.addMessage('user', chunk.content as string);
      } else if (role === 'system') {
        this.addMessage('system', chunk.content as string);
      }
    }
    this.loading = false;
    this.loader.stop();
    this.tui.requestRender();
  }
  
  private updateHeader() {
    if (this.session) {
      const parts = [this.session.displayName || this.session.agentName, this.session.backend];
      if (this.session.model) parts.push(this.session.model);
      if (this.session.isBackground) parts.push('[bg]');
      this.header.setText(` ObservableCAFE | ${parts.join(' | ')} `);
    } else {
      this.header.setText(` ObservableCAFE | Initializing... `);
    }
  }
  
  addMessage(role: string, content: string) {
    this.messages.push({ role, content });
    this.tui.requestRender();
  }
  
  setMode(mode: AppMode) {
    this.mode = mode;
    if (mode === 'sessions' || mode === 'new-session') {
      this.updateSessionsList();
      if (this.sessionsList.invalidate) this.sessionsList.invalidate();
    } else if (mode === 'settings') {
      this.updateSettings();
      if (this.settingsList.invalidate) this.settingsList.invalidate();
    }
    this.tui.requestRender();
  }
  
  private updateSessionsList() {
    this.sessionsList = this.createSessionsList();
    this.sessionsList.onSelect = (item) => this.handleSessionSelect(item);
    this.sessionsList.onCancel = () => this.setMode('chat');
  }
  
  private createSettingsList(items: SettingItem[]): SettingsList {
    const settingsTheme: SettingsListTheme = {
      label: (text, selected) => selected ? chalk.yellow(String(text)) : chalk.white(String(text)),
      value: (text, selected) => selected ? chalk.cyan(String(text)) : chalk.gray(String(text)),
      description: (text) => chalk.gray(String(text || '')),
      cursor: chalk.yellow(">"),
      hint: (text) => chalk.gray(String(text || '')),
    };
    
    return new SettingsList(
      items,
      10,
      settingsTheme,
      (id, value) => {
        this.settingsValues[id] = value;
        this.handleSettingChange(id, value);
      },
      () => this.setMode('chat')
    );
  }
  
  private updateNewSessionSettings() {
    const items: SelectItem[] = this.agents.map(a => ({
      value: a.name,
      label: a.name,
      description: a.description || ''
    }));
    
    if (items.length === 0) {
      items.push({ value: 'default', label: 'default', description: 'default agent' });
    }
    
    this.sessionsList = new SelectList(items, 10, {
      selectedPrefix: (s) => chalk.yellow(s),
      selectedText: (s) => chalk.white(s),
      description: (s) => chalk.gray(s),
      scrollInfo: (s) => chalk.gray(s),
      noMatch: (s) => chalk.red(s),
    });
    this.sessionsList.onSelect = (item) => {
      this.settingsValues['agent'] = item.value;
      this.createNewSession();
    };
    this.sessionsList.onCancel = () => this.setMode('chat');
  }
  
  private updateSettings() {
    const items: SettingItem[] = [];
    
    if (this.session) {
      items.push(
        { id: 'session-name', label: 'Session Name', currentValue: String(this.session.displayName || this.session.id) },
        { id: 'session-agent', label: 'Agent', currentValue: String(this.session.agentName) },
        { id: 'session-backend', label: 'Backend', currentValue: String(this.session.backend) },
        { id: 'session-model', label: 'Model', currentValue: String(this.session.model || 'default') },
      );
    }
    
    items.push(
      { id: 'separator', label: '─────────────', currentValue: '' },
      { id: 'list-sessions', label: 'List Sessions', currentValue: '' },
      { id: 'new-session', label: 'New Session', currentValue: '' },
    );
    
    if (this.session) {
      items.push({ id: 'delete-session', label: 'Delete Session', currentValue: '' });
    }
    
    this.settingsList = this.createSettingsList(items);
  }
  
  private handleSessionSelect(item: SelectItem) {
    if (item.value) {
      this.switchToSession(item.value);
    }
    this.setMode('chat');
  }
  
  private handleSettingChange(id: string, value: string) {
    switch (id) {
      case 'list-sessions':
        this.setMode('sessions');
        break;
      case 'new-session':
        this.setMode('new-session');
        break;
      case 'delete-session':
        if (this.session) {
          this.deleteCurrentSession();
        }
        break;
      case 'create':
        this.createNewSession();
        break;
    }
  }
  
  private async switchToSession(sessionId: string) {
    if (this.session?.id === sessionId) return;
    
    const session = getSession(sessionId);
    if (!session) {
      this.addMessage('system', `Session not found: ${sessionId}`);
      return;
    }
    
    this.session = session;
    this.messages = [];
    
    // Reload history into messages
    for (const chunk of session.history) {
      if (chunk.contentType === 'text') {
        const role = chunk.annotations['chat.role'];
        if (role === 'user' || role === 'assistant' || role === 'system') {
          this.messages.push({ role, content: chunk.content as string });
        }
      }
    }
    
    this.updateHeader();
    
    // Subscribe if not already
    session.outputStream.subscribe({
      next: (chunk) => this.handleChunk(chunk),
      error: (err) => {
        this.addMessage('system', `Error: ${err.message}`);
        this.loading = false;
        this.loader.stop();
        this.tui.requestRender();
      }
    });
    
    this.addMessage('system', `Switched to session: ${session.displayName || session.agentName}`);
    this.tui.requestRender();
  }
  
  private async createNewSession() {
    const agentId = this.settingsValues['agent'] || 'default';
    const backend = (this.settingsValues['backend'] || this.config.backend) as 'kobold' | 'ollama';
    const model = this.settingsValues['model'] || this.config.ollamaModel;
    const systemPrompt = this.settingsValues['systemPrompt'];
    
    const llmParams: Record<string, any> = {};
    const temp = this.settingsValues['temperature'];
    const maxTokens = this.settingsValues['maxTokens'];
    const topP = this.settingsValues['topP'];
    
    if (temp) llmParams.temperature = parseFloat(temp);
    if (maxTokens) llmParams.maxTokens = parseInt(maxTokens);
    if (topP) llmParams.topP = parseFloat(topP);
    
    this.session = await createSession(this.config, {
      agentId,
      runtimeConfig: { backend, model, systemPrompt: systemPrompt || undefined, llmParams: Object.keys(llmParams).length > 0 ? llmParams : undefined }
    });
    
    this.knownSessions.push({
      id: this.session.id,
      agentName: this.session.agentName,
      isBackground: false,
    });
    
    this.session.outputStream.subscribe({
      next: (chunk) => this.handleChunk(chunk),
      error: (err) => {
        this.addMessage('system', `Error: ${err.message}`);
        this.loading = false;
        this.loader.stop();
        this.tui.requestRender();
      }
    });
    
    this.session.errorStream.subscribe({
      next: (err) => {
        this.addMessage('system', `Pipeline Error: ${err.message}`);
        this.loading = false;
        this.loader.stop();
        this.tui.requestRender();
      }
    });
    
    this.updateHeader();
    
    let configDesc = `${backend}/${model}`;
    if (systemPrompt) configDesc += ' + sys prompt';
    if (Object.keys(llmParams).length > 0) configDesc += ` (${Object.keys(llmParams).join(', ')})`;
    
    this.addMessage('system', `Created session: ${this.session.agentName} (${configDesc})`);
    this.setMode('chat');
  }
  
  private async deleteCurrentSession() {
    if (!this.session) return;
    
    const sessionId = this.session.id;
    await coreDeleteSession(sessionId);
    
    this.knownSessions = this.knownSessions.filter(s => s.id !== sessionId);
    
    if (this.knownSessions.length > 0) {
      await this.switchToSession(this.knownSessions[0].id);
    } else {
      this.session = null;
      this.messages = [];
      this.header.setText(` ObservableCAFE | No session `);
    }
    
    this.setMode('chat');
  }
  
  private handleSubmit(text: string) {
    if (this.mode !== 'chat') {
      // Handle navigation in other modes
      if (this.mode === 'sessions' || this.mode === 'new-session') {
        this.sessionsList.handleInput("\r"); // Enter
      } else if (this.mode === 'new-session' || this.mode === 'settings') {
        if (matchesKey(text, Key.escape)) {
          this.setMode('chat');
        } else {
          this.settingsList.handleInput(text);
        }
      }
      return;
    }
    
    if (!this.session) return;
    
    const trimmed = text.trim();
    if (!trimmed) return;
    this.input.setValue("");
    
    if (trimmed === '/quit' || trimmed === '/exit') {
      this.tui.stop();
      return;
    }
    
    if (trimmed === '/clear') {
      this.session.history.length = 0;
      this.session.systemPrompt = null;
      this.session.trustedChunks.clear();
      this.messages = [];
      this.addMessage('system', 'History cleared.');
      return;
    }
    
    if (trimmed === '/history') {
      this.addMessage('system', '--- Conversation History ---');
      for (const chunk of this.session.history) {
        if (chunk.contentType !== 'text') continue;
        const role = chunk.annotations['chat.role'] || 'unknown';
        const content = (chunk.content as string).substring(0, 200);
        this.addMessage('system', `[${role}] ${content}`);
      }
      this.addMessage('system', '----------------------------');
      return;
    }
    
    if (trimmed === '/sessions') {
      this.setMode('sessions');
      return;
    }
    
    if (trimmed === '/new' || trimmed === '/new-session') {
      this.setMode('new-session');
      return;
    }
    
    if (trimmed === '/settings') {
      this.setMode('settings');
      return;
    }
    
    if (trimmed.startsWith('/system ')) {
      const promptText = trimmed.slice(8);
      addChunkToSession(this.session, {
        content: promptText,
        producer: 'com.rxcafe.system-prompt',
        annotations: { 'chat.role': 'system', 'system.prompt': true }
      });
      this.addMessage('system', `System prompt set: ${promptText.substring(0, 50)}...`);
      return;
    }
    
    if (trimmed.startsWith('/rename ')) {
      const newName = trimmed.slice(8);
      addChunkToSession(this.session, {
        contentType: 'null',
        producer: 'com.rxcafe.user-ui',
        annotations: { 'session.name': newName }
      });
      this.session.displayName = newName;
      this.updateHeader();
      this.addMessage('system', `Session renamed to: ${newName}`);
      return;
    }
    
    this.loading = true;
    this.loader.start();
    this.tui.requestRender();
    
    const userChunk = {
      content: trimmed,
      producer: 'com.rxcafe.user',
      annotations: { 'chat.role': 'user' }
    };
    
    addChunkToSession(this.session, { ...userChunk, emit: true });
    
    this.session.callbacks = {
      onToken: () => {},
      onFinish: () => {
        this.loading = false;
        this.loader.stop();
        this.tui.requestRender();
      },
      onError: (err) => {
        this.addMessage('system', `Error: ${err.message}`);
        this.loading = false;
        this.loader.stop();
        this.tui.requestRender();
      }
    };
  }
  
  render(width: number): string[] {
    if (this.mode === 'sessions' || this.mode === 'new-session') {
      return this.renderSessionsMode(width);
    } else if (this.mode === 'new-session') {
      return this.renderNewSessionMode(width);
    } else if (this.mode === 'settings') {
      return this.renderSettingsMode(width);
    }
    
    return this.renderChatMode(width);
  }
  
  private renderChatMode(width: number): string[] {
    const lines: string[] = [];
    
    lines.push(...this.header.render(width));
    lines.push("");
    
    const maxMessages = Math.min(this.messages.length, 15);
    const startIdx = Math.max(0, this.messages.length - maxMessages);
    
    for (let i = startIdx; i < this.messages.length; i++) {
      const msg = this.messages[i];
      const roleColor = msg.role === 'user' ? chalk.yellow :
                       msg.role === 'assistant' ? chalk.green : chalk.cyan;
      const prefix = roleColor(`[${msg.role}]`);
      
      const contentLines = msg.content.split('\n');
      for (let j = 0; j < contentLines.length; j++) {
        const line = j === 0 ? `${prefix} ${contentLines[j]}` : `    ${contentLines[j]}`;
        lines.push(truncateToWidth(line, width));
      }
    }
    
    if (this.loading) {
      lines.push("");
      lines.push(...this.loader.render(width));
    }
    
    const inputLabel = chalk.gray("> ");
    const inputLines = this.input.render(width - 2);
    for (const line of inputLines) {
      lines.push(inputLabel + line);
    }
    
    return lines;
  }
  
  private renderSessionsMode(width: number): string[] {
    const lines: string[] = [];
    
    lines.push(...this.header.render(width));
    lines.push("");
    lines.push(chalk.bold.cyan("Sessions"));
    lines.push(chalk.gray("Use arrow keys to navigate, Enter to select, Escape to go back"));
    lines.push("");
    
    const listLines = this.sessionsList.render(width - 2);
    for (const line of listLines) {
      lines.push("  " + line);
    }
    
    return lines;
  }
  
  private renderNewSessionMode(width: number): string[] {
    const lines: string[] = [];
    
    lines.push(...this.header.render(width));
    lines.push("");
    lines.push(chalk.bold.cyan("New Session"));
    lines.push(chalk.gray("Use arrow keys to navigate, Enter to change/create, Escape to go back"));
    lines.push("");
    
    const settingsLines = this.settingsList.render(width - 2);
    for (const line of settingsLines) {
      lines.push("  " + line);
    }
    
    return lines;
  }
  
  private renderSettingsMode(width: number): string[] {
    const lines: string[] = [];
    
    lines.push(...this.header.render(width));
    lines.push("");
    lines.push(chalk.bold.cyan("Settings"));
    lines.push(chalk.gray("Use arrow keys to navigate, Enter to select, Escape to go back"));
    lines.push("");
    
    const settingsLines = this.settingsList.render(width - 2);
    for (const line of settingsLines) {
      lines.push("  " + line);
    }
    
    return lines;
  }
  
  handleInput(data: string): void {
    if (this.mode === 'sessions' || this.mode === 'new-session') {
      if (matchesKey(data, Key.escape)) {
        this.setMode('chat');
      } else {
        this.sessionsList.handleInput(data);
      }
    } else if (this.mode === 'new-session' || this.mode === 'settings') {
      if (matchesKey(data, Key.escape)) {
        this.setMode('chat');
      } else {
        this.settingsList.handleInput(data);
      }
    } else {
      this.input.handleInput(data);
    }
  }
}

async function main() {
  const config = getDefaultConfigWithArgs();
  
  const terminal = new ProcessTerminal();
  const tui = new TUI(terminal);
  
  const chatApp = new ChatApp(tui, config);
  tui.addChild(chatApp);
  
  // Focus the chat app so it receives input
  tui.setFocus(chatApp);
  
  tui.onDebug = () => {
    console.log("Debug triggered - messages:", chatApp["messages"].length);
  };
  
  await chatApp.init();
  
  tui.start();
}

main().catch(err => {
  console.error('Failed to start TUI:', err);
  process.exit(1);
});
