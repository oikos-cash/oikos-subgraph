import { RatesUpdated as RatesUpdatedEvent, ExchangeRates } from '../generated/ExchangeRates/ExchangeRates';

import {
  RatesUpdated,
  RateUpdate,
  FifteenMinuteSNXPrice,
  DailySNXPrice,
  LatestRate,
} from '../generated/schema';

import { ByteArray, Bytes, BigInt, Address, log } from '@graphprotocol/graph-ts';

function loadDailySNXPrice(id: string): DailySNXPrice {
  let newDailySNXPrice = new DailySNXPrice(id);
  newDailySNXPrice.count = BigInt.fromI32(0);
  newDailySNXPrice.averagePrice = BigInt.fromI32(0);
  return newDailySNXPrice;
}

function loadFifteenMinuteSNXPrice(id: string): FifteenMinuteSNXPrice {
  let newFifteenMinuteSNXPrice = new FifteenMinuteSNXPrice(id);
  newFifteenMinuteSNXPrice.count = BigInt.fromI32(0);
  newFifteenMinuteSNXPrice.averagePrice = BigInt.fromI32(0);
  return newFifteenMinuteSNXPrice;
}

function calculateAveragePrice(oldAveragePrice: BigInt, newRate: BigInt, newCount: BigInt): BigInt {
  return oldAveragePrice
    .times(newCount.minus(BigInt.fromI32(1)))
    .plus(newRate)
    .div(newCount);
}

function handleSNXPrices(timestamp: BigInt, rate: BigInt): void {
  let dayID = timestamp.toI32() / 86400;
  let fifteenMinuteID = timestamp.toI32() / 900;

  let dailySNXPrice = DailySNXPrice.load(dayID.toString());
  let fifteenMinuteSNXPrice = FifteenMinuteSNXPrice.load(fifteenMinuteID.toString());

  if (dailySNXPrice == null) {
    dailySNXPrice = loadDailySNXPrice(dayID.toString());
  }

  if (fifteenMinuteSNXPrice == null) {
    fifteenMinuteSNXPrice = loadFifteenMinuteSNXPrice(fifteenMinuteID.toString());
  }

  dailySNXPrice.count = dailySNXPrice.count.plus(BigInt.fromI32(1));
  dailySNXPrice.averagePrice = calculateAveragePrice(dailySNXPrice.averagePrice, rate, dailySNXPrice.count);

  fifteenMinuteSNXPrice.count = fifteenMinuteSNXPrice.count.plus(BigInt.fromI32(1));
  fifteenMinuteSNXPrice.averagePrice = calculateAveragePrice(
    fifteenMinuteSNXPrice.averagePrice,
    rate,
    fifteenMinuteSNXPrice.count,
  );

  dailySNXPrice.save();
  fifteenMinuteSNXPrice.save();
}



export function handleRatesUpdated(event: RatesUpdatedEvent): void {
  addDollar('sUSD'); 

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
  // now save each individual update
  for (let i = 0; i < entity.currencyKeys.length; i++) {
    if (keys[i].toString() != '') {
      let rateEntity = new RateUpdate(event.transaction.hash.toHex() + '-' + keys[i].toString());
      rateEntity.block = event.block.number;
      rateEntity.timestamp = event.block.timestamp;
      rateEntity.currencyKey = keys[i];
      rateEntity.synth = keys[i].toString();
      rateEntity.rate = rates[i];
      rateEntity.save();
      if (keys[i].toString() == 'OKS') {
        handleSNXPrices(event.block.timestamp, rateEntity.rate);
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