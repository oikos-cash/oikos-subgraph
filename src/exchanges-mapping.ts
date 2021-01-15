import { Synthetix, SynthExchange as SynthExchangeEvent } from '../generated/Synthetix/Synthetix';
import { Synth as SynthXDR32 } from '../generated/SynthODR/Synth';

import { Total, DailyTotal, DailyExchanger, FifteenMinuteExchanger, FifteenMinuteTotal, SynthExchange, Exchanger } from '../generated/schema';

import { log, BigInt, Address } from '@graphprotocol/graph-ts';

import { exchangesToIgnore } from './exchangesToIgnore';

import { attemptEffectiveValue, sUSD32,  } from './common';

import {
  Synth,
  Transfer as SynthTransferEvent,
  Issued as IssuedEvent,
  Burned as BurnedEvent,
} from '../generated/SynthsUSD/Synth';

function getMetadata(): Total {
  let total = Total.load('1');

  if (total == null) {
    total = new Total('1');
    total.exchangers = BigInt.fromI32(0);
    total.exchangeUSDTally = BigInt.fromI32(0);
    total.totalFeesGeneratedInUSD = BigInt.fromI32(0);
    total.save();
  }

  return total as Total;
}

function incrementMetadata(field: string): void {
  let metadata = getMetadata();
  if (field == 'exchangers') {
    metadata.exchangers = metadata.exchangers.plus(BigInt.fromI32(1));
  }
  metadata.save();
}

function loadTotal(): Total {
  let newTotal = new Total('1');
  newTotal.trades = BigInt.fromI32(0);
  newTotal.exchangers = BigInt.fromI32(0);
  newTotal.exchangeUSDTally = BigInt.fromI32(0);
  newTotal.totalFeesGeneratedInUSD = BigInt.fromI32(0);
  return newTotal;
}


function loadDailyTotal(id: string): DailyTotal {
  let newDailyTotal = new DailyTotal(id);
  newDailyTotal.trades = BigInt.fromI32(0);
  newDailyTotal.exchangers = BigInt.fromI32(0);
  newDailyTotal.exchangeUSDTally = BigInt.fromI32(0);
  newDailyTotal.totalFeesGeneratedInUSD = BigInt.fromI32(0);
  return newDailyTotal;
}

function loadFifteenMinuteTotal(id: string): FifteenMinuteTotal {
  let newFifteenMinuteTotal = new FifteenMinuteTotal(id);
  newFifteenMinuteTotal.trades = BigInt.fromI32(0);
  newFifteenMinuteTotal.exchangers = BigInt.fromI32(0);
  newFifteenMinuteTotal.exchangeUSDTally = BigInt.fromI32(0);
  newFifteenMinuteTotal.totalFeesGeneratedInUSD = BigInt.fromI32(0);
  return newFifteenMinuteTotal;
}

function trackExchanger(account: Address): void {
  let existingExchanger = Exchanger.load(account.toHex());
  if (existingExchanger == null) {
    incrementMetadata('exchangers');
    let exchanger = new Exchanger(account.toHex());
    exchanger.save();
  }
}

