// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Deployed Crowdfunding on Base Sepolia (chainId 84532).
// https://sepolia.basescan.org/address/0xCC58c2406168072133Ed03aB80C922AFe5Cf765C
const CONTRACT_ADDRESS = "0xCC58c2406168072133Ed03aB80C922AFe5Cf765C";

const ABI = [
  "function createCampaign(string title, uint256 goal, uint256 duration) external returns (uint256)",
  "function pledge(uint256 id) external payable",
  "function unpledge(uint256 id, uint256 amount) external",
  "function claim(uint256 id) external",
  "function refund(uint256 id) external",
  "function campaignCount() view returns (uint256)",
  "function getCampaign(uint256 id) view returns (address creator, string title, uint256 goal, uint256 deadline, uint256 pledged, bool claimed)",
  "function pledgeOf(uint256 id, address) view returns (uint256)",
  "function isSuccessful(uint256 id) view returns (bool)",
  "event CampaignCreated(uint256 indexed id, address indexed creator, uint256 goal, uint256 deadline)",
  "event Pledged(uint256 indexed id, address indexed backer, uint256 amount)",
  "event Claimed(uint256 indexed id, uint256 amount)",
  "event Refunded(uint256 indexed id, address indexed backer, uint256 amount)",
];

// ---------------------------------------------------------------------------
// State + refs
// ---------------------------------------------------------------------------

let provider, signer, contract, account;
let allCampaigns = []; // cached {id, c, mine}
let filter = "all"; // all | live | ended | mine

