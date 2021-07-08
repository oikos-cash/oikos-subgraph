import { RatesUpdated as RatesUpdatedEvent } from '../generated/ExchangeRates/ExchangeRates';
import {  AnswerUpdated as AnswerUpdatedEvent } from '../generated/Aggregator/Aggregator';
import { ExchangeRates } from '../generated/ExchangeRates/ExchangeRates';

import {
  AccessControlAggregator,
  AnswerUpdated
} from "../generated/AccessControlledAggregator/AccessControlAggregator"
 
import {
  RatesUpdated,
  RateUpdate,
  FifteenMinuteOKSPrice,
  DailyOKSPrice,
  LatestRate,
  AggregatorAnswer
} from '../generated/schema';

import { ByteArray, Bytes, BigInt, Address, log } from '@graphprotocol/graph-ts';

function loadDailyOKSPrice(id: string): DailyOKSPrice {
  let newDailyOKSPrice = new DailyOKSPrice(id);
  newDailyOKSPrice.count = BigInt.fromI32(0);
  newDailyOKSPrice.averagePrice = BigInt.fromI32(0);
  return newDailyOKSPrice;
}

function loadFifteenMinuteOKSPrice(id: string): FifteenMinuteOKSPrice {
  let newFifteenMinuteOKSPrice = new FifteenMinuteOKSPrice(id);
  newFifteenMinuteOKSPrice.count = BigInt.fromI32(0);
  newFifteenMinuteOKSPrice.averagePrice = BigInt.fromI32(0);
  return newFifteenMinuteOKSPrice;
}

function calculateAveragePrice(oldAveragePrice: BigInt, newRate: BigInt, newCount: BigInt): BigInt {
  return oldAveragePrice
    .times(newCount.minus(BigInt.fromI32(1)))
    .plus(newRate)
    .div(newCount);
}

function handleOKSPrices(timestamp: BigInt, rate: BigInt): void {
  let dayID = timestamp.toI32() / 86400;
  let fifteenMinuteID = timestamp.toI32() / 900;

  let dailyOKSPrice = DailyOKSPrice.load(dayID.toString());
  let fifteenMinuteOKSPrice = FifteenMinuteOKSPrice.load(fifteenMinuteID.toString());

  if (dailyOKSPrice == null) {
    dailyOKSPrice = loadDailyOKSPrice(dayID.toString());
  }

  if (fifteenMinuteOKSPrice == null) {
    fifteenMinuteOKSPrice = loadFifteenMinuteOKSPrice(fifteenMinuteID.toString());
  }

  dailyOKSPrice.count = dailyOKSPrice.count.plus(BigInt.fromI32(1));
  dailyOKSPrice.averagePrice = calculateAveragePrice(dailyOKSPrice.averagePrice, rate, dailyOKSPrice.count);

  fifteenMinuteOKSPrice.count = fifteenMinuteOKSPrice.count.plus(BigInt.fromI32(1));
  fifteenMinuteOKSPrice.averagePrice = calculateAveragePrice(
    fifteenMinuteOKSPrice.averagePrice,
    rate,
    fifteenMinuteOKSPrice.count,
  );

  dailyOKSPrice.save();
  fifteenMinuteOKSPrice.save();
}



export function handleRatesUpdated(event: RatesUpdatedEvent): void {
  addDollar('oUSD'); 

  let entity = new RatesUpdated(event.transaction.hash.toHex() + '-' + event.logIndex.toString());
  entity.currencyKeys = event.params.currencyKeys;
  entity.newRates = event.params.newRates;
  entity.timestamp = event.block.timestamp;
  entity.block = event.block.number;
  entity.from = event.transaction.from;
  entity.gasPrice = event.transaction.gasPrice;
  entity.save();

  // required due to assemblyscript
  let keys = entity.currencyKeys;
  let rates = entity.newRates;

  //let bl = ['BNB','BTC','ETH','XAU'];

  // now save each individual update
  for (let i = 0; i < entity.currencyKeys.length; i++) {
    if (keys[i].toString() != '' /*&& !bl.includes(keys[i].toString())*/) {
      let rateEntity = new RateUpdate(event.transaction.hash.toHex() + '-' + keys[i].toString());
      rateEntity.block = event.block.number;
      rateEntity.timestamp = event.block.timestamp;
      rateEntity.currencyKey = keys[i];
      rateEntity.synth = keys[i].toString();
      rateEntity.rate = rates[i];
      rateEntity.save();
      if (keys[i].toString() == 'OKS') {
        handleOKSPrices(event.block.timestamp, rateEntity.rate);
      }
      addLatestRate(rateEntity.synth, rateEntity.rate);
    }
  }
}


