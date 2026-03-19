/**
 * Die Roller Tool
 * Rolls dice using standard notation (1d6, 2d10+3, 3d8-2)
 */

export interface DieRollResult {
  rolls: number[];
  total: number;
  expression: string;
}

export interface DieRollParameters {
  expression: string;
}

/**
 * Die roller tool
 * Handles die roll tool calls with formats like "1d6", "2d10+3", etc.
 */
export class DieRollerTool {
  readonly name = 'rollDice';
  readonly systemPrompt = DIE_ROLLER_SYSTEM_PROMPT;

  execute(parameters: DieRollParameters): DieRollResult {
    const expression = parameters.expression || '1d6';
    const result = this.rollExpression(expression);
    
    return {
      ...result,
      expression
    };
  }

  private rollExpression(expression: string): { rolls: number[]; total: number } {
    const trimmed = expression.trim();
    
    // Handle simple format like "1d6"
    const match = trimmed.match(/^(\d*)d(\d+)([+-]?\d+)?$/);
    
    if (!match) {
      return { rolls: [], total: 0 };
    }

    const numDice = parseInt(match[1]) || 1;
    const dieType = parseInt(match[2]);
    const modifier = match[3] ? parseInt(match[3]) : 0;

    const rolls: number[] = [];
    
    for (let i = 0; i < numDice; i++) {
      rolls.push(Math.floor(Math.random() * dieType) + 1);
    }

    const sum = rolls.reduce((a, b) => a + b, 0);
    const total = sum + modifier;

    return { rolls, total };
  }
}

/**
 * System prompt snippet to describe the die roller tool
 */
export const DIE_ROLLER_SYSTEM_PROMPT = `
You have access to a die rolling tool called "rollDice" that can roll virtual dice.

Tool: rollDice
Description: Rolls virtual dice using standard dice notation
Parameters:
- expression: The die roll expression (e.g., "1d6", "2d10+3", "3d8-2")
  - Format: [number of dice]d[die type][modifier]
  - Examples:
    - "1d6" = roll 1 six-sided die
    - "2d10+3" = roll 2 ten-sided dice and add 3
    - "3d8-2" = roll 3 eight-sided dice and subtract 2

To use this tool, format your response like this:
<|tool_call|>{"name":"rollDice","parameters":{"expression":"2d6+1"}}<|tool_call_end|>

The tool will automatically respond with the results of the roll.
`;
