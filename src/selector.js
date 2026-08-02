const EPS = 1e-9;

export const STATUS = Object.freeze({
  SATISFIED: "satisfied",
  NOT_SATISFIED: "not_satisfied",
  UNKNOWN: "unknown",
  UNAVAILABLE: "unavailable",
});

function uniqueNumbers(values) {
  return [...new Set(values.map(Number).filter(Number.isFinite))].sort((a, b) => b - a);
}

function rowAnchors(row) {
  const anchors = [
    { radius: row.minRadius, capacity: row.maxLoad },
    { radius: row.maxLoadRadius, capacity: row.maxLoad },
    ...row.points
      .filter((point) => point.radius > row.maxLoadRadius + EPS)
      .map((point) => ({ radius: point.radius, capacity: point.capacity })),
  ].sort((a, b) => a.radius - b.radius);

  return anchors.filter(
    (point, index) => index === 0 || Math.abs(point.radius - anchors[index - 1].radius) > EPS,
  );
}

export function assessCapacity(row, radius, requiredLoad) {
  const anchors = rowAnchors(row);
  const last = anchors[anchors.length - 1];
  if (radius < row.minRadius - EPS || radius > last.radius + EPS) {
    return { status: STATUS.UNAVAILABLE, reason: "radius_out_of_range" };
  }

  if (radius <= row.maxLoadRadius + EPS) {
    const status = row.maxLoad + EPS >= requiredLoad ? STATUS.SATISFIED : STATUS.NOT_SATISFIED;
    return {
      status,
      capacity: row.maxLoad,
      lowerCapacity: row.maxLoad,
      upperCapacity: row.maxLoad,
      lookupRadius: radius,
      lookupMode: "rated-range",
    };
  }

  const exact = anchors.find((point) => Math.abs(point.radius - radius) <= EPS);
  if (exact) {
    return {
      status: exact.capacity + EPS >= requiredLoad ? STATUS.SATISFIED : STATUS.NOT_SATISFIED,
      capacity: exact.capacity,
      lowerCapacity: exact.capacity,
      upperCapacity: exact.capacity,
      lookupRadius: exact.radius,
      lookupMode: "exact",
    };
  }

  let lower = null;
  let upper = null;
  for (const point of anchors) {
    if (point.radius < radius) lower = point;
    if (point.radius > radius) {
      upper = point;
      break;
    }
  }
  if (!lower || !upper) return { status: STATUS.UNAVAILABLE, reason: "missing_bracket" };

  let status = STATUS.UNKNOWN;
  if (upper.capacity + EPS >= requiredLoad) status = STATUS.SATISFIED;
  else if (lower.capacity < requiredLoad - EPS) status = STATUS.NOT_SATISFIED;

  return {
    status,
    capacity: upper.capacity,
    lowerCapacity: lower.capacity,
    upperCapacity: upper.capacity,
    lowerRadius: lower.radius,
    upperRadius: upper.radius,
    lookupRadius: upper.radius,
    lookupMode: "right-column",
  };
}

function bestAssessment(rows, jibLength, radius, requiredLoad) {
  const candidates = rows
    .filter((row) => Math.abs(row.jibLength - jibLength) <= EPS)
    .map((row) => ({ row, assessment: assessCapacity(row, radius, requiredLoad) }))
    .filter(({ assessment }) => assessment.status !== STATUS.UNAVAILABLE);

  if (!candidates.length) return null;
  const priority = {
    [STATUS.SATISFIED]: 3,
    [STATUS.UNKNOWN]: 2,
    [STATUS.NOT_SATISFIED]: 1,
  };
  candidates.sort((a, b) => {
    const byStatus = priority[b.assessment.status] - priority[a.assessment.status];
    if (byStatus) return byStatus;
    const byCapacity = (b.assessment.capacity ?? -Infinity) - (a.assessment.capacity ?? -Infinity);
    if (Math.abs(byCapacity) > EPS) return byCapacity;
    return b.row.reeving - a.row.reeving;
  });
  return candidates[0];
}

