import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import hre from 'hardhat';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('\n=== Token Allowance Management ===');

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
    chain: baseSepolia,
    transport: http()
  });

  // Create wallet client from private key
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http()
  });

  const owner = account.address;
  console.log('Owner address:', owner);

  try {
    // Get MockUSDC contract
    const { abi: mockUSDCAbi } = await hre.artifacts.readArtifact('MockUSDC');
    const mockUSDCAddress = process.env.MOCK_USDC_ADDRESS as `0x${string}`;
    const ticketMarketplaceAddress = process.env.TICKET_MARKETPLACE_ADDRESS as `0x${string}`;

    // Check current allowance
    const currentAllowance = await publicClient.readContract({
      address: mockUSDCAddress,
      abi: mockUSDCAbi,
      functionName: 'allowance',
      args: [owner, ticketMarketplaceAddress]
    });

    console.log('\nCurrent Allowance:', currentAllowance.toString());

    // Set new allowance (1000 USDC with 6 decimals)
    const newAllowance = BigInt(1000 * 10 ** 6);

    if (currentAllowance < newAllowance) {
      console.log('\nSetting new allowance...');
      const approveHash = await walletClient.writeContract({
        address: mockUSDCAddress,
        abi: mockUSDCAbi,
        functionName: 'approve',
        args: [ticketMarketplaceAddress, newAllowance]
      });

      console.log('Waiting for transaction confirmation...');
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      // Verify new allowance
      const updatedAllowance = await publicClient.readContract({
        address: mockUSDCAddress,
        abi: mockUSDCAbi,
        functionName: 'allowance',
        args: [owner, ticketMarketplaceAddress]
      });

      console.log('\n=== Allowance Update Summary ===');
      console.log('Previous Allowance:', currentAllowance.toString());
      console.log('New Allowance:', updatedAllowance.toString());
    } else {
      console.log('\nCurrent allowance is sufficient, no update needed.');
    }

  } catch (error) {
    console.error('Error during allowance management:', error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
