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

  // Get the new verifier address from command line arguments
  const newVerifierAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  if (!newVerifierAddress) {
    console.error("Please provide the new verifier address as an argument");
    process.exit(1);
  }

  try {
    // Get the contract instance
    const ticketMarketplace = await ethers.getContractAt("TicketMarketplace", contractAddress) as TicketMarketplace;

    // Get the current verifier address
    const currentVerifier = await ticketMarketplace.verifier();
    console.log("Current Verifier Address:", currentVerifier);

    // Set the new verifier address
    console.log("Setting new verifier address to:", newVerifierAddress);
    const tx = await ticketMarketplace.setVerifier(newVerifierAddress);
    await tx.wait();

    // Verify the new verifier address
    const updatedVerifier = await ticketMarketplace.verifier();
    console.log("Updated Verifier Address:", updatedVerifier);
  } catch (error) {
    console.error("Error setting verifier:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
