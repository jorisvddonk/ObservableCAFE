/**
 * LlamaCpp API Client
 * Supports both streaming and non-streaming generation via llama-server
 */

import { createTextChunk, createNullChunk, annotateChunk, type Chunk } from './chunk.js';
import type { LLMParams } from './agent.js';

export interface LlamaCppSettings {
  baseUrl: string;
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  repeatPenalty: number;
  seed?: number;
  numCtx: number;
  nPredict: number;
  cachePrompt: boolean;
  stream: boolean;
  stop: string[];
  minP: number;
  tfsZ: number;
  typicalP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  mirostat: number;
  mirostatTau: number;
  mirostatEta: number;
  penalizeNewline: boolean;
  repeatLastN: number;
}

const defaultSettings: LlamaCppSettings = {
  baseUrl: 'http://localhost:8080',
  model: 'model.gguf',
  temperature: 0.7,
  topP: 0.9,
  topK: 40,
  repeatPenalty: 1.1,
  numCtx: 4096,
  nPredict: 500,
  cachePrompt: true,
  stream: true,
  stop: [],
  minP: 0,
  tfsZ: 1,
  typicalP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  mirostat: 0,
  mirostatTau: 5,
  mirostatEta: 0.1,
  penalizeNewline: true,
  repeatLastN: 64,
};

export class LlamaCppAPI {
  private settings: LlamaCppSettings;

  constructor(baseUrl?: string, model?: string, settings?: Partial<LlamaCppSettings>) {
    this.settings = {
      ...defaultSettings,
      ...settings,
      baseUrl: baseUrl || defaultSettings.baseUrl,
      model: model || defaultSettings.model,
    };
  }

  updateSettings(newSettings: Partial<LlamaCppSettings>) {
    this.settings = { ...this.settings, ...newSettings };
  }

  getModel(): string {
    return this.settings.model;
  }

  async generate(prompt: string): Promise<string> {
    const response = await fetch(`${this.settings.baseUrl}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: this.settings.model,
        stream: false,
        temperature: this.settings.temperature,
        top_p: this.settings.topP,
        top_k: this.settings.topK,
        repeat_penalty: this.settings.repeatPenalty,
        seed: this.settings.seed,
        n_ctx: this.settings.numCtx,
        n_predict: this.settings.nPredict,
        cache_prompt: this.settings.cachePrompt,
        stop: this.settings.stop,
        min_p: this.settings.minP,
        tfs_z: this.settings.tfsZ,
        typical_p: this.settings.typicalP,
        frequency_penalty: this.settings.frequencyPenalty,
        presence_penalty: this.settings.presencePenalty,
        mirostat: this.settings.mirostat,
        mirostat_tau: this.settings.mirostatTau,
        mirostat_eta: this.settings.mirostatEta,
        penalize_newline: this.settings.penalizeNewline,
        repeat_last_n: this.settings.repeatLastN,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LlamaCpp error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.content || data.completion || '';
  }

  async *generateStream(prompt: string, abortSignal?: AbortSignal): AsyncIterable<{ token?: string; done?: boolean; finishReason?: string }> {
    console.log(`[LlamaCppAPI] Generating with model: ${this.settings.model}, prompt length: ${prompt.length}`);
    
    const response = await fetch(`${this.settings.baseUrl}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: this.settings.model,
        stream: true,
        temperature: this.settings.temperature,
        top_p: this.settings.topP,
        top_k: this.settings.topK,
        repeat_penalty: this.settings.repeatPenalty,
        seed: this.settings.seed,
        n_ctx: this.settings.numCtx,
        n_predict: this.settings.nPredict,
        cache_prompt: this.settings.cachePrompt,
        stop: this.settings.stop,
        min_p: this.settings.minP,
        tfs_z: this.settings.tfsZ,
        typical_p: this.settings.typicalP,
        frequency_penalty: this.settings.frequencyPenalty,
        presence_penalty: this.settings.presencePenalty,
        mirostat: this.settings.mirostat,
        mirostat_tau: this.settings.mirostatTau,
        mirostat_eta: this.settings.mirostatEta,
        penalize_newline: this.settings.penalizeNewline,
        repeat_last_n: this.settings.repeatLastN,
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LlamaCppAPI] HTTP error ${response.status}: ${errorText}`);
      throw new Error(`LlamaCpp error: ${response.status} - ${errorText}`);
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

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr.trim() === '[DONE]') {
              console.log(`[LlamaCppAPI] Generation complete, total tokens: ${tokenCount}`);
              yield { done: true, finishReason: 'stop' };
              return;
            }

            try {
              const data = JSON.parse(dataStr);
              if (data.content) {
                tokenCount++;
                if (tokenCount === 1) {
                  console.log(`[LlamaCppAPI] Received first token`);
                }
                yield { token: data.content };
              }
              if (data.stop) {
                console.log(`[LlamaCppAPI] Generation complete, total tokens: ${tokenCount}`);
                yield { done: true, finishReason: data.finish_reason || 'stop' };
                return;
              }
            } catch (e) {
              continue;
            }
          }
        }
      }
      console.log(`[LlamaCppAPI] Stream ended, total tokens: ${tokenCount}`);
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.settings.baseUrl}/v1/models`);
      if (!response.ok) {
        throw new Error(`LlamaCpp error: ${response.status}`);
      }
      const data = await response.json();
      return data.data?.map((m: any) => m.id) || [];
    } catch {
      return [this.settings.model];
    }
  }
}

