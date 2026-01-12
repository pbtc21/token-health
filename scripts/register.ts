import axios from "axios";
import {
  withPaymentInterceptor,
  privateKeyToAccount,
} from "x402-stacks";

const PRIVATE_KEY = "9b3d803bb236382305ca39e15265c6970e69f6ce8cd413f1aaf7f135e397a59501";
const REGISTRY_URL = "https://stx402.com/api/registry/register";

const ENDPOINT_TO_REGISTER = {
  url: "https://token-health.p-d07.workers.dev/health/{tokenAddress}",
  name: "Token Health Check",
  description: "Get health score (0-100) for any Stacks token. Returns holder concentration, fresh wallet ratio, volume trends, and risk flags.",
  price: "0.01 STX",
  category: "analytics",
};

async function register() {
  console.log("Registering endpoint on stx402.com...");
  console.log("Endpoint:", ENDPOINT_TO_REGISTER.url);

  const account = privateKeyToAccount(PRIVATE_KEY, "mainnet");
  console.log("Using wallet:", account.address);

  // Create axios instance with payment interceptor
  const api = withPaymentInterceptor(
    axios.create({ baseURL: "https://stx402.com" }),
    account
  );

  try {
    const response = await api.post("/api/registry/register", ENDPOINT_TO_REGISTER);
    console.log("Registration response:", response.data);
    return response.data;
  } catch (error: any) {
    if (error.response) {
      console.error("Response error:", error.response.status, error.response.data);
    } else {
      console.error("Registration failed:", error.message);
    }
    throw error;
  }
}

register()
  .then((result) => {
    console.log("Success!", result);
    process.exit(0);
  })
  .catch((err) => {
    process.exit(1);
  });
