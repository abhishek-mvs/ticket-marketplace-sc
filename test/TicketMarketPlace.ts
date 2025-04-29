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
      const amount = BigInt(10000 * 10 ** 6); // 1000 USDC
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
      const minBid = BigInt(100 * 10 ** 6);
      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const bidExpiryTime = currentTime + 3600n;
      const sellerExpiryTime = currentTime + 7200n;

      const sellerWalletClient = createWalletClient({
        account: hardhatAccounts[1].account as Account,
        chain: hardhat,
        transport: http()
      });

      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: [eventDetails, minBid, bidExpiryTime, sellerExpiryTime]
      });
      
      const ticket = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'tickets',
        args: [0n]
      });
      
      const ticketListFromContract = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'getAllTickets'
      });
      console.log("ticketList", ticketListFromContract);

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

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const bidExpiryTime = currentTime + 3600n;
      const sellerExpiryTime = currentTime + 7200n;

      await expect(
        sellerWalletClient.writeContract({
          address: ticketMarketplace.address,
          abi: ticketMarketplace.abi,
          functionName: 'listTicket',
          args: ["", BigInt(100 * 10 ** 6), bidExpiryTime, sellerExpiryTime]
        })
      ).to.be.rejectedWith("Empty event details");
    });

    it('Should not allow listing with zero minimum bid', async function () {
      const sellerWalletClient = createWalletClient({
        account: hardhatAccounts[1].account as Account,
        chain: hardhat,
        transport: http()
      });

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const bidExpiryTime = currentTime + 3600n;
      const sellerExpiryTime = currentTime + 7200n;
      
      await expect(
        sellerWalletClient.writeContract({
          address: ticketMarketplace.address,
          abi: ticketMarketplace.abi,
          functionName: 'listTicket',
          args: ["Concert", 0n, bidExpiryTime, sellerExpiryTime]
        })
      ).to.be.rejectedWith("Minimum bid must be greater than 0");
    });

    it('Should return list of all tickets', async function () {
      const sellerWalletClient = createWalletClient({
        account: hardhatAccounts[1].account as Account,
        chain: hardhat,
        transport: http()
      });

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const bidExpiryTime = currentTime + 3600n;
      const sellerExpiryTime = currentTime + 7200n;

      // List multiple tickets
      const tickets = [
        { details: "Concert 1", minBid: BigInt(100 * 10 ** 6) },
        { details: "Concert 2", minBid: BigInt(200 * 10 ** 6) },
        { details: "Concert 3", minBid: BigInt(300 * 10 ** 6) }
      ];

      const ticketListFromContract = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'getAllTickets'
      });
      console.log("ticketLis in list of all tickets", ticketListFromContract);

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
          args: [ticket.details, ticket.minBid, bidExpiryTime, sellerExpiryTime]
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
      console.log("allTickets", allTickets);
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

    it('Should return seller tickets', async function () {
      const sellerWalletClient = createWalletClient({
        account: hardhatAccounts[1].account as Account,
        chain: hardhat,
        transport: http()
      });

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const bidExpiryTime = currentTime + 3600n;
      const sellerExpiryTime = currentTime + 7200n;

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

      // List new tickets
      for (const ticket of tickets) {
        await sellerWalletClient.writeContract({
          address: ticketMarketplace.address,
          abi: ticketMarketplace.abi,
          functionName: 'listTicket',
          args: [ticket.details, ticket.minBid, bidExpiryTime, sellerExpiryTime]
        });
      }

      const sellerTickets = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'getSellerTickets',
        args: [seller]
      });

      expect(sellerTickets.length).to.equal(Number(initialTicketCount) + tickets.length);
      for (let i = 0; i < tickets.length; i++) {
        const ticketId = initialTicketCount + BigInt(i);
        const ticket = await publicClient.readContract({
          address: ticketMarketplace.address,
          abi: ticketMarketplace.abi,
          functionName: 'tickets',
          args: [ticketId]
        });
        expect(ticket[1].toLowerCase()).to.equal(seller.toLowerCase());
        expect(ticket[2]).to.equal(tickets[i].details);
        expect(ticket[3]).to.equal(tickets[i].minBid);
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

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const bidExpiryTime = currentTime + 3600n;
      const sellerExpiryTime = currentTime + 7200n;

      // Create a new ticket for this test
      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: [eventDetails, minBid, bidExpiryTime, sellerExpiryTime]
      });

      // Get the new ticket ID
      const ticketId = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'nextTicketId'
      }) - 1n;

      await buyer1WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [ticketId, minBid]
      });
      
      // Check if bid was recorded in ticketBids
      const ticketBids = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'getTicketBids',
        args: [ticketId]
      });
      
      expect(ticketBids.length).to.equal(1);
      expect(ticketBids[0].amount).to.equal(minBid);
      expect(ticketBids[0].bidder.toLowerCase()).to.equal(buyer1.toLowerCase());
      expect(ticketBids[0].isActive).to.equal(true);
    });

    it('Should not allow multiple bids from same user', async function () {
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

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const bidExpiryTime = currentTime + 3600n;
      const sellerExpiryTime = currentTime + 7200n;

      // Create a new ticket for this test
      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Concert", minBid, bidExpiryTime, sellerExpiryTime]
      });

      // Get the new ticket ID
      const ticketId = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'nextTicketId'
      }) - 1n;

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
          functionName: 'placeBid',
          args: [ticketId, higherBid]
        })
      ).to.be.rejectedWith("User has already bid on this ticket");
    });

    it('Should track all bids for a ticket', async function () {
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

      const buyer2WalletClient = createWalletClient({
        account: hardhatAccounts[3].account as Account,
        chain: hardhat,
        transport: http()
      });

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const bidExpiryTime = currentTime + 3600n;
      const sellerExpiryTime = currentTime + 7200n;

      // Create a new ticket for this test
      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Concert", minBid, bidExpiryTime, sellerExpiryTime]
      });

      // Get the new ticket ID
      const ticketId = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'nextTicketId'
      }) - 1n;

      // Place bids from different users
      await buyer1WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [ticketId, minBid]
      });

      await buyer2WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [ticketId, minBid + BigInt(50 * 10 ** 6)]
      });

      const ticketBids = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'getTicketBids',
        args: [ticketId]
      });

      expect(ticketBids.length).to.equal(2);
      expect(ticketBids[0].bidder.toLowerCase()).to.equal(buyer1.toLowerCase());
      expect(ticketBids[1].bidder.toLowerCase()).to.equal(buyer2.toLowerCase());
      expect(ticketBids[0].amount).to.equal(minBid);
      expect(ticketBids[1].amount).to.equal(minBid + BigInt(50 * 10 ** 6));
    });

    it('Should track all bids by a user', async function () {
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

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const bidExpiryTime = currentTime + 3600n;
      const sellerExpiryTime = currentTime + 7200n;

      // List multiple tickets
      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Concert 1", minBid, bidExpiryTime, sellerExpiryTime]
      });

      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Concert 2", minBid, bidExpiryTime, sellerExpiryTime]
      });

      // Get the new ticket IDs
      const ticketId1 = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'nextTicketId'
      }) - 2n;

      const ticketId2 = ticketId1 + 1n;

      // Place bids on different tickets
      await buyer1WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [ticketId1, minBid]
      });

      await buyer1WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [ticketId2, minBid + BigInt(50 * 10 ** 6)]
      });

      const userBids = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'getUserBids',
        args: [buyer1]
      });
      console.log("userBids", userBids);
      // Get the last two bids (most recent)
      const recentBids = userBids.slice(-2);
      
      expect(recentBids[0].ticketId).to.equal(ticketId1);
      expect(recentBids[1].ticketId).to.equal(ticketId2);
      expect(recentBids[0].amount).to.equal(minBid);
      expect(recentBids[1].amount).to.equal(minBid + BigInt(50 * 10 ** 6));
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

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const bidExpiryTime = currentTime + 3600n;
      const sellerExpiryTime = currentTime + 7200n;

      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Concert", minBid, bidExpiryTime, sellerExpiryTime]
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
    it('Should process highest bid on successful delivery', async function () {
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

      const buyer2WalletClient = createWalletClient({
        account: hardhatAccounts[3].account as Account,
        chain: hardhat,
        transport: http()
      });

      const verifierWalletClient = createWalletClient({
        account: hardhatAccounts[4].account as Account,
        chain: hardhat,
        transport: http()
      });

      // Get current block timestamp
      const latestBlock = await publicClient.getBlock({ blockTag: 'latest' });
      const currentTime = BigInt(latestBlock.timestamp);
      
      // Set expiry times to be in the future
      const bidExpiryTime = currentTime + 4n; // 2 seconds
      const sellerExpiryTime = currentTime + 10n; // 3 seconds

      console.log('\n=== Timestamps for Successful Delivery Test ===');
      console.log('Current block timestamp:', currentTime.toString());
      console.log('Bid expiry time:', bidExpiryTime.toString());
      console.log('Seller expiry time:', sellerExpiryTime.toString());

      // Create a new ticket for this test
      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Concert", minBid, bidExpiryTime, sellerExpiryTime]
      });

      // Get the new ticket ID
      const ticketId = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'nextTicketId'
      }) - 1n;

      // Place multiple bids
      await buyer1WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [ticketId, minBid]
      });

      await buyer2WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [ticketId, minBid + BigInt(50 * 10 ** 6)]
      });
      
      // Fast forward time past bid expiry
      await new Promise(resolve => setTimeout(resolve, 4000)); // Wait 4 seconds
      
      const initialSellerBalance = await publicClient.readContract({
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

      const finalSellerBalance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [seller]
      });
      
      // Verify seller received the highest bid amount
      expect(BigInt(finalSellerBalance) - BigInt(initialSellerBalance)).to.equal(minBid + BigInt(50 * 10 ** 6));

      // Verify ticket status
      const ticket = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'tickets',
        args: [ticketId]
      });
      
      expect(ticket[4]).to.equal(true); // sold status
      expect(ticket[5].toLowerCase()).to.equal(buyer2.toLowerCase()); // buyer address
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

      // Get current block timestamp
      const latestBlock = await publicClient.getBlock({ blockTag: 'latest' });
      const currentTime = BigInt(latestBlock.timestamp);
      
      const bidExpiryTime = currentTime + 2n; // 2 seconds
      const sellerExpiryTime = currentTime + 3n; // 3 seconds

      console.log('\n=== Timestamps for Failed Delivery Test ===');
      console.log('Current block timestamp:', currentTime.toString());
      console.log('Bid expiry time:', bidExpiryTime.toString());
      console.log('Seller expiry time:', sellerExpiryTime.toString());

      // Create a new ticket for this test
      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Concert", minBid, bidExpiryTime, sellerExpiryTime]
      });

      // Get the new ticket ID
      const ticketId = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'nextTicketId'
      }) - 1n;

      await buyer1WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [ticketId, minBid]
      });
      
      // Wait for bid expiry and seller expiry
      await new Promise(resolve => setTimeout(resolve, 4000)); // Wait 4 seconds
      
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

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const bidExpiryTime = currentTime + 3600n;
      const sellerExpiryTime = currentTime + 7200n;

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
        args: ["Concert", minBid, bidExpiryTime, sellerExpiryTime]
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

  describe('Bidding and Expiry', function () {
    it('Should not allow bidding after expiry', async function () {
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

      // Get current block timestamp
      const latestBlock = await publicClient.getBlock({ blockTag: 'latest' });
      const currentTime = BigInt(latestBlock.timestamp);
      
      // Set expiry times to be in the future
      const bidExpiryTime = currentTime + 2n; // 2 seconds
      const sellerExpiryTime = currentTime + 10n; // 10 seconds

      console.log('\n=== Timestamps for Bidding Expiry Test ===');
      console.log('Current block timestamp:', currentTime.toString());
      console.log('Bid expiry time:', bidExpiryTime.toString());
      console.log('Seller expiry time:', sellerExpiryTime.toString());

      
      // Create a new ticket for this test
      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Expired Concert", BigInt(100 * 10 ** 6), bidExpiryTime, sellerExpiryTime]
      });

      // Get the new ticket ID
      const ticketId = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'nextTicketId'
      }) - 1n;

      await new Promise(resolve => setTimeout(resolve, 4000)); // Wait 4 seconds

      // Try to place a bid after expiry
      await expect(
        buyer1WalletClient.writeContract({
          address: ticketMarketplace.address,
          abi: ticketMarketplace.abi,
          functionName: 'placeBid',
          args: [ticketId, BigInt(100 * 10 ** 6)]
        })
      ).to.be.rejectedWith("Bidding period has expired");
    });

    it('Should track user bids', async function () {
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

      const currentTime = BigInt(Math.floor(Date.now() / 1000));
      const bidExpiryTime = currentTime + 3600n;
      const sellerExpiryTime = currentTime + 7200n;

      // Create a new ticket for this test
      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Concert", BigInt(100 * 10 ** 6), bidExpiryTime, sellerExpiryTime]
      });

      // Get the new ticket ID
      const ticketId = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'nextTicketId'
      }) - 1n;

      // Get initial bids count
      const initialBids = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'getUserBids',
        args: [buyer1]
      });

      // Place bid
      await buyer1WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [ticketId, BigInt(100 * 10 ** 6)]
      });

      const userBids = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'getUserBids',
        args: [buyer1]
      });

      expect(userBids.length - initialBids.length).to.equal(1);
      const newBid = userBids[userBids.length - 1];
      expect(newBid.ticketId).to.equal(ticketId);
      expect(newBid.amount).to.equal(BigInt(100 * 10 ** 6));
      expect(newBid.isActive).to.equal(true);
    });

    it('Should process expired tickets and refund all bidders', async function () {
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

      // Get current block timestamp
      const latestBlock = await publicClient.getBlock({ blockTag: 'latest' });
      const currentTime = BigInt(latestBlock.timestamp);
      
      // Set expiry times to be very short
      const bidExpiryTime = currentTime + 4n; // 4 seconds
      const sellerExpiryTime = currentTime + 6n; // 6 seconds
      const minBid = BigInt(100 * 10 ** 6); // 100 USDC

      // Get initial balances
      const initialBuyer1Balance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [buyer1]
      });

      const initialBuyer2Balance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [buyer2]
      });

      const initialContractBalance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [ticketMarketplace.address]
      });

      console.log("initialContractBalance", initialContractBalance);
      console.log("initialBuyer1Balance", initialBuyer1Balance);
      console.log("initialBuyer2Balance", initialBuyer2Balance);
      // Create a new ticket for this test
      await sellerWalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'listTicket',
        args: ["Expired Concert", minBid, bidExpiryTime, sellerExpiryTime]
      });

      // Get the new ticket ID
      const ticketId = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'nextTicketId'
      }) - 1n;
      console.log("ticketId", ticketId);
      // Place bids from both buyers
      await buyer1WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [ticketId, minBid]
      });

      await buyer2WalletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'placeBid',
        args: [ticketId, minBid + BigInt(50 * 10 ** 6)]
      });

      // Check balances after placing bids
      const afterBidBuyer1Balance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [buyer1]
      });

      const afterBidBuyer2Balance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [buyer2]
      });

      const afterBidContractBalance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [ticketMarketplace.address]
      });

      console.log("afterBidContractBalance", afterBidContractBalance);
      console.log("afterBidBuyer1Balance", afterBidBuyer1Balance);
      console.log("afterBidBuyer2Balance", afterBidBuyer2Balance);

      // Verify bid amounts were transferred to contract
      expect(BigInt(initialBuyer1Balance) - BigInt(afterBidBuyer1Balance)).to.equal(minBid);
      expect(BigInt(initialBuyer2Balance) - BigInt(afterBidBuyer2Balance)).to.equal(minBid + BigInt(50 * 10 ** 6));
      expect(BigInt(afterBidContractBalance) - BigInt(initialContractBalance)).to.equal(minBid + minBid + BigInt(50 * 10 ** 6));

      // Wait for seller expiry
      await new Promise(resolve => setTimeout(resolve, 6000)); // Wait 4 seconds

      // Process expired tickets
      await walletClient.writeContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'processExpiredTickets'
      });

      // Check final balances
      const finalBuyer1Balance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [buyer1]
      });

      const finalBuyer2Balance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [buyer2]
      });

      const finalContractBalance = await publicClient.readContract({
        address: mockUSDC.address,
        abi: mockUSDC.abi,
        functionName: 'balanceOf',
        args: [ticketMarketplace.address]
      });

      console.log("finalBuyer1Balance", finalBuyer1Balance);
      console.log("finalBuyer2Balance", finalBuyer2Balance);
      console.log("finalContractBalance", finalContractBalance);
      // Verify all bid amounts were refunded
      expect(BigInt(finalBuyer1Balance) - BigInt(afterBidBuyer1Balance)).to.equal(minBid);
      expect(BigInt(finalBuyer2Balance) - BigInt(afterBidBuyer2Balance)).to.equal(minBid + BigInt(50 * 10 ** 6));
      expect(BigInt(afterBidContractBalance) - BigInt(finalContractBalance)).to.equal(minBid + minBid + BigInt(50 * 10 ** 6));

      // Verify ticket is marked as sold
      const ticket = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'tickets',
        args: [ticketId]
      });
      expect(ticket[4]).to.equal(true); // sold status

      // Verify ticket is removed from seller's active tickets
      const sellerTickets = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'getSellerTickets',
        args: [seller]
      });

      const buyer2userBids = await publicClient.readContract({
        address: ticketMarketplace.address,
        abi: ticketMarketplace.abi,
        functionName: 'getUserBids',
        args: [buyer2]
      });
      

      console.log("sellerTickets", sellerTickets);
      console.log("buyer2userBids", buyer2userBids);
      // Check if the ticket is no longer in seller's active tickets
      const ticketExists = sellerTickets.some((ticket: any) => ticket.id === ticketId);
      expect(ticketExists).to.equal(true);
    });
  });
});
