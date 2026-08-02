import "./styles.css";
import { loadCatalog } from "./data-loader.js";
import {
  STATUS,
  availableFilters,
  deriveBounds,
  evaluateCatalog,
} from "./selector.js";

const app = document.querySelector("#app");

const state = {
  type: "",
  radius: 50,
  requiredLoad: 3,
  requiredHeight: 0,
  specifiedJibLength: 0,
  minimumJibLength: 0,
  windCondition: "C25",
  mastSystem: "",
  baseType: "",
  compare: new Set(),
};

let models = [];
let queuedFrame = 0;

function number(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: digits });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function statusLabel(status) {
  if (status === STATUS.SATISFIED) return "确认满足";
  if (status === STATUS.UNKNOWN) return "不能确定";
  if (status === STATUS.NOT_SATISFIED) return "不能满足";
  return "不适用";
}

function conditionLabel(condition) {
  return condition === "superlift" ? "超起工况" : "普通工况";
}

function baseLabel(type) {
  return type === "fixed" ? "支腿/预埋基础" : "底架基础";
}

function reasonText(result) {
  const reason = result.reason || result.performance?.reason || result.configuration?.reason;
  const messages = {
    jib_unavailable: "没有能够覆盖该幅度或指定长度的起重臂",
    capacity: "当前载荷超过样本性能",
    wind_unavailable: "该型号没有对应风压版本",
    configuration_unavailable: "没有匹配的塔身与基础配置",
    height: "独立高度不足",
    sample_footnote_review_required: "最大高度受样本臂长脚注限制，当前结构化资料不能确认",
  };
  return messages[reason] || "当前条件不能形成完整可确认配置";
}

function normalizeState() {
  const filters = availableFilters(models, state.type);
  const bounds = deriveBounds(models, { type: state.type });
  state.radius = clamp(state.radius, bounds.radius.min, bounds.radius.max);
  state.requiredLoad = clamp(state.requiredLoad, bounds.load.min, bounds.load.max);
  state.requiredHeight = clamp(state.requiredHeight, bounds.height.min, bounds.height.max);
  if (!filters.windConditions.includes(state.windCondition)) {
    state.windCondition = filters.windConditions[0] || "C25";
  }
  if (state.mastSystem && !filters.mastSystems.includes(state.mastSystem)) state.mastSystem = "";
  if (state.specifiedJibLength && !filters.jibLengths.includes(state.specifiedJibLength)) {
    state.specifiedJibLength = 0;
  }
  return { filters, bounds };
}

function selectOptions(values, current, emptyLabel, formatter = String) {
  return [
    `<option value="">${emptyLabel}</option>`,
    ...values.map((value) =>
      `<option value="${value}" ${String(value) === String(current) ? "selected" : ""}>${formatter(value)}</option>`),
  ].join("");
}

function rangeControl(id, label, value, unit, range, note = "") {
  return `
    <div class="control-card">
      <div class="control-heading">
        <label for="${id}">${label}</label>
        <span class="control-value">${number(value)} <small>${unit}</small></span>
      </div>
      ${note ? `<p class="control-note">${note}</p>` : ""}
      <div class="range-row">
        <input id="${id}" data-state="${id}" type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}">
        <input class="number-input" data-number-state="${id}" type="number" min="${range.min}" max="${range.max}" step="${range.step}" value="${value}">
      </div>
      <div class="range-bounds"><span>${number(range.min)}</span><span>随当前型号库动态调整</span><span>${number(range.max)}</span></div>
    </div>`;
}

function performanceDetail(result) {
  const performance = result.performance;
  if (!performance?.result) return "";
  const { row, assessment } = performance.result;
  const lookup = assessment.lookupMode === "right-column"
    ? `按右侧 ${number(assessment.lookupRadius)} m档保守取值`
    : assessment.lookupMode === "rated-range"
      ? `最大起重量范围至 ${number(row.maxLoadRadius)} m`
      : "样本精确幅度档";
  const ordinaryNote = performance.condition === "superlift"
    ? `<span class="condition-note">普通工况${performance.ordinaryStatus === STATUS.UNKNOWN ? "不能确定" : "不能满足"}，超起工况满足</span>`
    : "";
  return `
    <div class="result-main">
      <div>
        <span class="eyebrow">${conditionLabel(performance.condition)}</span>
        <strong>${number(performance.jibLength)} m臂 · ${row.reeving}倍率</strong>
      </div>
      <div class="capacity"><strong>${number(assessment.capacity)}</strong><span>t</span></div>
    </div>
    <p>${lookup}；需求 ${number(state.requiredLoad)} t @ ${number(state.radius)} m</p>
    ${ordinaryNote}`;
}

