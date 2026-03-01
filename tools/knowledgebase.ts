import { Database as Sqlite } from 'bun:sqlite';
import { join } from 'path';

export interface KnowledgeEntry {
  id: number;
  content: string;
  metadata: string;
  createdAt: number;
}

export interface KnowledgeSearchResult {
  id: number;
  content: string;
  metadata: string;
  score: number;
}

class KnowledgebaseDB {
  private db: Sqlite;
  
  constructor(dbPath: string = './rxcafe-knowledge.db') {
    this.db = new Sqlite(dbPath);
    this.initializeSchema();
  }
  
  private initializeSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS knowledgebase (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      )
    `);
    
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_knowledgebase_created 
      ON knowledgebase(created_at DESC)
    `);
  }
  
  add(content: string, metadata: Record<string, any> = {}): number {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO knowledgebase (content, metadata, created_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(content, JSON.stringify(metadata), now);
    stmt.finalize();
    return this.db.query('SELECT last_insert_rowid() as id').get() as { id: number };
  }
  
  get(id: number): KnowledgeEntry | null {
    const stmt = this.db.prepare(`
      SELECT id, content, metadata, created_at as createdAt
      FROM knowledgebase WHERE id = ?
    `);
    const result = stmt.get(id) as any;
    stmt.finalize();
    return result ? { ...result, metadata: result.metadata } : null;
  }
  
  list(limit: number = 50, offset: number = 0): KnowledgeEntry[] {
    const stmt = this.db.prepare(`
      SELECT id, content, metadata, created_at as createdAt
      FROM knowledgebase ORDER BY created_at DESC LIMIT ? OFFSET ?
    `);
    const results = stmt.all(limit, offset) as any[];
    stmt.finalize();
    return results;
  }
  
  count(): number {
    const result = this.db.query('SELECT COUNT(*) as count FROM knowledgebase').get() as { count: number };
    return result.count;
  }
  
  delete(id: number): boolean {
    const stmt = this.db.prepare(`DELETE FROM knowledgebase WHERE id = ?`);
    const result = stmt.run(id);
    stmt.finalize();
    return result.changes > 0;
  }
  
  search(query: string, limit: number = 10): KnowledgeSearchResult[] {
    const queryLower = query.toLowerCase();
    const results: KnowledgeSearchResult[] = [];
    
    const entries = this.list(1000);
    
    for (const entry of entries) {
      const contentLower = entry.content.toLowerCase();
      
      let score = 0;
      
      if (contentLower.includes(queryLower)) {
        score += 10;
        
        const words = queryLower.split(/\s+/);
        for (const word of words) {
          if (word.length > 2 && contentLower.includes(word)) {
            score += 2;
          }
        }
        
        if (contentLower.startsWith(queryLower)) {
          score += 5;
        }
      }
      
      if (score > 0) {
        results.push({
          ...entry,
          score
        });
      }
    }
    
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }
  
  close(): void {
    this.db.close();
  }
}

let kbInstance: KnowledgebaseDB | null = null;

export function getKnowledgebase(): KnowledgebaseDB {
  if (!kbInstance) {
    kbInstance = new KnowledgebaseDB();
  }
  return kbInstance;
}

export class KnowledgeWriteTool {
  readonly name = 'knowledgeWrite';
  readonly systemPrompt = KNOWLEDGE_WRITE_SYSTEM_PROMPT;

  execute(parameters: KnowledgeWriteParameters): KnowledgeWriteResult {
    const { content, metadata } = parameters;
    
    try {
      const kb = getKnowledgebase();
      const id = kb.add(content, metadata || {});
      return { id, content, metadata, success: true };
    } catch (error: any) {
      return { id: 0, content, metadata: {}, success: false, error: error.message };
    }
  }
}

export interface KnowledgeWriteParameters {
  content: string;
  metadata?: Record<string, any>;
}

export interface KnowledgeWriteResult {
  id: number;
  content: string;
  metadata: Record<string, any>;
  success: boolean;
  error?: string;
}

export class KnowledgeRetrieveTool {
  readonly name = 'knowledgeRetrieve';
  readonly systemPrompt = KNOWLEDGE_RETRIEVE_SYSTEM_PROMPT;

  execute(parameters: KnowledgeRetrieveParameters): KnowledgeRetrieveResult {
    const { id } = parameters;
    
    try {
      const kb = getKnowledgebase();
      const entry = kb.get(id);
      if (!entry) {
        return { id, success: false, error: 'Entry not found' };
      }
      return { 
        id, 
        content: entry.content, 
        metadata: JSON.parse(entry.metadata || '{}'),
        createdAt: entry.createdAt,
        success: true 
      };
    } catch (error: any) {
      return { id, success: false, error: error.message };
    }
  }
}

