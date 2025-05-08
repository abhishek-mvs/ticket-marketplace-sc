import { ethers } from "hardhat";
import { TicketMarketplace } from "../typechain-types";
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  if (!process.env.TICKET_MARKETPLACE_ADDRESS) {
    throw new Error('Please set TICKET_MARKETPLACE_ADDRESS in your .env file');
  }

  // Get the contract instance using the deployed address
  const ticketMarketplace = await ethers.getContractAt(
    "TicketMarketplace",
    process.env.TICKET_MARKETPLACE_ADDRESS
  ) as TicketMarketplace;

  console.log("Fetching all tickets...");
  
  // Call getAllTickets function
  const tickets = await ticketMarketplace.getAllTickets();
  
  console.log("\nAll Tickets:");
  console.log("============");
  
  tickets.forEach((ticket, index) => {
    if (ticket.seller !== ethers.ZeroAddress) {
      console.log(`\nTicket #${index}:`);
      console.log(`Event Name: ${ticket.eventName}`);
      console.log(`Event Details: ${ticket.eventDetails}`);
      console.log(`Event Date: ${new Date(Number(ticket.eventDate) * 1000).toLocaleString()}`);
      console.log(`Event Location: ${ticket.eventLocation}`);
      console.log(`Seller: ${ticket.seller}`);
      console.log(`Seller FID: ${ticket.sellerFID}`);
      console.log(`Minimum Bid: ${ethers.formatEther(ticket.minBid)} ETH`);
      console.log(`ImageUri: ${ticket.ticketImage}`);
      console.log(`Status: ${ticket.sold ? "Sold" : "Available"}`);
      if (ticket.sold) {
        console.log(`Buyer: ${ticket.buyer}`);
        console.log(`Buyer FID: ${ticket.buyerFID}`);
      }
      console.log(`Bid Expiry: ${new Date(Number(ticket.bidExpiryTime) * 1000).toLocaleString()}`);
      console.log(`Seller Expiry: ${new Date(Number(ticket.sellerExpiryTime) * 1000).toLocaleString()}`);
      console.log(`Created At: ${new Date(Number(ticket.createdAt) * 1000).toLocaleString()}`);
      console.log(`Verified: ${ticket.isHighestBidderFound ? "Yes" : "No"}`);
      console.log("----------------------------------------");
    }
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
