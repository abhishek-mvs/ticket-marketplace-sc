import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia, hardhat } from 'viem/chains';
import hre from 'hardhat';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

const chainToDeploy = baseSepolia
async function main() {
  console.log('\n=== Starting Contract Deployment to Base Sepolia ===');

  if (!process.env.PRIVATE_KEY) {
    throw new Error('Please set PRIVATE_KEY in your .env file');
  }

  // Setup clients
  const publicClient = createPublicClient({
    chain: chainToDeploy,
    transport: http()
  });

  // Create wallet client from private key
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: chainToDeploy,
    transport: http()
  });

  const owner = account.address;
  // For Base Sepolia, we'll use a different verifier address - you should replace this with your actual verifier address
  const verifier = account.address; // Replace with actual verifier address

  console.log('Owner address:', owner);
  console.log('Verifier address:', verifier);

  try {
    // Deploy MockUSDC contract
    console.log('\nDeploying MockUSDC contract...');
    const { abi: mockUSDCAbi, bytecode: mockUSDCBytecode } = await hre.artifacts.readArtifact('MockUSDC');
    
    const mockUSDCHash = await walletClient.deployContract({
      abi: mockUSDCAbi,
      bytecode: mockUSDCBytecode as `0x${string}`,
      args: []
    });
    
    const mockUSDCReceipt = await publicClient.waitForTransactionReceipt({ hash: mockUSDCHash });
    
    if (!mockUSDCReceipt.contractAddress) {
      throw new Error('MockUSDC deployment failed - no contract address in receipt');
    }
    
    const mockUSDC = {
      address: mockUSDCReceipt.contractAddress,
      abi: mockUSDCAbi
    };
    
    console.log('MockUSDC deployed at:', mockUSDC.address);

    // Deploy TicketMarketplace contract
    console.log('\nDeploying TicketMarketplace contract...');
    const { abi: ticketMarketplaceAbi, bytecode: ticketMarketplaceBytecode } = await hre.artifacts.readArtifact('TicketMarketplace');
    
    const ticketMarketplaceHash = await walletClient.deployContract({
      abi: ticketMarketplaceAbi,
      bytecode: ticketMarketplaceBytecode as `0x${string}`,
      args: [mockUSDC.address]
    });
    
    const ticketMarketplaceReceipt = await publicClient.waitForTransactionReceipt({ hash: ticketMarketplaceHash });
    
    if (!ticketMarketplaceReceipt.contractAddress) {
      throw new Error('TicketMarketplace deployment failed - no contract address in receipt');
    }
    
    const ticketMarketplace = {
      address: ticketMarketplaceReceipt.contractAddress,
      abi: ticketMarketplaceAbi
    };
    
    console.log('TicketMarketplace deployed at:', ticketMarketplace.address);

    // Set verifier
    console.log('\nSetting verifier address...');
    await walletClient.writeContract({
      address: ticketMarketplace.address,
      abi: ticketMarketplace.abi,
      functionName: 'setVerifier',
      args: [verifier]
    });

    console.log('\n=== Deployment Summary ===');
    console.log('MockUSDC Address:', mockUSDC.address);
    console.log('TicketMarketplace Address:', ticketMarketplace.address);
    console.log('Verifier Address:', verifier);
    console.log('Owner Address:', owner);

  } catch (error) {
    console.error('Error during contract deployment:', error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 