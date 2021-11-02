import { expect } from 'chai';
import { artifacts, network, patract } from 'redspot';

const { getContractFactory, getRandomSigner, Contract } = patract;

const { api, getAddresses, getSigners } = network;

// address
let Alice: string;
let Bob: string;
let Charlie: string;
let elc: typeof Contract;
let relp: typeof Contract;
let reward: typeof Contract;
let additional: typeof Contract;

// variables
const blockTime: number = 3 * 1000;
let lastAliceBlock: number = 0;
let lastBobBlock: number = 0;
let lastCharlieBlock: number = 0;
let lastBlock: number = 0;
let curBlock: number = 0;
let deltaRELP: number = 0;
let deltaELP: number = 0;
let totalCoinday: number = 0;
let aliceCoinday: number = 0;
let bobCoinday: number = 0;
let charlieCoinday: number = 0;
let aliceELP: number = 0;
let bobELP: number = 0;
let charlieELP: number = 0;

describe('\nLiquidity mining awards to RELP holders', () => {
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

    describe("\nContract required for deployment", async function() {
        it('deploy elc token contract', async () => {
            const elcFactory = await getContractFactory('elc', Alice);
            elc = await elcFactory.deploy('new');

            expect(elc.address).to.exist;
        });

        it('deploy reward contract', async () => {
            const rewardFactory = await getContractFactory('reward', Alice);
            reward = await rewardFactory.deploy('new');

            expect(reward.address).to.exist;
        });

        it('deploy additional contract', async () => {
            const additionalFactory = await getContractFactory('additional', Alice);
            additional = await additionalFactory.deploy('new');

            expect(additional.address).to.exist;
        });

        it('deploy relp contract', async () => {
            const relpFactory = await getContractFactory('relp', Alice);
            relp = await relpFactory.deploy(
                'new',
                elc.address,
                reward.address,
                additional.address
            );

            expect(relp.address).to.exist;
        });
    });

    describe("\nMint or burn RELP", async function() {
        it('Test 1: Authorize to RELP contract address', async () => {
            // before distribure award, all contracts needs to delegate `relp` address.
            await elc.tx.transferOwnership(relp.address);
            expect((await elc.query.owner()).output).to.equal(relp.address);
            await reward.tx.transferOwnership(relp.address);
            expect((await reward.query.owner()).output).to.equal(relp.address);
            await additional.tx.transferOwnership(relp.address);
            expect((await additional.query.owner()).output).to.equal(relp.address);
        });

        it('Test 2: Mint RELP tokens for users', async () => {
            let deltaRELP = 10, curBlock = 50;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Alice mint 10 relp tokens at block 100, get totalSupply before minting.
            await relp.tx.mint(Alice, deltaRELP);
            // liquidity-mining reward
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await reward.query.getCoindayInfo(Alice)).output.amount).to.equal(0);
            expect((await reward.query.rewardOf(Alice)).output).to.equal(0);
            lastAliceBlock = lastBlock = curBlock;

            deltaRELP = 20, curBlock = 300;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Bob mint 20 relp tokens at block 300, get totalSupply before minting.
            let totalSupply = (await relp.query.totalSupply()).output;
            await relp.tx.mint(Bob, deltaRELP);
            // liquidity-mining reward
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await reward.query.getCoindayInfo(Bob)).output.amount).to.equal(0);
            expect((await reward.query.rewardOf(Bob)).output).to.equal(0);
            lastBobBlock = lastBlock = curBlock;

            deltaRELP = 40, curBlock = 400;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Charlie mint 40 relp tokens at block 400, get totalSupply before minting.
            let totalSupply = (await relp.query.totalSupply()).output;
            await relp.tx.mint(Charlie, deltaRELP);
            // liquidity-mining reward
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await reward.query.getCoindayInfo(Charlie)).output.amount).to.equal(0);
            expect((await reward.query.rewardOf(Charlie)).output).to.equal(0);
            lastCharlieBlock = lastBlock = curBlock;
        });

        it('Test 3: Update liquidity mining award pool', async () => {
            curBlock = 650
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // liquidity-mining reward
            // update liquidity mining award pool
            await relp.tx.updateBlockAwards();
            let totalSupply = (await relp.query.totalSupply()).output;
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            let len = (await reward.query.awardsLength()).output;
            deltaELP = (await reward.query.getAward(len - 1)).output.amount;
            let aliceDeltaCoinday = (await relp.query.balanceOf(Alice)).output * (curBlock - lastAliceBlock) * blockTime;
            let bobDeltaCoinday = (await relp.query.balanceOf(Bob)).output * (curBlock - lastBobBlock) * blockTime;
            let charlieDeltaCoinday = (await relp.query.balanceOf(Charlie)).output * (curBlock - lastCharlieBlock) * blockTime;
            aliceELP += Math.floor(deltaELP * (aliceCoinday + aliceDeltaCoinday) / totalCoinday);
            bobELP += Math.floor(deltaELP * (bobCoinday + bobDeltaCoinday) / totalCoinday);
            charlieELP += Math.floor(deltaELP * (charlieCoinday + charlieDeltaCoinday) / totalCoinday);
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            lastBlock = curBlock;
        });

        it('Test 4: Mint RELP tokens for users again', async () => {
            deltaRELP = 50, curBlock = 700;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Alice)).output;
            // Alice mint 50 relp tokens at block 700.
            await relp.tx.mint(Alice, deltaRELP);

            let curAliceReward = (await reward.query.rewardOf(Alice)).output;
            // liquidity-mining reward
            aliceCoinday += balance * (curBlock - lastAliceBlock) * blockTime;
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await reward.query.getCoindayInfo(Alice)).output.amount).to.equal(aliceCoinday);
            expect((await reward.query.rewardOf(Alice)).output).to.equal(aliceELP);
            lastAliceBlock = lastBlock = curBlock;

            deltaRELP = 40, curBlock = 750;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Bob)).output;
            // Bob mint 40 relp tokens at block 750.
            await relp.tx.mint(Bob, deltaRELP);
            // liquidity-mining reward
            bobCoinday += balance * (curBlock - lastBobBlock) * blockTime;
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await reward.query.getCoindayInfo(Bob)).output.amount).to.equal(bobCoinday);
            expect((await reward.query.rewardOf(Bob)).output).to.equal(bobELP);
            lastBobBlock = lastBlock = curBlock;

            deltaRELP = 20, curBlock = 800;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Charlie mint 20 relp tokens at block 800.
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Charlie)).output;
            await relp.tx.mint(Charlie, deltaRELP);
            // liquidity-mining reward
            charlieCoinday += balance * (curBlock - lastCharlieBlock) * blockTime;
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await reward.query.getCoindayInfo(Charlie)).output.amount).to.equal(charlieCoinday);
            expect((await reward.query.rewardOf(Charlie)).output).to.equal(charlieELP);
            lastCharlieBlock = lastBlock = curBlock;
        });

        it('Test 5: Update liquidity mining award pool', async () => {
            curBlock = 2900
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(1000 * 2);
            // liquidity-mining reward
            // update liquidity mining award pool
            await relp.tx.updateBlockAwards();
            let totalSupply = (await relp.query.totalSupply()).output;
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            let len = (await reward.query.awardsLength()).output;
            deltaELP = (await reward.query.getAward(len - 1)).output.amount;
            let aliceDeltaCoinday = (await relp.query.balanceOf(Alice)).output * (curBlock - lastAliceBlock) * blockTime;
            let bobDeltaCoinday = (await relp.query.balanceOf(Bob)).output * (curBlock - lastBobBlock) * blockTime;
            let charlieDeltaCoinday = (await relp.query.balanceOf(Charlie)).output * (curBlock - lastCharlieBlock) * blockTime;
            aliceELP += Math.floor(deltaELP * (aliceCoinday + aliceDeltaCoinday) / totalCoinday);
            bobELP += Math.floor(deltaELP * (bobCoinday + bobDeltaCoinday) / totalCoinday);
            charlieELP += Math.floor(deltaELP * (charlieCoinday + charlieDeltaCoinday) / totalCoinday);
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            lastBlock = curBlock;
        });

        it('Test 6: Burn RELP tokens for Charlie', async () => {
            deltaRELP = 60, curBlock = 3100;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Charlie mint 20 relp tokens at block 3100.
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Charlie)).output;
            await relp.tx.burn(Charlie, deltaRELP);
            // liquidity-mining reward
            charlieCoinday += balance * (curBlock - lastCharlieBlock) * blockTime;
            let decreaseCoinday = charlieCoinday * deltaRELP / balance;
            charlieCoinday -= decreaseCoinday;
            totalCoinday += (totalSupply * (curBlock - lastBlock) * blockTime - decreaseCoinday);
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await reward.query.getCoindayInfo(Charlie)).output.amount).to.equal(charlieCoinday);
            expect((await reward.query.rewardOf(Charlie)).output).to.equal(charlieELP);
            lastCharlieBlock = lastBlock = curBlock;
        });

        it('Test 7: Update liquidity mining award pool', async () => {
            curBlock = 3500
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // liquidity-mining reward
            // update liquidity mining award pool
            await relp.tx.updateBlockAwards();
            let totalSupply = (await relp.query.totalSupply()).output;
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            let len = (await reward.query.awardsLength()).output;
            deltaELP = (await reward.query.getAward(len - 1)).output.amount;
            let aliceDeltaCoinday = (await relp.query.balanceOf(Alice)).output * (curBlock - lastAliceBlock) * blockTime;
            let bobDeltaCoinday = (await relp.query.balanceOf(Bob)).output * (curBlock - lastBobBlock) * blockTime;
            let charlieDeltaCoinday = (await relp.query.balanceOf(Charlie)).output * (curBlock - lastCharlieBlock) * blockTime;
            aliceELP += Math.floor(deltaELP * (aliceCoinday + aliceDeltaCoinday) / totalCoinday);
            bobELP += Math.floor(deltaELP * (bobCoinday + bobDeltaCoinday) / totalCoinday);
            charlieELP += Math.floor(deltaELP * (charlieCoinday + charlieDeltaCoinday) / totalCoinday);
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            lastBlock = curBlock;
        });

        it('Test 8: Burn RELP tokens for Bob', async () => {
            deltaRELP = 30, curBlock = 3519;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Bob burn 30 relp tokens at block 3519. decreaseCoinday=262710000
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Bob)).output;
            await relp.tx.burn(Bob, deltaRELP);
            // liquidity-mining reward
            bobCoinday += balance * (curBlock - lastBobBlock) * blockTime;
            let decreaseCoinday = bobCoinday * deltaRELP / balance;
            bobCoinday -= decreaseCoinday;
            totalCoinday += (totalSupply * (curBlock - lastBlock) * blockTime - decreaseCoinday);
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await reward.query.getCoindayInfo(Bob)).output.amount).to.equal(bobCoinday);
            expect((await reward.query.rewardOf(Bob)).output).to.equal(bobELP);
            lastBobBlock = lastBlock = curBlock;
        });

        it('Test 9: Mint RELP tokens for Alice', async () => {
            deltaRELP = 40, curBlock = 3600;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Alice)).output;
            // Alice mint 40 relp tokens at block 3600.
            await relp.tx.mint(Alice, deltaRELP);
            // liquidity-mining reward
            aliceCoinday += balance * (curBlock - lastAliceBlock) * blockTime;
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await reward.query.getCoindayInfo(Alice)).output.amount).to.equal(aliceCoinday);
            expect((await reward.query.rewardOf(Alice)).output).to.equal(aliceELP);
            lastAliceBlock = lastBlock = curBlock;

            // finally, let's see the three accounts' relp balance 
            expect((await relp.query.balanceOf(Alice)).output).to.equal(100);
            expect((await relp.query.balanceOf(Bob)).output).to.equal(30);
            expect((await relp.query.balanceOf(Charlie)).output).to.equal(0);
        });
    });

    describe("\nTransfer or burn RELP", async function() {
        it('Test 1: Alice transfer relp to Charlie', async () => {
            deltaRELP = 20, curBlock = 4000
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // transer balance from Alice to Charlie at block 4000
            let totalSupply = (await relp.query.totalSupply()).output;
            let aliceBalance = (await relp.query.balanceOf(Alice)).output;
            let charlieBalance = (await relp.query.balanceOf(Charlie)).output;
            await relp.tx.transfer(Charlie, deltaRELP);
            // liquidity-mining reward
            aliceCoinday += aliceBalance * (curBlock - lastAliceBlock) * blockTime;
            let decreaseCoinday = aliceCoinday * deltaRELP / aliceBalance;
            aliceCoinday -= decreaseCoinday;
            charlieCoinday += charlieBalance * (curBlock - lastCharlieBlock) * blockTime;
            totalCoinday += (totalSupply * (curBlock - lastBlock) * blockTime - decreaseCoinday);
            expect((await reward.query.getCoindayInfo(Alice)).output.amount).to.equal(aliceCoinday);
            expect((await reward.query.getCoindayInfo(Bob)).output.amount).to.equal(bobCoinday);
            expect((await reward.query.getCoindayInfo(Charlie)).output.amount).to.equal(charlieCoinday);
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);

            lastAliceBlock = lastCharlieBlock = lastBlock = curBlock;
            // elc amount has no change because there is no liquidity-mining in block 3600-4000
            expect((await reward.query.rewardOf(Alice)).output).to.equal(aliceELP);
            expect((await reward.query.rewardOf(Bob)).output).to.equal(bobELP);
            expect((await reward.query.rewardOf(Charlie)).output).to.equal(charlieELP);
        });

        it('Test 2: Update liquidity mining award pool', async () => {
            curBlock = 4112
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // liquidity-mining reward
            // update liquidity mining award pool
            await relp.tx.updateBlockAwards();
            let totalSupply = (await relp.query.totalSupply()).output;
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            let len = (await reward.query.awardsLength()).output;
            deltaELP = (await reward.query.getAward(len - 1)).output.amount;
            let aliceDeltaCoinday = (await relp.query.balanceOf(Alice)).output * (curBlock - lastAliceBlock) * blockTime;
            let bobDeltaCoinday = (await relp.query.balanceOf(Bob)).output * (curBlock - lastBobBlock) * blockTime;
            let charlieDeltaCoinday = (await relp.query.balanceOf(Charlie)).output * (curBlock - lastCharlieBlock) * blockTime;
            aliceELP += Math.floor(deltaELP * (aliceCoinday + aliceDeltaCoinday) / totalCoinday);
            bobELP += Math.floor(deltaELP * (bobCoinday + bobDeltaCoinday) / totalCoinday);
            charlieELP += Math.floor(deltaELP * (charlieCoinday + charlieDeltaCoinday) / totalCoinday);
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            lastBlock = curBlock;
        });

        it('Test 3: Alice transfer relp to Charlie', async () => {
            deltaRELP = 20, curBlock = 4500
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // transer balance from Alice to Charlie at block 4000
            let totalSupply = (await relp.query.totalSupply()).output;
            let aliceBalance = (await relp.query.balanceOf(Alice)).output;
            let charlieBalance = (await relp.query.balanceOf(Charlie)).output;
            await relp.tx.transfer(Charlie, deltaRELP);
            // liquidity-mining reward
            aliceCoinday += aliceBalance * (curBlock - lastAliceBlock) * blockTime;
            let decreaseCoinday = aliceCoinday * deltaRELP / aliceBalance;
            aliceCoinday -= decreaseCoinday;
            charlieCoinday += charlieBalance * (curBlock - lastCharlieBlock) * blockTime;
            totalCoinday += (totalSupply * (curBlock - lastBlock) * blockTime - decreaseCoinday);
            expect((await reward.query.getCoindayInfo(Alice)).output.amount).to.equal(aliceCoinday);
            expect((await reward.query.getCoindayInfo(Bob)).output.amount).to.equal(bobCoinday);
            expect((await reward.query.getCoindayInfo(Charlie)).output.amount).to.equal(charlieCoinday);
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);

            lastAliceBlock = lastCharlieBlock = lastBlock = curBlock;
            expect((await reward.query.rewardOf(Alice)).output).to.equal(aliceELP);
            // bob's balance has not change
            // expect((await reward.query.rewardOf(Bob)).output).to.equal(bobELP);
            expect((await reward.query.rewardOf(Charlie)).output).to.equal(charlieELP);
        });

        it('Test 4: Update liquidity mining award pool', async () => {
            curBlock = 5000
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // liquidity-mining reward
            // update liquidity mining award pool
            await relp.tx.updateBlockAwards();
            let totalSupply = (await relp.query.totalSupply()).output;
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            let len = (await reward.query.awardsLength()).output;
            deltaELP = (await reward.query.getAward(len - 1)).output.amount;
            let aliceDeltaCoinday = (await relp.query.balanceOf(Alice)).output * (curBlock - lastAliceBlock) * blockTime;
            let bobDeltaCoinday = (await relp.query.balanceOf(Bob)).output * (curBlock - lastBobBlock) * blockTime;
            let charlieDeltaCoinday = (await relp.query.balanceOf(Charlie)).output * (curBlock - lastCharlieBlock) * blockTime;
            aliceELP += Math.floor(deltaELP * (aliceCoinday + aliceDeltaCoinday) / totalCoinday);
            bobELP += Math.floor(deltaELP * (bobCoinday + bobDeltaCoinday) / totalCoinday);
            charlieELP += Math.floor(deltaELP * (charlieCoinday + charlieDeltaCoinday) / totalCoinday);
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            lastBlock = curBlock;
        });

        it('Test 5: Burn all RELP tokens for users', async () => {
            deltaRELP = 30, curBlock = 5200;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Bob burn 30 relp tokens at block 5200. 
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Bob)).output;
            await relp.tx.burn(Bob, deltaRELP);
            // liquidity-mining reward
            bobCoinday += balance * (curBlock - lastBobBlock) * blockTime;
            let decreaseCoinday = bobCoinday * deltaRELP / balance;
            bobCoinday -= decreaseCoinday;
            totalCoinday += (totalSupply * (curBlock - lastBlock) * blockTime - decreaseCoinday);
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await reward.query.getCoindayInfo(Bob)).output.amount).to.equal(bobCoinday);
            expect((await reward.query.rewardOf(Bob)).output).to.equal(bobELP);
            lastBobBlock = lastBlock = curBlock;

            deltaRELP = 60, curBlock = 5600;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Alice burn 60 relp tokens at block 5600.
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Alice)).output;
            await relp.tx.burn(Alice, deltaRELP);
            // liquidity-mining reward
            aliceCoinday += balance * (curBlock - lastAliceBlock) * blockTime;
            let decreaseCoinday = aliceCoinday * deltaRELP / balance;
            aliceCoinday -= decreaseCoinday;
            totalCoinday += (totalSupply * (curBlock - lastBlock) * blockTime - decreaseCoinday);
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await reward.query.getCoindayInfo(Alice)).output.amount).to.equal(aliceCoinday);
            expect((await reward.query.rewardOf(Alice)).output).to.equal(aliceELP);
            lastAliceBlock = lastBlock = curBlock;

            deltaRELP = 40, curBlock = 5800;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Charlie burn 40 relp tokens at block 5800.
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Charlie)).output;
            await relp.tx.burn(Charlie, deltaRELP);
            // liquidity-mining reward
            charlieCoinday += balance * (curBlock - lastCharlieBlock) * blockTime;
            let decreaseCoinday = charlieCoinday * deltaRELP / balance;
            charlieCoinday -= decreaseCoinday;
            totalCoinday += (totalSupply * (curBlock - lastBlock) * blockTime - decreaseCoinday);
            expect((await reward.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await reward.query.getCoindayInfo(Charlie)).output.amount).to.equal(charlieCoinday);
            expect((await reward.query.rewardOf(Charlie)).output).to.equal(charlieELP);
            lastCharlieBlock = lastBlock = curBlock;
        });

        it("Test 6: Check whether the sum of users' reward is equal to the total reward", async () => {
            const totalELCReward = await reward.query.totalReward();
            const rewardAliceELC = await reward.query.rewardOf(Alice);
            const rewardBobELC = await reward.query.rewardOf(Bob);
            const rewardCharlieELC = await reward.query.rewardOf(Charlie);
            const dailyAward = await reward.query.dailyAward();
            console.log("\nReward Of Alice: ", rewardAliceELC.output.toString() / 10**8);
            console.log("Reward Of Bob: ", rewardBobELC.output.toString() / 10**8);
            console.log("Reward Of Charlie: ", rewardCharlieELC.output.toString() / 10**8);
            console.log("All accounts' reward:", 
                (parseFloat(rewardAliceELC.output) + 
                parseFloat(rewardBobELC.output) + 
                parseFloat(rewardCharlieELC.output)) / 10**8 );
            console.log("Total liquidity reward: ", totalELCReward.output.toString());
            console.log("Current Daily award(amount, timestamp): ", dailyAward.output.toString());
        });
    });
});
