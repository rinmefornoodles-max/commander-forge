import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
const productVersion=pkg.version;
const bundleVersion=pkg.commanderForge.bundleVersion;
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const bundle=fs.readFileSync(path.join(root,`commander-forge-${bundleVersion}.js`),'utf8');
const stability=fs.readFileSync(path.join(root,`commander-forge-stability-${productVersion}.js`),'utf8');
const diagnostics=fs.readFileSync(path.join(root,`commander-forge-diagnostics-${productVersion}.js`),'utf8');
const feedback=fs.readFileSync(path.join(root,'feedback-config.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const compilerV8=fs.readFileSync(path.join(root,'commander-forge-oracle-compiler-v8.js'),'utf8');
const versionText=fs.readFileSync(path.join(root,'VERSION.txt'),'utf8').trim();

function syntax(file){
  const r=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});
  assert.equal(r.status,0,`${file} syntax failed:\n${r.stderr}`);
}

test('release metadata and runtime wiring are consistent',()=>{
  assert.equal(productVersion,'6.15.0');
  assert.equal(bundleVersion,'6.15.0');
  assert.equal(pkg.commanderForge.multiplayerProtocol,'6.15.0-mp8');
  assert.match(versionText,/^6\.15\.0/);
  assert.match(stability,/PRODUCT_VERSION = '6\.15\.0'/);
  assert.match(stability,/BUNDLE_VERSION = '6\.15\.0'/);
  assert.match(feedback,/commander-forge-stability-6\.15\.0\.js\?v=6\.15\.0/);
  assert.match(feedback,/commander-forge-diagnostics-6\.15\.0\.js\?v=6\.15\.0/);
  assert.match(index,/commander-forge-6\.15\.0\.js\?v=6\.15\.0/);
  assert.match(index,/commander-forge-oracle-compiler-v8\.js\?v=8\.0\.0-ability-inventory/);
  assert.match(index,/const expected = '6\.15\.0'/);
  assert.match(bundle,/CommanderForgeBuildVersion = '6\.15\.0'/);
  assert.match(bundle,/MULTIPLAYER_APP_VERSION = '6\.15\.0-mp8'/);
  assert.match(sw,/CACHE='commander-forge-6\.15\.0'/);
});

test('PWA cache is scoped and version check is network-first',()=>{
  assert.match(stability,/serviceWorker\.register\('\.\/sw\.js'/);
  assert.match(stability,/Update & Reload/);
  assert.match(stability,/VERSION\.txt\?check=/);
  assert.match(sw,/CACHE_PREFIX='commander-forge-'/);
  assert.match(sw,/key\.startsWith\(CACHE_PREFIX\)&&key!==CACHE/);
  assert.match(sw,/request\.mode==='navigate'/);
  assert.match(sw,/cache:'no-store'/);
  assert.match(sw,/commander-forge-6\.15\.0\.js\?v=6\.15\.0/);
  assert.match(sw,/commander-forge-oracle-compiler-v8\.js\?v=8\.0\.0-ability-inventory/);
});

test('diagnostics deliberately exclude private zones',()=>{
  assert.match(diagnostics,/Report this error/);
  assert.match(diagnostics,/forge-feedback-tech/);
  assert.match(diagnostics,/Your hand and library are never included/);
  assert.match(diagnostics,/rulesMode/);
  assert.match(diagnostics,/manaMode/);
  assert.match(diagnostics,/viewport/);
  assert.doesNotMatch(diagnostics,/zones\.hand/);
  assert.doesNotMatch(diagnostics,/zones\.library/);
});

test('ability inventory never silently drops unsupported Oracle abilities',()=>{
  assert.match(compilerV8,/completeInventory:\s*true/);
  assert.match(compilerV8,/automation:\s*'manual'/);
  assert.match(compilerV8,/No safe general adapter exists/);
  assert.match(bundle,/function abilityCoverageForCard\(card\)/);
  assert.match(bundle,/Forge never treats an unrecognized ability as if it does nothing/);
});

test('Ardyn and Ancient Silver Dragon live adapters remain present',()=>{
  assert.match(bundle,/kind:\s*'exile-graveyard-copy-token'/);
  assert.match(bundle,/kind:\s*'roll-die-draw-no-max'/);
  assert.match(bundle,/function resolveSmartRandomEffect\(effectId\)/);
  assert.match(bundle,/NO_MAX_HAND_SIZE/);
  assert.match(bundle,/makeEffectCopyToken/);
});

test('mana source attribution fix is present in the generated production bundle',()=>{
  assert.match(bundle,/const directManaLines = lines/);
  assert.match(bundle,/colon >= 0 && addIndex > colon/);
  assert.match(bundle,/line = line\.replace\(\/\\\([^()]*\\\)\/g, ' '\)/);
  assert.match(bundle,/!choices\.length && \(\/\\bLand\\b\/i\.test\(type\) \|\| directManaLines\.length > 0\)/);
});

test('declare attacker hotfix remains in production gameplay bundle',()=>{
  assert.match(bundle,/attackLegality, compiledBlockLegality, landEntryPlan/);
  assert.match(bundle,/compiledBlockLegality\(state, blocker\.controller \|\| defender\.id, blocker\)\.legal/);
});

test('release JavaScript parses',()=>{
  syntax(`commander-forge-${bundleVersion}.js`);
  syntax(`commander-forge-stability-${productVersion}.js`);
  syntax(`commander-forge-diagnostics-${productVersion}.js`);
  syntax('feedback-config.js');
  syntax('commander-forge-oracle-compiler-v7.js');
  syntax('commander-forge-oracle-compiler-v8.js');
  syntax('commander-forge-engine-client-v6.js');
  syntax('commander-forge-engine-v6.js');
  syntax('commander-forge-engine-worker-v6.js');
  syntax('sw.js');
});
