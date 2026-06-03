import assert from "node:assert/strict";
import { MCM } from "../src/lib/sim/mcm";
import { Random } from "../src/lib/sim/distributions";
import { validateScenario } from "../src/lib/validation/scenario";
import { runSimulation } from "../src/lib/sim/engine";
import { loadDatasets } from "../src/lib/data/csv";
import type { ScenarioInput } from "../src/types/simulation";

function approx(value: number, low: number, high: number) {
  assert.ok(value >= low && value <= high, `Expected ${value} in [${low}, ${high}]`);
}

(function testUniform() {
  const rng = new Random(new MCM(1234));
  for (let i = 0; i < 1000; i++) {
    const v = rng.uniform(4, 10);
    assert.ok(v >= 4 && v < 10);
  }
})();

(function testNormal() {
  const rng = new Random(new MCM(999));
  const vals = Array.from({ length: 12000 }, () => rng.normal(100, 20));
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  approx(avg, 98, 102);
})();

(function testPoisson() {
  const rng = new Random(new MCM(55));
  const vals = Array.from({ length: 20000 }, () => rng.poisson(6));
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  approx(avg, 5.7, 6.3);
})();

(function testBinomial() {
  const rng = new Random(new MCM(77));
  const n = 20;
  const p = 0.6;
  const vals = Array.from({ length: 20000 }, () => rng.binomial(n, p));
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  approx(avg, n * p - 0.3, n * p + 0.3); // mean of Binomial(n,p) = n*p
  assert.ok(vals.every((v) => Number.isInteger(v) && v >= 0 && v <= n));
})();

const base: ScenarioInput = {
  scenario: "A",
  seed: 123,
  kiosks: [{ id: "k1", nombre: "k1", calle: "calle 1", lat: -26.8, lon: -65.2, chain: "Gobierno", source: "csv", active: true, attractivenessWeight: 1 }],
  demandZones: [
    { id: "z1", nombre: "zona 1", departamento: "Capital", lat: -26.8, lon: -65.2, population2022: 10000, density: 3500, demandWeight: 10000 },
    { id: "z2", nombre: "zona 2", departamento: "Capital", lat: -26.82, lon: -65.24, population2022: 8000, density: 2800, demandWeight: 8000 },
  ],
  global: {
    horizonDays: 90,
    serviceTime: { kind: "uniform", a: 4, b: 10 },
    serviceDistanceKm: 10,
  },
};

assert.equal(validateScenario(base).length, 0);
assert.ok(validateScenario({ ...base, global: { ...base.global, horizonDays: 0 } }).length > 0);

const result = runSimulation(base);
assert.ok(result.summary.totalRevenue.mean > 0);
assert.ok(result.summary.totalMargin.ci95Upper >= result.summary.totalMargin.ci95Lower);

// Revenue model: Binomial acceptance (~60%) and refurbish/scrap split (~60/40).
(function testRevenueModel() {
  const k = result.kiosks[0];
  approx(k.accepted / k.arrivals, 0.56, 0.64); // p = 0.60
  assert.equal(k.refurbished + k.scrap, k.devicesCollected); // only accepted are collected
  approx(k.refurbished / k.devicesCollected, 0.56, 0.64); // 60% refurbishable
  assert.equal(result.summary.totalDevices.mean, result.summary.totalRefurbished.mean + result.summary.totalScrap.mean);
  assert.ok(result.summary.recommendation === "S1" || result.summary.recommendation === "S2");
})();

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

(function testIndependentRandomInstances() {
  const first = new Random(new MCM(2024));
  const second = new Random(new MCM(2024));

  const a1 = first.normal(10, 2);
  const a2 = first.normal(10, 2);
  const b1 = second.normal(10, 2);
  const b2 = second.normal(10, 2);

  assert.equal(a1, b1);
  assert.equal(a2, b2);
})();

async function main() {
  const datasets = await loadDatasets();
  assert.ok(datasets.localities.length > 0);
  assert.ok(datasets.kiosks.length > 0);
  assert.ok(datasets.localityPoints.length === datasets.localities.length);
  assert.ok(datasets.kiosks.every((k) => k.latitud <= -26 && k.latitud >= -28.1));
  assert.ok(datasets.kiosks.every((k) => k.longitud <= -64.4 && k.longitud >= -66.2));
}

main()
  .then(() => {
    console.log("All tests passed");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