export class LlamaCppEvaluator {
  private api: LlamaCppAPI;
  private systemPrompt: string;

  constructor(baseUrl?: string, model?: string, systemPrompt: string = '', llmParams?: LLMParams) {
    const settings: Partial<LlamaCppSettings> = {};
    
    if (llmParams) {
      if (llmParams.temperature !== undefined) settings.temperature = llmParams.temperature;
      if (llmParams.maxTokens !== undefined) settings.nPredict = llmParams.maxTokens;
      if (llmParams.topP !== undefined) settings.topP = llmParams.topP;
      if (llmParams.topK !== undefined) settings.topK = llmParams.topK;
      if (llmParams.repeatPenalty !== undefined) settings.repeatPenalty = llmParams.repeatPenalty;
      if (llmParams.seed !== undefined) settings.seed = llmParams.seed;
      if (llmParams.numCtx !== undefined) settings.numCtx = llmParams.numCtx;
      if (llmParams.stop !== undefined) settings.stop = llmParams.stop;
    }
    
    this.api = new LlamaCppAPI(baseUrl, model, settings);
    this.systemPrompt = systemPrompt;
  }

  getAPI(): LlamaCppAPI {
    return this.api;
  }

  updateSystemPrompt(prompt: string) {
    this.systemPrompt = prompt;
  }

  async *evaluateChunk(chunk: Chunk): AsyncGenerator<Chunk> {
    console.log(`[LlamaCppEvaluator] Evaluating chunk, contentType: ${chunk.contentType}, length: ${(chunk.content as string)?.length || 0}`);
    
    if (chunk.contentType !== 'text') {
      console.log(`[LlamaCppEvaluator] Skipping non-text chunk`);
      yield annotateChunk(
        createNullChunk('com.rxcafe.llamacpp-evaluator'),
        'error.message',
        'LlamaCppEvaluator only accepts text chunks'
      );
      return;
    }

    const content = chunk.content as string;
    
    const isFullPrompt = chunk.annotations['llm.full-prompt'] === true;
    
    let prompt: string;
    if (isFullPrompt) {
      prompt = this.systemPrompt 
        ? `${this.systemPrompt}\n\n${content}`
        : content;
    } else {
      prompt = this.systemPrompt 
        ? `${this.systemPrompt}\n\nUser: ${content}\nAssistant:`
        : `User: ${content}\nAssistant:`;
    }

    console.log(`[LlamaCppEvaluator] Sending prompt (${prompt.length} chars) to model ${this.api.getModel()}`);

    yield annotateChunk(
      createNullChunk('com.rxcafe.llamacpp-evaluator'),
      'llm.generation-started',
      true
    );

    try {
      let tokenCount = 0;
      for await (const { token, done, finishReason } of this.api.generateStream(prompt)) {
        if (token) {
          tokenCount++;
          if (tokenCount === 1) {
            console.log(`[LlamaCppEvaluator] Received first token`);
          }
          yield createTextChunk(token, 'com.rxcafe.llamacpp-evaluator', {
            'llm.stream': true,
            'llm.parent-chunk-id': chunk.id
          });
        }
        if (done && finishReason) {
          console.log(`[LlamaCppEvaluator] Generation complete, ${tokenCount} tokens`);
          yield annotateChunk(
            createNullChunk('com.rxcafe.llamacpp-evaluator'),
            'llm.finish-reason',
            finishReason
          );
        }
      }
      console.log(`[LlamaCppEvaluator] Stream ended, ${tokenCount} total tokens`);
    } catch (error) {
      console.error(`[LlamaCppEvaluator] Error:`, error);
      yield annotateChunk(
        createNullChunk('com.rxcafe.llamacpp-evaluator'),
        'error.message',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}
