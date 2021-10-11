import {expect } from 'chai';
import {artifacts, network, patract } from 'redspot';

const {getContractFactory, getRandomSigner, Contract} = patract;
const {api, getAddresses, getSigners } = network;

// address
let Alice: string;
let Bob: string;
let Charlie: string;
let elc: typeof Contract;
let reward: typeof Contract;
let additional: typeof Contract;
let relp: typeof Contract;
let govern: typeof Contract;

describe('\nProposals and Votes', () => {
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

	describe('\nContract required for deployment', async function () {
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

		it('deploy govern contract', async () => {
			const governFactory = await getContractFactory('govern', Alice);
			govern = await governFactory.deploy('new', relp.address);
			expect(govern.address).to.exist;
		});
	});
});