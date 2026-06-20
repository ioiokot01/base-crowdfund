require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Normalize the private key: accept it with or without the "0x" prefix so a
// pasted key works either way. (Never hard-code a key here — it lives in .env.)
const rawKey = process.env.PRIVATE_KEY || "";
const privateKey = rawKey
  ? rawKey.startsWith("0x")
    ? rawKey
    : "0x" + rawKey
  : undefined;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24",
  networks: {
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts: privateKey ? [privateKey] : [],
    },
  },
};
