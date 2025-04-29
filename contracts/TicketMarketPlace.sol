// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TicketMarketplace is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    struct Ticket {
        uint256 id;
        address seller;
        string eventDetails;
        uint256 minBid;
        bool sold;
        address buyer;
        uint256 bidExpiryTime;  // Time after which no new bids can be placed
        uint256 sellerExpiryTime; // Time after which unsold tickets are refunded
    }

    struct Bid {
        uint256 ticketId;
        uint256 amount;
        uint256 timestamp;
        bool isActive;
    }

    IERC20 public stablecoin;
    uint256 public nextTicketId;
    mapping(uint256 => Ticket) public tickets;
    mapping(uint256 => uint256) public currentBidAmount;
    mapping(uint256 => address) public currentBidder;
    mapping(address => uint256[]) public sellerTickets; // Mapping of seller to their ticket IDs
    mapping(address => Bid[]) public userBids; // Mapping of user to their bids
    address public verifier; // AVS node address

    event TicketListed(uint256 ticketId, address seller, string details, uint256 minBid, uint256 bidExpiryTime, uint256 sellerExpiryTime);
    event BidPlaced(uint256 ticketId, address bidder, uint256 amount);
    event ProofSubmitted(uint256 ticketId, address seller);
    event TicketExpired(uint256 ticketId, address seller);
    event BidExpired(uint256 ticketId, address bidder, uint256 amount);

    constructor(address _stablecoin) {
        require(_stablecoin != address(0), "Invalid stablecoin address");
        stablecoin = IERC20(_stablecoin);
    }

    function getAllTickets() external view returns (Ticket[] memory) {
        Ticket[] memory allTickets = new Ticket[](nextTicketId);
        
        for (uint256 i = 0; i < nextTicketId; i++) {
            allTickets[i] = tickets[i];
        }
        
        return allTickets;
    }

    function getSellerTickets(address seller) external view returns (Ticket[] memory) {
        uint256[] storage ticketIds = sellerTickets[seller];
        Ticket[] memory sellerTicketsList = new Ticket[](ticketIds.length);
        
        for (uint256 i = 0; i < ticketIds.length; i++) {
            sellerTicketsList[i] = tickets[ticketIds[i]];
        }
        
        return sellerTicketsList;
    }

    function getUserBids(address user) external view returns (Bid[] memory) {
        return userBids[user];
    }

    function setVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "Invalid verifier address");
        verifier = _verifier;
    }

    function listTicket(string calldata _details, uint256 _minBid, uint256 _bidExpiryTime, uint256 _sellerExpiryTime) external nonReentrant {
        require(bytes(_details).length > 0, "Empty event details");
        require(_minBid > 0, "Minimum bid must be greater than 0");
        require(_bidExpiryTime > block.timestamp, "Bid expiry time must be in the future");
        require(_sellerExpiryTime > _bidExpiryTime, "Seller expiry time must be after bid expiry");

        tickets[nextTicketId] = Ticket({
            id: nextTicketId,
            seller: msg.sender,
            eventDetails: _details,
            minBid: _minBid,
            sold: false,
            buyer: address(0),
            bidExpiryTime: _bidExpiryTime,
            sellerExpiryTime: _sellerExpiryTime
        });

        sellerTickets[msg.sender].push(nextTicketId);

        emit TicketListed(nextTicketId, msg.sender, _details, _minBid, _bidExpiryTime, _sellerExpiryTime);
        nextTicketId++;
    }

    function placeBid(uint256 ticketId, uint256 bidAmount) external nonReentrant {
        Ticket storage ticket = tickets[ticketId];
        require(ticket.seller != address(0), "Ticket does not exist");
        require(!ticket.sold, "Already sold");
        require(block.timestamp <= ticket.bidExpiryTime, "Bidding period has expired");
        require(bidAmount >= ticket.minBid, "Bid too low");
        require(bidAmount >= currentBidAmount[ticketId], "There is a higher bid");

        // Refund previous bidder
        if (currentBidder[ticketId] != address(0)) {
            stablecoin.safeTransfer(currentBidder[ticketId], currentBidAmount[ticketId]);
            // Mark previous bid as inactive
            for (uint256 i = 0; i < userBids[currentBidder[ticketId]].length; i++) {
                if (userBids[currentBidder[ticketId]][i].ticketId == ticketId) {
                    userBids[currentBidder[ticketId]][i].isActive = false;
                    break;
                }
            }
        }

        // Transfer tokens to contract as lock
        stablecoin.safeTransferFrom(msg.sender, address(this), bidAmount);
        currentBidder[ticketId] = msg.sender;
        currentBidAmount[ticketId] = bidAmount;

        // Add new bid to user's bid history
        userBids[msg.sender].push(Bid({
            ticketId: ticketId,
            amount: bidAmount,
            timestamp: block.timestamp,
            isActive: true
        }));

        emit BidPlaced(ticketId, msg.sender, bidAmount);
    }

    function confirmTicketDelivery(uint256 ticketId, bool success) external nonReentrant {
        require(msg.sender == verifier, "Only verifier can confirm delivery");
        Ticket storage ticket = tickets[ticketId];
        require(ticket.seller != address(0), "Ticket does not exist");
        require(!ticket.sold, "Already processed");
        require(currentBidder[ticketId] != address(0), "No bidder");

        if (success) {
            // Send funds to seller
            stablecoin.safeTransfer(ticket.seller, currentBidAmount[ticketId]);
            ticket.sold = true;
            ticket.buyer = currentBidder[ticketId];
        } else {
            // Refund bidder
            stablecoin.safeTransfer(currentBidder[ticketId], currentBidAmount[ticketId]);
        }

        emit ProofSubmitted(ticketId, ticket.seller);
    }

    function processExpiredTickets() external nonReentrant {
        for (uint256 i = 0; i < nextTicketId; i++) {
            Ticket storage ticket = tickets[i];
            
            // Skip if ticket doesn't exist or is already sold
            if (ticket.seller == address(0) || ticket.sold) {
                continue;
            }

            // Process bid expiry
            if (block.timestamp > ticket.bidExpiryTime && currentBidder[i] != address(0)) {
                // Refund the current bidder
                stablecoin.safeTransfer(currentBidder[i], currentBidAmount[i]);
                emit BidExpired(i, currentBidder[i], currentBidAmount[i]);
                currentBidder[i] = address(0);
                currentBidAmount[i] = 0;
            }

            // Process seller expiry
            if (block.timestamp > ticket.sellerExpiryTime) {
                // Mark ticket as expired
                emit TicketExpired(i, ticket.seller);
                // Remove from seller's active tickets
                uint256[] storage sellerTicketIds = sellerTickets[ticket.seller];
                for (uint256 j = 0; j < sellerTicketIds.length; j++) {
                    if (sellerTicketIds[j] == i) {
                        sellerTicketIds[j] = sellerTicketIds[sellerTicketIds.length - 1];
                        sellerTicketIds.pop();
                        break;
                    }
                }
            }
        }
    }
}