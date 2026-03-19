/**
 * Web Search Tool
 * 
 * Searches the web using Brave Search or Exa AI APIs.
 * Set BRAVE_API_KEY or EXA_API_KEY environment variable to enable.
 */

export interface WebSearchParameters {
  query: string;
  numResults?: number;
}

export interface WebSearchResult {
  query: string;
  results: {
    title: string;
    url: string;
    snippet: string;
  }[];
  source?: string;
  error?: string;
}

export class WebSearchTool {
  readonly name = 'webSearch';
  readonly systemPrompt = WEB_SEARCH_SYSTEM_PROMPT;

  async execute(parameters: WebSearchParameters): Promise<WebSearchResult> {
    const { query, numResults = 5 } = parameters;
    
    const braveKey = process.env.BRAVE_API_KEY;
    const exaKey = process.env.EXA_API_KEY;
    
    if (braveKey) {
      return this.braveSearch(query, numResults, braveKey);
    }
    
    if (exaKey) {
      return this.exaSearch(query, numResults, exaKey);
    }
    
    return { 
      query, 
      results: [], 
      error: 'No API key configured. Set BRAVE_API_KEY or EXA_API_KEY environment variable.' 
    };
  }

  private async braveSearch(query: string, numResults: number, apiKey: string): Promise<WebSearchResult> {
    try {
      const response = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${numResults}`, {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': apiKey
        }
      });
      
      if (!response.ok) {
        return { query, results: [], source: 'brave', error: `API error: ${response.status}` };
      }
      
      const data = await response.json();
      const results = (data.web?.results || []).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.description || ''
      }));
      
      return { query, results, source: 'brave' };
    } catch (error: any) {
      return { query, results: [], source: 'brave', error: error.message };
    }
  }

  private async exaSearch(query: string, numResults: number, apiKey: string): Promise<WebSearchResult> {
    try {
      const response = await fetch(`https://api.exa.ai/search?query=${encodeURIComponent(query)}&num-results=${numResults}`, {
        headers: {
          'x-api-key': apiKey
        }
      });
      
      if (!response.ok) {
        return { query, results: [], source: 'exa', error: `API error: ${response.status}` };
      }
      
      const data = await response.json();
      const results = (data.results || []).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.snippet || ''
      }));
      
      return { query, results, source: 'exa' };
    } catch (error: any) {
      return { query, results: [], source: 'exa', error: error.message };
    }
  }
}

export const WEB_SEARCH_SYSTEM_PROMPT = `
Tool: webSearch
Description: Searches the web for information
Parameters:
- query: The search query (required)
- numResults: Number of results to return (optional, default: 5)

Returns: Array of search results with title, URL, and snippet

To use this tool, format your response like this:
<|tool_call|>{"name":"webSearch","parameters":{"query":"latest AI news 2026"}}<|tool_call_end|>
`;
