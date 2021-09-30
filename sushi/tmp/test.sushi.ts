import { expect } from "chai";
import { artifacts, network, patract } from "redspot";

const { getContractFactory } = patract;

const { api, getAddresses } = network;

describe("SushiToken", () => {
  after(() => {
    return api.disconnect();
  });

  async function setup() {
    await api.isReady
    const signerAddresses = await getAddresses();
    const Alice = signerAddresses[0];
    const Bob = signerAddresses[1];
    const Charlie = signerAddresses[2];
    const contractFactory = await getContractFactory("sushitoken", Alice);
    const contract = await contractFactory.deploy("new");

    return { contract, Alice, Bob, Charlie };
  }

  function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  it('testing...', async () => {
    const { contract, Alice, Bob, Charlie } = await setup();

    const name= await contract.query.name();
    expect(name.output).to.equal("Sushi Token");
    console.log("name: ", name.output.toString());
    
    const symbol = await contract.query.symbol();
    expect(symbol.output).to.equal("sushi");
    console.log("symbol: ", symbol.output.toString());
    
    const decimals = await contract.query.decimals();
    expect(decimals.output).to.equal(12);
    console.log("decimals: ", decimals.output.toString());

    const totalSupply = await contract.query.totalSupply();
    expect(totalSupply.output).to.equal(0);
    console.log("totalSupply: ", totalSupply.output.toString());

    const totalReward = await contract.query.totalReward();
    expect(totalReward.output).to.equal(0);
    console.log("totalReward: ", totalReward.output.toString());
    
    const balance = await contract.query.balanceOf(Alice);
    expect(balance.output).to.equal(0);
    console.log("balance: ", balance.output.toString());
    
    const reward = await contract.query.reward(Alice);
    expect(reward.output).to.equal(0); console.log("reward: ", reward.output.toString()); const rewardDebt = await contract.query.rewardDebt(Alice);
    expect(rewardDebt.output).to.equal(0);
    console.log("rewardDebt: ", rewardDebt.output.toString());
    
    const accSushiPershare = await contract.query.accSushiPershare();
    expect(accSushiPershare.output).to.equal(0);
    console.log("accSushiPershare: ", accSushiPershare.output.toString());

    const owner = await contract.query.owner();
    expect(owner.output).to.equal(Alice);
    console.log("owner: ", owner.output.toString());

    // Alice deposits 10 at block 310
    await api.rpc.europa.forwardToHeight(309);
    await delay(1000);
    await contract.tx.deposit(Alice, 10);
    /*/ Bob deposits 20 at block 314
    await api.rpc.europa.forwardToHeight(313);
    await contract.tx.deposit(Bob, 20);
    // Charlie deposits 30 at block 318
    await api.rpc.europa.forwardToHeight(317);
    await contract.tx.deposit(Charlie, 30);

    // Alice deposits 10 at block 319
    await api.rpc.europa.forwardToHeight(319);
    await contract.tx.deposit(Alice, 10);
    
    const reward = await contract.query.reward(Alice);
    // expect(reward.output).to.equal(0);
    console.log("reward: ", reward.output.toString());

    const totalReward = await contract.query.totalReward();
    // expect(totalReward.output).to.equal(0);
    console.log("totalReward: ", totalReward.output.toString());
    */
  });
});
