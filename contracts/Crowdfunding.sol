// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Crowdfunding
/// @notice Goal-and-deadline crowdfunding. Anyone can launch a campaign with a
///         funding goal and deadline. Backers pledge ETH; if the goal is met by
///         the deadline the creator can claim the funds, otherwise backers can
///         refund their pledges. Backers may also unpledge before the deadline.
/// @dev    Demonstrates deadline logic and the pull-payment refund pattern with
///         a `call`-based transfer and a success check.
contract Crowdfunding {
    uint256 public constant MAX_TITLE_LENGTH = 200;
    uint256 public constant MIN_DURATION = 1 minutes;
    uint256 public constant MAX_DURATION = 90 days;

    struct Campaign {
        address creator;
        string title;
        uint256 goal;
        uint256 deadline;
        uint256 pledged;
        bool claimed;
    }

    Campaign[] private _campaigns;
    /// @notice How much each backer has pledged to a campaign.
    mapping(uint256 => mapping(address => uint256)) public pledgeOf;

    event CampaignCreated(
        uint256 indexed id,
        address indexed creator,
        uint256 goal,
        uint256 deadline
    );
    event Pledged(uint256 indexed id, address indexed backer, uint256 amount);
    event Unpledged(uint256 indexed id, address indexed backer, uint256 amount);
    event Claimed(uint256 indexed id, uint256 amount);
    event Refunded(uint256 indexed id, address indexed backer, uint256 amount);

    /// @notice Launch a campaign. `duration` is seconds from now until deadline.
    function createCampaign(
        string calldata title,
        uint256 goal,
        uint256 duration
    ) external returns (uint256 id) {
        require(bytes(title).length > 0, "Title required");
        require(bytes(title).length <= MAX_TITLE_LENGTH, "Title too long");
        require(goal > 0, "Goal must be > 0");
        require(
            duration >= MIN_DURATION && duration <= MAX_DURATION,
            "Bad duration"
        );

        id = _campaigns.length;
        _campaigns.push(
            Campaign({
                creator: msg.sender,
                title: title,
                goal: goal,
                deadline: block.timestamp + duration,
                pledged: 0,
                claimed: false
            })
        );
        emit CampaignCreated(id, msg.sender, goal, block.timestamp + duration);
    }

    /// @notice Pledge ETH to a campaign before its deadline.
    function pledge(uint256 id) external payable {
        Campaign storage c = _campaign(id);
        require(block.timestamp < c.deadline, "Campaign ended");
        require(msg.value > 0, "Pledge must be > 0");

        c.pledged += msg.value;
        pledgeOf[id][msg.sender] += msg.value;
        emit Pledged(id, msg.sender, msg.value);
    }

    /// @notice Take back part or all of your pledge before the deadline.
    function unpledge(uint256 id, uint256 amount) external {
        Campaign storage c = _campaign(id);
        require(block.timestamp < c.deadline, "Campaign ended");
        require(amount > 0, "Amount must be > 0");
        require(pledgeOf[id][msg.sender] >= amount, "Not enough pledged");

        pledgeOf[id][msg.sender] -= amount;
        c.pledged -= amount;
        _send(msg.sender, amount);
        emit Unpledged(id, msg.sender, amount);
    }

    /// @notice Creator claims the funds after a successful campaign.
    function claim(uint256 id) external {
        Campaign storage c = _campaign(id);
        require(msg.sender == c.creator, "Not creator");
        require(block.timestamp >= c.deadline, "Not ended");
        require(c.pledged >= c.goal, "Goal not met");
        require(!c.claimed, "Already claimed");

        c.claimed = true;
        uint256 amount = c.pledged;
        _send(c.creator, amount);
        emit Claimed(id, amount);
    }

    /// @notice Backers refund their pledge after a failed campaign.
    function refund(uint256 id) external {
        Campaign storage c = _campaign(id);
        require(block.timestamp >= c.deadline, "Not ended");
        require(c.pledged < c.goal, "Goal was met");

        uint256 amount = pledgeOf[id][msg.sender];
        require(amount > 0, "Nothing to refund");

        pledgeOf[id][msg.sender] = 0;
        _send(msg.sender, amount);
        emit Refunded(id, msg.sender, amount);
    }

    // --- Views ---------------------------------------------------------------

    function campaignCount() external view returns (uint256) {
        return _campaigns.length;
    }

    function getCampaign(uint256 id)
        external
        view
        returns (
            address creator,
            string memory title,
            uint256 goal,
            uint256 deadline,
            uint256 pledged,
            bool claimed
        )
    {
        Campaign storage c = _campaign(id);
        return (c.creator, c.title, c.goal, c.deadline, c.pledged, c.claimed);
    }

    /// @notice True if the campaign has reached its goal.
    function isSuccessful(uint256 id) external view returns (bool) {
        Campaign storage c = _campaign(id);
        return c.pledged >= c.goal;
    }

    /// @notice Seconds left until the deadline (0 once ended).
    function timeLeft(uint256 id) external view returns (uint256) {
        Campaign storage c = _campaign(id);
        if (block.timestamp >= c.deadline) return 0;
        return c.deadline - block.timestamp;
    }

    // --- Internal ------------------------------------------------------------

    function _campaign(uint256 id) private view returns (Campaign storage) {
        require(id < _campaigns.length, "No such campaign");
        return _campaigns[id];
    }

    function _send(address to, uint256 amount) private {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "Transfer failed");
    }
}
