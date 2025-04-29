import { expect } from 'chai';
import { createPublicClient, createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hardhat } from 'viem/chains';
import hre from 'hardhat';
import { Account } from 'viem/accounts';

describe('TicketMarketplace', () => {
  let publicClient: any;
  let walletClient: any;
  let mockUSDC: any;
  let ticketMarketplace: any;
  let owner: `0x${string}`;
  let seller: `0x${string}`;
  let buyer1: `0x${string}`;
  let buyer2: `0x${string}`;
  let verifier: `0x${string}`;
  let hardhatAccounts: any[];

  before(async () => {
    // Setup clients
    publicClient = createPublicClient({
      chain: hardhat,
      transport: http()
    });

    // Get accounts from hardhat
    hardhatAccounts = await hre.viem.getWalletClients();
    owner = hardhatAccounts[0].account.address;
    seller = hardhatAccounts[1].account.address;
    buyer1 = hardhatAccounts[2].account.address;
    buyer2 = hardhatAccounts[3].account.address;
    verifier = hardhatAccounts[4].account.address;

    // Create wallet client for owner
    walletClient = createWalletClient({
      account: hardhatAccounts[0].account as Account,
      chain: hardhat,
      transport: http()
    });

    console.log('\n=== Contract Deployment ===');
    console.log('Owner address:', owner);
    console.log('Seller address:', seller);
    console.log('Buyer1 address:', buyer1);
    console.log('Buyer2 address:', buyer2);
    console.log('Verifier address:', verifier);

    try {
      // Deploy MockUSDC contract
      console.log('\nDeploying MockUSDC contract...');
      const { abi: mockUSDCAbi, bytecode: mockUSDCBytecode } = await hre.artifacts.readArtifact('MockUSDC');
      
      const mockUSDCHash = await walletClient.deployContract({
        abi: mockUSDCAbi,
        bytecode: mockUSDCBytecode as `0x${string}`
      });
      
      const mockUSDCReceipt = await publicClient.waitForTransactionReceipt({ hash: mockUSDCHash });
      
      if (!mockUSDCReceipt.contractAddress) {
        throw new Error('MockUSDC deployment failed - no contract address in receipt');
      }
      
      mockUSDC = {
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
      
      ticketMarketplace = {
        address: ticketMarketplaceReceipt.contractAddress,
        abi: ticketMarketplaceAbi
      };
      
      console.log('TicketMarketplace deployed at:', ticketMarketplace.address);

      // Set verifier
      await walletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'setVerifier',
        args: [verifier]
      });

      // Mint tokens to buyers and approve marketplace
      const amount = BigInt(1000 * 10 ** 6); // 1000 USDC
      await walletClient.writeContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'mint',
        args: [buyer1, amount]
      });

      await walletClient.writeContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'mint',
        args: [buyer2, amount]
      });

      // Create wallet clients for buyers
      const buyer1WalletClient = createWalletClient({
        account: hardhatAccounts[2].account as Account,
        chain: hardhat,
        transport: http()
      });

      const buyer2WalletClient = createWalletClient({
        account: hardhatAccounts[3].account as Account,
        chain: hardhat,
        transport: http()
      });

      // Approve marketplace for buyers
      await buyer1WalletClient.writeContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'approve',
        args: [ticketMarketplace.address, amount]
      });

      await buyer2WalletClient.writeContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'approve',
        args: [ticketMarketplace.address, amount]
      });

    } catch (error) {
      console.error('Error during contract deployment:', error);
      throw error;
    }
  });

  describe('Deployment', function () {
    it('Should set the right stablecoin', async function () {
      const stablecoin = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'stablecoin'
      });
      expect(stablecoin.toLowerCase()).to.equal(mockUSDC.address.toLowerCase());
    });

    it('Should set the right owner', async function () {
      const contractOwner = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'owner'
      });
      expect(contractOwner.toLowerCase()).to.equal(owner.toLowerCase());
    });
  });

  describe('Listing Tickets', function () {
    it('Should allow listing a ticket with valid details', async function () {
      const eventDetails = "Concert on 2024-12-31";
      const minBid = BigInt(100 * 10 ** 6); // 100 USDC

      const sellerWalletClient = createWalletClient({
        account: hardhatAccounts[1].account as Account,
        chain: hardhat,
        transport: http()
      });

      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: [eventDetails, minBid]
      });
      
      const ticket = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'tickets',
        args: [0n]
      });
      
      expect(ticket[1].toLowerCase()).to.equal(seller.toLowerCase());
      expect(ticket[2]).to.equal(eventDetails);
      expect(ticket[3]).to.equal(minBid);
    });

    it('Should not allow listing with empty details', async function () {
      const sellerWalletClient = createWalletClient({
        account: hardhatAccounts[1].account as Account,
        chain: hardhat,
        transport: http()
      });

      await expect(
        sellerWalletClient.writeContract({
          address: ticketMarketplace.address,
          abi: ticketMarketplace.abi,
          functionName: 'listTicket',
          args: ["", BigInt(100 * 10 ** 6)]
        })
      ).to.be.rejectedWith("Empty event details");
    });

    it('Should not allow listing with zero minimum bid', async function () {
      const sellerWalletClient = createWalletClient({
        account: hardhatAccounts[1].account as Account,
        chain: hardhat,
        transport: http()
      });
      
      await expect(
        sellerWalletClient.writeContract({
          address: ticketMarketplace.address,
          abi: ticketMarketplace.abi,
          functionName: 'listTicket',
          args: ["Concert", 0n]
        })
      ).to.be.rejectedWith("Minimum bid must be greater than 0");
    });

    it('Should return list of all tickets', async function () {
      const sellerWalletClient = createWalletClient({
        account: hardhatAccounts[1].account as Account,
        chain: hardhat,
        transport: http()
      });

      // List multiple tickets
      const tickets = [
        { details: "Concert 1", minBid: BigInt(100 * 10 ** 6) },
        { details: "Concert 2", minBid: BigInt(200 * 10 ** 6) },
        { details: "Concert 3", minBid: BigInt(300 * 10 ** 6) }
      ];

      // Get initial ticket count
      const initialTicketCount = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'nextTicketId'
      });

      // List all tickets
      for (const ticket of tickets) {
        await sellerWalletClient.writeContract({
          address: ticketMarketplace.address,
          abi: ticketMarketplace.abi,
          functionName: 'listTicket',
          args: [ticket.details, ticket.minBid]
        });
      }

      // Get final ticket count
      const finalTicketCount = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'nextTicketId'
      });
      
      // Verify total number of tickets
      expect(finalTicketCount - initialTicketCount).to.equal(BigInt(tickets.length));

      // Print all tickets
      console.log('\n=== All Tickets in Contract ===');
      const allTickets = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'getAllTickets'
      });

      for (let i = 0; i < allTickets.length; i++) {
        const ticket = allTickets[i];
        const currentBid = await publicClient.readContract({
          address: ticketMarketplace.address,
          abi: ticketMarketplace.abi,
          functionName: 'currentBidAmount',
          args: [BigInt(i)]
        });

        const currentBidder = await publicClient.readContract({
          address: ticketMarketplace.address,
          abi: ticketMarketplace.abi,
          functionName: 'currentBidder',
          args: [BigInt(i)]
        });

        console.log(`\nTicket ID: ${i}`);
        console.log(`Seller: ${ticket.seller}`);
        console.log(`Event Details: ${ticket.eventDetails}`);
        console.log(`Minimum Bid: ${ticket.minBid / BigInt(10 ** 6)} USDC`);
        console.log(`Sold: ${ticket.sold}`);
        console.log(`Buyer: ${ticket.buyer}`);
        console.log(`Current Bid: ${currentBid / BigInt(10 ** 6)} USDC`);
        console.log(`Current Bidder: ${currentBidder}`);
        console.log('------------------------');
      }

      // Verify each ticket's details
      for (let i = 0; i < tickets.length; i++) {
        const ticketId = initialTicketCount + BigInt(i);
        const ticket = allTickets[Number(ticketId)];
        expect(ticket.seller.toLowerCase()).to.equal(seller.toLowerCase());
        expect(ticket.eventDetails).to.equal(tickets[i].details);
        expect(ticket.minBid).to.equal(tickets[i].minBid);
        expect(ticket.sold).to.equal(false); // sold status
        expect(ticket.buyer).to.equal("0x0000000000000000000000000000000000000000"); // buyer address
      }
    });
  });

  describe('Placing Bids', function () {
    it('Should allow placing a valid bid', async function () {
      const eventDetails = "Concert";
      const minBid = BigInt(100 * 10 ** 6);
      
      const sellerWalletClient = createWalletClient({
        account: hardhatAccounts[1].account as Account,
        chain: hardhat,
        transport: http()
      });

      const buyer1WalletClient = createWalletClient({
        account: hardhatAccounts[2].account as Account,
        chain: hardhat,
        transport: http()
      });

      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: [eventDetails, minBid]
      });

      await buyer1WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [0n, minBid]
      });
      
      const currentBid = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'currentBidAmount',
        args: [0n]
      });
      
      expect(currentBid).to.equal(minBid);
    });

    it('Should refund previous bidder when new bid is placed', async function () {
      const minBid = BigInt(100 * 10 ** 6);
      const higherBid = BigInt(150 * 10 ** 6);
      
      const sellerWalletClient = createWalletClient({
        account: hardhatAccounts[1].account as Account,
        chain: hardhat,
        transport: http()
      });

      const buyer1WalletClient = createWalletClient({
        account: hardhatAccounts[2].account as Account,
        chain: hardhat,
        transport: http()
      });

      const buyer2WalletClient = createWalletClient({
        account: hardhatAccounts[3].account as Account,
        chain: hardhat,
        transport: http()
      });

      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Concert", minBid]
      });

      await buyer1WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [0n, minBid]
      });
      
      const initialBalance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [buyer1]
      });
      console.log("Initial balance:", initialBalance);
      await buyer2WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [0n, higherBid]
      });

      const finalBalance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [buyer1]
      });
      console.log("Final balance:", finalBalance);
      expect(BigInt(finalBalance) - BigInt(initialBalance)).to.equal(minBid);
    });

    it('Should not allow bid lower than minimum', async function () {
      const minBid = BigInt(100 * 10 ** 6);
      const lowBid = BigInt(50 * 10 ** 6);
      
      const sellerWalletClient = createWalletClient({
        account: hardhatAccounts[1].account as Account,
        chain: hardhat,
        transport: http()
      });

      const buyer1WalletClient = createWalletClient({
        account: hardhatAccounts[2].account as Account,
        chain: hardhat,
        transport: http()
      });

      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Concert", minBid]
      });
      
      await expect(
        buyer1WalletClient.writeContract({
          address: ticketMarketplace.address,
          abi: ticketMarketplace.abi,
          functionName: 'placeBid',
          args: [0n, lowBid]
        })
      ).to.be.rejectedWith("Bid too low");
    });
  });

  describe('Ticket Delivery Confirmation', function () {
    it('Should transfer funds to seller on successful delivery', async function () {
      const minBid = BigInt(100 * 10 ** 6);
      
      const sellerWalletClient = createWalletClient({
        account: hardhatAccounts[1].account as Account,
        chain: hardhat,
        transport: http()
      });

      const buyer1WalletClient = createWalletClient({
        account: hardhatAccounts[2].account as Account,
        chain: hardhat,
        transport: http()
      });

      const verifierWalletClient = createWalletClient({
        account: hardhatAccounts[4].account as Account,
        chain: hardhat,
        transport: http()
      });

      // Get the current ticket ID
      const ticketId = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'nextTicketId'
      });

      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Concert", minBid]
      });

      await buyer1WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [ticketId, minBid]
      });
      
      const initialBalance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [seller]
      });

      await verifierWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'confirmTicketDelivery',
        args: [ticketId, true]
      });

      const finalBalance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [seller]
      });
      
      expect(BigInt(finalBalance) - BigInt(initialBalance)).to.equal(minBid);
    });

    it('Should refund buyer on failed delivery', async function () {
      const minBid = BigInt(100 * 10 ** 6);
      
      const sellerWalletClient = createWalletClient({
        account: hardhatAccounts[1].account as Account,
        chain: hardhat,
        transport: http()
      });

      const buyer1WalletClient = createWalletClient({
        account: hardhatAccounts[2].account as Account,
        chain: hardhat,
        transport: http()
      });

      const verifierWalletClient = createWalletClient({
        account: hardhatAccounts[4].account as Account,
        chain: hardhat,
        transport: http()
      });

      // Get the current ticket ID
      const ticketId = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'nextTicketId'
      });

      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Concert", minBid]
      });

      await buyer1WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [ticketId, minBid]
      });
      
      const initialBalance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [buyer1]
      });

      await verifierWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'confirmTicketDelivery',
        args: [ticketId, false]
      });

      const finalBalance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [buyer1]
      });
      
      expect(BigInt(finalBalance) - BigInt(initialBalance)).to.equal(minBid);
    });

    it('Should only allow verifier to confirm delivery', async function () {
      const minBid = BigInt(100 * 10 ** 6);
      
      const sellerWalletClient = createWalletClient({
        account: hardhatAccounts[1].account as Account,
        chain: hardhat,
        transport: http()
      });

      const buyer1WalletClient = createWalletClient({
        account: hardhatAccounts[2].account as Account,
        chain: hardhat,
        transport: http()
      });

      // Get the current ticket ID
      const ticketId = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'nextTicketId'
      });

      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Concert", minBid]
      });

      await buyer1WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [ticketId, minBid]
      });
      
      await expect(
        buyer1WalletClient.writeContract({
          address: ticketMarketplace.address,
          abi: ticketMarketplace.abi,
          functionName: 'confirmTicketDelivery',
          args: [ticketId, true]
        })
      ).to.be.rejectedWith("Only verifier can confirm delivery");
    });
  });
});
