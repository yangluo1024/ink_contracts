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
let deltaELC: number = 0;
let totalCoinday: number = 0;
let aliceCoinday: number = 0;
let bobCoinday: number = 0;
let charlieCoinday: number = 0;
let aliceELC: number = 0;
let bobELC: number = 0;
let charlieELC: number = 0;

describe('\nELC incremental awards to RELP holders', () => {
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
            let deltaRELP = 10, curBlock = 100;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Alice mint 10 relp tokens at block 100, get totalSupply before minting.
            await relp.tx.mint(Alice, deltaRELP);
            // elc-increase reward
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await additional.query.getCoindayInfo(Alice)).output.amount).to.equal(0);
            expect((await elc.query.balanceOf(Alice)).output).to.equal(0);
            lastAliceBlock = lastBlock = curBlock;

            deltaRELP = 20, curBlock = 300;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Bob mint 20 relp tokens at block 300, get totalSupply before minting.
            let totalSupply = (await relp.query.totalSupply()).output;
            await relp.tx.mint(Bob, deltaRELP);
            // elc-increase reward
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await additional.query.getCoindayInfo(Bob)).output.amount).to.equal(0);
            expect((await elc.query.balanceOf(Bob)).output).to.equal(0);
            lastBobBlock = lastBlock = curBlock;

            deltaRELP = 40, curBlock = 400;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Charlie mint 40 relp tokens at block 400, get totalSupply before minting.
            let totalSupply = (await relp.query.totalSupply()).output;
            await relp.tx.mint(Charlie, deltaRELP);
            // elc-increase reward
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await additional.query.getCoindayInfo(Charlie)).output.amount).to.equal(0);
            expect((await elc.query.balanceOf(Charlie)).output).to.equal(0);
            lastCharlieBlock = lastBlock = curBlock;
        });

        it('Test 3: ELC increase issurance', async () => {
            deltaELC = 660, curBlock = 500
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // elc-increase reward
            // elc token increase 660 at block 500.
            let totalSupply = (await relp.query.totalSupply()).output;
            await relp.tx.updateIncreaseAwards(deltaELC);
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            let aliceDeltaCoinday = (await relp.query.balanceOf(Alice)).output * (curBlock - lastAliceBlock) * blockTime;
            let bobDeltaCoinday = (await relp.query.balanceOf(Bob)).output * (curBlock - lastBobBlock) * blockTime;
            let charlieDeltaCoinday = (await relp.query.balanceOf(Charlie)).output * (curBlock - lastCharlieBlock) * blockTime;
            aliceELC += Math.floor(deltaELC * (aliceCoinday + aliceDeltaCoinday) * 10**8 / totalCoinday);
            bobELC += Math.floor(deltaELC * (bobCoinday + bobDeltaCoinday) * 10**8 / totalCoinday);
            charlieELC += Math.floor(deltaELC * (charlieCoinday + charlieDeltaCoinday) * 10**8 / totalCoinday);
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
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
            // elc-increase reward
            // totalCoinday: old + 70*(700-500)*3*1000;  coindayOf: 10*(700-100)*3*1000;  elcBalanceOf: 660*10**8/3
            aliceCoinday += balance * (curBlock - lastAliceBlock) * blockTime;
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await additional.query.getCoindayInfo(Alice)).output.amount).to.equal(aliceCoinday);
            // award list: [660], aliceLastIdx: 0
            expect((await elc.query.balanceOf(Alice)).output).to.equal(aliceELC);
            lastAliceBlock = lastBlock = curBlock;

            deltaRELP = 40, curBlock = 750;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Bob)).output;
            // Bob mint 40 relp tokens at block 750.
            await relp.tx.mint(Bob, deltaRELP);
            // elc-increase reward
            // totalCoinday: old + 120*(750-700)*3*1000;  coindayOf: 20*(750-300)*3*1000;  elcBalanceOf: 660*10**8/3
            bobCoinday += balance * (curBlock - lastBobBlock) * blockTime;
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await additional.query.getCoindayInfo(Bob)).output.amount).to.equal(bobCoinday);
            // award list: [660], bobLastIdx: 0
            expect((await elc.query.balanceOf(Bob)).output).to.equal(bobELC);
            lastBobBlock = lastBlock = curBlock;

            deltaRELP = 20, curBlock = 800;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Charlie mint 20 relp tokens at block 800.
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Charlie)).output;
            await relp.tx.mint(Charlie, deltaRELP);
            // elc-increase reward
            // totalCoinday: old + 160*(800-750)*3*1000;  coindayOf: 40*(800-400)*3*1000;  elcBalanceOf: 660*10**8/3
            charlieCoinday += balance * (curBlock - lastCharlieBlock) * blockTime;
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await additional.query.getCoindayInfo(Charlie)).output.amount).to.equal(charlieCoinday);
            // award list: [660], bobLastIdx: 0
            expect((await elc.query.balanceOf(Charlie)).output).to.equal(charlieELC);
            lastCharlieBlock = lastBlock = curBlock;
        });

        it('Test 5: ELC increase issurance', async () => {
            deltaELC = 6000, curBlock = 3000
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(1000*2);
            // elc-increase reward
            // elc token increase 6000 at block 3000.
            let totalSupply = (await relp.query.totalSupply()).output;
            await relp.tx.updateIncreaseAwards(deltaELC);
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            let aliceDeltaCoinday = (await relp.query.balanceOf(Alice)).output * (curBlock - lastAliceBlock) * blockTime;
            let bobDeltaCoinday = (await relp.query.balanceOf(Bob)).output * (curBlock - lastBobBlock) * blockTime;
            let charlieDeltaCoinday = (await relp.query.balanceOf(Charlie)).output * (curBlock - lastCharlieBlock) * blockTime;
            aliceELC += Math.floor(deltaELC * (aliceCoinday + aliceDeltaCoinday) * 10**8 / totalCoinday);
            bobELC += Math.floor(deltaELC * (bobCoinday + bobDeltaCoinday) * 10**8 / totalCoinday);
            charlieELC += Math.floor(deltaELC * (charlieCoinday + charlieDeltaCoinday) * 10**8 / totalCoinday);
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            lastBlock = curBlock;
        });

        it('Test 6: Burn RELP tokens for Charlie', async () => {
            deltaRELP = 60, curBlock = 3100;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Charlie mint 20 relp tokens at block 800.
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Charlie)).output;
            await relp.tx.burn(Charlie, deltaRELP);
            // elc-increase reward
            // totalCoinday: old + 180*(3100-3000)*3*1000 - decreaseCoinday = 900000000;
            // coindayOf: old + 60*(3100-700)*3*1000 - all = 0;
            charlieCoinday += balance * (curBlock - lastCharlieBlock) * blockTime;
            let decreaseCoinday = charlieCoinday * deltaRELP / balance;
            charlieCoinday -= decreaseCoinday;
            totalCoinday += (totalSupply * (curBlock - lastBlock) * blockTime - decreaseCoinday);
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await additional.query.getCoindayInfo(Charlie)).output.amount).to.equal(charlieCoinday);
            // award list: [660, 6000], bobLastIdx: 1
            expect((await elc.query.balanceOf(Charlie)).output).to.equal(charlieELC);
            lastCharlieBlock = lastBlock = curBlock;
        });

        it('Test 7: ELC increase issurance', async () => {
            deltaELC = 15000, curBlock = 3500
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // elc-increase reward
            // elc token increase 15000 at block 3500.
            let totalSupply = (await relp.query.totalSupply()).output;
            await relp.tx.updateIncreaseAwards(deltaELC);
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            let aliceDeltaCoinday = (await relp.query.balanceOf(Alice)).output * (curBlock - lastAliceBlock) * blockTime;
            let bobDeltaCoinday = (await relp.query.balanceOf(Bob)).output * (curBlock - lastBobBlock) * blockTime;
            let charlieDeltaCoinday = (await relp.query.balanceOf(Charlie)).output * (curBlock - lastCharlieBlock) * blockTime;
            aliceELC += Math.floor(deltaELC * (aliceCoinday + aliceDeltaCoinday) * 10**8 / totalCoinday);
            bobELC += Math.floor(deltaELC * (bobCoinday + bobDeltaCoinday) * 10**8 / totalCoinday);
            charlieELC += Math.floor(deltaELC * (charlieCoinday + charlieDeltaCoinday) * 10**8 / totalCoinday);
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
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
            // elc-increase reward
            // totalCoinday: old + 120*(3519-3500)*3*1000 - decreaseCoinday = 788130000;
            // coindayOf: old + 60*(3519-750)*3*1000 - decreaseCoinday = 262710000;
            bobCoinday += balance * (curBlock - lastBobBlock) * blockTime;
            let decreaseCoinday = bobCoinday * deltaRELP / balance;
            bobCoinday -= decreaseCoinday;
            totalCoinday += (totalSupply * (curBlock - lastBlock) * blockTime - decreaseCoinday);
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await additional.query.getCoindayInfo(Bob)).output.amount).to.equal(bobCoinday);
            // award list: [660, 6000, 15000], bobLastIdx: 1
            expect((await elc.query.balanceOf(Bob)).output).to.equal(bobELC);
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
            // elc-increase reward
            // totalCoinday: old + 90*(3600-3519)*3*1000 = 810000000;
            // coindayOf: old + 60*(3600-800)*3*1000 = 540000000;
            // if to the current block, Bob's coinday is 270000000 (810000000 - 540000000)
            aliceCoinday += balance * (curBlock - lastAliceBlock) * blockTime;
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await additional.query.getCoindayInfo(Alice)).output.amount).to.equal(aliceCoinday);
            // award list: [660, 6000, 15000], aliceLastIdx: 1
            expect((await elc.query.balanceOf(Alice)).output).to.equal(aliceELC);
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
            // decreaseCoinday=132000000(Alice's balance getting smaller)
            let totalSupply = (await relp.query.totalSupply()).output;
            let aliceBalance = (await relp.query.balanceOf(Alice)).output;
            let charlieBalance = (await relp.query.balanceOf(Charlie)).output;
            await relp.tx.transfer(Charlie, deltaRELP);
            // elc-increase reward
            // coindayOfAlice: (old + 100*(4000-3600)*3000)*80/100 = 528000000, Bob's coinday has not been updated.
            // totalCoinday: (old + 130*400*3000) - decreaseCoinday = 834000000, Bob's coinday is 306000000 at block 4000
            aliceCoinday += aliceBalance * (curBlock - lastAliceBlock) * blockTime;
            let decreaseCoinday = aliceCoinday * deltaRELP / aliceBalance;
            aliceCoinday -= decreaseCoinday;
            charlieCoinday += charlieBalance * (curBlock - lastCharlieBlock) * blockTime;
            totalCoinday += (totalSupply * (curBlock - lastBlock) * blockTime - decreaseCoinday);
            expect((await additional.query.getCoindayInfo(Alice)).output.amount).to.equal(aliceCoinday);
            expect((await additional.query.getCoindayInfo(Bob)).output.amount).to.equal(bobCoinday);
            expect((await additional.query.getCoindayInfo(Charlie)).output.amount).to.equal(charlieCoinday);
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);

            lastAliceBlock = lastCharlieBlock = lastBlock = curBlock;
            // elc amount has no change because there is no elc-increase in block 3600-4000
            expect((await elc.query.balanceOf(Alice)).output).to.equal(aliceELC);
            expect((await elc.query.balanceOf(Bob)).output).to.equal(bobELC);
            expect((await elc.query.balanceOf(Charlie)).output).to.equal(charlieELC);
        });

        it('Test 2: ELC increase issurance', async () => {
            deltaELC = 18340, curBlock = 4112
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // elc-increase reward
            // elc token increase 18340 at block 4112.
            let totalSupply = (await relp.query.totalSupply()).output;
            await relp.tx.updateIncreaseAwards(deltaELC);
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            let aliceDeltaCoinday = (await relp.query.balanceOf(Alice)).output * (curBlock - lastAliceBlock) * blockTime;
            let bobDeltaCoinday = (await relp.query.balanceOf(Bob)).output * (curBlock - lastBobBlock) * blockTime;
            let charlieDeltaCoinday = (await relp.query.balanceOf(Charlie)).output * (curBlock - lastCharlieBlock) * blockTime;
            aliceELC += Math.floor(deltaELC * (aliceCoinday + aliceDeltaCoinday) * 10**8 / totalCoinday);
            bobELC += Math.floor(deltaELC * (bobCoinday + bobDeltaCoinday) * 10**8 / totalCoinday);
            charlieELC += Math.floor(deltaELC * (charlieCoinday + charlieDeltaCoinday) * 10**8 / totalCoinday);
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            lastBlock = curBlock;
        });

        it('Test 3: Alice transfer relp to Charlie', async () => {
            deltaRELP = 20, curBlock = 4500
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // transer balance from Alice to Charlie at block 4000
            // decreaseCoinday=132000000(Alice's balance getting smaller)
            let totalSupply = (await relp.query.totalSupply()).output;
            let aliceBalance = (await relp.query.balanceOf(Alice)).output;
            let charlieBalance = (await relp.query.balanceOf(Charlie)).output;
            await relp.tx.transfer(Charlie, deltaRELP);
            // elc-increase reward
            // coindayOfAlice: (old + 80*(4500-4000)*3000)*60/80 = 486000000, Bob's coinday is 351000000(262710000).
            // totalCoinday: (old + 130*(4500-4112)*3000) - decreaseCoinday = 867000000, Charlie's coinday is 20*500*3000=30000000 
            aliceCoinday += aliceBalance * (curBlock - lastAliceBlock) * blockTime;
            let decreaseCoinday = aliceCoinday * deltaRELP / aliceBalance;
            aliceCoinday -= decreaseCoinday;
            charlieCoinday += charlieBalance * (curBlock - lastCharlieBlock) * blockTime;
            totalCoinday += (totalSupply * (curBlock - lastBlock) * blockTime - decreaseCoinday);
            expect((await additional.query.getCoindayInfo(Alice)).output.amount).to.equal(aliceCoinday);
            expect((await additional.query.getCoindayInfo(Bob)).output.amount).to.equal(bobCoinday);
            expect((await additional.query.getCoindayInfo(Charlie)).output.amount).to.equal(charlieCoinday);
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);

            lastAliceBlock = lastCharlieBlock = lastBlock = curBlock;
            expect((await elc.query.balanceOf(Alice)).output).to.equal(aliceELC);
            // bob's balance has not change
            // expect((await elc.query.balanceOf(Bob)).output).to.equal(bobELC);
            expect((await elc.query.balanceOf(Charlie)).output).to.equal(charlieELC);
        });

        it('Test 4: ELC increase issurance', async () => {
            deltaELC = 20000, curBlock = 5000
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // elc-increase reward
            // elc token increase 20000 at block 5000.
            let totalSupply = (await relp.query.totalSupply()).output;
            await relp.tx.updateIncreaseAwards(deltaELC);
            totalCoinday += totalSupply * (curBlock - lastBlock) * blockTime;
            let aliceDeltaCoinday = (await relp.query.balanceOf(Alice)).output * (curBlock - lastAliceBlock) * blockTime;
            let bobDeltaCoinday = (await relp.query.balanceOf(Bob)).output * (curBlock - lastBobBlock) * blockTime;
            let charlieDeltaCoinday = (await relp.query.balanceOf(Charlie)).output * (curBlock - lastCharlieBlock) * blockTime;
            aliceELC += Math.floor(deltaELC * (aliceCoinday + aliceDeltaCoinday) * 10**8 / totalCoinday);
            bobELC += Math.floor(deltaELC * (bobCoinday + bobDeltaCoinday) * 10**8 / totalCoinday);
            charlieELC += Math.floor(deltaELC * (charlieCoinday + charlieDeltaCoinday) * 10**8 / totalCoinday);
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            lastBlock = curBlock;
        });

        it('Test 5: Burn all RELP tokens for users', async () => {
            deltaRELP = 30, curBlock = 5200;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Bob burn 30 relp tokens at block 5200. decreaseCoinday=414000000
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Bob)).output;
            await relp.tx.burn(Bob, deltaRELP);
            // elc-increase reward
            // totalCoinday: old + 130*(5200-5000)*3*1000 - decreaseCoinday = 726000000;
            // coindayOf: (old + 30*(5200-3519)*3*1000)*0/30 = 0;
            bobCoinday += balance * (curBlock - lastBobBlock) * blockTime;
            let decreaseCoinday = bobCoinday * deltaRELP / balance;
            bobCoinday -= decreaseCoinday;
            totalCoinday += (totalSupply * (curBlock - lastBlock) * blockTime - decreaseCoinday);
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await additional.query.getCoindayInfo(Bob)).output.amount).to.equal(bobCoinday);
            expect((await elc.query.balanceOf(Bob)).output).to.equal(bobELC);
            lastBobBlock = lastBlock = curBlock;

            deltaRELP = 60, curBlock = 5600;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Alice burn 60 relp tokens at block 5600. decreaseCoinday=684000000
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Alice)).output;
            await relp.tx.burn(Alice, deltaRELP);
            // elc-increase reward
            // totalCoinday: old + 100*(5600-5200)*3*1000 - decreaseCoinday = 162000000;
            // coindayOf: (old + 30*(5600-4500)*3*1000)*0/60 = 0;
            aliceCoinday += balance * (curBlock - lastAliceBlock) * blockTime;
            let decreaseCoinday = aliceCoinday * deltaRELP / balance;
            aliceCoinday -= decreaseCoinday;
            totalCoinday += (totalSupply * (curBlock - lastBlock) * blockTime - decreaseCoinday);
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await additional.query.getCoindayInfo(Alice)).output.amount).to.equal(aliceCoinday);
            expect((await elc.query.balanceOf(Alice)).output).to.equal(aliceELC);
            lastAliceBlock = lastBlock = curBlock;

            deltaRELP = 40, curBlock = 5800;
            await api.rpc.europa.forwardToHeight(curBlock - 1);
            await delay(500);
            // Charlie burn 40 relp tokens at block 5800. decreaseCoinday=186000000
            let totalSupply = (await relp.query.totalSupply()).output;
            let balance = (await relp.query.balanceOf(Charlie)).output;
            await relp.tx.burn(Charlie, deltaRELP);
            // elc-increase reward
            // totalCoinday: old + 120*(5800-5600)*3*1000 - decreaseCoinday = 0;
            // coindayOf: (old + 30*(5800-4500)*3*1000)*0/60 = 0;
            charlieCoinday += balance * (curBlock - lastCharlieBlock) * blockTime;
            let decreaseCoinday = charlieCoinday * deltaRELP / balance;
            charlieCoinday -= decreaseCoinday;
            totalCoinday += (totalSupply * (curBlock - lastBlock) * blockTime - decreaseCoinday);
            expect((await additional.query.totalCoinday()).output[0]).to.equal(totalCoinday);
            expect((await additional.query.getCoindayInfo(Charlie)).output.amount).to.equal(charlieCoinday);
            expect((await elc.query.balanceOf(Charlie)).output).to.equal(charlieELC);
            lastCharlieBlock = lastBlock = curBlock;
        });

        it("Test 6: Check whether the sum of users' reward is equal to the total reward", async () => {
            const totalELCReward = await additional.query.totalReward();
            const rewardAliceELC = await additional.query.rewardOf(Alice);
            const rewardBobELC = await additional.query.rewardOf(Bob);
            const rewardCharlieELC = await additional.query.rewardOf(Charlie);
            console.log("\nReward Of Alice: ", rewardAliceELC.output.toString() / 10**8);
            console.log("Reward Of Bob: ", rewardBobELC.output.toString() / 10**8);
            console.log("Reward Of Charlie: ", rewardCharlieELC.output.toString() / 10**8);
            console.log("All accounts' reward:", 
                (parseFloat(rewardAliceELC.output) + 
                parseFloat(rewardBobELC.output) + 
                parseFloat(rewardCharlieELC.output)) / 10**8 );
            console.log("Total ELC increase issurance: ", totalELCReward.output.toString());
            const aELC = await elc.query.balanceOf(Alice);
            const bELC = await elc.query.balanceOf(Bob);
            const cELC = await elc.query.balanceOf(Charlie);
            const totalELCSupply = await elc.query.totalSupply();
            console.log("\nAlice's ELC balance: ", aELC.output.toString() / 10**8);
            console.log("Bob's ELC balance: ", bELC.output.toString() / 10**8);
            console.log("Charlie's ELC balance: ", cELC.output.toString() / 10**8);
            console.log("Total ELC tokens: ", totalELCSupply.output.toString() / 10**8);
        });
    });
});
