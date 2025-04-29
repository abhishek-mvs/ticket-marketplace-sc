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
    }

    IERC20 public stablecoin;
    uint256 public nextTicketId;
    mapping(uint256 => Ticket) public tickets;
    mapping(uint256 => uint256) public currentBidAmount;
    mapping(uint256 => address) public currentBidder;
    address public verifier; // AVS node address

    event TicketListed(uint256 ticketId, address seller, string details, uint256 minBid);
    event BidPlaced(uint256 ticketId, address bidder, uint256 amount);
    event ProofSubmitted(uint256 ticketId, address seller);

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

    function setVerifier(address _verifier) external onlyOwner {
        require(_verifier != address(0), "Invalid verifier address");
        verifier = _verifier;
    }

    function listTicket(string calldata _details, uint256 _minBid) external nonReentrant {
        require(bytes(_details).length > 0, "Empty event details");
        require(_minBid > 0, "Minimum bid must be greater than 0");

        tickets[nextTicketId] = Ticket({
            id: nextTicketId,
            seller: msg.sender,
            eventDetails: _details,
            minBid: _minBid,
            sold: false,
            buyer: address(0)
        });

        emit TicketListed(nextTicketId, msg.sender, _details, _minBid);
        nextTicketId++;
    }

    function placeBid(uint256 ticketId, uint256 bidAmount) external nonReentrant {
        Ticket storage ticket = tickets[ticketId];
        require(ticket.seller != address(0), "Ticket does not exist");
        require(!ticket.sold, "Already sold");
        require(bidAmount >= ticket.minBid, "Bid too low");
        require(bidAmount >= currentBidAmount[ticketId], "There is a higher bid");

        // Refund previous bidder
        if (currentBidder[ticketId] != address(0)) {
            stablecoin.safeTransfer(currentBidder[ticketId], currentBidAmount[ticketId]);
        }

        // Transfer tokens to contract as lock
        stablecoin.safeTransferFrom(msg.sender, address(this), bidAmount);
        currentBidder[ticketId] = msg.sender;
        currentBidAmount[ticketId] = bidAmount;

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
}