import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import hre from 'hardhat';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('\n=== Starting Token Minting ===');

  if (!process.env.PRIVATE_KEY) {
    throw new Error('Please set PRIVATE_KEY in your .env file');
  }

  if (!process.env.MOCK_USDC_ADDRESS) {
    throw new Error('Please set MOCK_USDC_ADDRESS in your .env file');
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

    // Amount to mint (1000 USDC with 6 decimals)
    const amountToMint = BigInt(1000 * 10 ** 6);

    console.log('\nMinting MockUSDC tokens...');
    const mintHash = await walletClient.writeContract({
      address: mockUSDCAddress,
      abi: mockUSDCAbi,
      functionName: 'mint',
      args: [owner, amountToMint]
    });

    console.log('Waiting for transaction confirmation...');
    await publicClient.waitForTransactionReceipt({ hash: mintHash });

    // Check balance
    const balance = await publicClient.readContract({
      address: mockUSDCAddress,
      abi: mockUSDCAbi,
      functionName: 'balanceOf',
      args: [owner]
    });

    console.log('\n=== Minting Summary ===');
    console.log('MockUSDC Address:', mockUSDCAddress);
    console.log('Amount Minted:', amountToMint.toString());
    console.log('Current Balance:', balance.toString());

  } catch (error) {
    console.error('Error during token minting:', error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 