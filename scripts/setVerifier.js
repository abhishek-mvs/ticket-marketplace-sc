const { ethers } = require("hardhat");

async function main() {
    // Get the contract address from command line arguments
    const ticketMarketplaceAddress = "0xe7f1725e7734ce288f8367e1bb143e90bb3f0512";
    const verifierAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

    if (!ticketMarketplaceAddress || !verifierAddress) {
        console.error("Please provide both TicketMarketplace address and verifier address");
        console.error("Usage: npx hardhat run scripts/setVerifier.js <ticketMarketplaceAddress> <verifierAddress>");
        process.exit(1);
    }

    // Get the contract instance
    const TicketMarketplace = await ethers.getContractFactory("TicketMarketplace");
    const ticketMarketplace = await TicketMarketplace.attach(ticketMarketplaceAddress);

    // Get the signer (deployer)
    const [deployer] = await ethers.getSigners();
    console.log("Setting verifier using account:", deployer.address);

    // Set the verifier
    console.log("Setting verifier address:", verifierAddress);
    const tx = await ticketMarketplace.setVerifier(verifierAddress);
    await tx.wait();

    console.log("Verifier set successfully!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    }); 