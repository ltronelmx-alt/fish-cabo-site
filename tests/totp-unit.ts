// RFC 6238 reference vectors (SHA-1, secret "12345678901234567890") — same algorithm as Google Authenticator.
import { totpAt, b32encode, matchStep } from '../worker/booking/totp';
const sec = b32encode(new TextEncoder().encode('12345678901234567890'));
const V: [number, string][] = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']];
let ok = 0;
for (const [t, want] of V) { const got = await totpAt(sec, Math.floor(t / 30)); console.log(`${got === want ? 'PASS' : 'FAIL'}  T=${t} → ${got} (RFC: ${want})`); if (got === want) ok++; }
const s = await matchStep(sec, '287082', 59_000 + 30_000); console.log(`${s === 1 ? 'PASS' : 'FAIL'}  previous code still accepted 30 s later (clock drift ±1 step)`); if (s === 1) ok++;
const n = await matchStep(sec, '287082', 59_000 + 90_000); console.log(`${n === null ? 'PASS' : 'FAIL'}  code refused 90 s later`); if (n === null) ok++;
console.log(`\n${ok}/${V.length + 2} passed`); process.exit(ok === V.length + 2 ? 0 : 1);
