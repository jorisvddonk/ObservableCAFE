import type { Database } from '../database.js';
import type { RuntimeSessionConfig } from '../agent.js';
import { validateConfigAgainstSchema } from '../agent.js';
import {
  getAgent,
  createSession,
  addChunkToSession,
  getSession,
  type CoreConfig
} from '../../core.js';

let config: CoreConfig;
let trustDb: Database;

export function init(deps: { config: CoreConfig; trustDb: Database }) {
  config = deps.config;
  trustDb = deps.trustDb;
}

export function handleListQuickies() {
  const quickies = trustDb.listQuickies();
  
  return new Response(JSON.stringify({ quickies }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleCreateQuickie(body: any) {
  const { 
    presetId, 
    name, 
    description, 
    emoji, 
    gradientStart, 
    gradientEnd, 
    starterChunk, 
    uiMode, 
    displayOrder 
  } = body;
  
  if (!presetId || !name || !emoji || !gradientStart || !gradientEnd) {
    return new Response(JSON.stringify({ 
      error: 'Missing required fields',
      message: 'presetId, name, emoji, gradientStart, and gradientEnd are required'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Normalize uiMode - default to 'chat' if not provided
  let normalizedUIMode = uiMode || 'chat';
  
  // Validate preset exists
  const preset = trustDb.getAgentPresetById(presetId);
  if (!preset) {
    return new Response(JSON.stringify({ 
      error: 'Preset not found',
      message: `No preset with id '${presetId}'`
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const id = trustDb.addQuickie(presetId, name, emoji, gradientStart, gradientEnd, {
    description,
    starterChunk: starterChunk || null,
    uiMode: normalizedUIMode,
    displayOrder: displayOrder ?? 0
  });
  
  return new Response(JSON.stringify({ 
    success: true,
    quickie: {
      id,
      presetId,
      name,
      description,
      emoji,
      gradientStart,
      gradientEnd,
      starterChunk: starterChunk || null,
      uiMode: normalizedUIMode,
      displayOrder: displayOrder ?? 0
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleGetQuickie(quickieId: string) {
  const id = parseInt(quickieId, 10);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid quickie ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const quickie = trustDb.getQuickieById(id);
  
  if (!quickie) {
    return new Response(JSON.stringify({ error: 'Quickie not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ quickie }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleUpdateQuickie(quickieId: string, body: any) {
  const id = parseInt(quickieId, 10);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid quickie ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const quickie = trustDb.getQuickieById(id);
  
  if (!quickie) {
    return new Response(JSON.stringify({ error: 'Quickie not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const updates: any = {};
  if (body.presetId !== undefined) updates.presetId = body.presetId;
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.emoji !== undefined) updates.emoji = body.emoji;
  if (body.gradientStart !== undefined) updates.gradientStart = body.gradientStart;
  if (body.gradientEnd !== undefined) updates.gradientEnd = body.gradientEnd;
  if (body.starterChunk !== undefined) updates.starterChunk = body.starterChunk;
  if (body.uiMode !== undefined) {
    updates.uiMode = body.uiMode || 'chat';
  }
  if (body.displayOrder !== undefined) updates.displayOrder = body.displayOrder;
  
  const success = trustDb.updateQuickie(id, updates);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Failed to update quickie' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export function handleDeleteQuickie(quickieId: string) {
  const id = parseInt(quickieId, 10);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid quickie ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const success = trustDb.deleteQuickie(id);
  
  if (!success) {
    return new Response(JSON.stringify({ error: 'Quickie not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function handleLaunchQuickie(quickieId: string) {
  const id = parseInt(quickieId, 10);
  if (isNaN(id)) {
    return new Response(JSON.stringify({ error: 'Invalid quickie ID' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const quickie = trustDb.getQuickieById(id);
  
  if (!quickie) {
    return new Response(JSON.stringify({ error: 'Quickie not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Get the linked preset
  const preset = trustDb.getAgentPresetById(quickie.presetId);
  if (!preset) {
    return new Response(JSON.stringify({ 
      error: 'Preset not found',
      message: `Linked preset (id: ${quickie.presetId}) no longer exists`
    }), {
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
    // Create runtime config from preset
    const runtimeConfig: RuntimeSessionConfig = {};
    
    if (preset.backend) runtimeConfig.backend = preset.backend as any;
    if (preset.model) runtimeConfig.model = preset.model;
    if (preset.systemPrompt) runtimeConfig.systemPrompt = preset.systemPrompt;
    if (preset.llmParams) runtimeConfig.llmParams = preset.llmParams;
    
    // Validate config if agent has schema
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
    
    // Create the session
    const session = await createSession(config, { agentId: preset.agentId, runtimeConfig });
    
    // Add starter chunk if present
    if (quickie.starterChunk) {
      addChunkToSession(session, {
        contentType: quickie.starterChunk.contentType as any,
        content: quickie.starterChunk.content,
        annotations: quickie.starterChunk.annotations || {},
        emit: true
      });
    }
    
    return new Response(JSON.stringify({ 
      sessionId: session.id,
      agentName: session.agentName,
      isBackground: session.isBackground,
      hasStarterChunk: !!quickie.starterChunk,
      message: 'Session launched from quickie'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Failed to launch quickie',
      message: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
