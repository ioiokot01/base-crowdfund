const hre = require("hardhat");

// Deployed Crowdfunding on Base Sepolia.
const ADDRESS = "0xCC58c2406168072133Ed03aB80C922AFe5Cf765C";

async function main() {
  const cf = await hre.ethers.getContractAt("Crowdfunding", ADDRESS);

  const count = Number(await cf.campaignCount());
  console.log("Crowdfunding:", ADDRESS);
  console.log("Campaigns:", count);

  for (let id = 0; id < count; id++) {
    const c = await cf.getCampaign(id);
    const ended = Date.now() / 1000 >= Number(c.deadline);
    const ok = await cf.isSuccessful(id);
    console.log(`\n#${id} "${c.title}" by ${c.creator}`);
    console.log(
      `   ${hre.ethers.formatEther(c.pledged)} / ${hre.ethers.formatEther(
        c.goal
      )} ETH`
    );
    console.log(
      `   deadline: ${new Date(Number(c.deadline) * 1000).toLocaleString()}`
    );
    console.log(
      `   status: ${ended ? (ok ? "funded" : "failed") : "live"}${
        c.claimed ? " (claimed)" : ""
      }`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
