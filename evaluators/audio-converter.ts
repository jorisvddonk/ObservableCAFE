/**
 * Audio Converter Evaluator
 * Converts audio chunks between formats using ffmpeg
 * Falls back to original chunk if conversion fails or ffmpeg is unavailable
 */

import { Observable } from '../lib/stream.js';
import { createBinaryChunk, type Chunk } from '../lib/chunk.js';
import { spawn } from 'child_process';

export interface AudioConverterConfig {
  targetFormat?: string;
  targetMimeType?: string;
  ffmpegPath?: string;
}

/**
 * Detect if ffmpeg is available on the system
 */
async function isFfmpegAvailable(ffmpegPath: string = 'ffmpeg'): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, ['-version'], { stdio: 'pipe' });
    proc.on('error', () => resolve(false));
    proc.on('exit', (code) => resolve(code === 0));
    // Timeout after 2 seconds
    setTimeout(() => {
      proc.kill();
      resolve(false);
    }, 2000);
  });
}

/**
 * Convert audio buffer using ffmpeg
 */
async function convertAudio(
  inputData: Uint8Array,
  inputFormat: string,
  outputFormat: string,
  ffmpegPath: string = 'ffmpeg'
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const args = [
      '-i', 'pipe:0',
      '-f', outputFormat,
      '-codec:a', 'libmp3lame',
      '-q:a', '4',
      'pipe:1'
    ];

    const proc = spawn(ffmpegPath, args, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const chunks: Buffer[] = [];
    let errorOutput = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    proc.stderr.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });

    proc.on('exit', (code) => {
      if (code === 0) {
        const result = Buffer.concat(chunks);
        resolve(new Uint8Array(result));
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${errorOutput.slice(0, 200)}`));
      }
    });

    // Write input data
    proc.stdin.write(Buffer.from(inputData));
    proc.stdin.end();

    // Timeout after 30 seconds
    setTimeout(() => {
      proc.kill();
      reject(new Error('ffmpeg conversion timeout'));
    }, 30000);
  });
}

/**
 * Get file extension from mime type
 */
function getExtensionFromMimeType(mimeType: string): string | null {
  const mappings: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/webm': 'webm',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac'
  };
  return mappings[mimeType.toLowerCase()] || null;
}

/**
 * Check if conversion is needed
 */
function needsConversion(mimeType: string, targetMimeType: string): boolean {
  const normalizedSource = mimeType.toLowerCase().split(';')[0].trim();
  const normalizedTarget = targetMimeType.toLowerCase().split(';')[0].trim();
  return normalizedSource !== normalizedTarget;
}

/**
 * Audio converter evaluator that converts audio chunks to MP3 format
 * Falls back to original chunk if conversion fails
 */
export function convertToMp3(config: AudioConverterConfig = {}) {
  const targetMimeType = config.targetMimeType || 'audio/mpeg';
  const targetFormat = config.targetFormat || 'mp3';
  const ffmpegPath = config.ffmpegPath || 'ffmpeg';

  // Cache ffmpeg availability check
  let ffmpegAvailable: boolean | null = null;
  let ffmpegChecked = false;

  return (chunk: Chunk): Observable<Chunk> => {
    return new Observable((subscriber) => {
      const processChunk = async () => {
        try {
          // Only process binary audio chunks
          if (chunk.contentType !== 'binary') {
            subscriber.next(chunk);
            subscriber.complete();
            return;
          }

          const content = chunk.content as { data: Uint8Array; mimeType: string };
          const sourceMimeType = content.mimeType;

          // Check if already MP3
          if (!needsConversion(sourceMimeType, targetMimeType)) {
            console.log(`[AudioConverter] Chunk ${chunk.id} is already ${targetMimeType}, skipping conversion`);
            subscriber.next(chunk);
            subscriber.complete();
            return;
          }

          // Check ffmpeg availability (cached)
          if (!ffmpegChecked) {
            ffmpegAvailable = await isFfmpegAvailable(ffmpegPath);
            ffmpegChecked = true;
            console.log(`[AudioConverter] ffmpeg ${ffmpegAvailable ? 'available' : 'not available'}`);
          }

          if (!ffmpegAvailable) {
            console.log(`[AudioConverter] ffmpeg not available, passing original chunk ${chunk.id}`);
            subscriber.next(chunk);
            subscriber.complete();
            return;
          }

          const sourceExt = getExtensionFromMimeType(sourceMimeType);
          if (!sourceExt) {
            console.log(`[AudioConverter] Unknown source format ${sourceMimeType}, passing original chunk ${chunk.id}`);
            subscriber.next(chunk);
            subscriber.complete();
            return;
          }

          console.log(`[AudioConverter] Converting ${sourceMimeType} to ${targetMimeType} for chunk ${chunk.id}`);

          const convertedData = await convertAudio(
            content.data,
            sourceExt,
            targetFormat,
            ffmpegPath
          );

          console.log(`[AudioConverter] Converted ${content.data.length} bytes to ${convertedData.length} bytes`);

          // Create new chunk with converted audio
          const convertedChunk = createBinaryChunk(
            convertedData,
            targetMimeType,
            chunk.producer,
            {
              ...chunk.annotations,
              'audio.originalMimeType': sourceMimeType,
              'audio.converted': true,
              'audio.originalSize': content.data.length,
              'audio.convertedSize': convertedData.length
            }
          );

          subscriber.next(convertedChunk);
          subscriber.complete();

        } catch (error) {
          console.error(`[AudioConverter] Conversion failed for chunk ${chunk.id}:`, error);
          // Fall back to original chunk on error
          console.log(`[AudioConverter] Falling back to original chunk ${chunk.id}`);
          subscriber.next(chunk);
          subscriber.complete();
        }
      };

      processChunk().catch((err) => {
        console.error('[AudioConverter] Unexpected error:', err);
        subscriber.next(chunk);
        subscriber.complete();
      });
    });
  };
}

export default convertToMp3;
