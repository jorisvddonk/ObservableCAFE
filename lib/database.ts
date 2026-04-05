/**
 * RXCAFE Client Trust System
 * SQLite-based client authentication using bun:sqlite
 */

import { Database as Sqlite } from 'bun:sqlite';
import { randomBytes, createHash } from 'crypto';
import { join } from 'path';

export interface TrustedClient {
  id: number;
  token: string;
  description?: string;
  createdAt: number;
  lastUsedAt?: number;
  useCount: number;
}

export class Database {
  private db: Sqlite;
  private dbPath: string;

  constructor(dbPath: string = './rxcafe-trust.db') {
    this.dbPath = dbPath;
    this.db = new Sqlite(dbPath);
    this.initializeSchema();
  }
  
  getDatabase(): Sqlite {
    return this.db;
  }
  
  getDbPath(): string {
    return this.dbPath;
  }

  private initializeSchema(): void {
    // Create trusted_clients table (for API auth)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS trusted_clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        use_count INTEGER DEFAULT 0,
        is_admin INTEGER DEFAULT 0
      )
    `);
    
    // Migration: Add is_admin column if it doesn't exist
    const adminColumnCheck = this.db.prepare(`
      SELECT * FROM pragma_table_info('trusted_clients') WHERE name='is_admin'
    `);
    const adminColumn = adminColumnCheck.all();
    adminColumnCheck.finalize();
    
    if (adminColumn.length === 0) {
      this.db.run(`ALTER TABLE trusted_clients ADD COLUMN is_admin INTEGER DEFAULT 0`);
    }

    // Create index on token_hash for faster lookups
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_token_hash ON trusted_clients(token_hash)
    `);

    // Create trusted_telegram_users table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS trusted_telegram_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_user_id INTEGER UNIQUE,
        username TEXT UNIQUE,
        first_name TEXT,
        description TEXT,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        use_count INTEGER DEFAULT 0
      )
    `);

    // Create indexes for faster lookups
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_telegram_user_id ON trusted_telegram_users(telegram_user_id)
    `);
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_telegram_username ON trusted_telegram_users(username)
    `);

    // Create telegram_subscriptions table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS telegram_subscriptions (
        chat_id INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (chat_id, session_id)
      )
    `);

    // Create telegram_current_sessions table (persists last active session per chat)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS telegram_current_sessions (
        chat_id INTEGER PRIMARY KEY,
        session_id TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Create connected_agents table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS connected_agents (
        id TEXT PRIMARY KEY,
        api_key_hash TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    // Create index on api_key_hash for lookups
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_connected_agent_api_key_hash ON connected_agents(api_key_hash)
    `);

    // Create connected_agent_sessions table (tracks subscriptions/joins)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS connected_agent_sessions (
        agent_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        mode TEXT NOT NULL CHECK (mode IN ('subscribed', 'joined')),
        PRIMARY KEY (agent_id, session_id),
        FOREIGN KEY (agent_id) REFERENCES connected_agents(id) ON DELETE CASCADE
      )
    `);

    // Create index for finding agents in a session
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_connected_agent_sessions_session ON connected_agent_sessions(session_id)
    `);

    // Create agent_presets table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS agent_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        agent_id TEXT NOT NULL,
        backend TEXT,
        model TEXT,
        system_prompt TEXT,
        llm_params TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_agent_presets_name ON agent_presets(name)
    `);

    // Create quickies table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS quickies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        preset_id INTEGER NOT NULL REFERENCES agent_presets(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        emoji TEXT NOT NULL DEFAULT '⚡',
        gradient_start TEXT NOT NULL DEFAULT '#6366f1',
        gradient_end TEXT NOT NULL DEFAULT '#8b5cf6',
        starter_chunk TEXT,
        ui_mode TEXT NOT NULL DEFAULT 'chat',
        display_order INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_quickies_order ON quickies(display_order)
    `);
  }

  /**
   * Add a Telegram subscription
   */
  addTelegramSubscription(chatId: number, sessionId: string): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO telegram_subscriptions (chat_id, session_id, created_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(chatId, sessionId, now);
    stmt.finalize();
  }

  /**
   * Remove a Telegram subscription
   */
  removeTelegramSubscription(chatId: number, sessionId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM telegram_subscriptions WHERE chat_id = ? AND session_id = ?
    `);
    const result = stmt.run(chatId, sessionId);
    stmt.finalize();
    return result.changes > 0;
  }

  /**
   * List all subscriptions for a chat
   */
  listTelegramSubscriptions(chatId: number): string[] {
    const stmt = this.db.prepare(`
      SELECT session_id FROM telegram_subscriptions WHERE chat_id = ?
    `);
    const results = stmt.all(chatId) as { session_id: string }[];
    stmt.finalize();
    return results.map(r => r.session_id);
  }

  /**
   * List all global subscriptions
   */
  listAllTelegramSubscriptions(): Array<{ chatId: number, sessionId: string }> {
    const stmt = this.db.prepare(`
      SELECT chat_id, session_id FROM telegram_subscriptions
    `);
    const results = stmt.all() as { chat_id: number, session_id: string }[];
    stmt.finalize();
    return results.map(r => ({ chatId: r.chat_id, sessionId: r.session_id }));
  }

  /**
   * Persist the current session for a Telegram chat
   */
  setTelegramCurrentSession(chatId: number, sessionId: string): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO telegram_current_sessions (chat_id, session_id, updated_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(chatId, sessionId, now);
    stmt.finalize();
  }

  /**
   * Get the current session for a Telegram chat
   */
  getTelegramCurrentSession(chatId: number): string | null {
    const stmt = this.db.prepare(`
      SELECT session_id FROM telegram_current_sessions WHERE chat_id = ?
    `);
    const result = stmt.get(chatId) as { session_id: string } | undefined;
    stmt.finalize();
    return result?.session_id || null;
  }

  /**
   * List all current sessions
   */
  listAllTelegramCurrentSessions(): Array<{ chatId: number, sessionId: string }> {
    const stmt = this.db.prepare(`
      SELECT chat_id, session_id FROM telegram_current_sessions
    `);
    const results = stmt.all() as { chat_id: number, session_id: string }[];
    stmt.finalize();
    return results.map(r => ({ chatId: r.chat_id, sessionId: r.session_id }));
  }

  /**
   * Generate a new random token
   */
  static generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Hash a token for storage
   */
  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Add a new trusted client
   * Returns the token (which cannot be retrieved later)
   */
  addClient(description?: string): string {
    const token = Database.generateToken();
    const tokenHash = Database.hashToken(token);
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO trusted_clients (token, token_hash, description, created_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(token, tokenHash, description || null, now);
    stmt.finalize();

    return token;
  }

  /**
   * Check if a token is trusted and update usage stats
   */
  verifyToken(token: string): boolean {
    const tokenHash = Database.hashToken(token);
    const now = Date.now();

    // First check if token exists
    const checkStmt = this.db.prepare(`
      SELECT id FROM trusted_clients WHERE token_hash = ?
    `);
    const exists = checkStmt.get(tokenHash) as { id: number } | undefined;
    checkStmt.finalize();

    if (!exists) {
      return false;
    }

    // Update usage stats
    const updateStmt = this.db.prepare(`
      UPDATE trusted_clients
      SET last_used_at = ?, use_count = use_count + 1
      WHERE token_hash = ?
    `);
    updateStmt.run(now, tokenHash);
    updateStmt.finalize();

    return true;
  }

  /**
   * Check if a token is trusted without updating stats (for checks only)
   */
  isTokenTrusted(token: string): boolean {
    const tokenHash = Database.hashToken(token);

    const stmt = this.db.prepare(`
      SELECT id FROM trusted_clients WHERE token_hash = ?
    `);

    const result = stmt.get(tokenHash) as { id: number } | undefined;
    stmt.finalize();

    return !!result;
  }

  /**
   * Get all trusted clients (without tokens, only metadata)
   */
  listClients(): Array<Omit<TrustedClient, 'token'> & { isAdmin: boolean }> {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        description,
        created_at as createdAt,
        last_used_at as lastUsedAt,
        use_count as useCount,
        is_admin as isAdmin
      FROM trusted_clients
      ORDER BY created_at DESC
    `);

    const results = stmt.all() as Array<Omit<TrustedClient, 'token'> & { isAdmin: number }>;
    stmt.finalize();

    return results.map(r => ({ ...r, isAdmin: !!r.isAdmin }));
  }

  /**
   * Get a token by description (for retrieving web interface token)
   */
  getTokenByDescription(description: string): string | null {
    const stmt = this.db.prepare(`
      SELECT token FROM trusted_clients WHERE description = ?
    `);
    const result = stmt.get(description) as { token: string } | undefined;
    stmt.finalize();
    return result?.token || null;
  }

  /**
   * Remove a trusted client by ID
   */
  removeClient(id: number): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM trusted_clients WHERE id = ?
    `);

    const result = stmt.run(id);
    stmt.finalize();

    return result.changes > 0;
  }

  /**
   * Remove a trusted client by token
   */
  removeClientByToken(token: string): boolean {
    const tokenHash = Database.hashToken(token);
    const stmt = this.db.prepare(`
      DELETE FROM trusted_clients WHERE token_hash = ?
    `);

    const result = stmt.run(tokenHash);
    stmt.finalize();

    return result.changes > 0;
  }

  /**
   * Check if any trusted clients exist
   */
  hasTrustedClients(): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM trusted_clients
    `);

    const result = stmt.get() as { count: number };
    stmt.finalize();

    return result.count > 0;
  }

  /**
   * Get count of trusted clients
   */
  getClientCount(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM trusted_clients
    `);

    const result = stmt.get() as { count: number };
    stmt.finalize();

    return result.count;
  }

  /**
   * Set admin status for a client
   */
  setAdminStatus(id: number, isAdmin: boolean): boolean {
    const stmt = this.db.prepare(`
      UPDATE trusted_clients SET is_admin = ? WHERE id = ?
    `);
    const result = stmt.run(isAdmin ? 1 : 0, id);
    stmt.finalize();
    return result.changes > 0;
  }

  /**
   * Check if a token has admin privileges
   */
  isAdminToken(token: string): boolean {
    const tokenHash = Database.hashToken(token);
    const stmt = this.db.prepare(`
      SELECT id FROM trusted_clients WHERE token_hash = ? AND is_admin = 1
    `);
    const result = stmt.get(tokenHash) as { id: number } | undefined;
    stmt.finalize();
    return !!result;
  }

  /**
   * Get client ID by token (for admin verification)
   */
  getClientIdByToken(token: string): number | null {
    const tokenHash = Database.hashToken(token);
    const stmt = this.db.prepare(`
      SELECT id FROM trusted_clients WHERE token_hash = ?
    `);
    const result = stmt.get(tokenHash) as { id: number } | undefined;
    stmt.finalize();
    return result?.id ?? null;
  }

  /**
   * Get client by ID
   */
  getClientById(id: number): { id: number; description?: string; isAdmin: boolean; createdAt: number; lastUsedAt?: number; useCount: number } | null {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        description,
        is_admin as isAdmin,
        created_at as createdAt,
        last_used_at as lastUsedAt,
        use_count as useCount
      FROM trusted_clients WHERE id = ?
    `);
    const result = stmt.get(id) as any;
    stmt.finalize();
    return result ? { ...result, isAdmin: !!result.isAdmin } : null;
  }

  /**
   * List all admin clients
   */
  listAdminClients(): Array<{ id: number; description?: string; createdAt: number }> {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        description,
        created_at as createdAt
      FROM trusted_clients
      WHERE is_admin = 1
      ORDER BY created_at DESC
    `);
    const results = stmt.all() as Array<{ id: number; description?: string; createdAt: number }>;
    stmt.finalize();
    return results;
  }

  /**
   * Add a client with admin status
   */
  addClientWithAdmin(description?: string, isAdmin: boolean = false): string {
    const token = Database.generateToken();
    const tokenHash = Database.hashToken(token);
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO trusted_clients (token, token_hash, description, created_at, is_admin)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(token, tokenHash, description || null, now, isAdmin ? 1 : 0);
    stmt.finalize();

    return token;
  }

  // =============================================================================
  // Telegram User Trust Methods
  // =============================================================================

  /**
   * Add a trusted Telegram user by user ID
   */
  trustTelegramUser(userId: number, username?: string, firstName?: string, description?: string): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO trusted_telegram_users 
      (telegram_user_id, username, first_name, description, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(userId, username || null, firstName || null, description || null, now);
    stmt.finalize();
  }

  /**
   * Add a trusted Telegram user by username
   */
  trustTelegramUsername(username: string, description?: string): void {
    const now = Date.now();
    // Normalize username (remove @ if present)
    const normalizedUsername = username.startsWith('@') ? username.slice(1) : username;
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO trusted_telegram_users 
      (username, description, created_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(normalizedUsername, description || null, now);
    stmt.finalize();
  }

  /**
   * Remove a trusted Telegram user by user ID
   */
  untrustTelegramUser(userId: number): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM trusted_telegram_users WHERE telegram_user_id = ?
    `);
    const result = stmt.run(userId);
    stmt.finalize();
    return result.changes > 0;
  }

  /**
   * Remove a trusted Telegram user by username
   */
  untrustTelegramUsername(username: string): boolean {
    const normalizedUsername = username.startsWith('@') ? username.slice(1) : username;
    const stmt = this.db.prepare(`
      DELETE FROM trusted_telegram_users WHERE username = ?
    `);
    const result = stmt.run(normalizedUsername);
    stmt.finalize();
    return result.changes > 0;
  }

  /**
   * Check if a Telegram user is trusted (by user ID or username)
   */
  isTelegramUserTrusted(userId: number, username?: string): boolean {
    const now = Date.now();
    
    // Check by user ID
    const idStmt = this.db.prepare(`
      SELECT id FROM trusted_telegram_users WHERE telegram_user_id = ?
    `);
    const idResult = idStmt.get(userId) as { id: number } | undefined;
    idStmt.finalize();
    
    if (idResult) {
      // Update usage stats
      const updateStmt = this.db.prepare(`
        UPDATE trusted_telegram_users 
        SET last_used_at = ?, use_count = use_count + 1 
        WHERE telegram_user_id = ?
      `);
      updateStmt.run(now, userId);
      updateStmt.finalize();
      return true;
    }
    
    // Check by username if provided
    if (username) {
      const normalizedUsername = username.startsWith('@') ? username.slice(1) : username;
      const userStmt = this.db.prepare(`
        SELECT id FROM trusted_telegram_users WHERE username = ?
      `);
      const userResult = userStmt.get(normalizedUsername) as { id: number } | undefined;
      userStmt.finalize();
      
      if (userResult) {
        // Update usage stats and associate user ID with this username
        const updateStmt = this.db.prepare(`
          UPDATE trusted_telegram_users 
          SET last_used_at = ?, use_count = use_count + 1, telegram_user_id = ?
          WHERE username = ?
        `);
        updateStmt.run(now, userId, normalizedUsername);
        updateStmt.finalize();
        return true;
      }
    }
    
    return false;
  }

  /**
   * Check if any Telegram users are trusted (returns count)
   */
  hasTrustedTelegramUsers(): boolean {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM trusted_telegram_users
    `);
    const result = stmt.get() as { count: number };
    stmt.finalize();
    return result.count > 0;
  }

  /**
   * Get count of trusted Telegram users
   */
  getTelegramUserCount(): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM trusted_telegram_users
    `);
    const result = stmt.get() as { count: number };
    stmt.finalize();
    return result.count;
  }

  /**
   * List all trusted Telegram users
   */
  listTrustedTelegramUsers(): Array<{
    id: number;
    telegramUserId: number | null;
    username: string | null;
    firstName: string | null;
    description: string | null;
    createdAt: number;
    lastUsedAt: number | null;
    useCount: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        telegram_user_id as telegramUserId,
        username,
        first_name as firstName,
        description,
        created_at as createdAt,
        last_used_at as lastUsedAt,
        use_count as useCount
      FROM trusted_telegram_users
      ORDER BY created_at DESC
    `);
    const results = stmt.all() as any[];
    stmt.finalize();
    return results;
  }

  // =============================================================================
  // Connected Agents Methods
  // =============================================================================

  /**
   * Add a connected agent
   */
  addConnectedAgent(id: string, apiKey: string, name: string, description?: string): void {
    const apiKeyHash = Database.hashToken(apiKey);
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO connected_agents (id, api_key_hash, name, description, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, apiKeyHash, name, description || null, now);
    stmt.finalize();
  }

  /**
   * Remove a connected agent
   */
  removeConnectedAgent(id: string): boolean {
    // First delete sessions
    const deleteSessionsStmt = this.db.prepare(`
      DELETE FROM connected_agent_sessions WHERE agent_id = ?
    `);
    deleteSessionsStmt.run(id);
    deleteSessionsStmt.finalize();

    // Then delete agent
    const stmt = this.db.prepare(`
      DELETE FROM connected_agents WHERE id = ?
    `);
    const result = stmt.run(id);
    stmt.finalize();

    return result.changes > 0;
  }

  /**
   * Get connected agent by ID
   */
  getConnectedAgent(id: string): { id: string; name: string; description?: string; createdAt: number } | undefined {
    const stmt = this.db.prepare(`
      SELECT id, name, description, created_at as createdAt
      FROM connected_agents WHERE id = ?
    `);
    const result = stmt.get(id) as { id: string; name: string; description?: string; createdAt: number } | undefined;
    stmt.finalize();
    return result;
  }

  /**
   * Get connected agent by API key
   */
  getConnectedAgentByApiKey(apiKey: string): { id: string; name: string; description?: string; createdAt: number } | undefined {
    const apiKeyHash = Database.hashToken(apiKey);
    const stmt = this.db.prepare(`
      SELECT id, name, description, created_at as createdAt
      FROM connected_agents WHERE api_key_hash = ?
    `);
    const result = stmt.get(apiKeyHash) as { id: string; name: string; description?: string; createdAt: number } | undefined;
    stmt.finalize();
    return result;
  }

  /**
   * Add/update agent session (subscribe or join)
   */
  setAgentSession(agentId: string, sessionId: string, mode: 'subscribed' | 'joined'): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO connected_agent_sessions (agent_id, session_id, mode)
      VALUES (?, ?, ?)
    `);
    stmt.run(agentId, sessionId, mode);
    stmt.finalize();
  }

  /**
   * Remove agent session
   */
  removeAgentSession(agentId: string, sessionId: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM connected_agent_sessions WHERE agent_id = ? AND session_id = ?
    `);
    const result = stmt.run(agentId, sessionId);
    stmt.finalize();
    return result.changes > 0;
  }

  /**
   * Get all sessions for an agent
   */
  getAgentSessions(agentId: string): { sessionId: string; mode: 'subscribed' | 'joined' }[] {
    const stmt = this.db.prepare(`
      SELECT session_id as sessionId, mode
      FROM connected_agent_sessions WHERE agent_id = ?
    `);
    const results = stmt.all(agentId) as { sessionId: string; mode: 'subscribed' | 'joined' }[];
    stmt.finalize();
    return results;
  }

  /**
   * Get all agents in a session
   */
  getSessionAgents(sessionId: string): { agentId: string; name: string; mode: 'subscribed' | 'joined' }[] {
    const stmt = this.db.prepare(`
      SELECT cas.agent_id as agentId, ca.name, cas.mode
      FROM connected_agent_sessions cas
      JOIN connected_agents ca ON ca.id = cas.agent_id
      WHERE cas.session_id = ?
    `);
    const results = stmt.all(sessionId) as { agentId: string; name: string; mode: 'subscribed' | 'joined' }[];
    stmt.finalize();
    return results;
  }

  /**
   * Check if agent can read chunks in a session
   */
  canAgentReadChunks(agentId: string, sessionId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM connected_agent_sessions 
      WHERE agent_id = ? AND session_id = ?
    `);
    const result = stmt.get(agentId, sessionId);
    stmt.finalize();
    return !!result;
  }

  /**
   * Check if agent can produce chunks in a session
   */
  canAgentProduceChunks(agentId: string, sessionId: string): boolean {
    const stmt = this.db.prepare(`
      SELECT 1 FROM connected_agent_sessions 
      WHERE agent_id = ? AND session_id = ? AND mode = 'joined'
    `);
    const result = stmt.get(agentId, sessionId);
    stmt.finalize();
    return !!result;
  }

  // =============================================================================
  // Agent Presets Methods
  // =============================================================================

  /**
   * Add a new agent preset
   */
  addAgentPreset(
    name: string,
    agentId: string,
    backend?: string,
    model?: string,
    systemPrompt?: string,
    llmParams?: Record<string, any>,
    description?: string
  ): void {
    const now = Date.now();
    const llmParamsJson = llmParams ? JSON.stringify(llmParams) : null;

    const stmt = this.db.prepare(`
      INSERT INTO agent_presets (name, description, agent_id, backend, model, system_prompt, llm_params, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(name, description || null, agentId, backend || null, model || null, systemPrompt || null, llmParamsJson, now);
    stmt.finalize();
  }

  /**
   * Update an existing agent preset
   */
  updateAgentPreset(
    id: number,
    updates: {
      name?: string;
      description?: string;
      agentId?: string;
      backend?: string;
      model?: string;
      systemPrompt?: string;
      llmParams?: Record<string, any>;
    }
  ): boolean {
    const preset = this.getAgentPresetById(id);
    if (!preset) return false;

    const name = updates.name ?? preset.name;
    const description = updates.description ?? preset.description;
    const agentId = updates.agentId ?? preset.agentId;
    const backend = updates.backend ?? preset.backend;
    const model = updates.model ?? preset.model;
    const systemPrompt = updates.systemPrompt ?? preset.systemPrompt;
    const llmParamsJson = updates.llmParams ? JSON.stringify(updates.llmParams) : (preset.llmParams ? JSON.stringify(preset.llmParams) : null);

    const stmt = this.db.prepare(`
      UPDATE agent_presets 
      SET name = ?, description = ?, agent_id = ?, backend = ?, model = ?, system_prompt = ?, llm_params = ?
      WHERE id = ?
    `);
    const result = stmt.run(name, description, agentId, backend, model, systemPrompt, llmParamsJson, id);
    stmt.finalize();
    return result.changes > 0;
  }

  /**
   * Get preset by ID
   */
  getAgentPresetById(id: number): {
    id: number;
    name: string;
    description: string | null;
    agentId: string;
    backend: string | null;
    model: string | null;
    systemPrompt: string | null;
    llmParams: Record<string, any> | null;
    createdAt: number;
  } | undefined {
    const stmt = this.db.prepare(`
      SELECT id, name, description, agent_id as agentId, backend, model, system_prompt as systemPrompt, llm_params as llmParams, created_at as createdAt
      FROM agent_presets WHERE id = ?
    `);
    const result = stmt.get(id) as any;
    stmt.finalize();
    if (result && result.llmParams) {
      result.llmParams = JSON.parse(result.llmParams);
    }
    return result;
  }

  /**
   * Get preset by name
   */
  getAgentPresetByName(name: string): {
    id: number;
    name: string;
    description: string | null;
    agentId: string;
    backend: string | null;
    model: string | null;
    systemPrompt: string | null;
    llmParams: Record<string, any> | null;
    createdAt: number;
  } | undefined {
    const stmt = this.db.prepare(`
      SELECT id, name, description, agent_id as agentId, backend, model, system_prompt as systemPrompt, llm_params as llmParams, created_at as createdAt
      FROM agent_presets WHERE name = ?
    `);
    const result = stmt.get(name) as any;
    stmt.finalize();
    if (result && result.llmParams) {
      result.llmParams = JSON.parse(result.llmParams);
    }
    return result;
  }

  /**
   * List all agent presets
   */
  listAgentPresets(): Array<{
    id: number;
    name: string;
    description: string | null;
    agentId: string;
    backend: string | null;
    model: string | null;
    systemPrompt: string | null;
    llmParams: Record<string, any> | null;
    createdAt: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT id, name, description, agent_id as agentId, backend, model, system_prompt as systemPrompt, llm_params as llmParams, created_at as createdAt
      FROM agent_presets
      ORDER BY created_at DESC
    `);
    const results = stmt.all() as any[];
    stmt.finalize();
    return results.map(r => {
      if (r.llmParams) {
        r.llmParams = JSON.parse(r.llmParams);
      }
      return r;
    });
  }

  /**
   * Delete an agent preset
   */
  deleteAgentPreset(id: number): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM agent_presets WHERE id = ?
    `);
    const result = stmt.run(id);
    stmt.finalize();
    return result.changes > 0;
  }

  /**
   * Delete an agent preset by name
   */
  deleteAgentPresetByName(name: string): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM agent_presets WHERE name = ?
    `);
    const result = stmt.run(name);
    stmt.finalize();
    return result.changes > 0;
  }

  // ============ QUICKIES ============

  addQuickie(
    presetId: number,
    name: string,
    emoji: string,
    gradientStart: string,
    gradientEnd: string,
    options?: {
      description?: string;
      starterChunk?: { contentType: string; content: string; annotations?: Record<string, any> } | null;
      uiMode?: 'chat' | 'custom';
      displayOrder?: number;
    }
  ): number {
    const now = Date.now();
    const starterChunkJson = options?.starterChunk ? JSON.stringify(options.starterChunk) : null;

    const stmt = this.db.prepare(`
      INSERT INTO quickies (preset_id, name, description, emoji, gradient_start, gradient_end, starter_chunk, ui_mode, display_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      presetId,
      name,
      options?.description || null,
      emoji,
      gradientStart,
      gradientEnd,
      starterChunkJson,
      options?.uiMode || 'chat',
      options?.displayOrder ?? 0,
      now
    );
    stmt.finalize();
    return result.lastInsertRowid as number;
  }

  updateQuickie(
    id: number,
    updates: {
      presetId?: number;
      name?: string;
      description?: string;
      emoji?: string;
      gradientStart?: string;
      gradientEnd?: string;
      starterChunk?: { contentType: string; content: string; annotations?: Record<string, any> } | null;
      uiMode?: 'chat' | 'custom';
      displayOrder?: number;
    }
  ): boolean {
    const quickie = this.getQuickieById(id);
    if (!quickie) return false;

    const presetId = updates.presetId ?? quickie.presetId;
    const name = updates.name ?? quickie.name;
    const description = updates.description ?? quickie.description;
    const emoji = updates.emoji ?? quickie.emoji;
    const gradientStart = updates.gradientStart ?? quickie.gradientStart;
    const gradientEnd = updates.gradientEnd ?? quickie.gradientEnd;
    const starterChunkJson = updates.starterChunk !== undefined
      ? (updates.starterChunk ? JSON.stringify(updates.starterChunk) : null)
      : (quickie.starterChunk ? JSON.stringify(quickie.starterChunk) : null);
    const uiMode = updates.uiMode ?? quickie.uiMode;
    const displayOrder = updates.displayOrder ?? quickie.displayOrder;

    const stmt = this.db.prepare(`
      UPDATE quickies 
      SET preset_id = ?, name = ?, description = ?, emoji = ?, gradient_start = ?, gradient_end = ?, starter_chunk = ?, ui_mode = ?, display_order = ?
      WHERE id = ?
    `);
    const result = stmt.run(presetId, name, description, emoji, gradientStart, gradientEnd, starterChunkJson, uiMode, displayOrder, id);
    stmt.finalize();
    return result.changes > 0;
  }

  getQuickieById(id: number): {
    id: number;
    presetId: number;
    name: string;
    description: string | null;
    emoji: string;
    gradientStart: string;
    gradientEnd: string;
    starterChunk: { contentType: string; content: string; annotations?: Record<string, any> } | null;
    uiMode: 'chat' | 'custom';
    displayOrder: number;
    createdAt: number;
  } | undefined {
    const stmt = this.db.prepare(`
      SELECT id, preset_id as presetId, name, description, emoji, gradient_start as gradientStart, gradient_end as gradientEnd, starter_chunk as starterChunk, ui_mode as uiMode, display_order as displayOrder, created_at as createdAt
      FROM quickies WHERE id = ?
    `);
    const result = stmt.get(id) as any;
    stmt.finalize();
    if (result) {
      if (result.starterChunk) {
        try {
          result.starterChunk = JSON.parse(result.starterChunk);
        } catch {
          result.starterChunk = null;
        }
      }
    }
    return result;
  }

  listQuickies(): Array<{
    id: number;
    presetId: number;
    presetName: string;
    name: string;
    description: string | null;
    emoji: string;
    gradientStart: string;
    gradientEnd: string;
    starterChunk: { contentType: string; content: string; annotations?: Record<string, any> } | null;
    uiMode: 'chat' | 'custom';
    displayOrder: number;
    createdAt: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT 
        q.id, q.preset_id as presetId, p.name as presetName, q.name, q.description, q.emoji, 
        q.gradient_start as gradientStart, q.gradient_end as gradientEnd, 
        q.starter_chunk as starterChunk, q.ui_mode as uiMode, q.display_order as displayOrder, q.created_at as createdAt
      FROM quickies q
      JOIN agent_presets p ON q.preset_id = p.id
      ORDER BY q.display_order ASC, q.created_at DESC
    `);
    const results = stmt.all() as any[];
    stmt.finalize();
    return results.map(r => {
      if (r.starterChunk) {
        try {
          r.starterChunk = JSON.parse(r.starterChunk);
        } catch {
          r.starterChunk = null;
        }
      }
      return r;
    });
  }

  deleteQuickie(id: number): boolean {
    const stmt = this.db.prepare(`
      DELETE FROM quickies WHERE id = ?
    `);
    const result = stmt.run(id);
    stmt.finalize();
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}

/**
 * Extract client token from request
 * Checks Authorization header first, then query param
 */
export function extractClientToken(request: Request): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      return match[1];
    }
  }

  // Check query parameter
  const url = new URL(request.url);
  const tokenParam = url.searchParams.get('token');
  if (tokenParam) {
    return tokenParam;
  }

  return null;
}

/**
 * Format a token for display (show only first and last 8 chars)
 */
export function maskToken(token: string): string {
  if (token.length <= 16) {
    return token.slice(0, 4) + '...' + token.slice(-4);
  }
  return token.slice(0, 8) + '...' + token.slice(-8);
}
