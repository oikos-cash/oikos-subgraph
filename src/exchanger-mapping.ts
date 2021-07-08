import {
    ExchangeEntrySettled as ExchangeEntrySettledEvent,
    ExchangeEntryAppended as ExchangeEntryAppendedEvent,
  } from '../generated/Exchanger/Exchanger';
  
  
  import {
    ExchangeEntrySettled,
    ExchangeEntryAppended
  } from '../generated/schema';
  
  import { getTimeID } from './common';
  
  import { BigInt, log, BigDecimal } from '@graphprotocol/graph-ts';
  
  // NOTE importing and exporting methods helps to keep the files modular
  import { handleRatesUpdated, handleAnswerUpdated } from './rates-mapping';
  export { handleRatesUpdated, handleAnswerUpdated };

  
  let etherUnits = new BigDecimal(BigInt.fromI32(10).pow(18));
  
  export function handleExchangeEntrySettled(event: ExchangeEntrySettledEvent): void {
    let entity = new ExchangeEntrySettled(event.transaction.hash.toHex() + '-' + event.logIndex.toString());
    entity.from = event.params.from;
    entity.src = event.params.src;
    entity.amount = event.params.amount;
    entity.dest = event.params.dest;
    entity.reclaim = event.params.reclaim;
    entity.rebate = event.params.rebate;
    entity.srcRoundIdAtPeriodEnd = event.params.srcRoundIdAtPeriodEnd;
    entity.destRoundIdAtPeriodEnd = event.params.destRoundIdAtPeriodEnd;
    entity.exchangeTimestamp = event.params.exchangeTimestamp;
  
    entity.save();
  }
  
  export function handleExchangeEntryAppended(event: ExchangeEntryAppendedEvent): void {
    let txHash = event.transaction.hash.toHex();
    let entity = new ExchangeEntryAppended(txHash + '-' + event.logIndex.toString());
    entity.account = event.params.account;
    entity.src = event.params.src;
    entity.amount = event.params.amount;
    entity.dest = event.params.dest;
    entity.amountReceived = event.params.amountReceived;
    entity.exchangeFeeRate = event.params.exchangeFeeRate;
    entity.roundIdForSrc = event.params.roundIdForSrc;
    entity.roundIdForDest = event.params.roundIdForDest;
  
    entity.save();
  }
  
