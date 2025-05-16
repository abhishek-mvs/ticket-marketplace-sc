import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import hre from 'hardhat';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

const chainToDeploy = base;
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

async function main() {
  console.log('\n=== Starting Contract Deployment to Base Mainnet ===');

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
  const verifier = account.address; // Replace with actual verifier address

  console.log('Owner address:', owner);
  console.log('Verifier address:', verifier);
  console.log('USDC address:', USDC_ADDRESS);

  try {
    // Deploy TicketMarketplace contract
    console.log('\nDeploying TicketMarketplace contract...');
    const { abi: ticketMarketplaceAbi, bytecode: ticketMarketplaceBytecode } = await hre.artifacts.readArtifact('TicketMarketplace');
    
    const ticketMarketplaceHash = await walletClient.deployContract({
      abi: ticketMarketplaceAbi,
      bytecode: ticketMarketplaceBytecode as `0x${string}`,
      args: [USDC_ADDRESS]
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
    console.log('USDC Address:', USDC_ADDRESS);
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