const els = {
  connectBtn: document.getElementById("connectBtn"),
  account: document.getElementById("account"),
  createCard: document.getElementById("createCard"),
  titleInput: document.getElementById("titleInput"),
  goalInput: document.getElementById("goalInput"),
  durationInput: document.getElementById("durationInput"),
  createBtn: document.getElementById("createBtn"),
  status: document.getElementById("status"),
  count: document.getElementById("count"),
  refreshBtn: document.getElementById("refreshBtn"),
  campaigns: document.getElementById("campaigns"),
  empty: document.getElementById("empty"),
  filters: document.getElementById("filters"),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setStatus(text, kind = "") {
  els.status.textContent = text;
  els.status.className = "status" + (kind ? " " + kind : "");
}

function short(a) {
  return a.slice(0, 6) + "…" + a.slice(-4);
}

function fmtEth(wei) {
  return parseFloat(ethers.formatEther(wei)).toLocaleString(undefined, {
    maximumFractionDigits: 4,
  });
}

function humanizeLeft(seconds) {
  seconds = Number(seconds);
  if (seconds <= 0) return "ended";
  const d = Math.floor(seconds / 86400);
  if (d >= 1) return d + "d left";
  const h = Math.floor(seconds / 3600);
  if (h >= 1) return h + "h left";
  const m = Math.floor(seconds / 60);
  if (m >= 1) return m + "m left";
  return seconds + "s left";
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

async function connect() {
  if (!window.ethereum) {
    setStatus("No wallet found. Install MetaMask or Coinbase Wallet.", "error");
    return;
  }
  if (!CONTRACT_ADDRESS) {
    setStatus("Set CONTRACT_ADDRESS in app.js after deploying.", "error");
    return;
  }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    account = (await signer.getAddress()).toLowerCase();

    els.account.textContent = "Connected: " + short(account);
    els.account.classList.remove("hidden");
    els.connectBtn.textContent = "Connected";

    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    els.createCard.classList.remove("hidden");
    els.refreshBtn.disabled = false;

    await refresh();
    ["CampaignCreated", "Pledged", "Claimed", "Refunded"].forEach((e) =>
      contract.on(e, () => refresh())
    );
  } catch (err) {
    setStatus(err.shortMessage || err.message || "Failed to connect.", "error");
  }
}

// ---------------------------------------------------------------------------
// Read + render
// ---------------------------------------------------------------------------

async function refresh() {
  if (!contract) return;
  setStatus("Loading…");
  try {
    const count = Number(await contract.campaignCount());

    if (count === 0) {
      allCampaigns = [];
      els.count.textContent = "";
      els.filters.classList.add("hidden");
      els.campaigns.innerHTML = "";
      els.empty.textContent = "No campaigns yet — launch the first one!";
      els.empty.classList.remove("hidden");
      setStatus("");
      return;
    }

    const ids = [...Array(count).keys()].reverse();
    allCampaigns = await Promise.all(
      ids.map(async (id) => {
        const c = await contract.getCampaign(id);
        const mine = await contract.pledgeOf(id, account);
        return { id, c, mine };
      })
    );

    els.filters.classList.remove("hidden");
    render();
    setStatus("");
  } catch (err) {
    setStatus(err.shortMessage || err.message || "Failed to load.", "error");
  }
}

function render() {
  const nowSec = Math.floor(Date.now() / 1000);
  const visible = allCampaigns.filter(({ c, mine }) => {
    const ended = Number(c.deadline) <= nowSec;
    if (filter === "live") return !ended;
    if (filter === "ended") return ended;
    if (filter === "mine")
      return mine > 0n || c.creator.toLowerCase() === account;
    return true;
  });

  els.count.textContent = `(${visible.length})`;
  els.campaigns.innerHTML = "";

  if (visible.length === 0) {
    els.empty.textContent = "No campaigns match this filter.";
    els.empty.classList.remove("hidden");
    return;
  }
  els.empty.classList.add("hidden");
  visible.forEach(renderCampaign);
}

function renderCampaign({ id, c, mine }) {
  const goal = c.goal;
  const pledged = c.pledged;
  const pct = goal > 0n ? Math.min(100, Number((pledged * 100n) / goal)) : 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const secsLeft = Number(c.deadline) - nowSec;
  const ended = secsLeft <= 0;
  const success = pledged >= goal;
  const isCreator = c.creator.toLowerCase() === account;

  const card = document.createElement("div");
  card.className = "campaign";

  const title = document.createElement("p");
  title.className = "campaign-title";
  title.textContent = c.title;

  const meta = document.createElement("p");
  meta.className = "campaign-meta";
  meta.textContent = `#${id} · by ${short(c.creator)}`;

  // status tags
  const badges = document.createElement("div");
  badges.className = "badges";
  const stateTag = document.createElement("span");
  if (!ended) {
    stateTag.className = "tag live";
    stateTag.textContent = "🟢 " + humanizeLeft(secsLeft);
  } else if (success) {
    stateTag.className = "tag success";
    stateTag.textContent = "✅ Funded";
  } else {
    stateTag.className = "tag failed";
    stateTag.textContent = "❌ Failed";
  }
  badges.appendChild(stateTag);
  if (mine > 0n) {
    const mineTag = document.createElement("span");
    mineTag.className = "tag";
    mineTag.textContent = `You pledged ${fmtEth(mine)} ETH`;
    badges.appendChild(mineTag);
  }
  if (c.claimed) {
    const claimedTag = document.createElement("span");
    claimedTag.className = "tag";
    claimedTag.textContent = "Claimed";
    badges.appendChild(claimedTag);
  }

  const amounts = document.createElement("div");
  amounts.className = "amounts";
  const raised = document.createElement("span");
  raised.className = "amount-raised";
  raised.textContent = `${fmtEth(pledged)} / ${fmtEth(goal)} ETH`;
  const pctEl = document.createElement("span");
  pctEl.textContent = pct + "%";
  amounts.append(raised, pctEl);

  const bar = document.createElement("div");
  bar.className = "bar";
  const fill = document.createElement("div");
  fill.className = "bar-fill" + (success ? " success" : "");
  fill.style.width = pct + "%";
  bar.appendChild(fill);

  card.append(title, meta, badges, amounts, bar);

  // Actions depend on state.
  const actions = document.createElement("div");
  actions.className = "actions";

  if (!ended) {
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0";
    input.step = "0.001";
    input.placeholder = "Amount (ETH)";
    const pledgeBtn = document.createElement("button");
    pledgeBtn.className = "btn";
    pledgeBtn.textContent = "Pledge";
    pledgeBtn.addEventListener("click", () => doPledge(id, input.value));
    actions.append(input, pledgeBtn);
  } else if (success && isCreator && !c.claimed) {
    const claimBtn = document.createElement("button");
    claimBtn.className = "btn btn-big";
    claimBtn.textContent = "Claim funds";
    claimBtn.addEventListener("click", () => doClaim(id));
    actions.appendChild(claimBtn);
  } else if (!success && mine > 0n) {
    const refundBtn = document.createElement("button");
    refundBtn.className = "btn btn-big";
    refundBtn.textContent = `Refund ${fmtEth(mine)} ETH`;
    refundBtn.addEventListener("click", () => doRefund(id));
    actions.appendChild(refundBtn);
  }

  if (actions.children.length > 0) card.appendChild(actions);
  els.campaigns.appendChild(card);
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

async function createCampaign() {
  const title = els.titleInput.value.trim();
  const goalStr = els.goalInput.value.trim();
  const duration = els.durationInput.value;

  if (!title) return setStatus("Enter a title.", "error");
  let goal;
  try {
    goal = ethers.parseEther(goalStr || "0");
  } catch {
    return setStatus("Enter a valid goal.", "error");
  }
  if (goal <= 0n) return setStatus("Goal must be greater than 0.", "error");

  els.createBtn.disabled = true;
  try {
    setStatus("Confirm in your wallet…");
    const tx = await contract.createCampaign(title, goal, duration);
    setStatus("Creating campaign…");
    await tx.wait();
    setStatus("Campaign created! 🎉", "ok");
    els.titleInput.value = "";
    els.goalInput.value = "";
    await refresh();
  } catch (err) {
    setStatus(err.shortMessage || err.message || "Create failed.", "error");
  } finally {
    els.createBtn.disabled = false;
  }
}

async function doPledge(id, amountStr) {
  let value;
  try {
    value = ethers.parseEther((amountStr || "").trim() || "0");
  } catch {
    return setStatus("Enter a valid amount.", "error");
  }
  if (value <= 0n) return setStatus("Amount must be greater than 0.", "error");
  await send(() => contract.pledge(id, { value }), "Pledging");
}

async function doClaim(id) {
  await send(() => contract.claim(id), "Claiming");
}

async function doRefund(id) {
  await send(() => contract.refund(id), "Refunding");
}

async function send(action, label) {
  try {
    setStatus("Confirm in your wallet…");
    const tx = await action();
    setStatus(label + "…");
    await tx.wait();
    setStatus("Done ✅", "ok");
    await refresh();
  } catch (err) {
    setStatus(err.shortMessage || err.message || "Transaction failed.", "error");
  }
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------

els.connectBtn.addEventListener("click", connect);
els.createBtn.addEventListener("click", createCampaign);
els.refreshBtn.addEventListener("click", refresh);

els.filters.querySelectorAll(".filter").forEach((btn) => {
  btn.addEventListener("click", () => {
    filter = btn.dataset.filter;
    els.filters
      .querySelectorAll(".filter")
      .forEach((b) => b.classList.toggle("active", b === btn));
    render();
  });
});

if (window.ethereum) {
  window.ethereum.on?.("accountsChanged", () => window.location.reload());
  window.ethereum.on?.("chainChanged", () => window.location.reload());
}
