# Spec: Token Health Check

## Problem

Before buying a Stacks token, you need to manually check multiple data points across different sources: Who holds it? Are holders real or fresh wallets? Are whales accumulating or dumping? Is volume trending up or down?

This takes time, and most people skip it - leading to bad buys and rug pulls.

## Solution

A single API endpoint that takes a token address and returns a health score (0-100) plus the underlying data. One call, instant verdict. Makes due diligence fast enough that people actually do it.

## Core Features

- **Health Score**: Single 0-100 number summarizing token health (higher = healthier)
- **Holder Concentration**: Top 10/25/50% holder ownership percentages - high concentration = risky
- **Fresh Wallet Ratio**: Percentage of holders that are <1 week old - high ratio = potential rug setup
- **Whale Direction**: Net flow from large holders (buying vs selling in last 24h)
- **Volume Trend**: 24h volume compared to 7d average - is interest growing or dying?
- **Risk Flags**: Array of specific warnings (e.g., "top 10 holders own 80%", "50% fresh wallets")

## Out of Scope (v1)

- Historical health scores over time
- Comparison to other tokens
- Social sentiment data
- Contract audit status
- Price predictions
- User accounts or saved tokens

## Success Criteria

1. Returns response in <2 seconds
2. Score correlates with intuition (known rugs score low, established tokens score high)
3. Risk flags catch obvious red flags that a human would notice
4. Works for any SIP-010 token on Stacks

## Technical Notes

- **Stack**: Cloudflare Worker + Hono + Bun
- **Data Source**: Tenero API (all required data available)
- **Endpoints needed**:
  - `/v1/stacks/tokens/{address}` - basic token info
  - `/v1/stacks/tokens/{address}/holder_percentages` - concentration
  - `/v1/stacks/tokens/{address}/holder_stats` - fresh wallets, whale count
  - `/v1/stacks/tokens/{address}/ohlc` - volume data
  - `/v1/stacks/market/top_inflows` / `top_outflows` - whale direction (or derive from holder trades)
- **Caching**: Cache responses for 5 minutes to reduce Tenero load
- **Scoring Algorithm**: Weighted combination of factors, thresholds based on ecosystem norms
