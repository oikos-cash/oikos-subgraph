import { Oikos as OKS, Transfer as TransferEvent } from '../generated/Oikos/Oikos';
import { TargetUpdated as TargetUpdatedEvent } from '../generated/ProxyOikos/Proxy';
import { sUSD32 } from './common';
import { OikosState } from '../generated/Oikos/OikosState';

import {
  Synth,
  Transfer as SynthTransferEvent,
  Issued as IssuedEvent,
  Burned as BurnedEvent,
} from '../generated/SynthsUSD/Synth';
import { 
        Oikos, 
        Transfer, 
        Issued, 
        Burned, 
        Issuer, 
        ProxyTargetUpdated, 
        OKSHolder,
        SynthHolder, 
        DebtSnapshot,  
        TotalActiveStaker, 
        TotalDailyActiveStaker, 
        ActiveStaker 
      } from '../generated/schema';

import { store, BigInt, Address } from '@graphprotocol/graph-ts';

let contracts = new Map<string, string>();
contracts.set('escrow', '0x971e78e0c92392a4e39099835cf7e6ab535b2227');
contracts.set('rewardEscrow', '0xb671f2210b1f6621a2607ea63e6b2dc3e2464d1f');

function getMetadata(): Oikos {
  let oikos = Oikos.load('1');

  if (oikos == null) {
    oikos = new Oikos('1');
    oikos.issuers = BigInt.fromI32(0);
    oikos.oksHolders = BigInt.fromI32(0);
    oikos.save();
  }

  return oikos as Oikos;
}

function decrementMetadata(field: string): void {
  let metadata = getMetadata();
  if (field == 'issuers') {
    metadata.issuers = metadata.issuers.minus(BigInt.fromI32(1));
  } else if (field == 'oksHolders') {
    metadata.oksHolders = metadata.oksHolders.minus(BigInt.fromI32(1));
  }
  metadata.save();
}

function incrementMetadata(field: string): void {
  let metadata = getMetadata();
  if (field == 'issuers') {
    metadata.issuers = metadata.issuers.plus(BigInt.fromI32(1));
  } else if (field == 'oksHolders') {
    metadata.oksHolders = metadata.oksHolders.plus(BigInt.fromI32(1));
  }
  metadata.save();
}

function trackIssuer( account: Address): void {
  let existingIssuer = Issuer.load(account.toHex());
  if (existingIssuer == null) {
    incrementMetadata('issuers');
  }
  let issuer = new Issuer(account.toHex());
  issuer.save();
}

function trackOKSHolder(oksContract: Address, account: Address, timestamp:BigInt, block: BigInt): void {
  let holder = account.toHex();
  // ignore escrow accounts
  if (contracts.get('escrow') == holder || contracts.get('rewardEscrow') == holder) {
    return;
  }
  let existingOKSHolder = OKSHolder.load(account.toHex());
  if (existingOKSHolder == null) {
    incrementMetadata('oksHolders');
  }
  let oksHolder = new OKSHolder(account.toHex());
  let oikos = OKS.bind(oksContract);
  oksHolder.balanceOf = oikos.balanceOf(account);

  let transferableOikosTry = oikos.try_transferableOikos(account);
  if (!transferableOikosTry.reverted) {
    oksHolder.transferable = transferableOikosTry.value;
  }  
  oksHolder.block = block;
  oksHolder.timestamp = timestamp;
  let oikosCollateralTry = oikos.try_collateral(account);
  if (!oikosCollateralTry.reverted) {
    oksHolder.collateral = oikosCollateralTry.value;
  }

  let stateTry = oikos.try_tokenState();
  if (!stateTry.reverted) {
    let oikosStateAddr = Address.fromString("0x5065DfD3598D6Dfdc43E6621FAe5ECF78aadbeC1");
    let oikosState = OikosState.bind(oikosStateAddr);
    let issuanceData = oikosState.issuanceData(account); 
    oksHolder.initialDebtOwnership = issuanceData.value0;
    let debtLedgerTry = oikosState.try_debtLedger(issuanceData.value1);
    if (!debtLedgerTry.reverted) {
      oksHolder.debtEntryAtIndex = debtLedgerTry.value;
    }
  }
  
  if (
    (existingOKSHolder == null && oksHolder.balanceOf > BigInt.fromI32(0)) ||
    (existingOKSHolder != null &&
      existingOKSHolder.balanceOf == BigInt.fromI32(0) &&
      oksHolder.balanceOf > BigInt.fromI32(0))
  ) {
    incrementMetadata('oksHolders');
  } else if (
    existingOKSHolder != null &&
    existingOKSHolder.balanceOf > BigInt.fromI32(0) &&
    oksHolder.balanceOf == BigInt.fromI32(0)
  ) {
    decrementMetadata('oksHolders');
  }
    
    
  oksHolder.save();
}

