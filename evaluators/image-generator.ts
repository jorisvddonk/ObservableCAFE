import type { AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { createBinaryChunk, createTextChunk, annotateChunk } from '../lib/chunk.js';
import { filter, mergeMap, Observable, EMPTY, from } from '../lib/stream.js';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

interface ComfyUIConfig {
  host: string;
  port: number;
  outputFolder: string;
}

const DEFAULT_COMFYUI_CONFIG: ComfyUIConfig = {
  host: 'localhost',
  port: 8188,
  outputFolder: 'generated/images'
};

const DEFAULT_WORKFLOW = {
  "3": {
    "inputs": {
      "seed": 0,
      "steps": 20,
      "cfg": 8,
      "sampler_name": "euler",
      "scheduler": "normal",
      "denoise": 1,
      "model": ["4", 0],
      "positive": ["6", 0],
      "negative": ["7", 0],
      "latent_image": ["5", 0]
    },
    "class_type": "KSampler",
    "_meta": { "title": "KSampler" }
  },
  "4": {
    "inputs": { "ckpt_name": "v1-5-pruned-emaonly-fp16.safetensors" },
    "class_type": "CheckpointLoaderSimple",
    "_meta": { "title": "Load Checkpoint" }
  },
  "5": {
    "inputs": { "width": 512, "height": 512, "batch_size": 1 },
    "class_type": "EmptyLatentImage",
    "_meta": { "title": "Empty Latent Image" }
  },
  "6": {
    "inputs": {
      "text": "beautiful scenery nature glass bottle landscape, purple galaxy bottle,",
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (positive)" }
  },
  "7": {
    "inputs": {
      "text": "text, watermark",
      "clip": ["4", 1]
    },
    "class_type": "CLIPTextEncode",
    "_meta": { "title": "CLIP Text Encode (negative)" }
  },
  "8": {
    "inputs": {
      "samples": ["3", 0],
      "vae": ["4", 2]
    },
    "class_type": "VAEDecode",
    "_meta": { "title": "VAE Decode" }
  },
  "9": {
    "inputs": {
      "filename": "filename",
      "path": "~",
      "extension": "png",
      "lossless_webp": true,
      "quality_jpeg_or_webp": 100,
      "optimize_png": false,
      "embed_workflow": true,
      "save_workflow_as_json": false,
      "counter": 0,
      "time_format": "%Y-%m-%d-%H%M%S",
      "show_preview": true,
      "images": ["8", 0]
    },
    "class_type": "Image Saver Simple",
    "_meta": { "title": "Image Saver Simple" }
  }
};

export interface ImageGenerationResult {
  filename: string;
  subfolder: string;
  type: string;
  path: string;
}

export function generateImage(session: AgentSessionContext) {
  const outputDir = join(process.cwd(), DEFAULT_COMFYUI_CONFIG.outputFolder);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  return (source: Observable<Chunk>): Observable<Chunk> => {
    return new Observable(subscriber => {
      const subscription = source.subscribe({
        next: async (chunk: Chunk) => {
          if (chunk.contentType !== 'text' || chunk.annotations['chat.role'] !== 'user') {
            subscriber.next(chunk);
            return;
          }

          const text = chunk.content as string;
          const lowerText = text.toLowerCase();
          
          if (!lowerText.includes('image') && !lowerText.includes('generate') && !lowerText.includes('draw') && !lowerText.includes('paint')) {
            subscriber.next(chunk);
            return;
          }

          const runtimeConfig = session.config.sessionConfig || {};
          const config: ComfyUIConfig = runtimeConfig['config.comfyui'] || DEFAULT_COMFYUI_CONFIG;

          try {
            session.outputStream.next(createTextChunk(
              '🎨 Generating image...',
              'com.rxcafe.image-generator',
              { 'chat.role': 'assistant' }
            ));

            const sceneDescription = await callLLM(session,
              `You are an image description generator. Describe the scene in detail based on this request: "${text}"

Provide a vivid, detailed description focusing on:
- Main subject(s) and appearance
- Setting/environment details
- Lighting and mood
- Composition and framing

Description:`
            );

            const positivePrompt = await callLLM(session,
              `Convert this scene description into a detailed Stable Diffusion image generation prompt.

Scene description: ${sceneDescription}

Guidelines:
- Be specific and descriptive
- Include quality keywords (highly detailed, 8k, masterpiece)
- Include style keywords (photorealistic, digital art, oil painting)
- Include lighting and composition details
- Separate concepts with commas

Generate ONLY the positive prompt, no explanations:`
            );

            const negativePrompt = await callLLM(session,
              `Generate a negative prompt for Stable Diffusion.

Scene description: ${sceneDescription}

Include common quality issues (blurry, low quality, distorted) and unwanted styles.

Generate ONLY the negative prompt, no explanations:`
            );

            const result = await generateComfyUIImage(config, positivePrompt, negativePrompt, session.id);

            const imageData = readFileSync(result.path);
            const imageChunk = createBinaryChunk(
              new Uint8Array(imageData),
              'image/png',
              'com.rxcafe.image-generator',
              {
                'image.file': result.filename,
                'image.subfolder': result.subfolder,
                'image.positivePrompt': positivePrompt,
                'image.negativePrompt': negativePrompt,
                'image.sceneDescription': sceneDescription,
                'chat.role': 'assistant'
              }
            );

            session.outputStream.next(imageChunk);

            session.outputStream.next(createTextChunk(
              `✅ Generated: ${result.filename}`,
              'com.rxcafe.image-generator',
              { 'chat.role': 'assistant' }
            ));

            subscriber.next(chunk);

          } catch (error) {
            console.error('[ImageGenerator] Error:', error);
            session.outputStream.next(createTextChunk(
              `❌ Image generation failed: ${error}`,
              'com.rxcafe.image-generator',
              { 'chat.role': 'assistant' }
            ));
            subscriber.next(chunk);
          }
        },
        error: (err) => subscriber.error(err),
        complete: () => subscriber.complete()
      });

      return () => subscription.unsubscribe();
    });
  };
}

async function callLLM(session: AgentSessionContext, systemPrompt: string): Promise<string> {
  const evaluator = session.createLLMChunkEvaluator();
  
  const promptChunk: Chunk = {
    id: `prompt-${Date.now()}`,
    timestamp: Date.now(),
    contentType: 'text',
    content: systemPrompt,
    producer: 'com.rxcafe.image-generator',
    annotations: {}
  };

  let fullResponse = '';
  
  for await (const tokenChunk of evaluator.evaluateChunk(promptChunk)) {
    if (tokenChunk.content && typeof tokenChunk.content === 'string') {
      fullResponse += tokenChunk.content;
    }
  }

  return fullResponse.trim();
}

async function generateComfyUIImage(
  config: ComfyUIConfig,
  positivePrompt: string,
  negativePrompt: string,
  sessionId: string
): Promise<ImageGenerationResult> {
  const workflow = JSON.parse(JSON.stringify(DEFAULT_WORKFLOW));

  let positiveNodeId: string | null = null;
  let negativeNodeId: string | null = null;
  let seedNodeId: string | null = null;

  for (const nodeId in workflow) {
    const node = workflow[nodeId];
    if (node.class_type === 'CLIPTextEncode' && node.inputs) {
      const title = node._meta?.title || '';
      if (title.toLowerCase().includes('positive')) {
        positiveNodeId = nodeId;
        node.inputs.text = positivePrompt;
      } else if (title.toLowerCase().includes('negative')) {
        negativeNodeId = nodeId;
        node.inputs.text = negativePrompt;
      } else if (!positiveNodeId) {
        positiveNodeId = nodeId;
        node.inputs.text = positivePrompt;
      } else if (!negativeNodeId) {
        negativeNodeId = nodeId;
        node.inputs.text = negativePrompt;
      }
    } else if ((node.class_type === 'Seed (rgthree)' || node.class_type === 'Seed') && node.inputs) {
      seedNodeId = nodeId;
      node.inputs.seed = Math.floor(Math.random() * 1000000);
    } else if (node.class_type === 'KSampler' && node.inputs && !seedNodeId && node.inputs.seed) {
      seedNodeId = nodeId;
      node.inputs.seed = Math.floor(Math.random() * 1000000);
    }
  }

  const filename = `${sessionId}_image_${Date.now()}.png`;
  for (const nodeId in workflow) {
    const node = workflow[nodeId];
    if (node.class_type === 'Image Saver Simple' || node.class_type === 'SaveImage') {
      if (node.inputs?.filename_prefix) {
        node.inputs.filename_prefix = filename.replace('.png', '');
      } else if (node.inputs?.filename) {
        node.inputs.filename = filename;
      }
      if (node.inputs?.path && node.inputs.path === '~') {
        node.inputs.path = join(process.cwd(), config.outputFolder);
      }
    }
  }

  const clientId = `rxcafe_${Date.now()}`;
  
  const queueResponse = await sendRequest(config.host, config.port, '/prompt', {
    prompt: workflow,
    client_id: clientId
  });

  if (!queueResponse.prompt_id) {
    throw new Error('Failed to queue prompt: ' + JSON.stringify(queueResponse));
  }

  const promptId = queueResponse.prompt_id;
  const maxAttempts = 60;
  
  for (let attempts = 0; attempts < maxAttempts; attempts++) {
    await new Promise(resolve => setTimeout(resolve, 5000));

    const history = await sendRequest(config.host, config.port, `/history/${promptId}`, {}, 'GET');

    if (history && history[promptId]?.status?.completed) {
      const outputs = history[promptId].outputs;
      for (const nodeId in outputs) {
        if (outputs[nodeId].images && outputs[nodeId].images.length > 0) {
          const images = outputs[nodeId].images;
          for (const img of images) {
            const imagePath = join(process.cwd(), config.outputFolder, img.filename);
            if (existsSync(imagePath)) {
              return {
                filename: img.filename,
                subfolder: img.subfolder || '',
                type: img.type || 'output',
                path: imagePath
              };
            }
          }
        }
      }
    }
  }

  throw new Error('Image generation timed out');
}

async function sendRequest(host: string, port: number, path: string, data?: any, method: string = 'POST'): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: host,
      port,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = require('http').request(options, (res: any) => {
      let body = '';
      res.on('data', (chunk: any) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

// ts-prune-ignore-next
export default generateImage;
