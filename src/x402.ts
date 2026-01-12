import type { Context, MiddlewareHandler } from "hono";
import {
  STXtoMicroSTX,
  type X402MiddlewareConfig,
  type X402PaymentRequired as PaymentRequiredResponse,
  type VerifiedPayment,
} from "x402-stacks";

export { STXtoMicroSTX };

const HIRO_API = "https://api.hiro.so";

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
 * Hono middleware for x402 payment requirements
 * Uses direct broadcast instead of facilitator
 */
export function x402PaymentRequired(
  config: X402MiddlewareConfig
): MiddlewareHandler {
  return async (c: Context, next) => {
    // Check for signed payment in X-PAYMENT header
    const signedPayment = c.req.header("x-payment");

    // If no payment provided, return 402 Payment Required
    if (!signedPayment) {
      return sendPaymentRequired(c, config);
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

function sendPaymentRequired(c: Context, config: X402MiddlewareConfig) {
  const expirationSeconds = config.expirationSeconds || 300;
  const expiresAt = new Date(
    Date.now() + expirationSeconds * 1000
  ).toISOString();
  const nonce = crypto.randomUUID();
  const resource = config.resource || c.req.path;

  const paymentRequest: PaymentRequiredResponse = {
    maxAmountRequired: config.amount.toString(),
    resource,
    payTo: config.address,
    network: config.network,
    nonce,
    expiresAt,
    tokenType: config.tokenType || "STX",
    tokenContract: config.tokenContract,
  };

  return c.json(paymentRequest, 402);
}

/**
 * Get verified payment from context (after middleware passes)
 */
export function getPayment(c: Context): VerifiedPayment | undefined {
  return c.get("payment");
}
