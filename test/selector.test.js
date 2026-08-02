import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  STATUS,
  assessCapacity,
  assessConfigurations,
  choosePerformance,
  deriveBounds,
  evaluateModel,
} from "../src/selector.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function loadModel(type, code) {
  const root = `public/data/zoomlion/${type}/${code}`;
  const model = readJson(`${root}/model.json`);
  const ordinary = readJson(`${root}/performance/ordinary.json`);
  const superliftPath = `${root}/performance/superlift.json`;
  const superlift = fs.existsSync(path.join(repoRoot, superliftPath))
    ? readJson(superliftPath)
    : null;
  const wind = Object.fromEntries(
    model.windConditions.map((condition) => [
      condition,
      readJson(`${root}/wind/${condition}.json`),
    ]),
  );
  return {
    ...model,
    performance: {
      ordinary: ordinary.rows,
      superlift: superlift?.rows || null,
    },
    wind,
  };
}

const r220 = loadModel("flat", "R220-10");
const r135 = loadModel("flat", "R135-8");
const l235 = loadModel("luffing", "L235-12");

test("catalog only contains seven confirmed Zoomlion models", () => {
  const catalog = readJson("public/data/catalog.json");
  assert.equal(catalog.brand, "Zoomlion");
  assert.equal(catalog.models.length, 7);
  assert.deepEqual(
    new Set(catalog.models.map((model) => model.code)),
    new Set(["R90-5", "R135-8", "R220-10", "R275-12", "R335-16", "R370-20", "L235-12"]),
  );
  assert.ok(catalog.models.every((model) => model.brand === "Zoomlion"));
});

test("browser loader uses the build-time data bundle instead of runtime JSON requests", () => {
  const loaderSource = fs.readFileSync(path.join(repoRoot, "src/data-loader.js"), "utf8");
  assert.match(loaderSource, /virtual:tower-data/);
  assert.doesNotMatch(loaderSource, /\bfetch\s*\(/);
});

test("all split model files have valid performance and configuration links", () => {
  const catalog = readJson("public/data/catalog.json");
  for (const entry of catalog.models) {
    const type = entry.type;
    const model = loadModel(type, entry.code);
    assert.equal(model.brand, "Zoomlion");
    assert.equal(model.source.status, "confirmed");
    assert.ok(model.performance.ordinary.length > 0);
    for (const row of [
      ...model.performance.ordinary,
      ...(model.performance.superlift || []),
    ]) {
      assert.ok(model.jibLengths.includes(row.jibLength));
      assert.ok(row.points.every((point) => Number.isFinite(point.radius) && Number.isFinite(point.capacity)));
      for (let index = 1; index < row.points.length; index += 1) {
        assert.ok(row.points[index].radius > row.points[index - 1].radius);
        assert.ok(row.points[index].capacity <= row.points[index - 1].capacity + 1e-9);
      }
    }
    for (const wind of Object.values(model.wind)) {
      assert.equal(wind.model, model.code);
      assert.ok(wind.configurations.length > 0);
      assert.ok(wind.configurations.every((configuration) =>
        model.mastSystems.includes(configuration.mastSystem)));
    }
  }
});

test("non-table radius follows confirmed adjacent-column decision rule", () => {
  const row = r220.performance.ordinary.find(
    (item) => item.jibLength === 65 && item.reeving === 4,
  );
  assert.equal(assessCapacity(row, 48, 3).status, STATUS.SATISFIED);
  assert.equal(assessCapacity(row, 48, 3.1).status, STATUS.UNKNOWN);
  assert.equal(assessCapacity(row, 48, 3.3).status, STATUS.NOT_SATISFIED);
  assert.equal(assessCapacity(row, 48, 3).lookupRadius, 50);
});

test("unspecified jib selects the longest confirmed ordinary configuration", () => {
  const result = choosePerformance(r220, {
    radius: 48,
    requiredLoad: 3,
    specifiedJibLength: 0,
    minimumJibLength: 0,
  });
  assert.equal(result.status, STATUS.SATISFIED);
  assert.equal(result.condition, "ordinary");
  assert.equal(result.jibLength, 65);
});

test("specified jib and minimum coverage are respected", () => {
  const specified = choosePerformance(r220, {
    radius: 40,
    requiredLoad: 3,
    specifiedJibLength: 50,
    minimumJibLength: 0,
  });
  assert.equal(specified.jibLength, 50);

  const minimum = choosePerformance(r220, {
    radius: 40,
    requiredLoad: 3,
    specifiedJibLength: 0,
    minimumJibLength: 60,
  });
  assert.equal(minimum.jibLength, 65);
});

test("superlift is only used after ordinary cannot satisfy", () => {
  const result = choosePerformance(r220, {
    radius: 65,
    requiredLoad: 2.3,
    specifiedJibLength: 0,
    minimumJibLength: 0,
  });
  assert.equal(result.status, STATUS.SATISFIED);
  assert.equal(result.condition, "superlift");
  assert.equal(result.jibLength, 65);
  assert.equal(result.ordinaryStatus, STATUS.NOT_SATISFIED);
});

test("wind, mast and base remain one exact configuration", () => {
  const c25 = assessConfigurations(r135, {
    windCondition: "C25",
    mastSystem: "1.65 m-RA",
    baseType: "crossBase",
    requiredHeight: 57,
  }, 60);
  assert.equal(c25.status, STATUS.SATISFIED);
  assert.equal(c25.selected.baseLabel, "4.5 m底架");

  const d50 = assessConfigurations(r135, {
    windCondition: "D50",
    mastSystem: "1.65 m-RA",
    baseType: "crossBase",
    requiredHeight: 45,
  }, 60);
  assert.equal(d50.status, STATUS.NOT_SATISFIED);
});

test("luffing height uses H and the selected jib length", () => {
  const result = assessConfigurations(l235, {
    windCondition: "C25",
    mastSystem: "2.0 m-L68A",
    baseType: "fixed",
    requiredHeight: 40,
  }, 60);
  assert.equal(l235.heightTerm, "H");
  assert.equal(result.selected.maxHeight, 39.15);
  assert.equal(result.status, STATUS.NOT_SATISFIED);
});

test("dynamic bounds are derived from the loaded model data", () => {
  const bounds = deriveBounds([r135, r220, l235]);
  assert.equal(bounds.radius.max, 65);
  assert.equal(bounds.load.max, 12);
  assert.ok(bounds.height.max >= 57);
});

test("full model evaluation returns a coherent configuration", () => {
  const result = evaluateModel(r135, {
    type: "flat",
    radius: 50,
    requiredLoad: 2,
    requiredHeight: 40,
    specifiedJibLength: 0,
    minimumJibLength: 0,
    windCondition: "D50",
    mastSystem: "1.65 m-RA",
    baseType: "fixed",
  });
  assert.equal(result.status, STATUS.SATISFIED);
  assert.equal(result.performance.condition, "ordinary");
  assert.equal(result.configuration.selected.mastSystem, "1.65 m-RA");
  assert.equal(result.configuration.selected.baseType, "fixed");
});
