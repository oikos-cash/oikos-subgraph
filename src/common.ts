import { Bytes, ByteArray, BigInt } from '@graphprotocol/graph-ts';

import { Oikos as OKS } from '../generated/Oikos/Oikos';
import { ExchangeRates } from '../generated/ExchangeRates/ExchangeRates';

export let sUSD32 = ByteArray.fromHexString(
  '0x6f55534400000000000000000000000000000000000000000000000000000000',
) as Bytes;
export let sUSD4 = ByteArray.fromHexString('0x73555344') as Bytes;

export function _attemptEffectiveValue(exRates: ExchangeRates, currencyKey: Bytes, amount: BigInt): BigInt {

  let effectiveValueTry = exRates.try_effectiveValue(currencyKey, amount, sUSD32);
  if (!effectiveValueTry.reverted) {
    return effectiveValueTry.value;
  }
  return null;
}

export function attemptEffectiveValue(oikos: OKS, currencyKey: Bytes, amount: BigInt): BigInt {

  let effectiveValueTry = oikos.try_effectiveValue(currencyKey, amount, sUSD32);
  if (!effectiveValueTry.reverted) {
    return effectiveValueTry.value;
  }
  return null;
}