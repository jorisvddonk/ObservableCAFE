/**
 * Prompt Templates API
 * Returns available templates and their metadata to the frontend.
 */

import { listPromptTemplates, getPromptTemplate } from '../prompt-templates.js';

export async function handleListTemplates(): Promise<Response> {
  const templates = listPromptTemplates().map(name => {
    const t = getPromptTemplate(name)!;
    return {
      name: t.name,
      defaultStop: t.defaultStop || null,
    };
  });
  
  return new Response(JSON.stringify({ templates }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
