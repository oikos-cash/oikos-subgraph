import { Bytes, ByteArray, BigInt } from '@graphprotocol/graph-ts';

import { Oikos as SNX } from '../generated/Oikos/Oikos';

export let sUSD32 = ByteArray.fromHexString(
  '0x7355534400000000000000000000000000000000000000000000000000000000',
) as Bytes;
export let sUSD4 = ByteArray.fromHexString('0x73555344') as Bytes;

export function attemptEffectiveValue(oikos: SNX, currencyKey: Bytes, amount: BigInt): BigInt {
  let sUSD = sUSD32;

  let effectiveValueTry = oikos.try_effectiveValue(currencyKey, amount, sUSD);
  if (!effectiveValueTry.reverted) {
    return effectiveValueTry.value;
  }
  return null;
}