function candidateJibs(model, input) {
  const all = uniqueNumbers([
    ...model.performance.ordinary.map((row) => row.jibLength),
    ...(model.performance.superlift || []).map((row) => row.jibLength),
  ]);
  if (input.specifiedJibLength) {
    return all.filter((length) => Math.abs(length - input.specifiedJibLength) <= EPS);
  }
  const minimum = Math.max(input.radius, input.minimumJibLength || 0);
  return all.filter((length) => length + EPS >= minimum);
}

export function choosePerformance(model, input) {
  const jibs = candidateJibs(model, input);
  if (!jibs.length) {
    return { status: STATUS.NOT_SATISFIED, reason: "jib_unavailable" };
  }

  const ordinary = jibs
    .map((jibLength) => ({
      jibLength,
      condition: "ordinary",
      result: bestAssessment(model.performance.ordinary, jibLength, input.radius, input.requiredLoad),
    }))
    .filter((item) => item.result);

  const ordinarySatisfied = ordinary.find((item) => item.result.assessment.status === STATUS.SATISFIED);
  if (ordinarySatisfied) {
    return {
      status: STATUS.SATISFIED,
      ...ordinarySatisfied,
      ordinaryStatus: STATUS.SATISFIED,
    };
  }

  const superlift = model.performance.superlift
    ? jibs
        .map((jibLength) => ({
          jibLength,
          condition: "superlift",
          result: bestAssessment(model.performance.superlift, jibLength, input.radius, input.requiredLoad),
        }))
        .filter((item) => item.result)
    : [];
  const superliftSatisfied = superlift.find((item) => item.result.assessment.status === STATUS.SATISFIED);
  if (superliftSatisfied) {
    const ordinaryAtJib = ordinary.find(
      (item) => Math.abs(item.jibLength - superliftSatisfied.jibLength) <= EPS,
    );
    return {
      status: STATUS.SATISFIED,
      ...superliftSatisfied,
      ordinaryStatus: ordinaryAtJib?.result.assessment.status || STATUS.NOT_SATISFIED,
    };
  }

  const uncertain = ordinary.find((item) => item.result.assessment.status === STATUS.UNKNOWN)
    || superlift.find((item) => item.result.assessment.status === STATUS.UNKNOWN);
  if (uncertain) {
    return {
      status: STATUS.UNKNOWN,
      ...uncertain,
      ordinaryStatus: ordinary.find((item) => item.jibLength === uncertain.jibLength)?.result.assessment.status
        || STATUS.NOT_SATISFIED,
    };
  }

  const closest = ordinary[0] || superlift[0];
  return {
    status: STATUS.NOT_SATISFIED,
    reason: "capacity",
    ...(closest || {}),
    ordinaryStatus: STATUS.NOT_SATISFIED,
  };
}

export function assessConfigurations(model, input, jibLength) {
  const wind = model.wind[input.windCondition];
  if (!wind) {
    return {
      status: STATUS.UNKNOWN,
      reason: "wind_unavailable",
      configurations: [],
    };
  }

  const filtered = wind.configurations.filter((configuration) => {
    if (input.mastSystem && configuration.mastSystem !== input.mastSystem) return false;
    if (input.baseType && configuration.baseType !== input.baseType) return false;
    return true;
  });
  if (!filtered.length) {
    return {
      status: STATUS.NOT_SATISFIED,
      reason: "configuration_unavailable",
      configurations: [],
    };
  }

  const assessed = filtered.map((configuration) => {
    const maxHeight = configuration.heightByJib
      ? configuration.heightByJib[String(jibLength)]
      : configuration.freeStandingHeight;
    let status = STATUS.SATISFIED;
    let reason = null;
    if (input.requiredHeight > 0) {
      if (maxHeight == null) {
        status = STATUS.UNKNOWN;
        reason = "height_data_missing";
      } else if (configuration.heightStatus !== "confirmed") {
        status = STATUS.UNKNOWN;
        reason = "sample_footnote_review_required";
      } else if (input.requiredHeight > maxHeight + EPS) {
        status = STATUS.NOT_SATISFIED;
        reason = "height";
      }
    }
    return { ...configuration, maxHeight, status, reason };
  });

  const satisfied = assessed.filter((item) => item.status === STATUS.SATISFIED);
  const unknown = assessed.filter((item) => item.status === STATUS.UNKNOWN);
  if (satisfied.length) {
    satisfied.sort((a, b) => (b.maxHeight ?? 0) - (a.maxHeight ?? 0));
    return { status: STATUS.SATISFIED, configurations: assessed, selected: satisfied[0] };
  }
  if (unknown.length) {
    return { status: STATUS.UNKNOWN, configurations: assessed, selected: unknown[0] };
  }
  return {
    status: STATUS.NOT_SATISFIED,
    reason: "height",
    configurations: assessed,
    selected: assessed[0],
  };
}

