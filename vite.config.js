import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const virtualModuleId = "virtual:tower-data";
const resolvedVirtualModuleId = `\0${virtualModuleId}`;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function towerDataPlugin() {
  return {
    name: "tower-data-bundle",
    resolveId(id) {
      return id === virtualModuleId ? resolvedVirtualModuleId : null;
    },
    load(id) {
      if (id !== resolvedVirtualModuleId) return null;
      const dataRoot = path.join(projectRoot, "public", "data");
      const catalogPath = path.join(dataRoot, "catalog.json");
      const catalog = readJson(catalogPath);
      const models = catalog.models.map((entry) => {
        const modelPath = path.resolve(path.dirname(catalogPath), entry.path);
        const model = readJson(modelPath);
        const modelRoot = path.dirname(modelPath);
        const ordinary = readJson(path.resolve(modelRoot, model.files.ordinaryPerformance));
        const superlift = model.files.superliftPerformance
          ? readJson(path.resolve(modelRoot, model.files.superliftPerformance))
          : null;
        const wind = Object.fromEntries(model.windConditions.map((windCondition) => [
          windCondition,
          readJson(path.resolve(modelRoot, model.files.windDirectory, `${windCondition}.json`)),
        ]));
        return {
          ...model,
          performance: {
            ordinary: ordinary.rows,
            superlift: superlift?.rows || null,
          },
          wind,
        };
      });
      return `export default ${JSON.stringify({ catalog, models })};`;
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [towerDataPlugin()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
});