export function handleSynthExchange(event: SynthExchangeEvent): void {
  if (exchangesToIgnore.indexOf(event.transaction.hash.toHex()) >= 0) {
    return;
  }

  let account = event.transaction.from;
  let fromAmountInUSD = BigInt.fromI32(0);
  let toAmountInUSD = BigInt.fromI32(0);
  let feesInUSD = BigInt.fromI32(0);

 
 
  let synthetix = Synthetix.bind(event.address);

  let effectiveValueTry = synthetix.try_effectiveValue(
    event.params.fromCurrencyKey,
    event.params.fromAmount,
    sUSD32,
  );
  if (!effectiveValueTry.reverted) {
    fromAmountInUSD = effectiveValueTry.value;
    toAmountInUSD = synthetix.effectiveValue(event.params.toCurrencyKey, event.params.toAmount, sUSD32);
  }
  log.debug('Got fromAmountInUSD: {}, toAmountInUSD: {}', [
    fromAmountInUSD.toString(),
    toAmountInUSD.toString(),
  ]);
  
  if (fromAmountInUSD > toAmountInUSD) {
    feesInUSD = fromAmountInUSD.minus(toAmountInUSD);
  } else {
    feesInUSD = toAmountInUSD.minus(fromAmountInUSD);
  }
  

  let entity = new SynthExchange(event.transaction.hash.toHex() + '-' + event.logIndex.toString());
  entity.account = event.params.account;
  entity.from = account;
  entity.fromCurrencyKey = event.params.fromCurrencyKey;
  entity.fromAmount = event.params.fromAmount;
  entity.fromAmountInUSD = fromAmountInUSD;
  entity.toCurrencyKey = event.params.toCurrencyKey;
  entity.toAmount = event.params.toAmount;
  entity.toAmountInUSD = toAmountInUSD;
  entity.toAddress = event.params.toAddress;
  entity.feesInUSD = feesInUSD;
  entity.timestamp = event.block.timestamp;
  entity.block = event.block.number;
  entity.gasPrice = event.transaction.gasPrice;
  entity.network = '1';
  entity.save();

  let timestamp = event.block.timestamp.toI32();

  let dayID = timestamp / 86400;
  let fifteenMinuteID = timestamp / 900;

  let total = Total.load('1');
  let dailyTotal = DailyTotal.load(dayID.toString());
  let fifteenMinuteTotal = FifteenMinuteTotal.load(fifteenMinuteID.toString());

  if (total == null) {
    total = loadTotal();
  }

 

  if (dailyTotal == null) {
    dailyTotal = loadDailyTotal(dayID.toString());
  }

  if (fifteenMinuteTotal == null) {
    fifteenMinuteTotal = loadFifteenMinuteTotal(fifteenMinuteID.toString());
  }
 
  let existingExchanger = Exchanger.load(account.toHex());
  let existingDailyExchanger = DailyExchanger.load(dayID.toString() + '-' + account.toHex());
  let existingFifteenMinuteExchanger = FifteenMinuteExchanger.load(fifteenMinuteID.toString() + '-' + account.toHex());

  if (existingExchanger == null) {
    total.exchangers = total.exchangers.plus(BigInt.fromI32(1));
    let exchanger = new Exchanger(account.toHex());
    exchanger.save();
  }
 

  if (existingDailyExchanger == null) {
    dailyTotal.exchangers = dailyTotal.exchangers.plus(BigInt.fromI32(1));
    let dailyExchanger = new DailyExchanger(dayID.toString() + '-' + account.toHex());
    dailyExchanger.save();
  }

  if (existingFifteenMinuteExchanger == null) {
    fifteenMinuteTotal.exchangers = fifteenMinuteTotal.exchangers.plus(BigInt.fromI32(1));
    let fifteenMinuteExchanger = new FifteenMinuteExchanger(fifteenMinuteID.toString() + '-' + account.toHex());
    fifteenMinuteExchanger.save();
  }

 

  total.trades = total.trades.plus(BigInt.fromI32(1));
  dailyTotal.trades = dailyTotal.trades.plus(BigInt.fromI32(1));
  fifteenMinuteTotal.trades = fifteenMinuteTotal.trades.plus(BigInt.fromI32(1));

  if (fromAmountInUSD != null && feesInUSD != null) {
 
    total = addTotalFeesAndVolume(total as Total, fromAmountInUSD, feesInUSD);
    dailyTotal = addDailyTotalFeesAndVolume(dailyTotal as DailyTotal, fromAmountInUSD, feesInUSD);
    fifteenMinuteTotal = addFifteenMinuteTotalFeesAndVolume(
      fifteenMinuteTotal as FifteenMinuteTotal,
      fromAmountInUSD,
      feesInUSD,
    );
  }
 
  total.save();
  dailyTotal.save();
  fifteenMinuteTotal.save();
}



// Issuing of XDR is our fee mechanism
export function handleIssuedODR(event: IssuedEvent): void {
  if (exchangesToIgnore.indexOf(event.transaction.hash.toHex()) >= 0) {
    return;
  }
    let synthXDR = SynthXDR32.bind(event.address);
    let synthetix = Synthetix.bind(synthXDR.synthetixProxy());
    let effectiveValueTry = synthetix.try_effectiveValue(synthXDR.currencyKey(), event.params.value, sUSD32);
    if (!effectiveValueTry.reverted) {
      let metadata = getMetadata();
      metadata.totalFeesGeneratedInUSD = metadata.totalFeesGeneratedInUSD.plus(effectiveValueTry.value);
      metadata.save();
    }
 
}

function addTotalFeesAndVolume(total: Total, fromAmountInUSD: BigInt, feesInUSD: BigInt): Total {
  total.exchangeUSDTally = total.exchangeUSDTally.plus(fromAmountInUSD);
  total.totalFeesGeneratedInUSD = total.totalFeesGeneratedInUSD.plus(feesInUSD);
  return total;
}

function addDailyTotalFeesAndVolume(dailyTotal: DailyTotal, fromAmountInUSD: BigInt, feesInUSD: BigInt): DailyTotal {
  dailyTotal.exchangeUSDTally = dailyTotal.exchangeUSDTally.plus(fromAmountInUSD);
  dailyTotal.totalFeesGeneratedInUSD = dailyTotal.totalFeesGeneratedInUSD.plus(feesInUSD);
  return dailyTotal;
}

function addFifteenMinuteTotalFeesAndVolume(
  fifteenMinuteTotal: FifteenMinuteTotal,
  fromAmountInUSD: BigInt,
  feesInUSD: BigInt,
): FifteenMinuteTotal {
  fifteenMinuteTotal.exchangeUSDTally = fifteenMinuteTotal.exchangeUSDTally.plus(fromAmountInUSD);
  fifteenMinuteTotal.totalFeesGeneratedInUSD = fifteenMinuteTotal.totalFeesGeneratedInUSD.plus(feesInUSD);
  return fifteenMinuteTotal;
}