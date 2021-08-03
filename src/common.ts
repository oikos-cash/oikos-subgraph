import { Bytes, ByteArray, BigInt, BigDecimal } from '@graphprotocol/graph-ts';

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
// Extrapolated from ByteArray.fromUTF8
export function strToBytes(string: string, length: i32 = 32): Bytes {
  let utf8 = string.toUTF8();
  let bytes = new ByteArray(length);
  let strLen = string.lengthUTF8 - 1;
  for (let i: i32 = 0; i < strLen; i++) {
    bytes[i] = load<u8>(utf8 + i);
  }
  return bytes as Bytes;
}
export function attemptEffectiveValue(oikos: OKS, currencyKey: Bytes, amount: BigInt): BigInt {

  let effectiveValueTry = oikos.try_effectiveValue(currencyKey, amount, sUSD32);
  if (!effectiveValueTry.reverted) {
    return effectiveValueTry.value;
  }
  return null;
}

export function getTimeID(timestampI32: i32, num: i32): string {
  let id = timestampI32 / num;
  return id.toString();
}