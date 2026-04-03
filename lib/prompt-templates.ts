/**
 * Prompt Templates Registry
 * 
 * Templates define how system prompts and conversation history are formatted
 * for different LLM families. Selected via `config.promptTemplate` in runtime config.
 * 
 * Each template defines:
 * - systemPrefix / systemSuffix: wrappers around the system prompt
 * - userPrefix / userSuffix: wrappers around user messages
 * - assistantPrefix / assistantSuffix: wrappers around assistant messages
 * - systemPromptTransform: optional function to transform the system prompt text
 * - defaultStop: default stop sequences for this template
 * 
 * Usage in config chunk:
 * {
 *   "config.promptTemplate": "mistral-tekken",
 *   "config.systemPrompt": "You are {{char}}...",
 *   "config.llm.stop": ["[/INST]", "</s>", "[INST]"],
 *   "config.llm.stopTokenStrip": true
 * }
 */

export type InterpolatorFn = (text: string, vars: Record<string, string>) => string;

export const defaultInterpolator: InterpolatorFn = (text, vars) => {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => vars[name] ?? `{{${name}}}`);
};

export const nullInterpolator: InterpolatorFn = (text) => text;

export interface PromptTemplate {
  name: string;
  systemPrefix?: string;
  systemSuffix?: string;
  userPrefix: string;
  userSuffix?: string;
  assistantPrefix: string;
  assistantSuffix?: string;
  systemPromptTransform?: (prompt: string) => string;
  defaultStop?: string[];
  interpolator?: InterpolatorFn | null;
}

const registry: Map<string, PromptTemplate> = new Map();

export function registerPromptTemplate(template: PromptTemplate) {
  registry.set(template.name, template);
}

export function getPromptTemplate(name: string): PromptTemplate | undefined {
  return registry.get(name);
}

export function listPromptTemplates(): string[] {
  return Array.from(registry.keys());
}

// =============================================================================
// Built-in Templates
// =============================================================================

// Default rxcafe format
registerPromptTemplate({
  name: 'rxcafe',
  systemPrefix: 'System: ',
  userPrefix: 'User: ',
  assistantPrefix: 'Assistant:',
});

// Mistral Tekken V7
registerPromptTemplate({
  name: 'mistral-tekken',
  systemPrefix: '<s>[SYSTEM_PROMPT]',
  systemSuffix: '[/SYSTEM_PROMPT]',
  userPrefix: '[INST] ',
  userSuffix: '[/INST]',
  assistantPrefix: '',
  assistantSuffix: '</s>',
  defaultStop: ['[/INST]', '</s>', '[INST]'],
});

// Mistral Instruct v0.3
registerPromptTemplate({
  name: 'mistral-instruct',
  systemPrefix: '<s>[INST] ',
  systemSuffix: ' [/INST]',
  userPrefix: '[INST] ',
  userSuffix: ' [/INST]',
  assistantPrefix: '',
  assistantSuffix: '</s>',
  defaultStop: ['[/INST]', '</s>', '[INST]'],
});

// ChatML
registerPromptTemplate({
  name: 'chatml',
  systemPrefix: '<|im_start|>system\n',
  systemSuffix: '<|im_end|>\n',
  userPrefix: '<|im_start|>user\n',
  userSuffix: '<|im_end|>\n',
  assistantPrefix: '<|im_start|>assistant\n',
  assistantSuffix: '<|im_end|>\n',
  defaultStop: ['<|im_end|>', '<|im_start|>'],
});

// Llama 3 Instruct
registerPromptTemplate({
  name: 'llama3-instruct',
  systemPrefix: '<|start_header_id|>system<|end_header_id|>\n\n',
  systemSuffix: '<|eot_id|>',
  userPrefix: '<|start_header_id|>user<|end_header_id|>\n\n',
  userSuffix: '<|eot_id|>',
  assistantPrefix: '<|start_header_id|>assistant<|end_header_id|>\n\n',
  assistantSuffix: '<|eot_id|>',
  defaultStop: ['<|eot_id|>', '<|start_header_id|>'],
});

// Alpaca
registerPromptTemplate({
  name: 'alpaca',
  systemPrefix: 'Below is an instruction that describes a task. Write a response that appropriately completes the request.\n\n### Instruction:\n',
  userPrefix: '### Input:\n',
  userSuffix: '\n\n',
  assistantPrefix: '### Response:\n',
  defaultStop: ['### Input:', '### Response:', '### Instruction:'],
});

// Vicuna
registerPromptTemplate({
  name: 'vicuna',
  systemPrefix: 'A chat between a curious user and an artificial intelligence assistant. The assistant gives helpful, detailed, and polite answers to the user\'s questions.\n\n',
  userPrefix: 'USER: ',
  userSuffix: ' ',
  assistantPrefix: 'ASSISTANT:',
  defaultStop: ['USER:', 'ASSISTANT:'],
});

// Gemma
registerPromptTemplate({
  name: 'gemma',
  systemPrefix: '<start_of_turn>user\n',
  systemSuffix: '<end_of_turn>\n',
  userPrefix: '<start_of_turn>user\n',
  userSuffix: '<end_of_turn>\n',
  assistantPrefix: '<start_of_turn>model\n',
  assistantSuffix: '<end_of_turn>\n',
  defaultStop: ['<end_of_turn>', '<start_of_turn>'],
});

// DeepSeek
registerPromptTemplate({
  name: 'deepseek',
  systemPrefix: '<|begin_of_sentence|>',
  systemSuffix: '\n\n',
  userPrefix: 'User: ',
  userSuffix: '\n\n',
  assistantPrefix: 'Assistant: ',
  defaultStop: ['User:', 'Assistant:'],
});

// Qwen
registerPromptTemplate({
  name: 'qwen',
  systemPrefix: '<|im_start|>system\n',
  systemSuffix: '<|im_end|>\n',
  userPrefix: '<|im_start|>user\n',
  userSuffix: '<|im_end|>\n',
  assistantPrefix: '<|im_start|>assistant\n',
  assistantSuffix: '<|im_end|>\n',
  defaultStop: ['<|im_end|>', '<|im_start|>'],
});

// Phi
registerPromptTemplate({
  name: 'phi',
  systemPrefix: '<|system|>\n',
  systemSuffix: '<|end|>\n',
  userPrefix: '<|user|>\n',
  userSuffix: '<|end|>\n',
  assistantPrefix: '<|assistant|>\n',
  assistantSuffix: '<|end|>\n',
  defaultStop: ['<|end|>', '<|user|>', '<|assistant|>'],
});