export interface KnowledgeRetrieveParameters {
  id: number;
}

export interface KnowledgeRetrieveResult {
  id: number;
  content?: string;
  metadata?: Record<string, any>;
  createdAt?: number;
  success: boolean;
  error?: string;
}

export class KnowledgeSearchTool {
  readonly name = 'knowledgeSearch';
  readonly systemPrompt = KNOWLEDGE_SEARCH_SYSTEM_PROMPT;

  execute(parameters: KnowledgeSearchParameters): KnowledgeSearchResult {
    const { query, limit } = parameters;
    
    try {
      const kb = getKnowledgebase();
      const results = kb.search(query, limit || 10);
      return { 
        query, 
        results: results.map(r => ({
          id: r.id,
          content: r.content,
          metadata: JSON.parse(r.metadata || '{}'),
          score: r.score
        })),
        success: true 
      };
    } catch (error: any) {
      return { query, results: [], success: false, error: error.message };
    }
  }
}

export interface KnowledgeSearchParameters {
  query: string;
  limit?: number;
}

export interface KnowledgeSearchResultOutput {
  id: number;
  content: string;
  metadata: Record<string, any>;
  score: number;
}

export interface KnowledgeSearchResult {
  query: string;
  results: KnowledgeSearchResultOutput[];
  success: boolean;
  error?: string;
}

export class KnowledgeListTool {
  readonly name = 'knowledgeList';
  readonly systemPrompt = KNOWLEDGE_LIST_SYSTEM_PROMPT;

  execute(parameters: KnowledgeListParameters): KnowledgeListResult {
    const { limit, offset } = parameters;
    
    try {
      const kb = getKnowledgebase();
      const entries = kb.list(limit || 50, offset || 0);
      return { 
        entries: entries.map(e => ({
          id: e.id,
          content: e.content.slice(0, 100) + (e.content.length > 100 ? '...' : ''),
          metadata: JSON.parse(e.metadata || '{}'),
          createdAt: e.createdAt
        })),
        total: kb.count(),
        success: true 
      };
    } catch (error: any) {
      return { entries: [], total: 0, success: false, error: error.message };
    }
  }
}

export interface KnowledgeListParameters {
  limit?: number;
  offset?: number;
}

export interface KnowledgeListResult {
  entries: Array<{
    id: number;
    content: string;
    metadata: Record<string, any>;
    createdAt: number;
  }>;
  total: number;
  success: boolean;
  error?: string;
}

export const KNOWLEDGE_WRITE_SYSTEM_PROMPT = `
Tool: knowledgeWrite
Description: Stores information in the local knowledgebase for later retrieval
Parameters:
- content: The information to store (required)
- metadata: Optional metadata as JSON object (e.g., {"tags": ["important"], "source": "user"})

Returns: The ID of the stored entry and success status

To use this tool, format your response like this:
<|tool_call|>{"name":"knowledgeWrite","parameters":{"content":"The capital of France is Paris","metadata":{"tags":["geography","europe"]}}}<|tool_call_end|>
`;

export const KNOWLEDGE_RETRIEVE_SYSTEM_PROMPT = `
Tool: knowledgeRetrieve
Description: Retrieves a specific knowledgebase entry by its ID
Parameters:
- id: The ID of the entry to retrieve (required)

Returns: The content, metadata, and creation time of the entry

To use this tool, format your response like this:
<|tool_call|>{"name":"knowledgeRetrieve","parameters":{"id":1}}<|tool_call_end|>
`;

export const KNOWLEDGE_SEARCH_SYSTEM_PROMPT = `
Tool: knowledgeSearch
Description: Searches the knowledgebase for entries matching a query
Parameters:
- query: The search query (required)
- limit: Maximum number of results (optional, default: 10)

Returns: Array of matching entries with relevance scores

To use this tool, format your response like this:
<|tool_call|>{"name":"knowledgeSearch","parameters":{"query":"capital cities","limit":5}}<|tool_call_end|>
`;

export const KNOWLEDGE_LIST_SYSTEM_PROMPT = `
Tool: knowledgeList
Description: Lists all knowledgebase entries
Parameters:
- limit: Maximum number of entries to return (optional, default: 50)
- offset: Number of entries to skip (optional, default: 0)

Returns: Array of entries and total count

To use this tool, format your response like this:
<|tool_call|>{"name":"knowledgeList","parameters":{"limit":20,"offset":0}}<|tool_call_end|>
`;
