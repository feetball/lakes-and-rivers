#!/usr/bin/env node
const fs = require('fs');
const semver = require('semver');

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
const nextSpecifier = pkg.dependencies?.next || pkg.devDependencies?.next;
if (!nextSpecifier) {
  console.log('No Next.js dependency found');
  process.exit(0);
}

const allowedRanges = [
  '>=15.3.6',
  '>=16.0.7'
];

// Resolve caret versions to a version using semver.minVersion
let installed = null;
try {
  const nextPkg = require('../node_modules/next/package.json');
  installed = nextPkg.version;
} catch (e) {
  // Fall back to semver.minVersion of package.json specifier
  installed = semver.minVersion(nextSpecifier)?.version;
}
if (!installed) {
  console.error('Unable to parse next version:', nextSpecifier);
  process.exit(1);
}

const installedStr = typeof installed === 'string' ? installed : installed?.version;
let ok = false;
for (const r of allowedRanges) {
  if (semver.satisfies(installedStr, r)) { ok = true; break; }
}

if (!ok) {
  console.error(`Vulnerable or unsupported Next.js version detected: ${nextSpecifier} (resolved ${installedStr}). Please upgrade to a patched version (e.g. ^15.3.6 or ^16.0.7 or later).`);
  process.exit(2);
}

console.log(`Next.js version ${nextSpecifier} (resolved ${installedStr}) is OK.`);
process.exit(0);
