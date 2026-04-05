/**
 * Weather Tool
 * Fetches weather data from Open-Meteo API (free, no API key required)
 */

export interface WeatherParameters {
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface WeatherResult {
  location: {
    latitude: number;
    longitude: number;
  };
  current: {
    temperature: number;
    windspeed: number;
    winddirection: number;
    weathercode: number;
    time: string;
  };
  daily?: {
    date: string;
    maxTemp: number;
    minTemp: number;
    weathercode: number;
    precipitation: number;
  }[];
  timezone: string;
  error?: string;
}

export class WeatherTool {
  readonly name = 'getWeather';
  readonly systemPrompt = WEATHER_SYSTEM_PROMPT;

  async execute(parameters: WeatherParameters): Promise<WeatherResult> {
    const { latitude, longitude, timezone } = parameters;

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=${encodeURIComponent(timezone || 'auto')}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'ObservableCAFE/1.0'
        }
      });

      if (!response.ok) {
        return {
          location: { latitude, longitude },
          current: { temperature: 0, windspeed: 0, winddirection: 0, weathercode: 0, time: '' },
          timezone: timezone || 'auto',
          error: `HTTP error: ${response.status}`
        };
      }

      const data = await response.json();

      const daily = data.daily ? {
        date: data.daily.time,
        maxTemp: data.daily.temperature_2m_max,
        minTemp: data.daily.temperature_2m_min,
        weathercode: data.daily.weathercode,
        precipitation: data.daily.precipitation_sum
      } : undefined;

      const dailyArray = daily ? daily.date.map((date: string, i: number) => ({
        date,
        maxTemp: daily.maxTemp[i],
        minTemp: daily.minTemp[i],
        weathercode: daily.weathercode[i],
        precipitation: daily.precipitation[i]
      })) : undefined;

      return {
        location: {
          latitude: data.latitude,
          longitude: data.longitude
        },
        current: {
          temperature: data.current_weather.temperature,
          windspeed: data.current_weather.windspeed,
          winddirection: data.current_weather.winddirection,
          weathercode: data.current_weather.weathercode,
          time: data.current_weather.time
        },
        daily: dailyArray,
        timezone: data.timezone
      };
    } catch (error: any) {
      return {
        location: { latitude, longitude },
        current: { temperature: 0, windspeed: 0, winddirection: 0, weathercode: 0, time: '' },
        timezone: timezone || 'auto',
        error: error.message
      };
    }
  }

  formatResult(result: WeatherResult): string {
    if (result.error) return `Error: ${result.error}`;
    const condition = getWeatherDescription(result.current.weathercode);
    let output = `🌡️ Current Weather\n`;
    output += `Location: ${result.location.latitude.toFixed(2)}, ${result.location.longitude.toFixed(2)}\n`;
    output += `Temperature: ${Math.round(result.current.temperature)}°C\n`;
    output += `Condition: ${condition}\n`;
    output += `Wind: ${Math.round(result.current.windspeed)} km/h\n`;
    output += `Timezone: ${result.timezone}`;
    return output;
  }
}

export function getWeatherDescription(code: number): string {
  const codes: Record<number, string> = {
    0: 'Clear sky',
    1: 'Mainly clear',
    2: 'Partly cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Depositing rime fog',
    51: 'Light drizzle',
    53: 'Moderate drizzle',
    55: 'Dense drizzle',
    56: 'Light freezing drizzle',
    57: 'Dense freezing drizzle',
    61: 'Slight rain',
    63: 'Moderate rain',
    65: 'Heavy rain',
    66: 'Light freezing rain',
    67: 'Heavy freezing rain',
    71: 'Slight snow fall',
    73: 'Moderate snow fall',
    75: 'Heavy snow fall',
    77: 'Snow grains',
    80: 'Slight rain showers',
    81: 'Moderate rain showers',
    82: 'Violent rain showers',
    85: 'Slight snow showers',
    86: 'Heavy snow showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with slight hail',
    99: 'Thunderstorm with heavy hail'
  };
  return codes[code] || 'Unknown';
}

export const WEATHER_SYSTEM_PROMPT = `
Tool: getWeather
Description: Fetches current weather and 7-day forecast from Open-Meteo API
Parameters:
- latitude: Latitude of the location (required)
- longitude: Longitude of the location (required)
- timezone: Timezone (optional, default: "auto")

Returns: Current temperature, wind speed, weather condition code, and daily forecast

To use this tool, format your response like this:
<|tool_call|>{"name":"getWeather","parameters":{"latitude":59.3345,"longitude":18.0632,"timezone":"Europe/Stockholm"}}<|tool_call_end|>

After receiving the weather data, present it in a friendly summary including:
- Current temperature and conditions
- Wind speed
- A brief mention of the upcoming forecast
`;
