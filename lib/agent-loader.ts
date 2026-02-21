/**
 * RXCAFE Agent Loader
 * Auto-discovers and loads agent definitions from agents/*.ts
 */

import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, existsSync } from 'fs';
import type { AgentDefinition } from './agent.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const agents = new Map<string, AgentDefinition>();
let loaded = false;

export async function loadAgents(): Promise<Map<string, AgentDefinition>> {
  if (loaded) {
    return agents;
  }
  
  const searchPaths: string[] = [];
  
  // 1. Add default agents directory
  const defaultDir = join(__dirname, '..', 'agents');
  if (existsSync(defaultDir)) {
    searchPaths.push(defaultDir);
  }

  // 2. Add paths from environment variable
  const envPaths = process.env.RXCAFE_AGENT_SEARCH_PATHS;
  if (envPaths) {
    const paths = envPaths.split(':').map(p => resolve(p.trim())).filter(p => p.length > 0);
    searchPaths.push(...paths);
  }

  if (searchPaths.length === 0) {
    console.log(`[AgentLoader] No agent directories found.`);
    loaded = true;
    return agents;
  }

  for (const dir of searchPaths) {
    if (!existsSync(dir)) {
      console.log(`[AgentLoader] Directory not found: ${dir}`);
      continue;
    }

    console.log(`[AgentLoader] Scanning directory for agents: ${dir}`);
    
    try {
      const files = readdirSync(dir)
        .filter(f => f.endsWith('.ts'))
        .map(f => join(dir, f));
      
      for (const file of files) {
        try {
          const module = await import(file);
          
          // Check named exports first
          for (const exportName of Object.keys(module)) {
            if (exportName === 'default') continue;
            
            const exported = module[exportName];
            
            if (isAgentDefinition(exported) && !agents.has(exported.name)) {
              agents.set(exported.name, exported);
              console.log(`[AgentLoader] Loaded agent: ${exported.name}${exported.startInBackground ? ' (background)' : ''} from ${file}`);
            }
          }
          
          // Then check default export if no named agent was found
          if (module.default && isAgentDefinition(module.default) && !agents.has(module.default.name)) {
            agents.set(module.default.name, module.default);
            console.log(`[AgentLoader] Loaded agent: ${module.default.name}${module.default.startInBackground ? ' (background)' : ''} from ${file}`);
          }
        } catch (err) {
          console.error(`[AgentLoader] Failed to load ${file}:`, err);
        }
      }
    } catch (err) {
      console.error(`[AgentLoader] Failed to scan directory ${dir}:`, err);
    }
  }
  
  loaded = true;
  return agents;
}

export function getAgent(name: string): AgentDefinition | undefined {
  return agents.get(name);
}

export function listAgents(): AgentDefinition[] {
  return Array.from(agents.values());
}

export function listBackgroundAgents(): AgentDefinition[] {
  return Array.from(agents.values()).filter(a => a.startInBackground);
}

export function clearAgents(): void {
  agents.clear();
  loaded = false;
}

function isAgentDefinition(obj: unknown): obj is AgentDefinition {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as AgentDefinition).name === 'string' &&
    typeof (obj as AgentDefinition).initialize === 'function'
  );
}
