// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract TicketMarketplace is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    enum TicketStatus {
        active,
        pending,
        completed,
        notSold
    }

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
        TicketStatus status; // New field to track ticket status
        bytes32 privateBookingHash; // Private booking hash
    }

    struct Bid {
        uint256 ticketId;
        uint256 amount;
        uint256 timestamp;
        bool isActive;
        bool isAccepted;
        address bidder;
        string email;  // Added email field
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
        uint256 _sellerExpiryTime,
        bytes32 _privateBookingHash
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
            isHighestBidderFound: false,
            status: TicketStatus.active,
            privateBookingHash: _privateBookingHash
        });

        sellerTickets[msg.sender].push(nextTicketId);

        emit TicketListed(nextTicketId, msg.sender, _details, _minBid, _bidExpiryTime, _sellerExpiryTime);
        nextTicketId++;
    }

    function placeBid(uint256 _ticketId, uint256 _bidAmount, string calldata _email) external nonReentrant {
        Ticket storage ticket = tickets[_ticketId];
        require(ticket.seller != address(0), "Ticket does not exist");
        require(ticket.status == TicketStatus.active, "Ticket is not available for purchase");
        require(!ticket.sold, "Already sold");
        require(block.timestamp < ticket.bidExpiryTime, "Purchase period has expired");
        require(_bidAmount >= ticket.minBid, "Amount too low");
        require(!hasUserBid[_ticketId][msg.sender], "User has already purchased this ticket");
        require(keccak256(bytes(_email)) != keccak256(bytes("")), "Email cannot be empty");

        // Transfer tokens to contract as lock
        stablecoin.safeTransferFrom(msg.sender, address(this), _bidAmount);

        // Create new bid (now representing a purchase)
        Bid memory newBid = Bid({
            ticketId: _ticketId,
            amount: _bidAmount,
            timestamp: block.timestamp,
            isActive: true,
            isAccepted: false,
            bidder: msg.sender,
            email: _email
        });

        // Add bid to ticket's bid list
        ticketBids[_ticketId].push(newBid);
        
        // Add bid to user's bid history
        userBids[msg.sender].push(newBid);
        
        // Mark user as having bid on this ticket
        hasUserBid[_ticketId][msg.sender] = true;

        // Update ticket status to pending
        ticket.status = TicketStatus.pending;
        ticket.buyer = msg.sender;

        emit BidPlaced(_ticketId, msg.sender, _bidAmount);
    }

    function getTheBestBid(uint256 ticketId) external view returns (string memory email, uint256 amount) {
        Ticket storage ticket = tickets[ticketId];
        require(ticket.seller != address(0), "Ticket does not exist");
        require(ticket.status == TicketStatus.pending, "Ticket is not in pending state");

        Bid[] storage bids = ticketBids[ticketId];
        require(bids.length > 0, "No purchase found for this ticket");

        // Get the purchase (first and only bid)
        Bid storage purchase = bids[0];
        require(purchase.isActive, "Purchase is not active");

        return (purchase.email, purchase.amount);
    }

    function confirmTicketDelivery(uint256 ticketId, bool success) external nonReentrant {
        Ticket storage ticket = tickets[ticketId];
        require(ticket.seller != address(0), "Ticket does not exist");
        require(ticket.status == TicketStatus.pending, "Ticket is not in pending state");
        require(block.timestamp <= ticket.sellerExpiryTime, "Seller expiry time has passed");

        Bid[] storage bids = ticketBids[ticketId];
        require(bids.length > 0, "No purchase found for this ticket");

        // Get the purchase (bid)
        Bid storage purchase = bids[0];
        require(purchase.isActive, "Purchase is not active");

        if (!success) {
            // Refund the buyer
            stablecoin.safeTransfer(purchase.bidder, purchase.amount);
            ticket.status = TicketStatus.notSold;
        } else {
            // Transfer funds to seller
            stablecoin.safeTransfer(ticket.seller, purchase.amount);
            ticket.status = TicketStatus.completed;
            ticket.sold = true;
        }

        // Update purchase status
        purchase.isActive = false;
        purchase.isAccepted = success;

        // Update status in userBids
        Bid[] storage userBidsList = userBids[purchase.bidder];
        for (uint256 j = 0; j < userBidsList.length; j++) {
            if (userBidsList[j].ticketId == ticketId && userBidsList[j].isActive) {
                userBidsList[j].isActive = false;
                userBidsList[j].isAccepted = success;
                break;
            }
        }

        emit ProofSubmitted(ticketId, ticket.seller);
    }

    function getTicketBids(uint256 ticketId) external view returns (Bid[] memory) {
        return ticketBids[ticketId];
    }

    function processExpiredTickets() external nonReentrant {
        for (uint256 i = 0; i < nextTicketId; i++) {
            Ticket storage ticket = tickets[i];
            
            // Skip if ticket doesn't exist or is already completed
            if (ticket.seller == address(0) || ticket.status == TicketStatus.completed) {
                continue;
            }

            // Check if seller expiry time has passed and ticket is in pending or active state
            if (block.timestamp > ticket.sellerExpiryTime && 
                (ticket.status == TicketStatus.pending || ticket.status == TicketStatus.active)) {
                // Get the purchase for this ticket
                Bid[] storage bids = ticketBids[i];
                
                // Only process refunds if there are bids and ticket is in pending state
                if (ticket.status == TicketStatus.pending) {
                    require(bids.length > 0, "No purchase found for this ticket");
                    
                    // Get the purchase
                    Bid storage purchase = bids[0];
                    if (purchase.isActive) {
                        // Refund the buyer
                        stablecoin.safeTransfer(purchase.bidder, purchase.amount);
                        
                        // Update purchase status
                        purchase.isActive = false;
                        purchase.isAccepted = false;
                        
                        // Update status in userBids
                        Bid[] storage userBidsList = userBids[purchase.bidder];
                        for (uint256 j = 0; j < userBidsList.length; j++) {
                            if (userBidsList[j].ticketId == i && userBidsList[j].isActive) {
                                userBidsList[j].isActive = false;
                                userBidsList[j].isAccepted = false;
                                break;
                            }
                        }
                    }
                }
    
                // Update ticket status to notSold
                ticket.status = TicketStatus.notSold;

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