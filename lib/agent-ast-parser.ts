import * as ts from 'typescript';

/**
 * Extract the largest TypeScript code block from LLM output.
 * Handles cases where LLM includes prose, multiple code blocks, or markdown.
 */
export function extractLargestCodeBlock(text: string): string {
  // Pattern to match code blocks: ```typescript...``` or ```ts...``` or ```...```
  const codeBlockPattern = /```(?:typescript|ts)?\n?([\s\S]*?)```/g;
  const matches: string[] = [];

  let match;
  while ((match = codeBlockPattern.exec(text)) !== null) {
    matches.push(match[1].trim());
  }

  if (matches.length > 0) {
    // Return the largest code block (most likely to be the full agent)
    return matches.reduce((a, b) => a.length > b.length ? a : b);
  }

  // No code blocks found - try to extract code by looking for common patterns
  // Look for content between imports and the last export
  const importMatch = text.match(/^(import\s+.*?from\s+['"].*?['"];?\s*)+/);
  const exportMatch = text.match(/export\s+(?:const|default)\s+\w+.*?;/);

  if (importMatch || exportMatch) {
    const startIdx = importMatch ? text.indexOf(importMatch[0]) : 0;
    const endIdx = exportMatch
      ? text.indexOf(exportMatch[0]) + exportMatch[0].length
      : text.length;
    return text.slice(startIdx, endIdx).trim();
  }

  // Last resort: return the original text stripped of obvious prose markers
  return text
    .replace(/^(Here is|Here's|The following|This is|Below is)[^\n]*/i, '')
    .replace(/\n\n(Note:|Explanation:|This code|This agent)[^]*/i, '')
    .trim();
}

export interface ParsedOperator {
  name: string;
  type: string;
  description: string;
}

export interface PipelineAnalysis {
  name: string;
  description: string;
  operators: ParsedOperator[];
  sourceCode: string;
}

const EVALUATOR_DESCRIPTIONS: Record<string, string> = {
  parseMarkdownForVoice: 'Parses markdown for voice output',
  generateVoice: 'Generates voice audio',
  analyzeSentiment: 'Analyzes sentiment',
  detectToolCalls: 'Detects tool calls',
  detectTools: 'Detects tool calls',
  executeTools: 'Executes tools',
  createEvaluator: 'Creates LLM evaluator',
  createLLMChunkEvaluator: 'LLM completion',
  completeTurnWithLLM: 'LLM response generation',
  processWithEvaluator: 'Processes with evaluator',
  generateImage: 'Generates image via ComfyUI'
};

function getEvaluatorDescription(name: string): string {
  if (EVALUATOR_DESCRIPTIONS[name]) return EVALUATOR_DESCRIPTIONS[name];
  for (const [key, desc] of Object.entries(EVALUATOR_DESCRIPTIONS)) {
    if (name.toLowerCase().includes(key.toLowerCase())) return desc;
  }
  return name;
}

export function analyzeAgentPipeline(code: string): PipelineAnalysis {
  const sourceFile = ts.createSourceFile(
    'agent.ts',
    code,
    ts.ScriptTarget.Latest,
    true
  );

  const result: PipelineAnalysis = {
    name: 'Unknown Pipeline',
    description: '',
    operators: [],
    sourceCode: code
  };

  // Extract agent name and description
  ts.forEachChild(sourceFile, function visit(node) {
    // Find export const name: AgentDefinition
    if (ts.isVariableDeclaration(node) && 
        node.type?.getText(sourceFile).includes('AgentDefinition')) {
      result.name = node.name.getText(sourceFile);
      
      // Look for description property
      if (node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
        for (const prop of node.initializer.properties) {
          if (ts.isPropertyAssignment(prop) && 
              prop.name.getText(sourceFile) === 'description' &&
              ts.isStringLiteral(prop.initializer)) {
            result.description = prop.initializer.text;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  });

  // Find pipe chain
  function findPipe(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const exprText = node.expression.getText(sourceFile);
      // Check for .pipe( or .pipe followed by parentheses in parent
      if (exprText === 'pipe' || exprText.endsWith('.pipe')) {
        result.operators = extractOperators(node, sourceFile);
        return;
      }
    }
    ts.forEachChild(node, findPipe);
  }
  ts.forEachChild(sourceFile, findPipe);

  return result;
}

function extractOperators(pipeCall: ts.CallExpression, sourceFile: ts.SourceFile): ParsedOperator[] {
  const operators: ParsedOperator[] = [];

  for (const arg of pipeCall.arguments) {
    const op = parseOperator(arg, sourceFile);
    if (op) operators.push(op);
  }

  return operators;
}

function parseOperator(node: ts.Node, sourceFile: ts.SourceFile): ParsedOperator | null {
  // Handle catchError - skip it
  if (ts.isCallExpression(node)) {
    const funcName = node.expression.getText(sourceFile);
    if (funcName === 'catchError') return null;
  }

  // filter((chunk) => condition)
  if (ts.isCallExpression(node) && 
      node.expression.getText(sourceFile) === 'filter') {
    return parseFilter(node.arguments[0], sourceFile);
  }

  // map((chunk) => transform)
  if (ts.isCallExpression(node) && 
      node.expression.getText(sourceFile) === 'map') {
    return parseMap(node.arguments[0], sourceFile);
  }

  // mergeMap/switchMap/concatMap
  if (ts.isCallExpression(node)) {
    const funcName = node.expression.getText(sourceFile);
    if (['mergeMap', 'switchMap', 'concatMap'].includes(funcName)) {
      return parseMapOperator(funcName, node.arguments[0], sourceFile);
    }
  }

  // tap
  if (ts.isCallExpression(node) && 
      node.expression.getText(sourceFile) === 'tap') {
    return {
      name: 'tap',
      type: 'Side Effect',
      description: 'Performs side effect'
    };
  }

  // Direct evaluator references like detectToolCalls()
  if (ts.isCallExpression(node) && node.arguments.length === 0) {
    const name = node.expression.getText(sourceFile);
    const desc = getEvaluatorDescription(name);
    if (desc !== name) {
      return {
        name,
        type: 'Custom Evaluator',
        description: desc
      };
    }
  }

  return null;
}

function parseFilter(arg: ts.Node, sourceFile: ts.SourceFile): ParsedOperator {
  const text = arg.getText(sourceFile);
  
  if (text.includes('contentType')) {
    const match = text.match(/contentType\s*===?\s*['"]([^'"]+)['"]/);
    return {
      name: 'filter',
      type: 'Type Filter',
      description: match ? `Only ${match[1]} content` : 'Filters content type'
    };
  }
  
  if (text.includes('trust')) {
    return {
      name: 'filter',
      type: 'Security Filter',
      description: 'Trusted content only'
    };
  }

  if (text.includes('chat.role')) {
    const match = text.match(/chat\.role\s*===?\s*['"]([^'"]+)['"]/);
    return {
      name: 'filter',
      type: 'Role Filter',
      description: match ? `Only ${match[1]} messages` : 'Filters by role'
    };
  }

  return {
    name: 'filter',
    type: 'Condition Filter',
    description: text.length > 40 ? text.slice(0, 40) + '...' : text
  };
}

function parseMap(arg: ts.Node, sourceFile: ts.SourceFile): ParsedOperator {
  const text = arg.getText(sourceFile);

  if (text.includes('annotateChunk')) {
    const match = text.match(/annotateChunk\([^,]+,\s*['"]([^'"]+)['"]/);
    return {
      name: 'map',
      type: 'Annotation',
      description: match ? `Sets ${match[1]}` : 'Adds annotation'
    };
  }

  return {
    name: 'map',
    type: 'Transform',
    description: text.length > 40 ? text.slice(0, 40) + '...' : text
  };
}

function parseMapOperator(funcName: string, arg: ts.Node, sourceFile: ts.SourceFile): ParsedOperator {
  const text = arg.getText(sourceFile);
  const foundEvaluators: string[] = [];

  // Walk the AST to find all function calls
  function findCalls(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const callName = node.expression.getText(sourceFile);
      // Check for direct evaluator calls
      if (EVALUATOR_DESCRIPTIONS[callName]) {
        foundEvaluators.push(callName);
      }
      // Check for session.createEvaluator pattern
      if (callName.startsWith('session.')) {
        const method = callName.split('.')[1];
        if (EVALUATOR_DESCRIPTIONS[method]) {
          foundEvaluators.push(method);
        }
      }
    }
    ts.forEachChild(node, findCalls);
  }
  findCalls(arg);

  // Check for completeTurnWithLLM
  const hasLLM = text.includes('completeTurnWithLLM');
  if (hasLLM) {
    foundEvaluators.push('completeTurnWithLLM');
  }

  if (foundEvaluators.length === 0) {
    return {
      name: funcName,
      type: 'Async Transform',
      description: 'Maps to async operation'
    };
  }

  // Deduplicate
  const unique = [...new Set(foundEvaluators)];
  const descriptions = unique.map(e => getEvaluatorDescription(e));

  return {
    name: funcName,
    type: foundEvaluators.includes('completeTurnWithLLM') && unique.length === 1 ? 'LLM Call' : 'Custom Evaluator',
    description: descriptions.join(', ')
  };
}
