/**
 * Web Fetch Tool
 * 
 * Fetches web pages and extracts text content.
 * Strips HTML, scripts, and styles for clean text output.
 */

export interface WebFetchParameters {
  url: string;
  maxLength?: number;
}

export interface WebFetchResult {
  url: string;
  title?: string;
  content: string;
  error?: string;
}

export class WebFetchTool {
  readonly name = 'webFetch';
  readonly systemPrompt = WEB_FETCH_SYSTEM_PROMPT;

  async execute(parameters: WebFetchParameters): Promise<WebFetchResult> {
    const { url, maxLength = 10000 } = parameters;
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ObservableCAFE/1.0'
        }
      });
      
      if (!response.ok) {
        return { url, content: '', error: `HTTP error: ${response.status}` };
      }
      
      const text = await response.text();
      
      let title = '';
      const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1];
      
      const content = this.extractText(text, maxLength);
      
      return { url, title, content };
    } catch (error: any) {
      return { url, content: '', error: error.message };
    }
  }

  private extractText(html: string, maxLength: number): string {
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
    
    if (text.length > maxLength) {
      text = text.slice(0, maxLength) + '...';
    }
    
    return text;
  }
}

export const WEB_FETCH_SYSTEM_PROMPT = `
Tool: webFetch
Description: Fetches and extracts text content from a web page
Parameters:
- url: The URL to fetch (required)
- maxLength: Maximum characters to return (optional, default: 10000)

Returns: Page title and extracted text content

To use this tool, format your response like this:
<|tool_call|>{"name":"webFetch","parameters":{"url":"https://example.com","maxLength":5000}}<|tool_call_end|>
`;
