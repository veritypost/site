#!/usr/bin/env node
/**
 * Generates the Apple Sign In client_secret JWT for Supabase.
 *
 * Apple's "client secret" is a short-lived (max 6 months) JWT signed with
 * the .p8 key you downloaded. Supabase needs this JWT in the Apple
 * provider's Secret Keys field.
 *
 * Re-run this script every 5-6 months to rotate the secret.
 *
 * Usage:
 *   node scripts/generate-apple-client-secret.js \
 *     --p8 ~/Desktop/verity-siwa-auth.p8 \
 *     --kid <SIWA Key ID> \
 *     --team FQCAS829U7 \
 *     --sub com.veritypost.signin
 *
 * Or set as env vars: APPLE_P8_PATH, APPLE_KID, APPLE_TEAM_ID, APPLE_SUB
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  return def;
}

const P8_PATH = arg('p8', process.env.APPLE_P8_PATH);
const KID = arg('kid', process.env.APPLE_KID);
const TEAM_ID = arg('team', process.env.APPLE_TEAM_ID);
const SUB = arg('sub', process.env.APPLE_SUB);

if (!P8_PATH || !KID || !TEAM_ID || !SUB) {
  console.error('Missing required args. Need: --p8 <path> --kid <KeyID> --team <TeamID> --sub <ServiceID>');
  process.exit(1);
}

const p8 = fs.readFileSync(path.resolve(P8_PATH.replace(/^~/, process.env.HOME)), 'utf8');

const header = { alg: 'ES256', kid: KID };
const now = Math.floor(Date.now() / 1000);
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: now + 60 * 60 * 24 * 180, // 180 days (Apple max is 6 months)
  aud: 'https://appleid.apple.com',
  sub: SUB,
};

function b64url(input) {
  return Buffer.from(typeof input === 'string' ? input : JSON.stringify(input))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const signingInput = `${b64url(header)}.${b64url(payload)}`;
const sign = crypto.createSign('SHA256');
sign.update(signingInput);
sign.end();
const der = sign.sign({ key: p8, dsaEncoding: 'ieee-p1363' });
const jwt = `${signingInput}.${der.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`;

console.log('\n=== APPLE SIGN IN CLIENT SECRET (paste into Supabase) ===\n');
console.log(jwt);
console.log(`\nExpires: ${new Date((now + 60 * 60 * 24 * 180) * 1000).toISOString()}\n`);
console.log('Re-run this script every 5-6 months to rotate.\n');
