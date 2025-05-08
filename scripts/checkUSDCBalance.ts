import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia, hardhat } from 'viem/chains';
import hre from 'hardhat';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();
const chainToUse = hardhat
async function main() {
  console.log('\n=== Checking USDC Balances ===');

  if (!process.env.PRIVATE_KEY) {
    throw new Error('Please set PRIVATE_KEY in your .env file');
  }

  if (!process.env.MOCK_USDC_ADDRESS) {
    throw new Error('Please set MOCK_USDC_ADDRESS in your .env file');
  }

  if (!process.env.TICKET_MARKETPLACE_ADDRESS) {
    throw new Error('Please set TICKET_MARKETPLACE_ADDRESS in your .env file');
  }

  // Setup clients
  const publicClient = createPublicClient({
    chain: chainToUse,
    transport: http()
  });

  // Create wallet client from private key
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: chainToUse,
    transport: http()
  });

  const userAddress = account.address;
  console.log('User address:', userAddress);

  try {
    // Get MockUSDC contract
    const { abi: mockUSDCAbi } = await hre.artifacts.readArtifact('MockUSDC');
    const mockUSDCAddress = process.env.MOCK_USDC_ADDRESS as `0x${string}`;
    const ticketMarketplaceAddress = process.env.TICKET_MARKETPLACE_ADDRESS as `0x${string}`;

    // Check user's USDC balance
    const userBalance = await publicClient.readContract({
      address: mockUSDCAddress,
      abi: mockUSDCAbi,
      functionName: 'balanceOf',
      args: [userAddress]
    });

    // Check marketplace contract's USDC balance
    const marketplaceBalance = await publicClient.readContract({
      address: mockUSDCAddress,
      abi: mockUSDCAbi,
      functionName: 'balanceOf',
      args: [ticketMarketplaceAddress]
    });

    // Check user's allowance for marketplace
    const allowance = await publicClient.readContract({
      address: mockUSDCAddress,
      abi: mockUSDCAbi,
      functionName: 'allowance',
      args: [userAddress, ticketMarketplaceAddress]
    });

    console.log('\n=== Balance Summary ===');
    console.log('User Balance:', (Number(userBalance) / 1e18), 'USDC');
    console.log('Marketplace Balance:', (Number(marketplaceBalance) / 1e18), 'USDC');
    console.log('User Allowance for Marketplace:', (Number(allowance) / 1e18), 'USDC');

  } catch (error) {
    console.error('Error checking balances:', error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
