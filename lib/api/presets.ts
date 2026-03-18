/**
 * Presets API Handlers
 * 
 * REST endpoints for agent preset management:
 * - GET    /api/presets              List all presets
 * - POST   /api/presets              Create preset
 * - GET    /api/presets/:name        Get preset details
 * - PUT    /api/presets/:name        Update preset
 * - DELETE /api/presets/:name        Delete preset
 * - POST   /api/presets/:name/start  Create session from preset
 * 
 * Presets store reusable agent configurations (agent, backend, model, system prompt)
 * that can be quickly loaded to create new sessions.
 */

import type { Database } from '../database.js';
import type { RuntimeSessionConfig } from '../agent.js';
import { validateConfigAgainstSchema } from '../agent.js';
import {
  getAgent,
  createSession,
  type CoreConfig
} from '../../core.js';

let config: CoreConfig;
let trustDb: Database;

export function init(deps: { config: CoreConfig; trustDb: Database }) {
  config = deps.config;
  trustDb = deps.trustDb;
}

export function handleListPresets() {
  const presets = trustDb.listAgentPresets();
  
  return new Response(JSON.stringify({ presets }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleCreatePreset(body: any) {
  const { name, agentId, backend, model, systemPrompt, llmParams, description } = body;
  
  if (!name || !agentId) {
    return new Response(JSON.stringify({ 
      error: 'Name and agentId are required'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const existing = trustDb.getAgentPresetByName(name);
  if (existing) {
    return new Response(JSON.stringify({ 
      error: 'Preset already exists',
      message: `A preset named '${name}' already exists`
    }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const agent = getAgent(agentId);
  if (!agent) {
    return new Response(JSON.stringify({ 
      error: 'Agent not found',
      message: `No agent named '${agentId}'`
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  trustDb.addAgentPreset(name, agentId, backend, model, systemPrompt, llmParams, description);
  
  return new Response(JSON.stringify({ 
    success: true,
    preset: {
      name,
      agentId,
      backend,
      model,
      systemPrompt,
      llmParams,
      description
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleGetPreset(presetName: string) {
  const preset = trustDb.getAgentPresetByName(presetName);
  
  if (!preset) {
    return new Response(JSON.stringify({ error: 'Preset not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ preset }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleUpdatePreset(presetName: string, body: any) {
  const preset = trustDb.getAgentPresetByName(presetName);
  
  if (!preset) {
    return new Response(JSON.stringify({ error: 'Preset not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const updates: any = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.agentId !== undefined) updates.agentId = body.agentId;
  if (body.backend !== undefined) updates.backend = body.backend;
  if (body.model !== undefined) updates.model = body.model;
  if (body.systemPrompt !== undefined) updates.systemPrompt = body.systemPrompt;
  if (body.llmParams !== undefined) updates.llmParams = body.llmParams;
  
  const success = trustDb.updateAgentPreset(preset.id, updates);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Failed to update preset' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleDeletePreset(presetName: string) {
  const success = trustDb.deleteAgentPresetByName(presetName);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Preset not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleCreateSessionFromPreset(presetName: string) {
  const preset = trustDb.getAgentPresetByName(presetName);
  
  if (!preset) {
    return new Response(JSON.stringify({ error: 'Preset not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const agent = getAgent(preset.agentId);
  if (!agent) {
    return new Response(JSON.stringify({ 
      error: 'Agent not found',
      message: `Agent '${preset.agentId}' from preset no longer exists`
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    const runtimeConfig: RuntimeSessionConfig = {};
    
    if (preset.backend) runtimeConfig.backend = preset.backend as any;
    if (preset.model) runtimeConfig.model = preset.model;
    if (preset.systemPrompt) runtimeConfig.systemPrompt = preset.systemPrompt;
    if (preset.llmParams) runtimeConfig.llmParams = preset.llmParams;
    
    if (agent.configSchema) {
      const errors = await validateConfigAgainstSchema(runtimeConfig, agent.configSchema);
      if (errors.length > 0) {
        return new Response(JSON.stringify({ 
          error: 'Invalid configuration',
          message: 'Preset configuration does not meet agent requirements',
          validationErrors: errors
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    const session = await createSession(config, { agentId: preset.agentId, runtimeConfig });
    
    return new Response(JSON.stringify({ 
      sessionId: session.id,
      agentName: session.agentName,
      isBackground: session.isBackground,
      message: 'Session created from preset'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to create session from preset',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
