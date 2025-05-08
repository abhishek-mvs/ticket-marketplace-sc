import { ethers } from "hardhat";
import { TicketMarketplace } from "../typechain-types";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const contractAddress = process.env.TICKET_MARKETPLACE_ADDRESS;
  if (!contractAddress) {
    console.error("Please set TICKET_MARKETPLACE_ADDRESS in your .env file");
    process.exit(1);
  }

  try {
    // Get the contract instance
    const ticketMarketplace = await ethers.getContractAt("TicketMarketplace", contractAddress) as TicketMarketplace;

    // Fetch the verifier address
    const verifier = await ticketMarketplace.verifier();
    
    console.log("Contract Address:", contractAddress);
    console.log("Verifier Address:", verifier);
  } catch (error) {
    console.error("Error fetching verifier:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
