# Spec: Token Health Check

## Problem

Before buying a Stacks token, you need to manually check multiple data points across different sources: Who holds it? Are holders real or fresh wallets? Are whales accumulating or dumping? Is volume trending up or down?

This takes time, and most people skip it - leading to bad buys and rug pulls.

## Solution

A single API endpoint that takes a token address and returns a health score (0-100) plus the underlying data. One call, instant verdict. Pay with x402 micropayments, get immediate analysis.

## Core Features

### Health Score (0-100)
Single number summarizing token health. Higher = healthier.

**Grade Scale:**
| Score | Grade | Meaning |
|-------|-------|---------|
| 80-100 | A | Strong fundamentals |
| 65-79 | B | Generally healthy |
| 50-64 | C | Some concerns |
| 35-49 | D | Multiple red flags |
| 0-34 | F | High risk |

### Scoring Components

| Factor | Weight | What It Measures |
|--------|--------|------------------|
| Concentration | 35% | Top holder ownership (10/25/50%) |
| Fresh Wallets | 25% | Ratio of holders <1 week old |
| Holder Activity | 20% | Active vs dormant holders |
| Volume Trend | 20% | 24h volume vs 7d average |

### Risk Flags
Plain English warnings extracted from the data:
- "Extreme concentration: top 10 holders own 85%"
- "Warning: 45% of holders are <1 week old"
- "70% of holders inactive for 6+ months"
- "Volume down 60% from 7d avg"

## API

### Endpoint
```
GET /health/:tokenAddress
```

### Example Request
```
GET /health/SP1AY6K3PQV5MRT6R4S671NWW2FRVPKM0BR162CT6.leo-token
```

### Example Response
```json
{
  "token": {
    "address": "SP1AY6K3PQV5MRT6R4S671NWW2FRVPKM0BR162CT6.leo-token",
    "name": "Leo Token",
    "symbol": "LEO",
    "price_usd": 0.0234,
    "market_cap_usd": 1234567
  },
  "score": 72,
  "grade": "B",
  "breakdown": {
    "concentration": { "score": 65, "weight": 0.35 },
    "freshWallets": { "score": 80, "weight": 0.25 },
    "holderActivity": { "score": 70, "weight": 0.20 },
    "volumeTrend": { "score": 75, "weight": 0.20 }
  },
  "metrics": {
    "top10Ownership": 45.2,
    "top25Ownership": 62.1,
    "top50Ownership": 78.4,
    "freshWalletRatio": 0.12,
    "holderCount": 1523,
    "activeRatio": 0.08,
    "volume24h": 45000,
    "volume7dAvg": 38000,
    "volumeTrendPercent": 18.4
  },
  "flags": [
    "Top 10 holders own 45.2% of supply"
  ],
  "timestamp": 1736697600000
}
```

## Scoring Algorithm

### Concentration (35% weight)
```
Ideal: top 10 < 40%, top 25 < 60%, top 50 < 80%

top_10 > 80%  → -60 points + flag
top_10 > 60%  → -40 points + flag
top_10 > 40%  → -20 points
top_25 > 90%  → -20 points + flag
```

### Fresh Wallets (25% weight)
```
High fresh ratio = potential rug setup

fresh_1w > 50%  → -50 points + warning
fresh_1w > 30%  → -30 points + flag
fresh_1w > 15%  → -15 points
fresh_1m < 5%   → -10 points (dead token)
```

### Holder Activity (20% weight)
```
Healthy: 10-30% active weekly

active_1w < 2%   → -30 points + flag
active_1w < 5%   → -15 points
inactive_6m > 70% → -25 points + flag
inactive_6m > 50% → -10 points
```

### Volume Trend (20% weight)
```
Baseline: 70 points

trend > +100%  → 95 points + flag
trend > +30%   → 85 points
trend > 0%     → 75 points
trend > -30%   → 65 points
trend > -50%   → 50 points + flag
trend < -50%   → 30 points + flag
```

## Pricing

| Item | Cost |
|------|------|
| Health check | 0.01 STX |
| Protocol | x402 |

Payment required via x402 header. Cached results (5 min) don't require new payment.

## Deployed Infrastructure

### API
`https://token-health.p-d07.workers.dev`

### Data Source
Tenero API endpoints:
- `/v1/stacks/tokens/{address}` - token info
- `/v1/stacks/tokens/{address}/holder_percentages` - concentration
- `/v1/stacks/tokens/{address}/holder_stats` - wallet age/activity
- `/v1/stacks/tokens/{address}/ohlc` - volume data (7d hourly)

### Caching
- KV store with 5-minute TTL
- Reduces Tenero load
- Cached responses marked with `cached: true`

## Out of Scope (v1)

- Historical health scores over time
- Comparison to other tokens
- Social sentiment data
- Contract audit status
- Price predictions
- User accounts or saved tokens
- Whale direction (buy vs sell) - data not easily available

## Success Criteria

1. Returns response in <2 seconds
2. Score correlates with intuition (known rugs score low, established tokens score high)
3. Risk flags catch obvious red flags that a human would notice
4. Works for any SIP-010 token on Stacks
5. x402 payments work seamlessly

## Technical Notes

### Why These Weights?
- **Concentration (35%)**: Most predictive of rug risk. If 10 wallets control the supply, they control the price.
- **Fresh Wallets (25%)**: Coordinated buys from new wallets often precede dumps.
- **Activity (20%)**: Dead holder bases can't provide exit liquidity.
- **Volume (20%)**: Trend matters more than absolute volume for health.

### Edge Cases
- New tokens (<100 holders): Some metrics less meaningful
- Tokens with unusual distribution (airdrops): May flag unfairly
- Low liquidity tokens: Volume data may be sparse

### Future Improvements
- Whale flow direction (net buying vs selling)
- Contract verification status
- DEX vs CEX volume split
- Time-weighted scores (30d trend)
