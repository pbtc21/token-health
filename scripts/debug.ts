import axios from "axios";

const API_URL = "https://token-health.p-d07.workers.dev";
const TOKEN = "SP1AY6K3PQV5MRT6R4S671NWW2FRVPKM0BR162CT6.leo-token";

async function debug() {
  try {
    const response = await axios.get(`${API_URL}/health/${TOKEN}`);
    console.log("Success:", response.data);
  } catch (error: any) {
    if (error.response?.status === 402) {
      console.log("402 Response:");
      console.log(JSON.stringify(error.response.data, null, 2));

      const data = error.response.data;
      console.log("\nValidation checks:");
      console.log("- maxAmountRequired is string:", typeof data.maxAmountRequired === "string");
      console.log("- resource is string:", typeof data.resource === "string");
      console.log("- payTo is string:", typeof data.payTo === "string");
      console.log("- network is string:", typeof data.network === "string");
      console.log("- nonce is string:", typeof data.nonce === "string");
      console.log("- expiresAt is string:", typeof data.expiresAt === "string");
      console.log("- network is mainnet/testnet:", data.network === "mainnet" || data.network === "testnet");
    } else {
      console.log("Other error:", error.message);
    }
  }
}

debug();
