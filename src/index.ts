import { Hono } from "hono";
import { cors } from "hono/cors";
import { calculateHealthScore, type HealthReport } from "./health";
import { TeneroClient } from "./tenero";
import { x402PaymentRequired, STXtoMicroSTX } from "./x402";

type Bindings = {
  CACHE: KVNamespace;
  PAYMENT_ADDRESS: string;
  PAYMENT_NETWORK: "mainnet" | "testnet";
  PAYMENT_AMOUNT_STX: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors());

// x402 Discovery endpoint
app.get("/.well-known/x402", (c) => {
  const amountSTX = parseFloat(c.env.PAYMENT_AMOUNT_STX || "0.01");
  const maxAmountRequired = STXtoMicroSTX(amountSTX).toString();

  return c.json({
    x402Version: 1,
    name: "Token Health",
    accepts: [
      {
        scheme: "exact",
        network: "stacks",
        maxAmountRequired,
        resource: "/health/:token",
        description: "Token health scores and analysis",
        mimeType: "application/json",
        payTo: c.env.PAYMENT_ADDRESS || "SPKH9AWG0ENZ87J1X0PBD4HETP22G8W22AFNVF8K",
        maxTimeoutSeconds: 300,
        asset: "STX",
        outputSchema: {
          input: {
            type: "object",
            properties: {
              token: {
                type: "string",
                description: "Token contract address (e.g., SP1AY6K3PQV5MRT6R4S671NWW2FRVPKM0BR162CT6.leo-token)",
              },
            },
            required: ["token"],
          },
          output: {
            type: "object",
            properties: {
              token: {
                type: "object",
                properties: {
                  address: { type: "string" },
                  name: { type: "string" },
                  symbol: { type: "string" },
                  price_usd: { type: "number" },
                  market_cap_usd: { type: "number" },
                },
              },
              score: { type: "number", description: "Health score 0-100" },
              grade: { type: "string", enum: ["A", "B", "C", "D", "F"] },
              breakdown: {
                type: "object",
                properties: {
                  concentration: { type: "object" },
                  freshWallets: { type: "object" },
                  holderActivity: { type: "object" },
                  volumeTrend: { type: "object" },
                },
              },
              metrics: {
                type: "object",
                properties: {
                  top10Ownership: { type: "number" },
                  top25Ownership: { type: "number" },
                  top50Ownership: { type: "number" },
                  freshWalletRatio: { type: "number" },
                  holderCount: { type: "number" },
                  activeRatio: { type: "number" },
                  volume24h: { type: "number" },
                  volume7dAvg: { type: "number" },
                  volumeTrendPercent: { type: "number" },
                },
              },
              flags: { type: "array", items: { type: "string" } },
              timestamp: { type: "number" },
            },
          },
        },
      },
    ],
  });
});

app.get("/", (c) => {
  return c.json({
    name: "Token Health Check",
    version: "1.0.0",
    endpoints: {
      health: "GET /health/:tokenAddress",
      discovery: "GET /.well-known/x402",
    },
    example: "/health/SP1AY6K3PQV5MRT6R4S671NWW2FRVPKM0BR162CT6.leo-token",
    pricing: {
      stx: c.env.PAYMENT_AMOUNT_STX || "0.01",
      sbtc: "0.00000001", // 1 sat
      protocol: "x402",
      tokenTypeParam: "?tokenType=STX|sBTC",
    },
  });
});

// Payment-gated health check endpoint (accepts STX or sBTC)
app.use("/health/*", async (c, next) => {
  const middleware = x402PaymentRequired({
    amountSTX: parseFloat(c.env.PAYMENT_AMOUNT_STX || "0.01"),
    amountSBTC: 0.00000001, // 1 sat
    amount: BigInt(0), // Will be calculated based on token type
    address: c.env.PAYMENT_ADDRESS,
    network: c.env.PAYMENT_NETWORK || "mainnet",
    resource: c.req.path,
  });
  return middleware(c, next);
});

app.get("/health/:tokenAddress", async (c) => {
  const tokenAddress = c.req.param("tokenAddress");

  // Validate token address format
  if (!tokenAddress.match(/^SP[A-Z0-9]+\.[a-z0-9-]+$/i)) {
    return c.json({ error: "Invalid token address format" }, 400);
  }

  // Check cache first
  const cacheKey = `health:${tokenAddress}`;
  const cached = await c.env.CACHE?.get(cacheKey);
  if (cached) {
    const report = JSON.parse(cached) as HealthReport;
    return c.json({ ...report, cached: true });
  }

  try {
    const tenero = new TeneroClient();
    const report = await calculateHealthScore(tenero, tokenAddress);

    // Cache for 5 minutes
    await c.env.CACHE?.put(cacheKey, JSON.stringify(report), {
      expirationTtl: 300,
    });

    return c.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: `Failed to analyze token: ${message}` }, 500);
  }
});

export default app;
