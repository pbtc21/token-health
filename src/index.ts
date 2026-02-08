import { Hono } from "hono";
import { cors } from "hono/cors";
import { calculateHealthScore, type HealthReport } from "./health";
import { TeneroClient } from "./tenero";
import { x402PaymentRequired } from "./x402";

type Bindings = {
  CACHE: KVNamespace;
  PAYMENT_ADDRESS: string;
  PAYMENT_NETWORK: "mainnet" | "testnet";
  PAYMENT_AMOUNT_STX: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors());

app.get("/", (c) => {
  return c.json({
    name: "Token Health Check",
    version: "1.0.0",
    endpoints: {
      health: "GET /health/:tokenAddress",
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