function configurationDetail(result) {
  const selected = result.configuration?.selected;
  if (!selected) return "";
  const height = selected.maxHeight == null
    ? "高度资料不足"
    : `${result.model.heightTerm}上限 ${number(selected.maxHeight)} m`;
  return `
    <div class="configuration">
      <span>${selected.mastSystem}</span>
      <span>${selected.baseLabel}</span>
      <span>${state.windCondition}</span>
      <span>${height}</span>
    </div>`;
}

function resultCard(result, index) {
  if (result.status === STATUS.UNAVAILABLE) return "";
  const isCompared = state.compare.has(result.model.code);
  const margin = result.marginRate == null
    ? ""
    : result.marginRate >= 0
      ? `余量 ${number(result.margin)} t（${number(result.marginRate * 100, 1)}%）`
      : `缺口 ${number(Math.abs(result.margin))} t`;
  return `
    <article class="result-card ${result.status}">
      <div class="result-header">
        <div>
          <span class="rank">${String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3>${result.model.code}</h3>
            <p>${result.model.type === "flat" ? "中联平臂塔机" : "中联动臂塔机"} · ${result.model.source.edition}</p>
          </div>
        </div>
        <span class="status-badge">${statusLabel(result.status)}</span>
      </div>
      ${performanceDetail(result)}
      ${configurationDetail(result)}
      ${result.status === STATUS.SATISFIED ? `<p class="margin">${margin}</p>` : `<p class="reason">${reasonText(result)}</p>`}
      ${result.model.notes.length ? `<p class="data-warning">${result.model.notes.join(" ")}</p>` : ""}
      <div class="card-footer">
        <span>来源：${result.model.source.file} · 第${result.model.source.pages.performance.join("、")}页</span>
        <button class="text-button" data-compare="${result.model.code}">${isCompared ? "移出对比" : "加入对比"}</button>
      </div>
    </article>`;
}

function comparison(results) {
  const selected = results.filter((result) => state.compare.has(result.model.code));
  if (!selected.length) return "";
  return `
    <section class="comparison-section">
      <div class="section-heading">
        <div><span class="section-index">03</span><div><h2>当前工况对比</h2><p>所有数值均来自同一输入条件和各自完整配置</p></div></div>
        <button class="ghost-button" id="clear-compare">清空</button>
      </div>
      <div class="comparison-grid">
        ${selected.map((result) => `
          <article class="comparison-card">
            <h3>${result.model.code}</h3>
            <dl>
              <div><dt>结论</dt><dd>${statusLabel(result.status)}</dd></div>
              <div><dt>臂长</dt><dd>${number(result.performance?.jibLength)} m</dd></div>
              <div><dt>工况/倍率</dt><dd>${conditionLabel(result.performance?.condition)} · ${result.performance?.result?.row.reeving || "—"}倍率</dd></div>
              <div><dt>允许吊重</dt><dd>${number(result.capacity)} t</dd></div>
              <div><dt>塔身</dt><dd>${result.configuration?.selected?.mastSystem || "—"}</dd></div>
              <div><dt>基础</dt><dd>${result.configuration?.selected?.baseLabel || "—"}</dd></div>
              <div><dt>风压</dt><dd>${state.windCondition}</dd></div>
            </dl>
          </article>`).join("")}
      </div>
    </section>`;
}

