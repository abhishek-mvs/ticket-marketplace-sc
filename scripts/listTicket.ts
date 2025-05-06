import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import hre from 'hardhat';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('\n=== Starting Ticket Listing ===');

  if (!process.env.PRIVATE_KEY) {
    throw new Error('Please set PRIVATE_KEY in your .env file');
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
    // Get TicketMarketplace contract
    const { abi: ticketMarketplaceAbi } = await hre.artifacts.readArtifact('TicketMarketplace');
    const ticketMarketplaceAddress = process.env.TICKET_MARKETPLACE_ADDRESS as `0x${string}`;

    // Example ticket data
    const eventDetails = "Concert on 2024-12-31";
    const minBid = BigInt(100 * 10 ** 6); // 100 USDC
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const bidExpiryTime = currentTime + 3600n; // 1 hour from now
    const sellerExpiryTime = currentTime + 7200n; // 2 hours from now

    console.log('\nListing new ticket...');
    const listHash = await walletClient.writeContract({
      address: ticketMarketplaceAddress,
      abi: ticketMarketplaceAbi,
      functionName: 'listTicket',
      args: [
        eventDetails,
        0n, // initial bid amount
        minBid,
        bidExpiryTime,
        sellerExpiryTime
      ]
    });

    console.log('Waiting for transaction confirmation...');
    await publicClient.waitForTransactionReceipt({ hash: listHash });

    // Get all tickets
    console.log('\nFetching all tickets...');
    const tickets = await publicClient.readContract({
      address: ticketMarketplaceAddress,
      abi: ticketMarketplaceAbi,
      functionName: 'getAllTickets'
    });

    console.log('\n=== Ticket Listing Summary ===');
    console.log('Ticket Marketplace Address:', ticketMarketplaceAddress);
    console.log('\nListed Ticket Details:');
    console.log('Event Details:', eventDetails);
    console.log('Minimum Bid:', Number(minBid) / 10 ** 6, 'USDC');
    console.log('Bid Expiry Time:', new Date(Number(bidExpiryTime) * 1000).toLocaleString());
    console.log('Seller Expiry Time:', new Date(Number(sellerExpiryTime) * 1000).toLocaleString());

    console.log('\nAll Tickets in Marketplace:');
    tickets.forEach((ticket: any, index: number) => {
      console.log(`\nTicket #${index + 1}:`);
      console.log('Event Details:', ticket.eventDetails);
      console.log('Current Bid Amount:', Number(ticket.currentBidAmount) / 10 ** 6, 'USDC');
      console.log('Minimum Bid:', Number(ticket.minBid) / 10 ** 6, 'USDC');
      console.log('Bid Expiry Time:', new Date(Number(ticket.bidExpiryTime) * 1000).toLocaleString());
      console.log('Seller Expiry Time:', new Date(Number(ticket.sellerExpiryTime) * 1000).toLocaleString());
      console.log('Seller:', ticket.seller);
      console.log('Current Bidder:', ticket.currentBidder);
    });

  } catch (error) {
    console.error('Error during ticket listing:', error);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 