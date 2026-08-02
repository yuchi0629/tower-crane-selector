async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`无法读取数据：${url} (${response.status})`);
  return response.json();
}

export async function loadCatalog() {
  const catalogUrl = new URL("./data/catalog.json", document.baseURI);
  const catalog = await fetchJson(catalogUrl);
  const models = await Promise.all(catalog.models.map(async (entry) => {
    const modelUrl = new URL(entry.path, catalogUrl);
    const model = await fetchJson(modelUrl);
    const ordinaryUrl = new URL(model.files.ordinaryPerformance, modelUrl);
    const ordinary = await fetchJson(ordinaryUrl);
    const superlift = model.files.superliftPerformance
      ? await fetchJson(new URL(model.files.superliftPerformance, modelUrl))
      : null;
    const windEntries = await Promise.all(model.windConditions.map(async (windCondition) => {
      const windUrl = new URL(`${model.files.windDirectory}${windCondition}.json`, modelUrl);
      return [windCondition, await fetchJson(windUrl)];
    }));
    return {
      ...model,
      performance: {
        ordinary: ordinary.rows,
        superlift: superlift?.rows || null,
      },
      wind: Object.fromEntries(windEntries),
    };
  }));
  return { catalog, models };
}
