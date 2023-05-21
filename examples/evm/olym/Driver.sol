//SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {AxelarExecutable} from "@axelar-network/axelar-gmp-sdk-solidity/contracts/executable/AxelarExecutable.sol";
import {IAxelarGateway} from "@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGateway.sol";
import {IERC20} from "@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IERC20.sol";
import {IAxelarGasService} from "@axelar-network/axelar-gmp-sdk-solidity/contracts/interfaces/IAxelarGasService.sol";

contract Driver is AxelarExecutable {
    address public immutable parentChainGatewayContractAddress =
        0xe432150cce91c13a887f7D836923d5597adD8E31;
    string public tokenSymbol = "aUSDC";
    address public tokenAddress;

    address public immutable axelarGateway;

    address public immutable owner;
    struct Beneficiary {
        address addr;
        uint weight;
    }
    Beneficiary[] public beneficiaries;

    string[] public siblings;

    uint256 public ownerLastAccess;
    uint256 public killTime;
    bool public killed;

    IAxelarGasService public immutable gasService;

    constructor(
        address gateway_,
        address gasReceiver_,
        string[] memory siblings_,
        uint256 killTime_,
        address tokenAddress_
    ) AxelarExecutable(gateway_) {
        axelarGateway = gateway_;
        gasService = IAxelarGasService(gasReceiver_);

        tokenAddress = tokenAddress_;

        owner = msg.sender;
    
        siblings = siblings_;

        ownerLastAccess = block.number;
        killTime = killTime_;
        killed = false;
    }

    function addBeneficiary(address addr, uint weight) external {
        if (msg.sender != owner) {
            return;
        }

        beneficiaries.push(Beneficiary(addr, weight));
    }

    function updateTimeToKill() external {
        if (killed || msg.sender != owner) {
            return;
        }

        ownerLastAccess = block.number;
    }

    function kill() external payable {
        if (ownerLastAccess + killTime > block.number) {
            return;
        }

        killed = true;

        if (axelarGateway == parentChainGatewayContractAddress && beneficiaries.length > 0) {
            for (uint i = 0; i < siblings.length; i++) {
                gateway.callContract(siblings[i], abi.encodePacked(address(this)), abi.encode());
            }

            return;
        }
    }

    function withdraw() external payable {
        uint maxWeight = 0;
        uint weight = 0;
        uint index = 0;

        for (uint i = 0; i < beneficiaries.length; i++) {
            maxWeight += beneficiaries[i].weight;

            if (beneficiaries[i].addr == msg.sender) {
                weight = beneficiaries[i].weight;
                index = i;
            }
        }

        if (maxWeight == 0 || weight == 0) {
            return;
        }

        beneficiaries[index].weight = 0;

        IERC20(tokenAddress).transfer(msg.sender, IERC20(tokenAddress).balanceOf(address(this)) * weight / maxWeight);
    }

    function _executeWithToken(
        string calldata sourceChain,
        string calldata sourceAddress,
        bytes calldata payload,
        string calldata tokenSymbol,
        uint256 amount
    ) internal override {
        killed = true;

        gateway.sendToken(sourceChain, sourceAddress, tokenSymbol, IERC20(tokenAddress).balanceOf(address(this)));
    }
}
