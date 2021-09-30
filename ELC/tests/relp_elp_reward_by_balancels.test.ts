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
        // about elp block reward, deltaReward = 0
        // totalReward: 0
        // accElpPershare: 0
        // rewardOf: 0
        // rewardDebtOf: 0
        expect((await reward.query.totalReward()).output).to.equal(0);
        expect((await reward.query.accElpPershare()).output).to.equal(0);
        expect((await reward.query.rewardOf(Alice)).output).to.equal(0);
        expect((await reward.query.rewardDebtOf(Alice)).output).to.equal(0);


        await api.rpc.europa.forwardToHeight(299);
        await delay(500);
        // Bob mint 20 relp tokens at block 300.
        await relp.tx.mint(Bob, 20);
        // elc-increase reward
        // totalCoinday: old + 10*(300-100)*3*1000;  coindayOf: 0;  elcBalanceOf: 0
        expect((await additional.query.totalCoinday()).output[0]).to.equal(6000000);
        expect((await additional.query.getCoindayInfo(Bob)).output.amount).to.equal(0);
        expect((await elc.query.balanceOf(Bob)).output).to.equal(0);
        // elp block reward, deltaReward = (300-100)*day_award/28800 - 0=13888888888
        // totalReward: old + deltaReward = 13888888888
        // accElpPershare: old + deltaReward/10 = 1388888888
        // rewardOf: 0
        // rewardDebtOf: accEP*20=27777777760
        expect((await reward.query.totalReward()).output).to.equal(13888888888);
        expect((await reward.query.accElpPershare()).output).to.equal(1388888888);
        expect((await reward.query.rewardOf(Bob)).output).to.equal(0);
        expect((await reward.query.rewardDebtOf(Bob)).output).to.equal(27777777760);

        await api.rpc.europa.forwardToHeight(399);
        await delay(500);
        // Charlie mint 40 relp tokens at block 400.
        await relp.tx.mint(Charlie, 40);
        // elc-increase reward
        // totalCoinday: old + (10+20)*(400-300)*3*1000;  coindayOf: 0;  elcBalanceOf: 0
        expect((await additional.query.totalCoinday()).output[0]).to.equal(15000000);
        expect((await additional.query.getCoindayInfo(Charlie)).output.amount).to.equal(0);
        expect((await elc.query.balanceOf(Charlie)).output).to.equal(0);
        // elp block reward, deltaReward = (400-100)*day_award/28800 - (300-100)*day_award/28800=6944444445
        // totalReward: old + dR = 20833333333
        // accElpPershare: old + dR/30 =1620370369 
        // rewardOf: 0
        // rewardDebtOf: accEP*40=64814814760
        expect((await reward.query.totalReward()).output).to.equal(20833333333);
        expect((await reward.query.accElpPershare()).output).to.equal(1620370369);
        expect((await reward.query.rewardOf(Charlie)).output).to.equal(0);
        expect((await reward.query.rewardDebtOf(Charlie)).output).to.equal(64814814760);

        await api.rpc.europa.forwardToHeight(499);
        await delay(500);
        // elc-increase reward
        // elc token increase 660 at block 500.
        await relp.tx.relpUpdateAwards(660);
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
        // elp block reward, deltaReward = (700-100)*day_award/28800 - (400-100)*day_award/28800=20833333333
        // totalReward: old + dR = 41666666666
        // accElpPershare: old + dR/(10+20+40) = 1917989416
        // rewardOf: 0 + accEP*10 = 19179894160 
        // rewardDebtOf: accEP*(10+50) = 115079364960 
        expect((await reward.query.totalReward()).output).to.equal(41666666666);
        expect((await reward.query.accElpPershare()).output).to.equal(1917989416);
        expect((await reward.query.rewardOf(Alice)).output).to.equal(19179894160);
        expect((await reward.query.rewardDebtOf(Alice)).output).to.equal(115079364960);

        await api.rpc.europa.forwardToHeight(749);
        await delay(500);
        // Bob mint 40 relp tokens at block 750.
        await relp.tx.mint(Bob, 40);
        // elc-increase reward
        // totalCoinday: old + 120*(750-700)*3*1000;  coindayOf: 20*(750-300)*3*1000;  elcBalanceOf: 660*10**8/3
        expect((await additional.query.totalCoinday()).output[0]).to.equal(96000000);
        expect((await additional.query.getCoindayInfo(Bob)).output.amount).to.equal(27000000);
        expect((await elc.query.balanceOf(Bob)).output).to.equal(22000000000);
        // elp block reward, deltaReward = (750-100)*day_award/28800 - (700-100)*day_award/28800=3472222222
        // totalReward: old + deltaReward = 45138888888
        // accElpPershare: old + deltaReward/120 = 1946924601
        // rewardOf: 0 + accep*20 - Bob's rewardDebt = 11160714260
        // rewardDebtOf: accEP*60=116815476060
        expect((await reward.query.totalReward()).output).to.equal(45138888888);
        expect((await reward.query.accElpPershare()).output).to.equal(1946924601);
        expect((await reward.query.rewardOf(Bob)).output).to.equal(11160714260);
        expect((await reward.query.rewardDebtOf(Bob)).output).to.equal(116815476060);

        await api.rpc.europa.forwardToHeight(799);
        await delay(500);
        // Charlie mint 20 relp tokens at block 800.
        await relp.tx.mint(Charlie, 20);
        // elc-increase reward
        // totalCoinday: old + 160*(800-750)*3*1000;  coindayOf: 40*(800-400)*3*1000;  elcBalanceOf: 660*10**8/3
        expect((await additional.query.totalCoinday()).output[0]).to.equal(120000000);
        expect((await additional.query.getCoindayInfo(Charlie)).output.amount).to.equal(48000000);
        expect((await elc.query.balanceOf(Charlie)).output).to.equal(22000000000);
        // elp block reward, deltaReward = (800-100)*day_award/28800 - (750-100)*day_award/28800=3472222223
        // totalReward: old + dR =48611111111 
        // accElpPershare: old + dR/160 = 1968625989
        // rewardOf: 0 + accep*40 - Charlie's rewardDebt = 13930224800
        // rewardDebtOf: accEP*60=118117559340
        expect((await reward.query.totalReward()).output).to.equal(48611111111);
        expect((await reward.query.accElpPershare()).output).to.equal(1968625989);
        expect((await reward.query.rewardOf(Charlie)).output).to.equal(13930224800);
        expect((await reward.query.rewardDebtOf(Charlie)).output).to.equal(118117559340);


        await api.rpc.europa.forwardToHeight(2999);
        await delay(1000 * 2);
        // elc-increase reward
        // elc token increase 6000 at block 3000.
        await relp.tx.relpUpdateAwards(6000);
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
        // elp block reward, deltaReward = (3100-100)*day_award/28800 - (800-100)*day_award/28800=159722222222
        // totalReward: old + dR = 208333333333
        // accElpPershare: old + dR/180 = 2855971668
        // rewardOf: old + accep*60 - Charlie's rewardDebt =67170965540 
        // rewardDebtOf: accEP*0 = 0
        expect((await reward.query.totalReward()).output).to.equal(208333333333);
        expect((await reward.query.accElpPershare()).output).to.equal(2855971668);
        expect((await reward.query.rewardOf(Charlie)).output).to.equal(67170965540);
        expect((await reward.query.rewardDebtOf(Charlie)).output).to.equal(0);

        await api.rpc.europa.forwardToHeight(3499);
        await delay(500);
        // elc-increase reward
        // elc token increase 15000 at block 3500.
        await relp.tx.relpUpdateAwards(15000);
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
        // elp block reward, deltaReward = (3519-100)*day_award/28800 - (3100-100)*day_award/28800=29097222222
        // totalReward: old + deltaReward =237430555555 
        // accElpPershare: old + deltaReward/120 = 3098448519
        // rewardOf: old + accep*60 - Bob's rewardDebt =80252149340
        // rewardDebtOf: accEP*30=92953455570
        expect((await reward.query.totalReward()).output).to.equal(237430555555);
        expect((await reward.query.accElpPershare()).output).to.equal(3098448519);
        expect((await reward.query.rewardOf(Bob)).output).to.equal(80252149340);
        expect((await reward.query.rewardDebtOf(Bob)).output).to.equal(92953455570);

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
        // elp block reward, deltaReward = (3600-100)*day_award/28800 - (3519-100)*day_award/28800=5625000000
        // totalReward: old + dR =243055555555 
        // accElpPershare: old + dR/90 =3160948519 
        // rewardOf: old + accEP*60 - Alice's rewardDebt =93757440340 
        // rewardDebtOf: accEP*100 =316094851900 
        expect((await reward.query.totalReward()).output).to.equal(243055555555);
        expect((await reward.query.accElpPershare()).output).to.equal(3160948519);
        expect((await reward.query.rewardOf(Alice)).output).to.equal(93757440340);
        expect((await reward.query.rewardDebtOf(Alice)).output).to.equal(316094851900);

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
        // elp block reward, deltaReward = (4000-100)*day_award/28800 - (3600-100)*day_award/28800=27777777778 
        // totalReward: old + dR =270833333333 
        // accElpPershare: old + dR/130 =3374623732 
        // rewardOfAlice: old + accEP*100 - Alice's rewardDebt =115124961640 
        // rewardDebtOfAlice: accEP*80 =269969898560
        // rewardOfCharlie: old + accEP*0 - Charlie's rewardDebt = old = 67170965540
        // rewardDebtOfCharlie: accEP*20 =67492474640
        expect((await reward.query.totalReward()).output).to.equal(270833333333);
        expect((await reward.query.accElpPershare()).output).to.equal(3374623732);
        expect((await reward.query.rewardOf(Alice)).output).to.equal(115124961640);
        expect((await reward.query.rewardDebtOf(Alice)).output).to.equal(269969898560);
        expect((await reward.query.rewardOf(Charlie)).output).to.equal(67170965540);
        expect((await reward.query.rewardDebtOf(Charlie)).output).to.equal(67492474640);

        // elc amount has no change because there is no elc-increase in block 3600-4000
        expect((await elc.query.balanceOf(Alice)).output).to.equal(970165137614);
        expect((await elc.query.balanceOf(Bob)).output).to.equal(970165137614);
        expect((await elc.query.balanceOf(Charlie)).output).to.equal(225669724770);

        await api.rpc.europa.forwardToHeight(4111);
        await delay(500);
        // elc-increase reward
        // elc token increase 18340 at block 4112.
        await relp.tx.relpUpdateAwards(18340);
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
        // elp block reward, deltaReward = (4500-100)*day_award/28800 - (4000-100)*day_award/28800=34722222222 
        // totalReward: old + dR = 305555555555
        // accElpPershare: old + dR/130 =3641717749 
        // rewardOfAlice: old + accEP*80 - Alice's rewardDebt =136492483000 
        // rewardDebtOfAlice: accEP*60 =218503064940 
        // rewardOfCharlie: old + accEP*20 - Charlie's rewardDebt =72512845880 
        // rewardDebtOfCharlie: accEP*40 =145668709960 
        expect((await reward.query.totalReward()).output).to.equal(305555555555);
        expect((await reward.query.accElpPershare()).output).to.equal(3641717749);
        expect((await reward.query.rewardOf(Alice)).output).to.equal(136492483000);
        expect((await reward.query.rewardDebtOf(Alice)).output).to.equal(218503064940);
        expect((await reward.query.rewardOf(Charlie)).output).to.equal(72512845880);
        expect((await reward.query.rewardDebtOf(Charlie)).output).to.equal(145668709960);

        await api.rpc.europa.forwardToHeight(4999);
        await delay(500);
        // elc-increase reward
        // elc token increase 20000 at block 5000.
        await relp.tx.relpUpdateAwards(20000);
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
        // elp block reward, deltaReward = (5200-100)*day_award/28800 - (4500-100)*day_award/28800=48611111111 
        // totalReward: old + deltaReward =354166666666 
        // accElpPershare: old + deltaReward/130 =4015649372 
        // rewardOf: old + accep*30 - Bob's rewardDebt =107768174930 
        // rewardDebtOf: accEP*0=0
        expect((await reward.query.totalReward()).output).to.equal(354166666666);
        expect((await reward.query.accElpPershare()).output).to.equal(4015649372);
        expect((await reward.query.rewardOf(Bob)).output).to.equal(107768174930);
        expect((await reward.query.rewardDebtOf(Bob)).output).to.equal(0);

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
        // elp block reward, deltaReward = (5600-100)*day_award/28800 - (5200-100)*day_award/28800=27777777778 
        // totalReward: old + deltaReward =381944444444 
        // accElpPershare: old + deltaReward/100 = 4293427149 
        // rewardOf: old + accep*60 - Bob's rewardDebt = 175595047000
        // rewardDebtOf: accEP*0=0
        expect((await reward.query.totalReward()).output).to.equal(381944444444);
        expect((await reward.query.accElpPershare()).output).to.equal(4293427149);
        expect((await reward.query.rewardOf(Alice)).output).to.equal(175595047000);
        expect((await reward.query.rewardDebtOf(Alice)).output).to.equal(0);

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
        // elp block reward, deltaReward = (5800-100)*day_award/28800 - (5600-100)*day_award/28800=13888888889
        // totalReward: old + dR =395833333333 
        // accElpPershare: old + dR/40 =4640649371 
        // rewardOf: old + accep*40 - Charlie's rewardDebt =112470110760 
        // rewardDebtOf: accEP*0 = 0
        expect((await reward.query.totalReward()).output).to.equal(395833333333);
        expect((await reward.query.accElpPershare()).output).to.equal(4640649371);
        expect((await reward.query.rewardOf(Charlie)).output).to.equal(112470110760);
        expect((await reward.query.rewardDebtOf(Charlie)).output).to.equal(0);
    });

    it("if totalReward is the sum of all accounts' reward", async () => {
        const totalReward = await reward.query.totalReward();
        console.log("Total ELP Reward: ", totalReward.output.toString());

        const rewardA = await reward.query.rewardOf(Alice);
        const rewardB = await reward.query.rewardOf(Bob);
        const rewardC = await reward.query.rewardOf(Charlie);
        console.log("All accounts' reward: ", parseInt(rewardA.output) + parseInt(rewardB.output) + parseInt(rewardC.output));
    });
});
