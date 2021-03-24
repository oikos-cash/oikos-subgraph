import { RatesUpdated as RatesUpdatedEvent, ExchangeRates } from '../generated/ExchangeRates/ExchangeRates';

import {
  RatesUpdated,
  RateUpdate,
  FifteenMinuteOKSPrice,
  DailyOKSPrice,
  LatestRate,
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