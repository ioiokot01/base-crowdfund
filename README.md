# Crowdfunding

[![CI](https://github.com/ioiokot01/base-crowdfund/actions/workflows/ci.yml/badge.svg)](https://github.com/ioiokot01/base-crowdfund/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
![Solidity](https://img.shields.io/badge/Solidity-0.8.24-363636.svg)
![Chain](https://img.shields.io/badge/Base-Sepolia-0052ff.svg)

A **goal-and-deadline crowdfunding** dApp for the [Base](https://base.org)
ecosystem. Anyone can launch a campaign with a funding goal and deadline; backers
pledge ETH. If the goal is met by the deadline the creator claims the funds —
otherwise backers refund their pledges.

Project 7 in a learning series. New concepts: **deadline logic**, the
**pull-payment refund pattern**, and safe ETH transfers via `call` + success
check.

## Stack

- [Hardhat 2](https://hardhat.org) — compile, test, deploy
- Solidity `0.8.24`
- Target chain: Base Sepolia (testnet)

## Getting started

```bash
npm install
npx hardhat compile
npx hardhat test
```

## Contract

`contracts/Crowdfunding.sol`

| Function | Description |
| --- | --- |
| `createCampaign(string title, uint256 goal, uint256 duration)` | Launch a campaign |
| `pledge(uint256 id)` *(payable)* | Back a campaign before its deadline |
| `unpledge(uint256 id, uint256 amount)` | Withdraw part of your pledge early |
| `claim(uint256 id)` | Creator claims funds of a successful campaign |
| `refund(uint256 id)` | Backers refund a failed campaign |
| `getCampaign(uint256 id)` | Campaign details + totals |
| `isSuccessful(uint256 id)` / `timeLeft(uint256 id)` | Status helpers |

Emits `CampaignCreated`, `Pledged`, `Unpledged`, `Claimed`, `Refunded`.

## Deploy

```bash
cp .env.example .env   # then fill in PRIVATE_KEY (testnet wallet only)
npm run deploy
```

## Roadmap

- [x] Crowdfunding contract + tests
- [x] Deploy to Base Sepolia
- [x] Frontend (create, pledge, claim/refund)

## Deployments

| Network | Address |
| --- | --- |
| Base Sepolia | [`0xCC58c2406168072133Ed03aB80C922AFe5Cf765C`](https://sepolia.basescan.org/address/0xCC58c2406168072133Ed03aB80C922AFe5Cf765C) |

## Security notes

- Refunds and claims use the `call` pattern with a success check.
- Funds are tracked per backer; refunds zero the balance before sending.
- Secrets (`.env`, private keys) are git-ignored and never committed.
- All development targets a **testnet** — no real funds.

## License

MIT
