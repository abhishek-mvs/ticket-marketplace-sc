import { ethers } from "hardhat";
import { TicketMarketplace } from "../typechain-types";

async function main() {
  // Get the contract instance
  const ticketMarketplace = await ethers.getContractAt(
    "TicketMarketplace",
    process.env.TICKET_MARKETPLACE_ADDRESS || ""
  ) as TicketMarketplace;

  const ticketId = 1; // Ticket #3 (Mumbai Music Festival)
  const minBid = ethers.parseEther("20"); // Minimum bid from ticket details
  const bidAmount = ethers.parseEther("20"); // Bidding slightly higher than minimum

  console.log(`Placing bid for Ticket #${ticketId}...`);
  console.log(`Event: Mumbai Music Festival`);
  console.log(`Minimum Bid: ${ethers.formatEther(minBid)} ETH`);
  console.log(`Your Bid Amount: ${ethers.formatEther(bidAmount)} ETH`);

  try {
    // Place the bid
    const tx = await ticketMarketplace.placeBid(ticketId, bidAmount);
    console.log("Transaction hash:", tx.hash);
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt?.blockNumber);
    
    // Get the ticket details after bidding
    const ticket = await ticketMarketplace.tickets(ticketId);
    console.log("\nUpdated Ticket Status:");
    console.log("=====================");
    console.log(`Event Name: ${ticket.eventName}`);
    console.log(`Current Status: ${ticket.sold ? "Sold" : "Available"}`);
    console.log(`Current Bidder: ${ticket.buyer}`);
    console.log(`Bid Expiry: ${new Date(Number(ticket.bidExpiryTime) * 1000).toLocaleString()}`);
    
  } catch (error) {
    console.error("Error placing bid:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
