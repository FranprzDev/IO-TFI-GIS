import assert from "node:assert/strict";
import { LcgRng } from "../src/lib/sim/rng";
import { sampleNormal, samplePoisson, sampleUniform } from "../src/lib/sim/distributions";
import { validateScenario } from "../src/lib/validation/scenario";
import { runSimulation } from "../src/lib/sim/engine";
import { loadDatasets } from "../src/lib/data/csv";
import type { ScenarioInput } from "../src/types/simulation";

function approx(value: number, low: number, high: number) {
  assert.ok(value >= low && value <= high, `Expected ${value} in [${low}, ${high}]`);
}

(function testUniform() {
  const rng = new LcgRng(1234);
  for (let i = 0; i < 1000; i++) {
    const v = sampleUniform(rng, 4, 10);
    assert.ok(v >= 4 && v < 10);
  }
})();

(function testNormal() {
  const rng = new LcgRng(999);
  const vals = Array.from({ length: 12000 }, () => sampleNormal(rng, 100, 20));
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  approx(avg, 98, 102);
})();

(function testPoisson() {
  const rng = new LcgRng(55);
  const vals = Array.from({ length: 20000 }, () => samplePoisson(rng, 6));
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  approx(avg, 5.7, 6.3);
})();

const base: ScenarioInput = {
  scenario: "A",
  seed: 123,
  conglomerates: [{ id: "cg-1", nombre: "c1", departamento: "d", dailyDemand: { kind: "normal", mu: 1000, sigma: 100 }, interestPct: 0.05, operationalHours: 12 }],
  kiosks: [{ id: "k1", nombre: "k1", calle: "calle 1", conglomerateId: "cg-1", lat: -26.8, lon: -65.2, chain: "Gobierno", acquisitionPrice: 7000 }],
  global: {
    capacityMaxDevices: 100,
    horizonDays: 90,
    replicas: 30,
    confidenceLevel: 0.95,
    warmupDays: 0,
    serviceTime: { kind: "uniform", a: 4, b: 10 },
    deviceValue: { kind: "normal", mu: 120, sigma: 35 },
    operationCostPerDevice: 20,
  },
};

assert.equal(validateScenario(base).length, 0);
assert.ok(validateScenario({ ...base, global: { ...base.global, capacityMaxDevices: 0 } }).length > 0);

const result = runSimulation(base);
assert.equal(result.replicas.length, 30);
assert.ok(result.summary.totalRevenue.mean > 0);
assert.ok(result.summary.totalMargin.ci95Upper >= result.summary.totalMargin.ci95Lower);

const invalidRes = validateScenario({ ...base, global: { ...base.global, serviceTime: { kind: "uniform", a: 12, b: 10 } } });
assert.ok(invalidRes.some((e) => e.field === "global.serviceTime"));

// Determinism: same seed must produce identical results regardless of any
// previous run. This guards against the Box-Muller spare leaking across runs.
(function testDeterminism() {
  runSimulation({ ...base, seed: 777 }); // pollute any shared sampler state
  const a = runSimulation(base);
  const b = runSimulation(base);
  assert.equal(a.summary.totalMargin.mean, b.summary.totalMargin.mean);
  assert.equal(a.summary.totalRevenue.mean, b.summary.totalRevenue.mean);
  assert.equal(a.summary.totalDevices.mean, b.summary.totalDevices.mean);
})();

async function main() {
  const datasets = await loadDatasets();
  assert.ok(datasets.localities.length > 0);
  assert.ok(datasets.kiosks.length > 0);
  assert.ok(datasets.kiosks.every((k) => k.latitud <= -26 && k.latitud >= -28));
  assert.ok(datasets.kiosks.every((k) => k.longitud <= -65 && k.longitud >= -66));
}

main()
  .then(() => {
    console.log("All tests passed");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
