import { Bytes, ByteArray, BigInt } from '@graphprotocol/graph-ts';

import { Oikos as OKS } from '../generated/Oikos/Oikos';
import { ExchangeRates } from '../generated/ExchangeRates/ExchangeRates';

export let sUSD32 = ByteArray.fromHexString(
  '0x6f55534400000000000000000000000000000000000000000000000000000000',
) as Bytes;
export let sUSD4 = ByteArray.fromHexString('0x73555344') as Bytes;

export function attemptEffectiveValue(exRates: ExchangeRates, currencyKey: Bytes, amount: BigInt): BigInt {
  let sUSD = sUSD32;

  let effectiveValueTry = exRates.try_effectiveValue(currencyKey, amount, sUSD);
  if (!effectiveValueTry.reverted) {
    return effectiveValueTry.value;
  }
  return null;
}