export function handleTransferOKS(event: TransferEvent): void {
  let entity = new Transfer(event.transaction.hash.toHex() + '-' + event.logIndex.toString());
  entity.source = 'OKS';
  entity.from = event.params.from;
  entity.to = event.params.to;
  entity.value = event.params.value;
  entity.timestamp = event.block.timestamp;
  entity.block = event.block.number;
  entity.save();

  trackOKSHolder(event.address, event.params.from, event.block.timestamp, event.block.number);
  trackOKSHolder(event.address, event.params.to, event.block.timestamp, event.block.number);
 
}

function trackSynthHolder(contract: Synth, source: string, account: Address, block: BigInt, timestamp: BigInt): void {
  let entityID = account.toHex() + '-' + source;
  let entity = SynthHolder.load(entityID);
  if (entity == null) {
    entity = new SynthHolder(entityID);
  }
  entity.synth = source;
  entity.balanceOf = contract.balanceOf(account);
  entity.account = account;
  entity.block = block;
  entity.timestamp = timestamp;
  entity.source = source;  
  entity.save();
}

export function handleTransferSynth(event: SynthTransferEvent): void {
  let contract = Synth.bind(event.address);
  let entity = new Transfer(event.transaction.hash.toHex() + '-' + event.logIndex.toString());

  let currencyKeyTry = contract.try_currencyKey();
  if (!currencyKeyTry.reverted) {
    entity.source = currencyKeyTry.value.toString();
  } else {
    entity.source = "sUSD";
  }
  
  entity.from = event.params.from;
  entity.to = event.params.to;
  entity.value = event.params.value;
  entity.timestamp = event.block.timestamp;
  entity.block = event.block.number;
  entity.save();

  trackSynthHolder(contract, entity.source, event.params.from,  event.block.number, event.block.timestamp);
  trackSynthHolder(contract, entity.source, event.params.to,  event.block.number, event.block.timestamp);  
}

export function handleIssuedsUSD(event: IssuedEvent): void {
  let entity = new Issued(event.transaction.hash.toHex() + '-' + event.logIndex.toString());
  entity.account = event.params.account;
  entity.value = event.params.value;
  entity.source = 'sUSD';
  entity.timestamp = event.block.timestamp;
  entity.block = event.block.number;
  entity.gasPrice = event.transaction.gasPrice;
  entity.save();
  //let synthContract = Synth.bind(event.address);
  trackIssuer( event.transaction.from);
  trackActiveStakersI(event);
}

export function handleBurnedsUSD(event: BurnedEvent): void {
  let entity = new Burned(event.transaction.hash.toHex() + '-' + event.logIndex.toString());
  entity.account = event.params.account;
  entity.value = event.params.value;
  entity.source = 'sUSD';
  entity.timestamp = event.block.timestamp;
  entity.block = event.block.number;
  entity.gasPrice = event.transaction.gasPrice;
  entity.save();
  trackDebtSnapshot(event);
  trackActiveStakersB(event);
}

export function handleProxyTargetUpdated(event: TargetUpdatedEvent): void {
  let entity = new ProxyTargetUpdated(event.transaction.hash.toHex() + '-' + event.logIndex.toString());
  entity.source = 'Oikos'; // hardcoded for now
  entity.newTarget = event.params.newTarget;
  entity.block = event.block.number;
  entity.tx = event.transaction.hash;
  entity.save();
}

function trackDebtSnapshot(event: BurnedEvent): void {
  let oksContract = event.transaction.to as Address;
  let account = event.transaction.from;

  // ignore escrow accounts
  if (contracts.get('escrow') == account.toHex() || contracts.get('rewardEscrow') == account.toHex()) {
    return;
  }

  let entity = new DebtSnapshot(event.transaction.hash.toHex() + '-' + event.logIndex.toString());
  entity.block = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.account = account;

 
  let oikos = OKS.bind(oksContract);
  let balanceOfTry = oikos.try_balanceOf(account);
  if (!balanceOfTry.reverted) {
    entity.balanceOf = balanceOfTry.value;
  }

  let collateralTry = oikos.try_collateral(account);
  if (!collateralTry.reverted) {
    entity.collateral = collateralTry.value;
  }
 
  //entity.debtBalanceOf = oikos.debtBalanceOf(account, sUSD32);
  let debtBalanceOfTry = oikos.try_debtBalanceOf(account, sUSD32);
  if (!debtBalanceOfTry.reverted) {
    entity.debtBalanceOf = debtBalanceOfTry.value;
  }

  entity.save();
}

