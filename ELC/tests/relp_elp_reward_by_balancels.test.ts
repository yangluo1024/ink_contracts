import { expect } from 'chai';
import { artifacts, network, patract } from 'redspot';

const { getContractFactory, getRandomSigner, Contract } = patract;

const { api, getAddresses, getSigners } = network;

let Alice: string;
let Bob: string;
let Charlie: string;
let elc: typeof Contract;
let relp: typeof Contract;
let reward: typeof Contract;
let additional: typeof Contract;

describe('ELC stable currency', () => {
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

    it('Distribute elc and elp award when mint or burn relp.', async () => {
        // before distribure award, all contracts needs to delegate `relp` address.
        await elc.tx.transferOwnership(relp.address);
        expect((await elc.query.owner()).output).to.equal(relp.address);
        await reward.tx.transferOwnership(relp.address);
        expect((await reward.query.owner()).output).to.equal(relp.address);
        await additional.tx.transferOwnership(relp.address);
        expect((await additional.query.owner()).output).to.equal(relp.address);
        
        await api.rpc.europa.forwardToHeight(99);
        await delay(500);
        // Alice mint 10 relp tokens at block 100.
        await relp.tx.mint(Alice, 10);
        // elc-increase reward
        // totalCoinday: 0;  coindayOf: 0;  elcBalanceOf: 0
        expect((await additional.query.totalCoinday()).output[0]).to.equal(0);
        expect((await additional.query.getCoindayInfo(Alice)).output.amount).to.equal(0);
        expect((await elc.query.balanceOf(Alice)).output).to.equal(0);

        await api.rpc.europa.forwardToHeight(299);
        await delay(500);
        // Bob mint 20 relp tokens at block 300.
        await relp.tx.mint(Bob, 20);
        // elc-increase reward
        // totalCoinday: old + 10*(300-100)*3*1000;  coindayOf: 0;  elcBalanceOf: 0
        expect((await additional.query.totalCoinday()).output[0]).to.equal(6000000);
        expect((await additional.query.getCoindayInfo(Bob)).output.amount).to.equal(0);
        expect((await elc.query.balanceOf(Bob)).output).to.equal(0);

        await api.rpc.europa.forwardToHeight(399);
        await delay(500);
        // Charlie mint 40 relp tokens at block 400.
        await relp.tx.mint(Charlie, 40);
        // elc-increase reward
        // totalCoinday: old + (10+20)*(400-300)*3*1000;  coindayOf: 0;  elcBalanceOf: 0
        expect((await additional.query.totalCoinday()).output[0]).to.equal(15000000);
        expect((await additional.query.getCoindayInfo(Charlie)).output.amount).to.equal(0);
        expect((await elc.query.balanceOf(Charlie)).output).to.equal(0);

        await api.rpc.europa.forwardToHeight(499);
        await delay(500);
        // elc-increase reward
        // elc token increase 660 at block 500.
        await relp.tx.updateIncreaseAwards(660);
        // totalCoinday: old + (10+20+40)*(500-400)*3*1000
        // alice's coinday is old + 10*(500-100)*3*1000 = 12000000
        // bob's coinday is old + 20*(500-300)*3*1000 = 12000000
        // charlie's coinday is old + 40*(500-400)*3*1000 = 12000000
        // so the three accounts will get 220 each.
        expect((await additional.query.totalCoinday()).output[0]).to.equal(36000000);

        await api.rpc.europa.forwardToHeight(699);
        await delay(500);
        // Alice mint 50 relp tokens at block 700.
        await relp.tx.mint(Alice, 50);
        // elc-increase reward
        // totalCoinday: old + 70*(700-500)*3*1000;  coindayOf: 10*(700-100)*3*1000;  elcBalanceOf: 660*10**8/3
        expect((await additional.query.totalCoinday()).output[0]).to.equal(78000000);
        expect((await additional.query.getCoindayInfo(Alice)).output.amount).to.equal(18000000);
        expect((await elc.query.balanceOf(Alice)).output).to.equal(22000000000);

        await api.rpc.europa.forwardToHeight(749);
        await delay(500);
        // Bob mint 40 relp tokens at block 750.
        await relp.tx.mint(Bob, 40);
        // elc-increase reward
        // totalCoinday: old + 120*(750-700)*3*1000;  coindayOf: 20*(750-300)*3*1000;  elcBalanceOf: 660*10**8/3
        expect((await additional.query.totalCoinday()).output[0]).to.equal(96000000);
        expect((await additional.query.getCoindayInfo(Bob)).output.amount).to.equal(27000000);
        expect((await elc.query.balanceOf(Bob)).output).to.equal(22000000000);

        await api.rpc.europa.forwardToHeight(799);
        await delay(500);
        // Charlie mint 20 relp tokens at block 800.
        await relp.tx.mint(Charlie, 20);
        // elc-increase reward
        // totalCoinday: old + 160*(800-750)*3*1000;  coindayOf: 40*(800-400)*3*1000;  elcBalanceOf: 660*10**8/3
        expect((await additional.query.totalCoinday()).output[0]).to.equal(120000000);
        expect((await additional.query.getCoindayInfo(Charlie)).output.amount).to.equal(48000000);
        expect((await elc.query.balanceOf(Charlie)).output).to.equal(22000000000);


        await api.rpc.europa.forwardToHeight(2999);
        await delay(1000 * 2);
        // elc-increase reward
        // elc token increase 6000 at block 3000.
        await relp.tx.updateIncreaseAwards(6000);
        // totalCoinday: old + 180*(3000-800)*3*1000 = 1308000000
        // alice's coinday is old + 60*(3000-700)*3*1000 = 432000000
        // bob's coinday is old + 60*(3000-750)*3*1000 = 432000000
        // charlie's coinday is old + 60*(3000-800)*3*1000 = 444000000
        // so Alice, Bob will get 1981.65137614, Charlie is 2036.69724770.
        expect((await additional.query.totalCoinday()).output[0]).to.equal(1308000000);

        await api.rpc.europa.forwardToHeight(3099);
        await delay(500);
        // Charlie burn 60 at block 3100, decreaseCoinday=462000000
        await relp.tx.burn(Charlie, 60);
        // elc-increase reward
        // totalCoinday: old + 180*(3100-3000)*3*1000 - decreaseCoinday = 900000000;
        // coindayOf: old + 60*(3100-700)*3*1000 - all = 0;
        expect((await additional.query.totalCoinday()).output[0]).to.equal(900000000);
        expect((await additional.query.getCoindayInfo(Charlie)).output.amount).to.equal(0);
        expect((await elc.query.balanceOf(Charlie)).output).to.equal(22000000000 + 203669724770);

        await api.rpc.europa.forwardToHeight(3499);
        await delay(500);
        // elc-increase reward
        // elc token increase 15000 at block 3500.
        await relp.tx.updateIncreaseAwards(15000);
        // totalCoinday: old + 120*(3500-3100)*3*1000 = 1044000000
        // alice's coinday is old + 60*(3500-3000)*3*1000 = 522000000
        // bob's coinday is old + 60*(3500-3000)*3*1000 = 522000000
        // charlie's coinday is 0
        // so Alice, Bob will get 7500, Charlie is 7500.
        expect((await additional.query.totalCoinday()).output[0]).to.equal(1044000000);

        await api.rpc.europa.forwardToHeight(3518);
        await delay(500);
        // Bob burn 30 relp tokens at block 3519. decreaseCoinday=262710000
        await relp.tx.burn(Bob, 30);
        // elc-increase reward
        // totalCoinday: old + 120*(3519-3500)*3*1000 - decreaseCoinday = 788130000;
        // coindayOf: old + 60*(3519-750)*3*1000 - decreaseCoinday = 262710000;
        expect((await additional.query.totalCoinday()).output[0]).to.equal(788130000);
        expect((await additional.query.getCoindayInfo(Bob)).output.amount).to.equal(262710000);
        expect((await elc.query.balanceOf(Bob)).output).to.equal(22000000000 + 198165137614 + 750000000000);

        await api.rpc.europa.forwardToHeight(3599);
        await delay(500);
        // Alice mint 40 relp tokens at block 3600.
        await relp.tx.mint(Alice, 40);
        // elc-increase reward
        // totalCoinday: old + 90*(3600-3519)*3*1000 = 810000000;
        // coindayOf: old + 60*(3600-800)*3*1000 = 540000000;
        // if to the current block, Bob's coinday is 270000000 (810000000 - 540000000)
        expect((await additional.query.totalCoinday()).output[0]).to.equal(810000000);
        expect((await additional.query.getCoindayInfo(Alice)).output.amount).to.equal(540000000);
        expect((await elc.query.balanceOf(Alice)).output).to.equal(22000000000 + 198165137614 + 750000000000);

        // finally, let's see the three accounts' relp balance 
        expect((await relp.query.balanceOf(Alice)).output).to.equal(100);
        expect((await relp.query.balanceOf(Bob)).output).to.equal(30);
        expect((await relp.query.balanceOf(Charlie)).output).to.equal(0);
    });

    it('Distribute elc and elp award when transfering balance occurred', async () => {
        await api.rpc.europa.forwardToHeight(3999);
        await delay(500);
        // transer balance from Alice to Charlie at block 4000
        // decreaseCoinday=132000000(Alice's balance getting smaller)
        await relp.tx.transfer(Charlie, 20);
        // elc-increase reward
        // coindayOfAlice: (old + 100*(4000-3600)*3000)*80/100 = 528000000, Bob's coinday has not been updated.
        // totalCoinday: (old + 130*400*3000) - decreaseCoinday = 834000000, Bob's coinday is 306000000 at block 4000
        expect((await additional.query.getCoindayInfo(Alice)).output.amount).to.equal(528000000);
        expect((await additional.query.getCoindayInfo(Bob)).output.amount).to.equal(262710000);
        expect((await additional.query.getCoindayInfo(Charlie)).output.amount).to.equal(0);
        expect((await additional.query.totalCoinday()).output[0]).to.equal(834000000);

        // elc amount has no change because there is no elc-increase in block 3600-4000
        expect((await elc.query.balanceOf(Alice)).output).to.equal(970165137614);
        expect((await elc.query.balanceOf(Bob)).output).to.equal(970165137614);
        expect((await elc.query.balanceOf(Charlie)).output).to.equal(225669724770);

        await api.rpc.europa.forwardToHeight(4111);
        await delay(500);
        // elc-increase reward
        // elc token increase 18340 at block 4112.
        await relp.tx.updateIncreaseAwards(18340);
        // totalCoinday: old + 130*(4112-4000)*3*1000 = 877680000
        // alice's coinday is old + 80*(4112-4000)*3*1000 = 554880000
        // bob's coinday is old + 30*(4112-3519)*3*1000 = 316080000
        // charlie's coinday is old + 20*(4112-4000)*3*1000 = 6720000
        // so Alice will get 11594.77167076, Bob is 6604.80721903, Charlie is 140.42111019.
        expect((await additional.query.totalCoinday()).output[0]).to.equal(877680000);


        await api.rpc.europa.forwardToHeight(4499);
        await delay(500);
        // transer balance from Alice to Charlie at block 4500
        // decreaseCoinday=162000000(Alice's balance getting smaller)
        await relp.tx.transfer(Charlie, 20);
        // elc-increase reward
        // coindayOfAlice: (old + 80*(4500-4000)*3000)*60/80 = 486000000, Bob's coinday is 351000000(262710000).
        // totalCoinday: (old + 130*(4500-4112)*3000) - decreaseCoinday = 867000000, Charlie's coinday is 20*500*3000=30000000 
        expect((await additional.query.getCoindayInfo(Alice)).output.amount).to.equal(486000000);
        expect((await additional.query.getCoindayInfo(Bob)).output.amount).to.equal(262710000);
        expect((await additional.query.getCoindayInfo(Charlie)).output.amount).to.equal(30000000);
        expect((await additional.query.totalCoinday()).output[0]).to.equal(867000000);
        expect((await elc.query.balanceOf(Alice)).output).to.equal(970165137614 + 1159477167076);
        expect((await elc.query.balanceOf(Charlie)).output).to.equal(225669724770 + 14042111019);

        await api.rpc.europa.forwardToHeight(4999);
        await delay(500);
        // elc-increase reward
        // elc token increase 20000 at block 5000.
        await relp.tx.updateIncreaseAwards(20000);
        // totalCoinday: old + 130*(5000-4500)*3*1000 = 1062000000
        // alice's coinday is old + 60*(5000-4500)*3*1000 = 576000000
        // bob's coinday is old + 30*(4112-3519)*3*1000 = 396000000
        // charlie's coinday is old + 20*(4112-4000)*3*1000 = 90000000 
        // so Alice will get 10847.45762711, Bob is 7457.62711864, Charlie is 1694.91525423.
        expect((await additional.query.totalCoinday()).output[0]).to.equal(1062000000);

        // set all accounts' balance zero to see if total reward is the sum of all accounts' reward
        await api.rpc.europa.forwardToHeight(5199);
        await delay(500);
        // Bob burn 30 relp tokens at block 5200. decreaseCoinday=414000000
        await relp.tx.burn(Bob, 30);
        // elc-increase reward
        // totalCoinday: old + 130*(5200-5000)*3*1000 - decreaseCoinday = 726000000;
        // coindayOf: (old + 30*(5200-3519)*3*1000)*0/30 = 0;
        expect((await additional.query.totalCoinday()).output[0]).to.equal(726000000);
        expect((await additional.query.getCoindayInfo(Bob)).output.amount).to.equal(0);
        expect((await elc.query.balanceOf(Bob)).output).to.equal(970165137614 + 660480721903 + 745762711864);

        await api.rpc.europa.forwardToHeight(5599);
        await delay(500);
        // Alice burn 60 relp tokens at block 5600. decreaseCoinday=684000000
        await relp.tx.burn(Alice, 60);
        // elc-increase reward
        // totalCoinday: old + 100*(5600-5200)*3*1000 - decreaseCoinday = 162000000;
        // coindayOf: (old + 30*(5600-4500)*3*1000)*0/60 = 0;
        expect((await additional.query.totalCoinday()).output[0]).to.equal(162000000);
        expect((await additional.query.getCoindayInfo(Alice)).output.amount).to.equal(0);
        expect((await elc.query.balanceOf(Alice)).output).to.equal(970165137614 + 1159477167076 + 1084745762711);

        await api.rpc.europa.forwardToHeight(5799);
        await delay(500);
        // Charlie burn 40 relp tokens at block 5800. decreaseCoinday=186000000
        await relp.tx.burn(Charlie, 40);
        // elc-increase reward
        // totalCoinday: old + 120*(5800-5600)*3*1000 - decreaseCoinday = 0;
        // coindayOf: (old + 30*(5800-4500)*3*1000)*0/60 = 0;
        expect((await additional.query.totalCoinday()).output[0]).to.equal(0);
        expect((await additional.query.getCoindayInfo(Charlie)).output.amount).to.equal(0);
        expect((await elc.query.balanceOf(Charlie)).output).to.equal(225669724770 + 14042111019 + 169491525423);

        const totalELCReward = await additional.query.totalReward();
        console.log("total elc increase: ", totalELCReward.output.toString());
        const rewardAliceELC = await additional.query.rewardOf(Alice);
        const rewardBobELC = await additional.query.rewardOf(Bob);
        const rewardCharlieELC = await additional.query.rewardOf(Charlie);
        console.log("All accounts' reward:", 
            (parseFloat(rewardAliceELC.output) + 
            parseFloat(rewardBobELC.output) + 
            parseFloat(rewardCharlieELC.output)) / 1e8 );
    });
});