function render() {
  const { filters, bounds } = normalizeState();
  const input = {
    type: state.type,
    radius: state.radius,
    requiredLoad: state.requiredLoad,
    requiredHeight: state.requiredHeight,
    specifiedJibLength: state.specifiedJibLength,
    minimumJibLength: state.minimumJibLength,
    windCondition: state.windCondition,
    mastSystem: state.mastSystem,
    baseType: state.baseType,
  };
  const results = evaluateCatalog(models, input);
  const visible = results.filter((result) => result.status !== STATUS.UNAVAILABLE);
  const satisfied = visible.filter((result) => result.status === STATUS.SATISFIED).length;
  const uncertain = visible.filter((result) => result.status === STATUS.UNKNOWN).length;

  app.innerHTML = `
    <header class="site-header">
      <div class="brand">
        <img src="./assets/zoomlion.png" alt="ZOOMLION">
        <div><strong>塔机智能选型</strong><span>知识库确认数据版</span></div>
      </div>
      <div class="header-meta"><span>7个中联型号</span><span>配置不跨塔身/基础/风压拼接</span></div>
    </header>
    <main>
      <section class="hero">
        <div>
          <span class="hero-kicker">ZOOMLION TOWER CRANE SELECTOR</span>
          <h1>从项目工况，找到可复核的完整塔机配置</h1>
          <p>普通工况优先、最长可满足臂长优先；非表格幅度按相邻档位给出确认或不能确定的结论。</p>
        </div>
        <div class="hero-mark"><span>01</span><strong>选型</strong></div>
      </section>

      <section class="input-section">
        <div class="section-heading">
          <div><span class="section-index">01</span><div><h2>项目工况</h2><p>空白筛选项表示不限，所有输入上限由当前型号库计算</p></div></div>
        </div>
        <div class="basic-filters">
          <label>塔机类型
            <select data-select-state="type">
              <option value="" ${state.type === "" ? "selected" : ""}>全部</option>
              <option value="flat" ${state.type === "flat" ? "selected" : ""}>平臂塔机</option>
              <option value="luffing" ${state.type === "luffing" ? "selected" : ""}>动臂塔机</option>
            </select>
          </label>
          <label>风压条件
            <select data-select-state="windCondition">
              ${filters.windConditions.map((wind) => `<option value="${wind}" ${wind === state.windCondition ? "selected" : ""}>${wind}${state.type === "luffing" ? "（样本未标时默认）" : ""}</option>`).join("")}
            </select>
          </label>
          <label>指定臂长
            <select data-select-number="specifiedJibLength">
              ${selectOptions(filters.jibLengths, state.specifiedJibLength, "自动选择最长可满足臂长", (value) => `${number(value)} m`)}
            </select>
          </label>
          <label>最小覆盖臂长
            <select data-select-number="minimumJibLength">
              ${selectOptions(filters.jibLengths, state.minimumJibLength, "仅按工作幅度", (value) => `至少 ${number(value)} m`)}
            </select>
          </label>
          <label>塔身体系
            <select data-select-state="mastSystem">
              ${selectOptions(filters.mastSystems, state.mastSystem, "不限塔身")}
            </select>
          </label>
          <label>基础形式
            <select data-select-state="baseType">
              <option value="" ${state.baseType === "" ? "selected" : ""}>不限基础</option>
              <option value="fixed" ${state.baseType === "fixed" ? "selected" : ""}>支腿/预埋基础</option>
              <option value="crossBase" ${state.baseType === "crossBase" ? "selected" : ""}>底架基础</option>
            </select>
          </label>
        </div>
        <div class="range-grid">
          ${rangeControl("radius", "工作幅度", state.radius, "m", bounds.radius)}
          ${rangeControl("requiredLoad", "需求起重量", state.requiredLoad, "t", bounds.load)}
          ${rangeControl("requiredHeight", state.type === "luffing" ? "塔身高度H" : state.type === "flat" ? "吊钩高度HUH" : "高度（平臂HUH / 动臂H）", state.requiredHeight, "m", bounds.height, "0表示不校核独立高度")}
        </div>
      </section>

      <section class="results-section">
        <div class="section-heading">
          <div><span class="section-index">02</span><div><h2>选型结果</h2><p>确认满足 ${satisfied} 型 · 不能确定 ${uncertain} 型 · 按完整配置和经济余量排序</p></div></div>
        </div>
        <div class="legend">
          <span><i class="dot satisfied"></i>确认满足</span>
          <span><i class="dot unknown"></i>不能确定</span>
          <span><i class="dot not_satisfied"></i>不能满足</span>
        </div>
        <div class="results-list">${visible.map(resultCard).join("")}</div>
      </section>
      ${comparison(results)}
    </main>
    <footer>
      数据来源于塔机专家知识库中已确认的中联样本。正式工程方案仍须按原始样本、适用标准及项目条件复核。
    </footer>`;
  bindEvents();
}

function scheduleRender() {
  if (queuedFrame) return;
  queuedFrame = requestAnimationFrame(() => {
    queuedFrame = 0;
    render();
  });
}

function bindEvents() {
  document.querySelectorAll("[data-select-state]").forEach((element) => {
    element.addEventListener("change", () => {
      state[element.dataset.selectState] = element.value;
      render();
    });
  });
  document.querySelectorAll("[data-select-number]").forEach((element) => {
    element.addEventListener("change", () => {
      state[element.dataset.selectNumber] = Number(element.value) || 0;
      render();
    });
  });
  document.querySelectorAll("[data-state]").forEach((element) => {
    element.addEventListener("input", () => {
      state[element.dataset.state] = Number(element.value);
      scheduleRender();
    });
  });
  document.querySelectorAll("[data-number-state]").forEach((element) => {
    element.addEventListener("change", () => {
      state[element.dataset.numberState] = Number(element.value);
      render();
    });
  });
  document.querySelectorAll("[data-compare]").forEach((button) => {
    button.addEventListener("click", () => {
      const code = button.dataset.compare;
      if (state.compare.has(code)) state.compare.delete(code);
      else state.compare.add(code);
      render();
    });
  });
  document.querySelector("#clear-compare")?.addEventListener("click", () => {
    state.compare.clear();
    render();
  });
}

async function init() {
  try {
    const loaded = await loadCatalog();
    models = loaded.models;
    render();
  } catch (error) {
    app.innerHTML = `<div class="fatal"><h1>数据加载失败</h1><p>${error.message}</p></div>`;
  }
}

init();
