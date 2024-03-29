import { 
        Oikos, 
        SynthExchange as SynthExchangeEvent,
        ExchangeReclaim as ExchangeReclaimEvent,
        ExchangeRebate as ExchangeRebateEvent
      } from '../generated/Oikos/Oikos';

import { 
        Total, 
        DailyTotal, 
        DailyExchanger, 
        FifteenMinuteExchanger, 
        ExchangeReclaim, 
        ExchangeRebate, 
        FifteenMinuteTotal, 
        SynthExchange, 
        Exchanger 
      } from '../generated/schema';

import {
        Synth,
        Transfer as SynthTransferEvent,
        Issued as IssuedEvent,
        Burned as BurnedEvent,
      } from '../generated/SynthsUSD/Synth';

import { Synth as SynthXDR32 } from '../generated/SynthODR/Synth';
import { ExchangeRates } from '../generated/ExchangeRates/ExchangeRates';
import { log, BigInt, Address } from '@graphprotocol/graph-ts';
import { exchangesToIgnore } from './exchangesToIgnore';
import { _attemptEffectiveValue, attemptEffectiveValue, sUSD32  } from './common';

let v2 = BigInt.fromI32(8406666); // (Jun-18-2021 02:50:34 PM +UTC)

let contracts = new Map<string, string>();
contracts.set('exRates_v1', '0x9A1D6d7900eC1E34bF22f85a139a21461D4bFB42');
contracts.set('exRates_v2', '0xe1ff83762F2db7274b6AC2c1C9Bb75B2A8574EaF');

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
  let _exRates = "exRates_v1";

  if (event.block.number > v2) {
    _exRates = "exRates_v2";
  }

  let oikos = Oikos.bind(event.address);
  let exRatesAddr = Address.fromString(contracts.get(_exRates));

  let exRates = ExchangeRates.bind(exRatesAddr);
  let effectiveValueTry = _attemptEffectiveValue(
    exRates,
    event.params.fromCurrencyKey,
    event.params.fromAmount
  );

  if (effectiveValueTry != null) {
    fromAmountInUSD = event.params.fromAmount;
    toAmountInUSD = effectiveValueTry;
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
  let proxyTry = synthXDR.try_proxy();
  let _exRates = "exRates_v1";

  if (event.block.number > v2) {
    _exRates = "exRates_v2";
  }

  if (!proxyTry.reverted) {
      let oikos = Oikos.bind(proxyTry.value);

      let exRatesAddr = Address.fromString(contracts.get(_exRates));
      let exRates = ExchangeRates.bind(exRatesAddr);
      let effectiveValueTry = _attemptEffectiveValue(exRates, synthXDR.currencyKey(), event.params.value);

      if (effectiveValueTry != null) {
        let metadata = getMetadata();
        metadata.totalFeesGeneratedInUSD = metadata.totalFeesGeneratedInUSD.plus(effectiveValueTry);
        metadata.save();
      }
  }
}

 

export function handleExchangeReclaim(event: ExchangeReclaimEvent): void {
  let entity = new ExchangeReclaim(event.transaction.hash.toHex() + '-' + event.logIndex.toString());
  entity.account = event.params.account;
  entity.amount = event.params.amount;
  entity.currencyKey = event.params.currencyKey;
  entity.timestamp = event.block.timestamp;
  entity.block = event.block.number;
  entity.gasPrice = event.transaction.gasPrice;
  let _exRates = "exRates_v1";

  if (event.block.number > v2) {
    _exRates = "exRates_v2";
  }

  let exRatesAddr = Address.fromString(contracts.get(_exRates));
  let exRates = ExchangeRates.bind(exRatesAddr);
  let effectiveValueTry = _attemptEffectiveValue(
    exRates,
    event.params.currencyKey,
    event.params.amount
  );
  if (effectiveValueTry != null) {
    entity.amountInUSD = effectiveValueTry;
  } 

}

export function handleExchangeRebate(event: ExchangeRebateEvent): void {
  let entity = new ExchangeRebate(event.transaction.hash.toHex() + '-' + event.logIndex.toString());
  entity.account = event.params.account;
  entity.amount = event.params.amount;
  entity.currencyKey = event.params.currencyKey;
  entity.timestamp = event.block.timestamp;
  entity.block = event.block.number;
  entity.gasPrice = event.transaction.gasPrice;
  let _exRates = "exRates_v1";

  if (event.block.number > v2) {
    _exRates = "exRates_v2";
  }

  let exRatesAddr = Address.fromString(contracts.get(_exRates));
  let exRates = ExchangeRates.bind(exRatesAddr);

  let effectiveValueTry = _attemptEffectiveValue(
    exRates,
    event.params.currencyKey,
    event.params.amount
  );

  if (effectiveValueTry != null) {
    entity.amountInUSD = effectiveValueTry;
  }    
  entity.save();
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