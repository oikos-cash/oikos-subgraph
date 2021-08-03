import { Oikos } from '../generated/Liquidations/Oikos';

import { AddressResolver } from '../generated/Liquidations/AddressResolver';

import {
  AccountFlaggedForLiquidation as AccountFlaggedForLiquidationEvent,
  AccountRemovedFromLiquidation as AccountRemovedFromLiquidationEvent,
  Liquidations,
} from '../generated/Liquidations/Liquidations';

import { AccountLiquidated as AccountLiquidatedEvent } from '../generated/Liquidations/Oikos';

import { AccountFlaggedForLiquidation, AccountRemovedFromLiquidation, AccountLiquidated } from '../generated/schema';

import { strToBytes } from './common';

export function handleAccountFlaggedForLiquidation(event: AccountFlaggedForLiquidationEvent): void {
  let liquidationsContract = Liquidations.bind(event.address);
  let resolver = AddressResolver.bind(liquidationsContract.resolver());
  let oikos = Oikos.bind(resolver.getAddress(strToBytes('Synthetix', 32)));
  let accountFlaggedForLiquidation = new AccountFlaggedForLiquidation(
    event.params.deadline.toString() + '-' + event.params.account.toHex(),
  );
  accountFlaggedForLiquidation.account = event.params.account;
  accountFlaggedForLiquidation.deadline = event.params.deadline;
  accountFlaggedForLiquidation.collateralRatio = oikos.collateralisationRatio(event.params.account);
  accountFlaggedForLiquidation.collateral = oikos.collateral(event.params.account);
  accountFlaggedForLiquidation.liquidatableNonEscrowOKS = oikos.balanceOf(event.params.account);
  accountFlaggedForLiquidation.save();
}

export function handleAccountRemovedFromLiquidation(event: AccountRemovedFromLiquidationEvent): void {
  let accountRemovedFromLiquidation = new AccountRemovedFromLiquidation(
    event.params.time.toString() + '-' + event.params.account.toHex(),
  );
  accountRemovedFromLiquidation.account = event.params.account;
  accountRemovedFromLiquidation.time = event.params.time;
  accountRemovedFromLiquidation.save();
}

export function handleAccountLiquidated(event: AccountLiquidatedEvent): void {
  let entity = new AccountLiquidated(event.transaction.hash.toHex() + '-' + event.logIndex.toString());

  entity.account = event.params.account;
  entity.snxRedeemed = event.params.oksRedeemed;
  entity.amountLiquidated = event.params.amountLiquidated;
  entity.liquidator = event.params.liquidator;
  entity.time = event.block.timestamp;

  entity.save();
}