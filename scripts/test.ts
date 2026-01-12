import axios, { AxiosInstance, AxiosError } from "axios";
import { privateKeyToAccount } from "x402-stacks";
import {
  makeSTXTokenTransfer,
  AnchorMode,
  getAddressFromPrivateKey,
  TransactionVersion,
} from "@stacks/transactions";
import { StacksMainnet } from "@stacks/network";

const PRIVATE_KEY = "9b3d803bb236382305ca39e15265c6970e69f6ce8cd413f1aaf7f135e397a59501";
const API_URL = "https://token-health.p-d07.workers.dev";
const TOKEN = "SP1AY6K3PQV5MRT6R4S671NWW2FRVPKM0BR162CT6.leo-token";

interface PaymentRequest {
  maxAmountRequired: string;
  resource: string;
  payTo: string;
  network: "mainnet" | "testnet";
  nonce: string;
  expiresAt: string;
  tokenType?: string;
}

async function signPayment(paymentRequest: PaymentRequest, privateKey: string): Promise<string> {
  const amount = BigInt(paymentRequest.maxAmountRequired);
  const network = new StacksMainnet();
  const memo = paymentRequest.nonce.substring(0, 34);

  const transaction = await makeSTXTokenTransfer({
    recipient: paymentRequest.payTo,
    amount,
    senderKey: privateKey,
    network,
    memo,
    anchorMode: AnchorMode.Any,
  });

  const serialized = transaction.serialize();
  return Buffer.from(serialized).toString("hex");
}

async function test() {
  const account = privateKeyToAccount(PRIVATE_KEY, "mainnet");
  console.log("Wallet:", account.address);
  console.log("Testing:", TOKEN);
  console.log("---");

  // Step 1: Get 402 response
  console.log("Step 1: Getting payment requirements...");
  let paymentRequest: PaymentRequest;

  try {
    await axios.get(`${API_URL}/health/${TOKEN}`);
    console.log("Unexpected success - should have gotten 402");
    return;
  } catch (error) {
    const axiosError = error as AxiosError<PaymentRequest>;
    if (axiosError.response?.status !== 402) {
      console.error("Unexpected error:", axiosError.message);
      return;
    }
    paymentRequest = axiosError.response.data;
    console.log("Payment required:", paymentRequest);
  }

  // Step 2: Sign payment
  console.log("\nStep 2: Signing payment...");
  const signedTx = await signPayment(paymentRequest, PRIVATE_KEY);
  console.log("Signed tx length:", signedTx.length);

  // Step 3: Retry with payment
  console.log("\nStep 3: Retrying with payment...");
  try {
    const response = await axios.get(`${API_URL}/health/${TOKEN}`, {
      headers: {
        "X-PAYMENT": signedTx,
        "X-PAYMENT-TOKEN-TYPE": "STX",
      },
    });
    console.log("\nHealth Report:");
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    const axiosError = error as AxiosError;
    console.error("Error:", axiosError.response?.status, axiosError.response?.data);
  }
}

test().catch(console.error);
