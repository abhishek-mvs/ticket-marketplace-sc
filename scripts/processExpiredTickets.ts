import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia, hardhat } from 'viem/chains';
import hre from 'hardhat';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();
const chainToUse = hardhat
async function main() {
  console.log('\n=== Starting Expired Tickets Processing ===');

  if (!process.env.PRIVATE_KEY) {
    throw new Error('Please set PRIVATE_KEY in your .env file');
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

  const owner = account.address;
  console.log('Owner address:', owner);

  try {
    // Get TicketMarketplace contract
    const { abi: ticketMarketplaceAbi } = await hre.artifacts.readArtifact('TicketMarketplace');
    const ticketMarketplaceAddress = process.env.TICKET_MARKETPLACE_ADDRESS as `0x${string}`;

    // Get all tickets
    console.log('\nFetching all tickets...');
    const tickets = await publicClient.readContract({
      address: ticketMarketplaceAddress,
      abi: ticketMarketplaceAbi,
      functionName: 'getAllTickets',
      args: []
    });

    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    let expiredCount = 0;

    // Check for expired tickets
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      if (ticket.seller !== '0x0000000000000000000000000000000000000000' && !ticket.sold) {
        if (ticket.bidExpiryTime <= currentTime || ticket.sellerExpiryTime <= currentTime) {
          expiredCount++;
          console.log(`\nFound expired ticket #${i}:`);
          console.log('Event Name:', ticket.eventName);
          console.log('Seller:', ticket.seller);
          console.log('Bid Expiry:', new Date(Number(ticket.bidExpiryTime) * 1000).toLocaleString());
          console.log('Seller Expiry:', new Date(Number(ticket.sellerExpiryTime) * 1000).toLocaleString());
        }
      }
    }

    if (expiredCount > 0) {
      console.log(`\nProcessing ${expiredCount} expired tickets...`);
      
      // Process expired tickets
      const processHash = await walletClient.writeContract({
        address: ticketMarketplaceAddress,
        abi: ticketMarketplaceAbi,
        functionName: 'processExpiredTickets',
        args: []
      });

      console.log('Waiting for transaction confirmation...');
      await publicClient.waitForTransactionReceipt({ hash: processHash });
      console.log('Successfully processed expired tickets');
    } else {
      console.log('\nNo expired tickets found to process');
    }

  } catch (error) {
    console.error('Error during expired tickets processing:', error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