function addLatestRate(synth: string, rate: BigInt): void {
  let latestRate = LatestRate.load(synth);
  if (latestRate == null) {
    latestRate = new LatestRate(synth);
  }
  latestRate.rate = rate;
  latestRate.save();
}

function addDollar(dollarID: string): void {
  let dollarRate = LatestRate.load(dollarID);
  if (dollarRate == null) {
    dollarRate = new LatestRate(dollarID);
    let oneDollar = BigInt.fromI32(10);
    dollarRate.rate = oneDollar.pow(18);
    dollarRate.save();
  }
}


// ---------------------
// Chainlink Aggregators
// ---------------------

// create a contract mapping to know which synth the aggregator corresponds to

export const feedsToProxies = new Map<string, string>();
feedsToProxies.set(
  // oBNB
  '0x137924d7c36816e0dcaf016eb617cc2c92c05782',
  '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE', 
);
feedsToProxies.set(
  // oBTC
  '0x178ba789e24a1d51e9ea3cb1db3b52917963d71d',
  '0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf', 
);
feedsToProxies.set(
  // oETH
  '0xfc3069296a691250ffdf21fe51340fdd415a76ed',
  '0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e', 
);
feedsToProxies.set(
  // oXAU
  '0xc54645d805aca807e7f40b9308d159bb62939e3a',
  '0x86896fEB19D8A607c3b11f2aF50A0f239Bd71CD0', 
);
export function handleAnswerUpdated(event: AnswerUpdatedEvent): void {

    let exRatesAddress = Address.fromString("0xe1ff83762F2db7274b6AC2c1C9Bb75B2A8574EaF");
    let exrates = ExchangeRates.bind(exRatesAddress);
    let proxy = feedsToProxies.get(event.address.toHexString());

    log.debug('Feed address is: {} x: {}', [
      event.address.toHexString(),
      proxy
    ]);

    let tryCurrencyKeys = exrates.try_currenciesUsingAggregator(Address.fromHexString(
      // for the aggregator, we need the proxy
      proxy,
    ) as Address);

    if (tryCurrencyKeys.reverted) {
      log.debug('currenciesUsingAggregator was reverted in tx hash: {}, from block: {}', [
        event.transaction.hash.toHex(),
        event.block.number.toString(),
      ]);
      return;
    }

    let currencyKeys = tryCurrencyKeys.value;
    // for each currency key using this aggregator
    for (let i = 0; i < currencyKeys.length; i++) {
      // create an answer entity for the non-zero entries
      if (currencyKeys[i].toString() != '') {
        createRates(event, currencyKeys[i], exrates.rateForCurrency(currencyKeys[i]));
      }
    }

}

function createRates(event: AnswerUpdatedEvent, currencyKey: Bytes, rate: BigInt): void {
  let entity = new AggregatorAnswer(event.transaction.hash.toHex() + '-' + currencyKey.toString());
  entity.block = event.block.number;
  entity.timestamp = event.block.timestamp;
  entity.currencyKey = currencyKey;
  entity.synth = currencyKey.toString();
  entity.rate = rate;
  //entity.roundId = event.params.roundId;
  entity.aggregator = event.address;
  entity.save();

  addLatestRate(entity.synth, entity.rate);
  //updateDailyCandle(event.block.timestamp, currencyKey.toString(), rate);

  // save aggregated event as rate update from v2.17.5 (Procyon)
  //if (event.block.number > BigInt.fromI32(9123410)) {
    let rateEntity = new RateUpdate(event.transaction.hash.toHex() + '-' + entity.synth);
    rateEntity.block = entity.block;
    rateEntity.timestamp = entity.timestamp;
    rateEntity.currencyKey = currencyKey;
    rateEntity.synth = entity.synth;
    rateEntity.rate = entity.rate;
    rateEntity.save();
    if (entity.currencyKey.toString() == 'OKS') {
      handleOKSPrices(entity.timestamp, entity.rate);
    }
  //}
}

