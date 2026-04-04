/**
 * OpenAI-Compatible API Client
 * Supports streaming chat completions via POST /v1/chat/completions
 */

import { createTextChunk, createNullChunk, annotateChunk, type Chunk } from './chunk.js';
import type { LLMParams } from './agent.js';

export interface OpenAISettings {
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  seed?: number;
  stop: string[];
  presencePenalty: number;
  frequencyPenalty: number;
}

const defaultSettings: OpenAISettings = {
  baseUrl: 'http://localhost:8000',
  model: '',
  apiKey: '',
  temperature: 0.7,
  topP: 0.9,
  maxTokens: 500,
  stop: [],
  presencePenalty: 0,
  frequencyPenalty: 0,
};

export class OpenAIAPI {
  private settings: OpenAISettings;

  constructor(baseUrl?: string, model?: string, apiKey?: string, settings?: Partial<OpenAISettings>) {
    this.settings = {
      ...defaultSettings,
      ...settings,
      baseUrl: baseUrl || defaultSettings.baseUrl,
      model: model || defaultSettings.model,
      apiKey: apiKey || defaultSettings.apiKey,
    };
  }

  updateSettings(newSettings: Partial<OpenAISettings>) {
    this.settings = { ...this.settings, ...newSettings };
  }

  getModel(): string {
    return this.settings.model;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.settings.apiKey) {
      headers['Authorization'] = `Bearer ${this.settings.apiKey}`;
    }
    return headers;
  }

  async generate(prompt: string): Promise<string> {
    const response = await fetch(`${this.settings.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.settings.model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: this.settings.temperature,
        top_p: this.settings.topP,
        max_tokens: this.settings.maxTokens,
        seed: this.settings.seed,
        stop: this.settings.stop,
        presence_penalty: this.settings.presencePenalty,
        frequency_penalty: this.settings.frequencyPenalty,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`OpenAI error: ${data.error.message || data.error}`);
    }
    return data.choices?.[0]?.message?.content || '';
  }

  async *generateStream(prompt: string, abortSignal?: AbortSignal): AsyncIterable<{ token?: string; done?: boolean; finishReason?: string }> {
    console.log(`[OpenAIAPI] Generating with model: ${this.settings.model}, prompt length: ${prompt.length}`);

    const response = await fetch(`${this.settings.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.settings.model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        temperature: this.settings.temperature,
        top_p: this.settings.topP,
        max_tokens: this.settings.maxTokens,
        seed: this.settings.seed,
        stop: this.settings.stop,
        presence_penalty: this.settings.presencePenalty,
        frequency_penalty: this.settings.frequencyPenalty,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OpenAIAPI] HTTP error ${response.status}: ${errorText}`);
      throw new Error(`OpenAI error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let tokenCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (buffer.includes('\n')) {
          const newlineIndex = buffer.indexOf('\n');
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (!line || !line.startsWith('data: ')) continue;

          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') {
            console.log(`[OpenAIAPI] Generation complete, total tokens: ${tokenCount}`);
            yield { done: true, finishReason: 'stop' };
            return;
          }

          try {
            const data = JSON.parse(dataStr);

            if (data.error) {
              throw new Error(`OpenAI error: ${data.error.message || data.error}`);
            }

            const choice = data.choices?.[0];
            if (choice) {
              const content = choice.delta?.content ?? choice.text;
              if (content) {
                tokenCount++;
                yield { token: content };
              }
              if (choice.finish_reason) {
                console.log(`[OpenAIAPI] Generation complete, total tokens: ${tokenCount}, finish_reason: ${choice.finish_reason}`);
                yield { done: true, finishReason: choice.finish_reason };
                return;
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
      console.log(`[OpenAIAPI] Stream ended, total tokens: ${tokenCount}`);
    } finally {
      reader.releaseLock();
    }
  }

  async *chatStream(messages: { role: string; content: string }[], abortSignal?: AbortSignal): AsyncIterable<{ token?: string; done?: boolean; finishReason?: string }> {
    const filteredMessages = messages.filter(m => m.content.trim());

    console.log(`[OpenAIAPI] Chatting with model: ${this.settings.model}, messages: ${filteredMessages.length}`);

    const response = await fetch(`${this.settings.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.settings.model,
        messages: filteredMessages,
        stream: true,
        temperature: this.settings.temperature,
        top_p: this.settings.topP,
        max_tokens: this.settings.maxTokens,
        seed: this.settings.seed,
        stop: this.settings.stop,
        presence_penalty: this.settings.presencePenalty,
        frequency_penalty: this.settings.frequencyPenalty,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OpenAIAPI] HTTP error ${response.status}: ${errorText}`);
      throw new Error(`OpenAI error: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let tokenCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (buffer.includes('\n')) {
          const newlineIndex = buffer.indexOf('\n');
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (!line || !line.startsWith('data: ')) continue;

          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') {
            console.log(`[OpenAIAPI] Chat complete, total tokens: ${tokenCount}`);
            yield { done: true, finishReason: 'stop' };
            return;
          }

          try {
            const data = JSON.parse(dataStr);

            if (data.error) {
              throw new Error(`OpenAI error: ${data.error.message || data.error}`);
            }

            const choice = data.choices?.[0];
            if (choice) {
              const content = choice.delta?.content ?? choice.text;
              if (content) {
                tokenCount++;
                yield { token: content };
              }
              if (choice.finish_reason) {
                console.log(`[OpenAIAPI] Chat complete, total tokens: ${tokenCount}, finish_reason: ${choice.finish_reason}`);
                yield { done: true, finishReason: choice.finish_reason };
                return;
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
      console.log(`[OpenAIAPI] Stream ended, total tokens: ${tokenCount}`);
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<string[]> {
    const response = await fetch(`${this.settings.baseUrl}/v1/models`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`OpenAI error: ${response.status}`);
    }
    const data = await response.json();
    return data.data?.map((m: any) => m.id) || [];
  }
}

export class OpenAIEvaluator {
  private api: OpenAIAPI;
  private systemPrompt: string;

  constructor(baseUrl?: string, model?: string, systemPrompt: string = '', llmParams?: LLMParams, apiKey?: string) {
    const settings: Partial<OpenAISettings> = {};

    if (llmParams) {
      if (llmParams.temperature !== undefined) settings.temperature = llmParams.temperature;
      if (llmParams.maxTokens !== undefined) settings.maxTokens = llmParams.maxTokens;
      if (llmParams.topP !== undefined) settings.topP = llmParams.topP;
      if (llmParams.seed !== undefined) settings.seed = llmParams.seed;
      if (llmParams.stop !== undefined) settings.stop = llmParams.stop;
    }

    this.api = new OpenAIAPI(baseUrl, model, apiKey, settings);
    this.systemPrompt = systemPrompt;
  }

  getAPI(): OpenAIAPI {
    return this.api;
  }

  updateSystemPrompt(prompt: string) {
    this.systemPrompt = prompt;
  }

  async *evaluateChunk(chunk: Chunk): AsyncGenerator<Chunk> {
    console.log(`[OpenAIEvaluator] Evaluating chunk, contentType: ${chunk.contentType}, length: ${(chunk.content as string)?.length || 0}`);

    if (chunk.contentType !== 'text') {
      console.log(`[OpenAIEvaluator] Skipping non-text chunk`);
      yield annotateChunk(
        createNullChunk('com.rxcafe.openai-evaluator'),
        'error.message',
        'OpenAIEvaluator only accepts text chunks'
      );
      return;
    }

    const content = chunk.content as string;

    const isFullPrompt = chunk.annotations['llm.full-prompt'] === true;

    let messages: { role: string; content: string }[];
    if (isFullPrompt) {
      messages = [{ role: 'user', content }];
    } else {
      messages = [];
      if (this.systemPrompt) {
        messages.push({ role: 'system', content: this.systemPrompt });
      }
      messages.push({ role: 'user', content });
    }

    console.log(`[OpenAIEvaluator] Sending ${messages.length} messages to model ${this.api.getModel()}`);

    yield annotateChunk(
      createNullChunk('com.rxcafe.openai-evaluator'),
      'llm.generation-started',
      true
    );

    try {
      let tokenCount = 0;
      for await (const { token, done, finishReason } of this.api.chatStream(messages)) {
        if (token) {
          tokenCount++;
          if (tokenCount === 1) {
            console.log(`[OpenAIEvaluator] Received first token`);
          }
          yield createTextChunk(token, 'com.rxcafe.openai-evaluator', {
            'llm.stream': true,
            'llm.parent-chunk-id': chunk.id
          });
        }
        if (done && finishReason) {
          console.log(`[OpenAIEvaluator] Generation complete, ${tokenCount} tokens`);
          yield annotateChunk(
            createNullChunk('com.rxcafe.openai-evaluator'),
            'llm.finish-reason',
            finishReason
          );
        }
      }
      console.log(`[OpenAIEvaluator] Stream ended, ${tokenCount} total tokens`);
    } catch (error) {
      console.error(`[OpenAIEvaluator] Error:`, error);
      yield annotateChunk(
        createNullChunk('com.rxcafe.openai-evaluator'),
        'error.message',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}