export function evaluateModel(model, input) {
  if (input.type && model.type !== input.type) {
    return { model, status: STATUS.UNAVAILABLE, reason: "type" };
  }

  const performance = choosePerformance(model, input);
  if (!performance.jibLength) {
    return { model, performance, status: performance.status, reason: performance.reason };
  }

  const configuration = assessConfigurations(model, input, performance.jibLength);
  let status = STATUS.SATISFIED;
  if (performance.status === STATUS.NOT_SATISFIED || configuration.status === STATUS.NOT_SATISFIED) {
    status = STATUS.NOT_SATISFIED;
  } else if (performance.status === STATUS.UNKNOWN || configuration.status === STATUS.UNKNOWN) {
    status = STATUS.UNKNOWN;
  }

  const capacity = performance.result?.assessment.capacity ?? null;
  const margin = capacity == null ? null : capacity - input.requiredLoad;
  const marginRate = margin == null || input.requiredLoad <= 0 ? null : margin / input.requiredLoad;
  return {
    model,
    status,
    performance,
    configuration,
    capacity,
    margin,
    marginRate,
    reason: status === STATUS.SATISFIED ? null : performance.reason || configuration.reason,
  };
}

export function evaluateCatalog(models, input) {
  const results = models.map((model) => evaluateModel(model, input));
  const statusPriority = {
    [STATUS.SATISFIED]: 3,
    [STATUS.UNKNOWN]: 2,
    [STATUS.NOT_SATISFIED]: 1,
    [STATUS.UNAVAILABLE]: 0,
  };
  return results.sort((a, b) => {
    const byStatus = statusPriority[b.status] - statusPriority[a.status];
    if (byStatus) return byStatus;
    const byCondition = Number(a.performance?.condition === "superlift")
      - Number(b.performance?.condition === "superlift");
    if (byCondition) return byCondition;
    const byMargin = (a.marginRate ?? Infinity) - (b.marginRate ?? Infinity);
    if (Math.abs(byMargin) > EPS) return byMargin;
    return a.model.maxLoad - b.model.maxLoad;
  });
}

export function deriveBounds(models, filters = {}) {
  const scoped = models.filter((model) => !filters.type || model.type === filters.type);
  const rows = scoped.flatMap((model) => [
    ...model.performance.ordinary,
    ...(model.performance.superlift || []),
  ]);
  const configurations = scoped.flatMap((model) =>
    Object.values(model.wind).flatMap((wind) => wind.configurations),
  );
  const heightValues = configurations.flatMap((configuration) => [
    configuration.freeStandingHeight,
    ...Object.values(configuration.heightByJib || {}),
  ]).filter(Number.isFinite);
  const radiusValues = rows.flatMap((row) => [
    row.minRadius,
    row.maxLoadRadius,
    ...row.points.map((point) => point.radius),
  ]);

  return {
    radius: {
      min: Math.floor(Math.min(...radiusValues) * 2) / 2,
      max: Math.max(...scoped.map((model) => model.maxJibLength)),
      step: 0.5,
    },
    load: {
      min: 0.1,
      max: Math.max(...scoped.map((model) => model.maxLoad)),
      step: 0.1,
    },
    height: {
      min: 0,
      max: Math.ceil(Math.max(...heightValues)),
      step: 0.1,
    },
  };
}

export function availableFilters(models, type = "") {
  const scoped = models.filter((model) => !type || model.type === type);
  return {
    jibLengths: uniqueNumbers(scoped.flatMap((model) => model.jibLengths)),
    windConditions: [...new Set(scoped.flatMap((model) => model.windConditions))],
    mastSystems: [...new Set(scoped.flatMap((model) => model.mastSystems))].sort(),
  };
}
