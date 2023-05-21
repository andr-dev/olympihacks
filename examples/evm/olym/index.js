'use strict';

const { getDefaultProvider, Contract, Wallet, utils: { keccak256, defaultAbiCoder } } = require('ethers');
const {
    utils: { deployContract },
} = require('@axelar-network/axelar-local-dev');

const Driver = rootRequire(
    './artifacts/examples/evm/olym/Driver.sol/Driver.json',
);
const Gateway = rootRequire(
    './artifacts/@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGateway.sol/IAxelarGateway.json',
);
const IERC20 = rootRequire('./artifacts/@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol/IERC20.json');

async function deploy(chain, wallet) {
    console.log(`Deploying Olym for ${chain.name} (${chain.chainId}).`);
    const provider = getDefaultProvider(chain.rpc);
    chain.wallet = wallet.connect(provider);
    const gateway = new Contract(chain.gateway, Gateway.abi, chain.wallet);
    const usdcAddress = await gateway.tokenAddresses('aUSDC');
    chain.contract = await deployContract(
		wallet,
		Driver,
		[
			chain.gateway,
			chain.gasService,
			[2500, 2501, 2502, 2503, 2504].filter((x) => x != chain.chainId).map((x) => `${x}`),
			1,
			usdcAddress,
		],
	);
    chain.usdc = new Contract(usdcAddress, IERC20.abi, chain.wallet);
    console.log(`Deployed Olym for ${chain.name} at ${chain.contract.address}.`);
}

async function execute(chains, wallet, options) {
    const args = options.args || [];
    const { source, destination, calculateBridgeFee } = options;
    const amount = Math.floor(parseFloat(args[2])) * 1e6 || 10e6;
    const accounts = args.slice(3);

    if (accounts.length === 0) accounts.push(wallet.address);

	const provider = chains.filter((x) => x.chainId == 2503)[0].provider;

	const beneficiary1 = new Wallet(keccak256(defaultAbiCoder.encode(['string'], ['beneficiary1'])), provider);
	const beneficiary2 = new Wallet(keccak256(defaultAbiCoder.encode(['string'], ['beneficiary2'])), provider);
	const beneficiary3 = new Wallet(keccak256(defaultAbiCoder.encode(['string'], ['beneficiary3'])), provider);

    async function logAccountBalances() {
        for (const account of accounts) {
            console.log(`${account} has ${(await destination.usdc.balanceOf(account)) / 1e6} aUSDC`);
        }
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    console.log('--- Initially ---');
    await logAccountBalances();

    const fee = await calculateBridgeFee(source, destination);

    const balance = await destination.usdc.balanceOf(accounts[0]);

    const approveTx = await source.usdc.approve(source.contract.address, amount);
    await approveTx.wait();

	const destinationWallet = wallet.connect(provider);

	await destinationWallet.sendTransaction({ to: beneficiary1.address, value: BigInt(1e18) }).then((tx) => tx.wait());

    console.log('--- After Bridge ---');
    await logAccountBalances();

    const sendTx1 = await source.contract.addBeneficiary(beneficiary1.address, 1);
    await sendTx1.wait();

    const sendTx2 = await source.contract.addBeneficiary(beneficiary2.address, 3);
    await sendTx2.wait();

    const sendTx3 = await source.contract.addBeneficiary(beneficiary2.address, 6);
    await sendTx3.wait();

    console.log('--- After Beneficiaries ---');
    await logAccountBalances();

    const killTx = await source.contract.kill();
    await killTx.wait();

    console.log('--- After Kill ---');
    await logAccountBalances();

    while (true) {
        const updatedBalance = await destination.usdc.balanceOf(accounts[0]);

        if (updatedBalance.gt(balance)) {
            break;
        }

        await sleep(1000);
    }

    console.log('--- After ---');
    await logAccountBalances();
}

module.exports = {
    deploy,
    execute,
};
