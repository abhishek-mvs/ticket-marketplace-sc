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
        uint256 sellerFID;
        string eventDetails;
        string eventName;
        uint256 eventDate;
        string eventLocation;
        string ticketImage;  // URL or IPFS hash of the ticket image
        uint256 minBid;
        bool sold;
        address buyer;
        uint256 buyerFID;
        uint256 bidExpiryTime;  // Time after which no new bids can be placed
        uint256 sellerExpiryTime; // Time after which unsold tickets are refunded
        uint256 createdAt;
        bool isHighestBidderFound; // Flag to track if highest bidder has been determined
    }

    struct Bid {
        uint256 ticketId;
        uint256 amount;
        uint256 timestamp;
        bool isActive;
        bool isAccepted;
        address bidder;
    }

    IERC20 public stablecoin;
    uint256 public nextTicketId;
    mapping(uint256 => Ticket) public tickets;
    mapping(uint256 => uint256) public currentBidAmount;
    mapping(uint256 => address) public currentBidder;
    mapping(address => uint256[]) public sellerTickets; // Mapping of seller to their ticket IDs
    mapping(address => Bid[]) public userBids; // Mapping of user to their bids
    mapping(uint256 => Bid[]) public ticketBids; // Mapping of ticket ID to all bids
    mapping(uint256 => mapping(address => bool)) public hasUserBid; // Mapping to track if user has bid on a ticket
    mapping(uint256 => bool) public isTicketVerified; // Mapping to track if a ticket is verified
    address public verifier; // AVS node address

    event TicketListed(uint256 ticketId, address seller, string details, uint256 minBid, uint256 bidExpiryTime, uint256 sellerExpiryTime);
    event BidPlaced(uint256 ticketId, address bidder, uint256 amount);
    event ProofSubmitted(uint256 ticketId, address seller);
    event TicketExpired(uint256 ticketId, address seller);
    event BidExpired(uint256 ticketId, address bidder, uint256 amount);
    event TicketVerified(uint256 ticketId); // New event for ticket verification

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

    function listTicket(
        string calldata _details,
        string calldata _eventName,
        uint256 _eventDate,
        string calldata _eventLocation,
        string calldata _ticketImage,
        uint256 _sellerFID,
        uint256 _minBid,
        uint256 _bidExpiryTime,
        uint256 _sellerExpiryTime
    ) external nonReentrant {
        // Check for empty string by comparing with empty string literal
        require(keccak256(bytes(_details)) != keccak256(bytes("")), "Empty event details");
        require(keccak256(bytes(_eventName)) != keccak256(bytes("")), "Empty event name");
        require(keccak256(bytes(_eventLocation)) != keccak256(bytes("")), "Empty event location");
        require(keccak256(bytes(_ticketImage)) != keccak256(bytes("")), "Empty ticket image");
        require(_minBid > 0, "Minimum bid must be greater than 0");
        require(_bidExpiryTime > block.timestamp, "Bid expiry time must be in the future");
        require(_sellerExpiryTime > _bidExpiryTime, "Seller expiry time must be after bid expiry");

        tickets[nextTicketId] = Ticket({
            id: nextTicketId,
            seller: msg.sender,
            sellerFID: _sellerFID,
            eventDetails: _details,
            eventName: _eventName,
            eventDate: _eventDate,
            eventLocation: _eventLocation,
            ticketImage: _ticketImage,
            minBid: _minBid,
            sold: false,
            buyer: address(0),
            buyerFID: 0,
            bidExpiryTime: _bidExpiryTime,
            sellerExpiryTime: _sellerExpiryTime,
            createdAt: block.timestamp,
            isHighestBidderFound: false
        });

        sellerTickets[msg.sender].push(nextTicketId);

        emit TicketListed(nextTicketId, msg.sender, _details, _minBid, _bidExpiryTime, _sellerExpiryTime);
        nextTicketId++;
    }

    function placeBid(uint256 _ticketId, uint256 _bidAmount) external nonReentrant {
        Ticket storage ticket = tickets[_ticketId];
        require(ticket.seller != address(0), "Ticket does not exist");
        require(!ticket.sold, "Already sold");
        require(block.timestamp < ticket.bidExpiryTime, "Bidding period has expired");
        require(_bidAmount >= ticket.minBid, "Bid too low");
        require(!hasUserBid[_ticketId][msg.sender], "User has already bid on this ticket");

        // Transfer tokens to contract as lock
        stablecoin.safeTransferFrom(msg.sender, address(this), _bidAmount);

        // Create new bid
        Bid memory newBid = Bid({
            ticketId: _ticketId,
            amount: _bidAmount,
            timestamp: block.timestamp,
            isActive: true,
            isAccepted: false,
            bidder: msg.sender
        });

        // Add bid to ticket's bid list
        ticketBids[_ticketId].push(newBid);
        
        // Add bid to user's bid history
        userBids[msg.sender].push(newBid);
        
        // Mark user as having bid on this ticket
        hasUserBid[_ticketId][msg.sender] = true;

        emit BidPlaced(_ticketId, msg.sender, _bidAmount);
    }

    function getTheBestBid(uint256 ticketId) external view returns (address winner, uint256 amount) {
        Ticket storage ticket = tickets[ticketId];
        require(ticket.seller != address(0), "Ticket does not exist");
        require(!ticket.sold, "Already processed");
        require(block.timestamp >= ticket.bidExpiryTime, "Bidding period not ended");

        Bid[] storage bids = ticketBids[ticketId];
        require(bids.length > 0, "No bids found for this ticket");

        // Find the highest bid
        uint256 highestBidIndex = 0;
        uint256 highestAmount = 0;

        for (uint256 i = 0; i < bids.length; i++) {
            if (bids[i].isActive && bids[i].amount > highestAmount) {
                highestAmount = bids[i].amount;
                highestBidIndex = i;
            }
        }

        require(highestAmount > 0, "No valid bid found");
        return (bids[highestBidIndex].bidder, highestAmount);
    }

    function confirmTicketDelivery(uint256 ticketId, bool success) external nonReentrant {
        require(msg.sender == verifier, "Only verifier can confirm delivery");
        Ticket storage ticket = tickets[ticketId];
        require(ticket.seller != address(0), "Ticket does not exist");
        require(!ticket.sold, "Already processed");
        require(block.timestamp >= ticket.bidExpiryTime, "Bidding period not ended");

        Bid[] storage bids = ticketBids[ticketId];
        require(bids.length > 0, "No bids found for this ticket");

        // Find the highest bid
        uint256 highestBidIndex = 0;
        uint256 highestAmount = 0;

        for (uint256 i = 0; i < bids.length; i++) {
            if (bids[i].isActive && bids[i].amount > highestAmount) {
                highestAmount = bids[i].amount;
                highestBidIndex = i;
            }
        }

        require(highestAmount > 0, "No valid bid found");

        // Refund all other bidders and update bid status
        for (uint256 i = 0; i < bids.length; i++) {
            if (i != highestBidIndex && bids[i].isActive) {
                // Refund the bidder
                stablecoin.safeTransfer(bids[i].bidder, bids[i].amount);
                
                // Update status in ticketBids
                bids[i].isActive = false;
                bids[i].isAccepted = false;
                
                // Update status in userBids
                Bid[] storage userBidsList = userBids[bids[i].bidder];
                for (uint256 j = 0; j < userBidsList.length; j++) {
                    if (userBidsList[j].ticketId == ticketId && userBidsList[j].isActive) {
                        userBidsList[j].isActive = false;
                        userBidsList[j].isAccepted = false;
                        break;
                    }
                }
            }
        }

        if (!success) {
            // Refund the winning bidder
            stablecoin.safeTransfer(bids[highestBidIndex].bidder, highestAmount);
        } else {
            // Transfer funds to seller
            stablecoin.safeTransfer(ticket.seller, highestAmount);
            ticket.buyer = bids[highestBidIndex].bidder;
        }

        // Update bid status
        bids[highestBidIndex].isActive = false;
        bids[highestBidIndex].isAccepted = success;

        // Update status in userBids
        Bid[] storage winningUserBids = userBids[bids[highestBidIndex].bidder];
        for (uint256 j = 0; j < winningUserBids.length; j++) {
            if (winningUserBids[j].ticketId == ticketId && winningUserBids[j].isActive) {
                winningUserBids[j].isActive = false;
                winningUserBids[j].isAccepted = success;
                break;
            }
        }

        // Mark ticket as sold only after all transactions are complete
        ticket.sold = true;

        emit ProofSubmitted(ticketId, ticket.seller);
    }

    function getTicketBids(uint256 ticketId) external view returns (Bid[] memory) {
        return ticketBids[ticketId];
    }

    function processExpiredTickets() external nonReentrant {
        for (uint256 i = 0; i < nextTicketId; i++) {
            Ticket storage ticket = tickets[i];
            
            // Skip if ticket doesn't exist or is already sold
            if (ticket.seller == address(0) || ticket.sold) {
                continue;
            }

            // Check if seller expiry time has passed
            if (block.timestamp > ticket.sellerExpiryTime) {
                // Get all bids for this ticket
                Bid[] storage bids = ticketBids[i];
                
                // Refund all bidders and update bid status in all mappings
                for (uint256 j = 0; j < bids.length; j++) {
                    if (bids[j].isActive) {
                        // Refund the bidder
                        stablecoin.safeTransfer(bids[j].bidder, bids[j].amount);
                        
                        // Update status in ticketBids
                        bids[j].isActive = false;
                        bids[j].isAccepted = false; // Ensure bid is marked as not accepted
                        
                        // Update status in userBids
                        Bid[] storage userBidsList = userBids[bids[j].bidder];
                        for (uint256 k = 0; k < userBidsList.length; k++) {
                            if (userBidsList[k].ticketId == i && userBidsList[k].isActive) {
                                userBidsList[k].isActive = false;
                                userBidsList[k].isAccepted = false; // Ensure bid is marked as not accepted
                                break;
                            }
                        }
                    }
                }
    
                // Mark ticket as sold
                ticket.sold = true;

                emit TicketExpired(i, ticket.seller);
            }
        }
    }

    function verifyTicket(uint256 ticketId) external {
        require(msg.sender == verifier, "Only verifier can verify tickets");
        // require(tickets[ticketId].seller != address(0), "Ticket does not exist");
        // require(!isTicketVerified[ticketId], "Ticket already verified");
        
        isTicketVerified[ticketId] = true;
        emit TicketVerified(ticketId);
    }

    function getTicketVerificationStatus(uint256 ticketId) external view returns (bool) {
        return isTicketVerified[ticketId];
    }
}