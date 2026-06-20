const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("Crowdfunding", function () {
  const GOAL = ethers.parseEther("10");
  const DURATION = 7 * 24 * 60 * 60; // 7 days

  async function deploy() {
    const [owner, creator, alice, bob] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("Crowdfunding");
    const cf = await Factory.deploy();
    await cf.waitForDeployment();
    return { cf, owner, creator, alice, bob };
  }

  async function withCampaign() {
    const ctx = await deploy();
    await ctx.cf.connect(ctx.creator).createCampaign("Build a park", GOAL, DURATION);
    return ctx;
  }

  describe("Creating", function () {
    it("creates a campaign and emits CampaignCreated", async function () {
      const { cf, creator } = await deploy();
      await expect(cf.connect(creator).createCampaign("Park", GOAL, DURATION))
        .to.emit(cf, "CampaignCreated")
        .withArgs(0, creator.address, GOAL, anyValue);

      expect(await cf.campaignCount()).to.equal(1n);
      const c = await cf.getCampaign(0);
      expect(c.creator).to.equal(creator.address);
      expect(c.title).to.equal("Park");
      expect(c.goal).to.equal(GOAL);
      expect(c.pledged).to.equal(0n);
      expect(c.claimed).to.equal(false);
    });

    it("rejects an empty title", async function () {
      const { cf } = await deploy();
      await expect(cf.createCampaign("", GOAL, DURATION)).to.be.revertedWith(
        "Title required"
      );
    });

    it("rejects a zero goal", async function () {
      const { cf } = await deploy();
      await expect(cf.createCampaign("x", 0, DURATION)).to.be.revertedWith(
        "Goal must be > 0"
      );
    });

    it("rejects a duration out of bounds", async function () {
      const { cf } = await deploy();
      await expect(cf.createCampaign("x", GOAL, 1)).to.be.revertedWith(
        "Bad duration"
      );
    });
  });

  describe("Pledging", function () {
    it("records pledges and updates totals", async function () {
      const { cf, alice } = await withCampaign();
      const amount = ethers.parseEther("3");
      // changeEtherBalance can't chain after emit, so assert them separately.
      await expect(cf.connect(alice).pledge(0, { value: amount }))
        .to.emit(cf, "Pledged")
        .withArgs(0, alice.address, amount);
      // (balance delta is covered by the unpledge/claim/refund tests)

      expect(await cf.pledgeOf(0, alice.address)).to.equal(amount);
      expect((await cf.getCampaign(0)).pledged).to.equal(amount);
    });

    it("accumulates multiple pledges from the same backer", async function () {
      const { cf, alice } = await withCampaign();
      await cf.connect(alice).pledge(0, { value: ethers.parseEther("2") });
      await cf.connect(alice).pledge(0, { value: ethers.parseEther("1") });
      expect(await cf.pledgeOf(0, alice.address)).to.equal(
        ethers.parseEther("3")
      );
    });

    it("rejects a zero-value pledge", async function () {
      const { cf, alice } = await withCampaign();
      await expect(
        cf.connect(alice).pledge(0, { value: 0 })
      ).to.be.revertedWith("Pledge must be > 0");
    });

    it("rejects pledging after the deadline", async function () {
      const { cf, alice } = await withCampaign();
      await time.increase(DURATION + 1);
      await expect(
        cf.connect(alice).pledge(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Campaign ended");
    });

    it("lets a backer unpledge before the deadline", async function () {
      const { cf, alice } = await withCampaign();
      await cf.connect(alice).pledge(0, { value: ethers.parseEther("4") });

      await expect(
        cf.connect(alice).unpledge(0, ethers.parseEther("1"))
      ).to.changeEtherBalance(alice, ethers.parseEther("1"));

      expect(await cf.pledgeOf(0, alice.address)).to.equal(
        ethers.parseEther("3")
      );
      expect((await cf.getCampaign(0)).pledged).to.equal(
        ethers.parseEther("3")
      );
    });

    it("rejects unpledging more than pledged", async function () {
      const { cf, alice } = await withCampaign();
      await cf.connect(alice).pledge(0, { value: ethers.parseEther("1") });
      await expect(
        cf.connect(alice).unpledge(0, ethers.parseEther("2"))
      ).to.be.revertedWith("Not enough pledged");
    });
  });

  describe("Claiming (successful campaign)", function () {
    it("lets the creator claim once the goal is met and time passes", async function () {
      const { cf, creator, alice, bob } = await withCampaign();
      await cf.connect(alice).pledge(0, { value: ethers.parseEther("6") });
      await cf.connect(bob).pledge(0, { value: ethers.parseEther("5") });
      expect(await cf.isSuccessful(0)).to.equal(true);

      await time.increase(DURATION + 1);
      await expect(cf.connect(creator).claim(0)).to.changeEtherBalance(
        creator,
        ethers.parseEther("11")
      );
      expect((await cf.getCampaign(0)).claimed).to.equal(true);
    });

    it("blocks non-creators from claiming", async function () {
      const { cf, alice } = await withCampaign();
      await cf.connect(alice).pledge(0, { value: GOAL });
      await time.increase(DURATION + 1);
      await expect(cf.connect(alice).claim(0)).to.be.revertedWith(
        "Not creator"
      );
    });

    it("blocks claiming before the deadline", async function () {
      const { cf, creator, alice } = await withCampaign();
      await cf.connect(alice).pledge(0, { value: GOAL });
      await expect(cf.connect(creator).claim(0)).to.be.revertedWith(
        "Not ended"
      );
    });

    it("blocks claiming when the goal was not met", async function () {
      const { cf, creator, alice } = await withCampaign();
      await cf.connect(alice).pledge(0, { value: ethers.parseEther("1") });
      await time.increase(DURATION + 1);
      await expect(cf.connect(creator).claim(0)).to.be.revertedWith(
        "Goal not met"
      );
    });

    it("blocks a second claim", async function () {
      const { cf, creator, alice } = await withCampaign();
      await cf.connect(alice).pledge(0, { value: GOAL });
      await time.increase(DURATION + 1);
      await cf.connect(creator).claim(0);
      await expect(cf.connect(creator).claim(0)).to.be.revertedWith(
        "Already claimed"
      );
    });
  });

  describe("Refunds (failed campaign)", function () {
    it("lets backers refund when the goal is not met", async function () {
      const { cf, alice } = await withCampaign();
      await cf.connect(alice).pledge(0, { value: ethers.parseEther("4") });
      await time.increase(DURATION + 1);

      await expect(cf.connect(alice).refund(0)).to.changeEtherBalance(
        alice,
        ethers.parseEther("4")
      );
      expect(await cf.pledgeOf(0, alice.address)).to.equal(0n);
    });

    it("blocks refunds before the deadline", async function () {
      const { cf, alice } = await withCampaign();
      await cf.connect(alice).pledge(0, { value: ethers.parseEther("4") });
      await expect(cf.connect(alice).refund(0)).to.be.revertedWith("Not ended");
    });

    it("blocks refunds when the goal was met", async function () {
      const { cf, alice } = await withCampaign();
      await cf.connect(alice).pledge(0, { value: GOAL });
      await time.increase(DURATION + 1);
      await expect(cf.connect(alice).refund(0)).to.be.revertedWith(
        "Goal was met"
      );
    });

    it("prevents double refunds", async function () {
      const { cf, alice } = await withCampaign();
      await cf.connect(alice).pledge(0, { value: ethers.parseEther("4") });
      await time.increase(DURATION + 1);
      await cf.connect(alice).refund(0);
      await expect(cf.connect(alice).refund(0)).to.be.revertedWith(
        "Nothing to refund"
      );
    });
  });

  describe("Views", function () {
    it("reports timeLeft and zero after the deadline", async function () {
      const { cf } = await withCampaign();
      expect(await cf.timeLeft(0)).to.be.greaterThan(0n);
      await time.increase(DURATION + 1);
      expect(await cf.timeLeft(0)).to.equal(0n);
    });

    it("reverts getCampaign for a missing id", async function () {
      const { cf } = await deploy();
      await expect(cf.getCampaign(0)).to.be.revertedWith("No such campaign");
    });
  });
});
