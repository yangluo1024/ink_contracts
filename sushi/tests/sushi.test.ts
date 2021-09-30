import { expect } from 'chai';
import { artifacts, network, patract } from 'redspot';

const { getContractFactory, getRandomSigner, Contract } = patract;

const { api, getAddresses, getSigners } = network;

let Alice: string;
let Bob: string;
let Charlie: string;
let erc: typeof Contract;
let sushi: typeof Contract;

describe('Sushi', () => {
    after(() => {
        return api.disconnect();
    });

    before(async () => {
        await api.isReady;
        const signerAddresses = await getAddresses();
        Alice = signerAddresses[0];
        Bob = signerAddresses[1];
        Charlie = signerAddresses[2];
    });

    function delay(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    it('deploy erc20', async () => {
        const ercFactory = await getContractFactory('erc20', Alice);
        erc = await ercFactory.deploy('new');

        expect(erc.address).to.exist;
    });

    it('deploy sushi', async () => {
        const sushiFactory = await getContractFactory('sushitoken', Alice);
        sushi = await sushiFactory.deploy('new', erc.address);

        expect(sushi.address).to.exist;
    });

    it('erc mint', async () => {
        await erc.tx.mint(Alice, 600)
        expect((await erc.query.balanceOf(Alice)).output).to.equal(600);
        await erc.tx.mint(Bob, 600)
        expect((await erc.query.balanceOf(Bob)).output).to.equal(600);
        await erc.tx.mint(Charlie, 600)
        expect((await erc.query.balanceOf(Charlie)).output).to.equal(600);
        expect((await erc.query.totalSupply()).output).to.equal(1800);
    });

    it('erc transfer', async () => {
        await erc.tx.transfer(Charlie, 100)
        expect((await erc.query.balanceOf(Alice)).output).to.equal(500);
        expect((await erc.query.balanceOf(Charlie)).output).to.equal(700);
        expect((await erc.query.totalSupply()).output).to.equal(1800);
    });

    it('sushi distribute reward', async () => {
        // delegate
        await erc.tx.transferOwnership(sushi.address);
        expect((await erc.query.owner()).output).to.equal(sushi.address);

        // approve
        await erc.tx.approve(sushi.address, 1000);
        expect((await erc.query.allowance(Alice, sushi.address)).output).to.equal(1000);
        
        // Alice deposits 10 at block 310
        await api.rpc.europa.forwardToHeight(309);
        await delay(1000);
        await sushi.tx.deposit(Alice, 10);

        /*
        // Bob deposits 20 at block 314
        await api.rpc.europa.forwardToHeight(313);
        await delay(1000);
        await sushi.tx.deposit(Bob, 20);
        // Charlie deposits 30 at block 318
        await api.rpc.europa.forwardToHeight(317);
        await delay(1000);
        await sushi.tx.deposit(Charlie, 30);
        */

        // Alice deposits 10 at block 320
        await api.rpc.europa.forwardToHeight(319);
        await delay(1000);
        await sushi.tx.deposit(Alice, 10);

        const reward = await erc.query.reward(Alice);
        console.log("\nrewardA at block 320: ", reward.output.toString());

        /* 
        const totalReward = await sushi.query.totalReward();
        console.log("totalReward at block 320: ", totalReward.output.toString());

        // Bob deposits 20 at block 324
        await api.rpc.europa.forwardToHeight(323);
        await delay(1000);
        await sushi.tx.deposit(Bob, 20);
        // Charlie deposits 30 at block 328
        await api.rpc.europa.forwardToHeight(327);
        await delay(1000);
        await sushi.tx.deposit(Charlie, 30);
        */

        await sushi.tx.withdraw(Alice, 20);
        // await sushi.tx.withdraw(Bob, 40);
        // await sushi.tx.withdraw(Charlie, 60);

        const rewardA = await erc.query.reward(Alice);
        console.log("\nAlice's reward: ", rewardA.output.toString());
        // const rewardB = await erc.query.reward(Bob);
        // console.log("Bob's reward: ", rewardB.output.toString());
        // const rewardC = await erc.query.reward(Charlie);
        // console.log("Charlie's reward: ", rewardC.output.toString());

        const totalReward = await sushi.query.totalReward();
        console.log("totalReward: ", totalReward.output.toString());

        const t = await sushi.query.getTime();
        console.log("now time: ", t.output.toString());
    });
});