function trackActiveStakersB(event: BurnedEvent): void {
  let isBurn = true;
  let account = event.transaction.from;
  let timestamp = event.block.timestamp;
  let oksContract = event.transaction.to as Address;
  let accountDebtBalance = BigInt.fromI32(0);

 
  let oikos = OKS.bind(oksContract);
  //accountDebtBalance = oikos.debtBalanceOf(account, sUSD32);
  let debtBalanceOfTry = oikos.try_debtBalanceOf(account, sUSD32);
  if (!debtBalanceOfTry.reverted) {
    accountDebtBalance = debtBalanceOfTry.value;
  }

  let dayID = timestamp.toI32() / 86400;

  let totalActiveStaker = TotalActiveStaker.load('1');
  let activeStaker = ActiveStaker.load(account.toHex());

  if (totalActiveStaker == null) {
    totalActiveStaker = loadTotalActiveStaker();
  }

  // You are burning and have been counted before as active and have no debt balance
  // we reduce the count from the total and remove the active staker entity
  if (isBurn && activeStaker != null && accountDebtBalance == BigInt.fromI32(0)) {
    totalActiveStaker.count = totalActiveStaker.count.minus(BigInt.fromI32(1));
    totalActiveStaker.save();
    store.remove('ActiveStaker', account.toHex());
    // else if you are minting and have not been accounted for as being active, add one
    // and create a new active staker entity
  } else if (!isBurn && activeStaker == null) {
    activeStaker = new ActiveStaker(account.toHex());
    activeStaker.save();
    totalActiveStaker.count = totalActiveStaker.count.plus(BigInt.fromI32(1));
    totalActiveStaker.save();
  }

  // Once a day we stor the total number of active stakers in an entity that is easy to query for charts
  let totalDailyActiveStaker = TotalDailyActiveStaker.load(dayID.toString());
  if (totalDailyActiveStaker == null) {
    updateTotalDailyActiveStaker(dayID.toString(), totalActiveStaker.count);
  }
}

function trackActiveStakersI(event: IssuedEvent): void {
  let isBurn = false;
  let account = event.transaction.from;
  let timestamp = event.block.timestamp;
  let oksContract = event.transaction.to as Address;
  let accountDebtBalance = BigInt.fromI32(0);

 
  let oikos = OKS.bind(oksContract);
  let debtBalanceOfTry = oikos.try_debtBalanceOf(account, sUSD32);
  if (!debtBalanceOfTry.reverted) {
    accountDebtBalance = debtBalanceOfTry.value;
  }

  let dayID = timestamp.toI32() / 86400;

  let totalActiveStaker = TotalActiveStaker.load('1');
  let activeStaker = ActiveStaker.load(account.toHex());

  if (totalActiveStaker == null) {
    totalActiveStaker = loadTotalActiveStaker();
  }

  // You are burning and have been counted before as active and have no debt balance
  // we reduce the count from the total and remove the active staker entity
  if (isBurn && activeStaker != null && accountDebtBalance == BigInt.fromI32(0)) {
    totalActiveStaker.count = totalActiveStaker.count.minus(BigInt.fromI32(1));
    totalActiveStaker.save();
    store.remove('ActiveStaker', account.toHex());
    // else if you are minting and have not been accounted for as being active, add one
    // and create a new active staker entity
  } else if (!isBurn && activeStaker == null) {
    activeStaker = new ActiveStaker(account.toHex());
    activeStaker.save();
    totalActiveStaker.count = totalActiveStaker.count.plus(BigInt.fromI32(1));
    totalActiveStaker.save();
  }

  // Once a day we stor the total number of active stakers in an entity that is easy to query for charts
  let totalDailyActiveStaker = TotalDailyActiveStaker.load(dayID.toString());
  if (totalDailyActiveStaker == null) {
    updateTotalDailyActiveStaker(dayID.toString(), totalActiveStaker.count);
  }
}

function loadTotalActiveStaker(): TotalActiveStaker {
  let newActiveStaker = new TotalActiveStaker('1');
  newActiveStaker.count = BigInt.fromI32(0);
  return newActiveStaker;
}

function updateTotalDailyActiveStaker(id: string, count: BigInt): void {
  let newTotalDailyActiveStaker = new TotalDailyActiveStaker(id);
  newTotalDailyActiveStaker.count = count;
  newTotalDailyActiveStaker.save();
}
