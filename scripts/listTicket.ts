import { createPublicClient, createWalletClient, http } from 'viem';
import { baseSepolia, hardhat } from 'viem/chains';
import hre from 'hardhat';
import { privateKeyToAccount } from 'viem/accounts';
import * as dotenv from 'dotenv';

dotenv.config();
const chainToUse = hardhat
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

    // Example ticket data
    const eventDetails = "Mumbai Music Festival";
    const eventName = "Mumbai Music Festival";
    // Set event date to tomorrow at midnight
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const eventDate = BigInt(Math.floor(tomorrow.getTime() / 1000));
    const eventLocation = "Mumbai";
    const ticketImage = "https://imgs.search.brave.com/vYhHnb9dcA0W-hjbjfwC8CehAg8IxTkHrHdxs5o9BLE/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tZWRp/YS5pc3RvY2twaG90/by5jb20vaWQvMTE5/MTgxODI1OS9waG90/by9jcm93ZC1vbi1h/LW11c2ljLWZlc3Rp/dmFsLmpwZz9zPTYx/Mng2MTImdz0wJms9/MjAmYz1nNUFRbDkx/amZEX3pZc1ZaT0hX/SjhQNGJJcWNvVDV1/UnNpTFVrNGcxNGVB/PQ";
    const sellerFID = 1n; // Replace with actual seller FID
    const minBid = BigInt(10 * 10 ** 6); // 10 USDC
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    const bidExpiryTime = currentTime + 15n * 60n; // 15 minutes from now
    const sellerExpiryTime = currentTime + 30n * 60n; // 30 minutes from now

    console.log('\nListing new ticket...');
    const listHash = await walletClient.writeContract({
      address: ticketMarketplaceAddress,
      abi: ticketMarketplaceAbi,
      functionName: 'listTicket',
      args: [
        eventDetails,
        eventName,
        eventDate,
        eventLocation,
        ticketImage,
        sellerFID,
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
      console.log('Ticket:', ticket);
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