import { evaluatePhase2Readiness } from '../src/phase2/phase2-readiness.js';

const result = evaluatePhase2Readiness();
console.log(`Phase 2 deployment configuration: ${result.ready ? 'READY' : 'GATED'}`);
for (const check of Object.values(result.checks)) {
  console.log(`${check.ok ? 'PASS' : 'GATE'} ${check.component}${check.ok ? '' : ` (${check.code}: ${check.message})`}`);
}
if (!result.ready) {
  console.log('This command made no network connections and did not start services.');
}
