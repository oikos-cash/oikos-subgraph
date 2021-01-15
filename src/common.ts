import { Bytes, ByteArray, BigInt } from '@graphprotocol/graph-ts';

import { Synthetix as SNX } from '../generated/Synthetix/Synthetix';

export let sUSD32 = ByteArray.fromHexString(
  '0x7355534400000000000000000000000000000000000000000000000000000000',
) as Bytes;
export let sUSD4 = ByteArray.fromHexString('0x73555344') as Bytes;

export function attemptEffectiveValue(synthetix: SNX, currencyKey: Bytes, amount: BigInt): BigInt {
  let sUSD = sUSD32;

  let effectiveValueTry = synthetix.try_effectiveValue(currencyKey, amount, sUSD);
  if (!effectiveValueTry.reverted) {
    return effectiveValueTry.value;
  }
  return null;
}
