import type { Context, MiddlewareHandler } from "hono";
import {
  STXtoMicroSTX,
  BTCtoSats,
  type X402MiddlewareConfig,
  type X402PaymentRequired as PaymentRequiredResponse,
  type VerifiedPayment,
} from "x402-stacks";

export { STXtoMicroSTX, BTCtoSats };

const HIRO_API = "https://api.hiro.so";

// Token types supported
export type TokenType = "STX" | "sBTC";

// Token contracts for sBTC
const TOKEN_CONTRACTS = {
  mainnet: {
    sBTC: { address: "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9", name: "token-sbtc" },
  },
  testnet: {
    sBTC: { address: "ST1F7QA2MDF17S807EPA36TSS8AMEFY4KA9TVGWXT", name: "sbtc-token" },
  },
};

/**
 * Broadcast a signed transaction to Stacks network
 */
async function broadcastTransaction(
  signedTxHex: string,
  network: "mainnet" | "testnet"
): Promise<{ success: boolean; txId?: string; error?: string }> {
  const apiUrl =
    network === "mainnet"
      ? HIRO_API
      : "https://api.testnet.hiro.so";

  try {
    // Convert hex to bytes
    const txBytes = new Uint8Array(
      signedTxHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    const response = await fetch(`${apiUrl}/v2/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: txBytes,
    });

    if (response.ok) {
      const txId = await response.text();
      return { success: true, txId: txId.replace(/"/g, "") };
    } else {
      const error = await response.text();
      // If already broadcasted, that's fine
      if (error.includes("ConflictingNonceInMempool") || error.includes("already")) {
        return { success: true, error: "Transaction already in mempool" };
      }
      return { success: false, error };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Extended config with multi-token support
 */
export interface MultiTokenConfig extends X402MiddlewareConfig {
  amountSTX: number;
  amountSBTC?: number; // in BTC (e.g., 0.000001)
}

/**
 * Validate and normalize token type from request
 */
function getTokenType(c: Context): TokenType {
  const queryToken = c.req.query("tokenType");
  const headerToken = c.req.header("X-PAYMENT-TOKEN-TYPE");
  const tokenStr = (headerToken || queryToken || "STX").toUpperCase();

  if (tokenStr === "SBTC") return "sBTC";
  return "STX";
}

/**
 * Hono middleware for x402 payment requirements
 * Supports STX and sBTC payments
 */
export function x402PaymentRequired(
  config: MultiTokenConfig
): MiddlewareHandler {
  return async (c: Context, next) => {
    // Determine which token type client wants to pay with
    const tokenType = getTokenType(c);

    // Get amount in smallest units based on token type
    let amount: bigint;
    if (tokenType === "sBTC" && config.amountSBTC) {
      amount = BTCtoSats(config.amountSBTC);
    } else {
      amount = BigInt(STXtoMicroSTX(config.amountSTX));
    }

    // Check for signed payment in X-PAYMENT header
    const signedPayment = c.req.header("x-payment");

    // If no payment provided, return 402 Payment Required
    if (!signedPayment) {
      return sendPaymentRequired(c, { ...config, amount }, tokenType);
    }

    try {
      // Broadcast the transaction directly
      const result = await broadcastTransaction(signedPayment, config.network);

      if (!result.success && !result.error?.includes("already")) {
        return c.json(
          {
            error: "Payment broadcast failed",
            details: result.error,
            paymentStatus: "failed",
          },
          402
        );
      }

      // Payment accepted - attach info to context
      const verification: VerifiedPayment = {
        txId: result.txId || "pending",
        status: "pending",
        sender: "",
        recipient: config.address,
        amount: BigInt(config.amount),
        isValid: true,
      };

      c.set("payment", verification);

      const paymentResponse = {
        txId: result.txId,
        status: "pending",
        message: "Transaction broadcast successful",
      };
      c.header(
        "X-PAYMENT-RESPONSE",
        Buffer.from(JSON.stringify(paymentResponse)).toString("base64")
      );

      await next();
    } catch (error) {
      console.error("x402 middleware error:", error);
      return c.json(
        {
          error: "Payment processing error",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    }
  };
}

function sendPaymentRequired(c: Context, config: X402MiddlewareConfig & { amount: bigint }, tokenType: TokenType) {
  const expirationSeconds = config.expirationSeconds || 300;
  const expiresAt = new Date(
    Date.now() + expirationSeconds * 1000
  ).toISOString();
  const nonce = crypto.randomUUID();
  const resource = config.resource || c.req.path;

  // Get token contract for sBTC
  const tokenContract = tokenType === "sBTC"
    ? TOKEN_CONTRACTS[config.network]?.sBTC
    : undefined;

  const paymentRequest: PaymentRequiredResponse = {
    maxAmountRequired: config.amount.toString(),
    resource,
    payTo: config.address,
    network: config.network,
    nonce,
    expiresAt,
    tokenType,
    ...(tokenContract && { tokenContract }),
  };

  return c.json(paymentRequest, 402);
}

/**
 * Get verified payment from context (after middleware passes)
 */
export function getPayment(c: Context): VerifiedPayment | undefined {
  return c.get("payment");
}
