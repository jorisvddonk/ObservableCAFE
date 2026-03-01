import type { CoreConfig, AddChunkOptions } from '../core.js';
import type { Database } from '../database.js';
import type { SessionStore } from '../session-store.js';

let config: CoreConfig;
let trustDb: Database;
let sessionStore: SessionStore;

export function initApiHandlers(deps: { config: CoreConfig; trustDb: Database; sessionStore: SessionStore }) {
  config = deps.config;
  trustDb = deps.trustDb;
  sessionStore = deps.sessionStore;
  
  import('./session.js').then(m => m.init({ config, sessionStore }));
  import('./chat.js').then(m => m.init({ config }));
  // connected-agents and streams don't need init
}

export { handleCreateSession, handleListSessions, handleDeleteSession, handleGetHistory, handleToggleTrust } from './session.js';
export { handleChatStream, handleFetchWeb, handleAddChunk, handleAbort, handleListModels, handleListAgents } from './chat.js';
export { 
  handleRegisterConnectedAgent, 
  handleUnregisterConnectedAgent, 
  handleGetAgentSessions, 
  handleAgentSubscribe, 
  handleAgentUnsubscribe, 
  handleAgentJoin, 
  handleAgentLeave, 
  handleGetSessionConnectedAgents, 
  handleAgentSessionStream, 
  handleAgentProduceChunk 
} from './connected-agents.js';
export { handleSessionStream, handleErrorStream, handleSystemCommand } from './streams.js';
