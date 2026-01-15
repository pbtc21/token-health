import axios from "axios";
import { withPaymentInterceptor, privateKeyToAccount } from "x402-stacks";

const PRIVATE_KEY = "9b3d803bb236382305ca39e15265c6970e69f6ce8cd413f1aaf7f135e397a59501";

const ENDPOINTS = [
  // Token Health
  {
    url: "https://token-health.p-d07.workers.dev/health/{tokenAddress}",
    name: "Token Health Check",
    description: "Health score (0-100) for any Stacks token. Holder concentration, fresh wallet ratio, volume trends.",
    price: "0.01 STX",
    category: "analytics",
  },
  // Wallet Intel
  {
    url: "https://wallet-intel.p-d07.workers.dev/analyze/{address}",
    name: "Wallet Intelligence - Full Report",
    description: "Deep analysis of any Stacks wallet - holdings, DeFi positions, risk score, actionable insights.",
    price: "0.1 STX",
    category: "analytics",
  },
  {
    url: "https://wallet-intel.p-d07.workers.dev/quick/{address}",
    name: "Wallet Intelligence - Quick",
    description: "Quick portfolio summary for any Stacks wallet.",
    price: "0.025 STX",
    category: "analytics",
  },
  // sBTC DeFi Intel
  {
    url: "https://sbtc-defi-intel.p-d07.workers.dev/yield-opportunities",
    name: "sBTC Yield Opportunities",
    description: "Real-time yield opportunities for sBTC across Stacks DeFi.",
    price: "0.002 STX",
    category: "defi",
  },
  {
    url: "https://sbtc-defi-intel.p-d07.workers.dev/peg-health",
    name: "sBTC Peg Health",
    description: "Monitor sBTC peg health and stability metrics.",
    price: "0.002 STX",
    category: "defi",
  },
  {
    url: "https://sbtc-defi-intel.p-d07.workers.dev/alpha",
    name: "sBTC Alpha Signals",
    description: "Premium alpha signals for sBTC trading.",
    price: "0.005 STX",
    category: "defi",
  },
  // Contract Scout
  {
    url: "https://contract-scout.p-d07.workers.dev/api/scout/latest",
    name: "Contract Scout - Latest",
    description: "AI-discovered high-scoring Stacks contracts.",
    price: "0.001 STX",
    category: "analytics",
  },
  // Bitcoin Faces NFT
  {
    url: "https://bitcoin-faces-nft.p-d07.workers.dev/mint",
    name: "Bitcoin Faces - Mint",
    description: "Mint unique Bitcoin Face NFT based on your Stacks address.",
    price: "varies",
    category: "nft",
  },
  // Coin Refill
  {
    url: "https://coin-refill.p-d07.workers.dev/refill",
    name: "Coin Refill",
    description: "Pay STX to refill any wallet with tokens (5% fee).",
    price: "5% fee",
    category: "utility",
  },
  // Wallet ID Card
  {
    url: "https://wallet-id-card.p-d07.workers.dev/card/{address}",
    name: "Wallet ID Card",
    description: "Generate AI-powered visual identity card for any Stacks wallet.",
    price: "varies",
    category: "nft",
  },
  // stx402-endpoint Oracle
  {
    url: "https://stx402-endpoint.p-d07.workers.dev/oracle",
    name: "STX402 Oracle",
    description: "AI oracle for Stacks market intelligence.",
    price: "varies",
    category: "analytics",
  },
  {
    url: "https://stx402-endpoint.p-d07.workers.dev/sentiment",
    name: "STX402 Sentiment",
    description: "Market sentiment analysis for Stacks ecosystem.",
    price: "varies",
    category: "analytics",
  },
  // stx402-agents
  {
    url: "https://stx402-agents.p-d07.workers.dev/agents",
    name: "Agent Registry - Register",
    description: "ERC-8004 inspired agent registry. Register new AI agents.",
    price: "varies",
    category: "infrastructure",
  },
  {
    url: "https://stx402-agents.p-d07.workers.dev/orchestrate",
    name: "Agent Orchestration",
    description: "Execute multi-agent task chains.",
    price: "varies",
    category: "infrastructure",
  },
  // sBTC Yield Stream
  {
    url: "https://sbtc-yield-stream.p-d07.workers.dev/earn",
    name: "sBTC Yield Stream",
    description: "Deposit sBTC, earn 23% APY, automatic payout after 30 days.",
    price: "deposit-based",
    category: "defi",
  },
];

async function registerAll() {
  const account = privateKeyToAccount(PRIVATE_KEY, "mainnet");
  console.log("Wallet:", account.address);
  console.log("Registering", ENDPOINTS.length, "endpoints...\n");

  const api = withPaymentInterceptor(
    axios.create({ baseURL: "https://stx402.com" }),
    account
  );

  let registered = 0;
  let skipped = 0;
  let failed = 0;

  for (const endpoint of ENDPOINTS) {
    try {
      process.stdout.write(`${endpoint.name}... `);
      const response = await api.post("/api/registry/register", endpoint);
      console.log(`✓ ${response.data.entry?.id || 'ok'}`);
      registered++;
    } catch (error: any) {
      const errMsg = error.response?.data?.error || error.message;
      if (errMsg?.includes("already") || errMsg?.includes("exists")) {
        console.log(`⏭ exists`);
        skipped++;
      } else {
        console.log(`✗ ${errMsg}`);
        failed++;
      }
    }
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\nDone: ${registered} registered, ${skipped} skipped, ${failed} failed`);
}

registerAll().catch(console.error);
