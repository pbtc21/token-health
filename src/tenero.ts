const BASE_URL = "https://api.tenero.io/v1/stacks";

export interface TokenInfo {
  contract_address: string;
  name: string;
  symbol: string;
  decimals: number;
  total_supply: string;
  price_usd: number;
  market_cap_usd: number;
  volume_24h_usd: number;
}

export interface HolderPercentages {
  top_10_percent: number;
  top_25_percent: number;
  top_50_percent: number;
}

export interface HolderStats {
  holder_count: string;
  fresh_1w: string;
  fresh_1m: string;
  old_1y: string;
  old_2y: string;
  whale_wallets: string;
  active_1w: string;
  active_1m: string;
  inactive_6m: string;
  trader_wallets: string;
  high_volume_traders: string;
  updated_at: number;
}

export interface Candlestick {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface TeneroResponse<T> {
  statusCode: number;
  message: string;
  data: T;
}

export class TeneroClient {
  private async fetch<T>(endpoint: string): Promise<T> {
    const response = await fetch(`${BASE_URL}${endpoint}`);
    if (!response.ok) {
      throw new Error(`Tenero API error: ${response.status}`);
    }
    const json = (await response.json()) as TeneroResponse<T>;
    if (json.statusCode !== 200) {
      throw new Error(`Tenero error: ${json.message}`);
    }
    return json.data;
  }

  async getTokenInfo(address: string): Promise<TokenInfo> {
    return this.fetch<TokenInfo>(`/tokens/${address}`);
  }

  async getHolderPercentages(address: string): Promise<HolderPercentages> {
    return this.fetch<HolderPercentages>(
      `/tokens/${address}/holder_percentages`
    );
  }

  async getHolderStats(address: string): Promise<HolderStats> {
    return this.fetch<HolderStats>(`/tokens/${address}/holder_stats`);
  }

  async getOHLC(
    address: string,
    period: string = "1h",
    limit: number = 168
  ): Promise<Candlestick[]> {
    return this.fetch<Candlestick[]>(
      `/tokens/${address}/ohlc?period=${period}&limit=${limit}`
    );
  }
}
