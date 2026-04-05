/**
 * Translation Evaluator
 *
 * Translates non-English text chunks to English using LLM.
 * Requires language detection annotation to be present.
 * Annotates chunks with translated text and translation metadata.
 *
 * Results are emitted to both the pipeline and session output stream
 * for persistent storage.
 */

import type { AgentSessionContext } from '../lib/agent.js';
import type { Chunk } from '../lib/chunk.js';
import { annotateChunk, createTextChunk } from '../lib/chunk.js';
import { Observable } from '../lib/stream.js';
import type { LanguageDetectionResult } from './language-detection.js';

/**
 * Result of translation
 */
export interface TranslationResult {
  originalLanguage: string;
  translatedText: string;
  wasTranslated: boolean;
}

/**
 * Higher-order function that returns a translation processor.
 * Translates non-English text to English using LLM.
 */
export function translateToEnglish(session: AgentSessionContext) {
  const evaluator = session.createLLMChunkEvaluator({
    temperature: 0,
    maxTokens: 1000
  });

  return (chunk: Chunk): Observable<Chunk> => {
    return new Observable(subscriber => {
      if (chunk.contentType !== 'text') {
        subscriber.next(chunk);
        subscriber.complete();
        return;
      }

      const text = chunk.content as string;
      if (!text || typeof text !== 'string') {
        subscriber.next(chunk);
        subscriber.complete();
        return;
      }

      const languageDetection = chunk.annotations['com.rxcafe.language-detection'] as LanguageDetectionResult;
      if (!languageDetection) {
        // No language detection available, pass through
        subscriber.next(chunk);
        subscriber.complete();
        return;
      }

      (async () => {
        try {
          let result: TranslationResult = {
            originalLanguage: languageDetection.detectedLanguage,
            translatedText: text,
            wasTranslated: false
          };

          let finalText = text;

          // If not English, translate using LLM
          if (languageDetection.detectedLanguage !== 'eng' && languageDetection.detectedLanguage !== 'und') {
            const prompt = `You are a professional translator. Translate the following text to English.

Return your response in the following XML format:
<translation>
[translated text here]
</translation>

Only include the XML tags and the translated text between them. No explanations or additional content.

<text_to_translate>
${text}
</text_to_translate>`;

            const promptChunk = createTextChunk(prompt, 'com.rxcafe.translation-prompt', {
              'llm.full-prompt': true
            });

            let translatedText = '';
            for await (const tokenChunk of evaluator.evaluateChunk(promptChunk)) {
              if (tokenChunk.contentType === 'text') {
                translatedText += tokenChunk.content;
              }
            }

            // Parse the translation from XML tags, markdown code blocks, or fallback
            translatedText = translatedText.trim();

            let extractedTranslation = '';

            // First try XML tags
            const xmlMatch = translatedText.match(/<translation>(.*?)<\/translation>/s);
            if (xmlMatch) {
              extractedTranslation = xmlMatch[1].trim();
            } else {
              // Try markdown code blocks
              const codeBlockMatch = translatedText.match(/```(?:\w+)?\n?(.*?)\n?```/s);
              if (codeBlockMatch) {
                extractedTranslation = codeBlockMatch[1].trim();
              } else {
                // Fallback to entire response
                extractedTranslation = translatedText;
              }
            }

            result.translatedText = extractedTranslation;
            result.wasTranslated = true;
            finalText = extractedTranslation;
          }

          // Create new chunk with translated text if needed
          let outputChunk = chunk;
          if (result.wasTranslated) {
            outputChunk = createTextChunk(finalText, chunk.contentType, chunk.annotations);
          }

          // Annotate with translation result
          const annotated = annotateChunk(outputChunk, 'com.rxcafe.translation', result);

          // Emit the annotated chunk to the persistent session stream
          session.outputStream.next(annotated);

          // Pass it down the pipeline
          subscriber.next(annotated);
        } catch (err) {
          console.error('[TranslationEvaluator] Translation failed:', err);
          subscriber.next(chunk);
        } finally {
          subscriber.complete();
        }
      })();
    });
  };
}