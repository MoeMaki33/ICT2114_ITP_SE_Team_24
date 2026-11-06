(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.WeeklyLocationAggregator = api.WeeklyLocationAggregator;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const STATUS_ORDER = Object.freeze({
    Unprotected: 0,
    Warning: 1,
    "No Data": 2,
    Protected: 3,
  });

  const CONDITION_ORDER = Object.freeze({
    Critical: 0,
    "Attention Required": 1,
    "No Data": 2,
    Protected: 3,
  });

  const REPEATED_CROSSING_THRESHOLD = 3;

  function finiteNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeStatus(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "protected") return "Protected";
    if (normalized === "warning") return "Warning";
    if (normalized === "unprotected") return "Unprotected";
    return "No Data";
  }

  function statusForSummary(summary) {
    if (Number(summary?.readingCount || 0) === 0) return "No Data";
    return normalizeStatus(summary?.displayStatus || summary?.currentDisplayStatus);
  }

  function addIsoDays(isoDate, days) {
    const [year, month, day] = String(isoDate || "").split("-").map(Number);
    if (![year, month, day].every(Number.isFinite)) return "";
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
  }

  function isDeclining(summary) {
    const value = String(summary?.statusChange || "").toLowerCase();
    return value === "worsened" || value === "declined";
  }

  function normalizedTrend(summary) {
    const value = String(summary?.statusChange || "").trim().toLowerCase();
    if (value === "improved") return "Improved";
    if (value === "stable") return "Stable";
    if (value === "worsened" || value === "declined") return "Declining";
    return "Insufficient Data";
  }

  function hasRepeatedCrossings(summary) {
    return Number(summary?.thresholdCrossingCount || 0) >= REPEATED_CROSSING_THRESHOLD;
  }

  function attentionReasons(summary) {
    const reasons = [];
    const status = statusForSummary(summary);
    const trend = normalizedTrend(summary);
    const crossings = Math.max(0, Number(summary?.thresholdCrossingCount || 0));

    if (status === "Unprotected") reasons.push("Latest reading is Unprotected");
    else if (status === "Warning") reasons.push("Latest reading is in the Warning range");
    else if (status === "No Data") reasons.push("No weekly readings are available");

    if (trend === "Declining") reasons.push("Weekly trend is declining");
    else if (trend === "Insufficient Data" && status !== "No Data") reasons.push("Insufficient readings to determine a weekly trend");

    if (crossings >= REPEATED_CROSSING_THRESHOLD) {
      reasons.push(`${crossings} threshold crossings were recorded`);
    }

    return reasons;
  }

  function primaryAttentionReason(summary) {
    return attentionReasons(summary)[0] || "No attention condition detected";
  }

  function locationKey(summary) {
    return String(summary?.locationId || summary?.testPoint?.site || "unassigned");
  }

  function severityCategory(summary) {
    const status = statusForSummary(summary);
    if (status === "Unprotected") return 0;
    if (status === "Warning") return 1;
    const trend = normalizedTrend(summary);
    if (trend === "Declining") return 2;
    if (hasRepeatedCrossings(summary)) return 3;
    if (status === "No Data") return 4;
    if (trend === "Insufficient Data") return 5;
    if (trend === "Stable") return 6;
    return 7;
  }

  function needsAttention(summary) {
    const status = statusForSummary(summary);
    return status !== "Protected"
      || isDeclining(summary)
      || normalizedTrend(summary) === "Insufficient Data"
      || hasRepeatedCrossings(summary)
      || Number(summary?.readingCount || 0) === 0;
  }

  function compareAttention(first, second) {
    const categoryDifference = severityCategory(first) - severityCategory(second);
    if (categoryDifference) return categoryDifference;

    const firstPercentage = finiteNumber(first?.protectedPercentage);
    const secondPercentage = finiteNumber(second?.protectedPercentage);
    if (firstPercentage !== null || secondPercentage !== null) {
      if (firstPercentage === null) return 1;
      if (secondPercentage === null) return -1;
      if (firstPercentage !== secondPercentage) return firstPercentage - secondPercentage;
    }

    const firstLatest = finiteNumber(first?.latestReading);
    const secondLatest = finiteNumber(second?.latestReading);
    if (firstLatest !== null || secondLatest !== null) {
      if (firstLatest === null) return 1;
      if (secondLatest === null) return -1;
      if (firstLatest !== secondLatest) return secondLatest - firstLatest;
    }

    const changeDifference = Number(second?.changeFromStart || 0) - Number(first?.changeFromStart || 0);
    if (changeDifference) return changeDifference;

    const crossingDifference = Number(second?.thresholdCrossingCount || 0) - Number(first?.thresholdCrossingCount || 0);
    if (crossingDifference) return crossingDifference;

    return String(first?.testPointId || first?.testPoint?.testPointName || "")
      .localeCompare(String(second?.testPointId || second?.testPoint?.testPointName || ""), undefined, {
        sensitivity: "base",
        numeric: true,
      });
  }

  function conditionReasonFor(counts, {
    decliningCount = 0,
    insufficientDataCount = 0,
    repeatedCrossingPointCount = 0,
  } = {}) {
    if (counts.total === 0) return "No active Test Points are available for this Location.";
    if (counts.noData === counts.total) return "No Test Points have sufficient readings for the selected week.";
    if (counts.unprotected > 0) {
      return `${counts.unprotected} Unprotected Test Point${counts.unprotected === 1 ? "" : "s"} require immediate review.`;
    }
    if (counts.warning > 0) {
      return `${counts.warning} Test Point${counts.warning === 1 ? " is" : "s are"} currently in the Warning range.`;
    }
    if (counts.noData > 0) {
      return `${counts.noData} Test Point${counts.noData === 1 ? " has" : "s have"} no weekly data.`;
    }
    if (decliningCount > 0) {
      return `${decliningCount} protected Test Point${decliningCount === 1 ? " has" : "s have"} a declining weekly trend.`;
    }
    if (insufficientDataCount > 0) {
      return `${insufficientDataCount} Test Point${insufficientDataCount === 1 ? " has" : "s have"} insufficient data to determine a trend.`;
    }
    if (repeatedCrossingPointCount > 0) {
      return `${repeatedCrossingPointCount} Test Point${repeatedCrossingPointCount === 1 ? " has" : "s have"} repeated threshold crossings.`;
    }
    return "No weekly protection, trend or data-quality concerns were detected.";
  }

  class WeeklyLocationAggregator {
    aggregate(summaries) {
      return WeeklyLocationAggregator.aggregate(summaries);
    }

    calculateCondition(locationSummary) {
      return WeeklyLocationAggregator.conditionFor(
        locationSummary?.counts || locationSummary || { total: 0, protected: 0, warning: 0, unprotected: 0, noData: 0 },
        locationSummary || {},
      );
    }

    findWorstTestPoint(summaries) {
      return WeeklyLocationAggregator.findWorstTestPoint(summaries);
    }

    static normalizeStatus(value) { return normalizeStatus(value); }
    static isDeclining(summary) { return isDeclining(summary); }
    static normalizedTrend(summary) { return normalizedTrend(summary); }
    static statusForSummary(summary) { return statusForSummary(summary); }
    static needsAttention(summary) { return needsAttention(summary); }
    static compareAttention(first, second) { return compareAttention(first, second); }
    static attentionReasons(summary) { return attentionReasons(summary); }
    static primaryAttentionReason(summary) { return primaryAttentionReason(summary); }
    static conditionReasonFor(counts, context) { return conditionReasonFor(counts, context); }

    static isWeekInProgress(weekStart, todayIso = new Date().toISOString().slice(0, 10)) {
      const weekEnd = addIsoDays(weekStart, 6);
      return Boolean(weekEnd) && String(todayIso) >= String(weekStart) && String(todayIso) <= weekEnd;
    }

    static findWorstTestPoint(summaries) {
      return (Array.isArray(summaries) ? summaries : []).slice().sort(compareAttention)[0] || null;
    }

    static conditionFor(counts, {
      decliningCount = 0,
      insufficientDataCount = 0,
      repeatedCrossingPointCount = 0,
    } = {}) {
      if (counts.total === 0 || counts.noData === counts.total) return "No Data";
      if (counts.unprotected > 0) return "Critical";
      if (
        counts.warning > 0
        || counts.noData > 0
        || decliningCount > 0
        || insufficientDataCount > 0
        || repeatedCrossingPointCount > 0
      ) return "Attention Required";
      return "Protected";
    }

    static summarizeLocation(summaries, { locationId = null, siteName = null } = {}) {
      const points = Array.isArray(summaries) ? summaries : [];
      const counts = { total: points.length, protected: 0, warning: 0, unprotected: 0, noData: 0 };
      let weightedTotal = 0;
      let weightedCount = 0;
      let readingCount = 0;
      let thresholdCrossingCount = 0;
      let repeatedCrossingPointCount = 0;
      let decliningCount = 0;
      let improvedCount = 0;
      let stableCount = 0;
      let insufficientDataCount = 0;

      points.forEach((summary) => {
        const status = statusForSummary(summary);
        if (status === "Protected") counts.protected += 1;
        else if (status === "Warning") counts.warning += 1;
        else if (status === "Unprotected") counts.unprotected += 1;
        else counts.noData += 1;

        const pointReadingCount = Math.max(0, Number(summary?.readingCount || 0));
        const average = finiteNumber(summary?.weeklyAverage);
        if (average !== null && pointReadingCount > 0) {
          weightedTotal += average * pointReadingCount;
          weightedCount += pointReadingCount;
        }
        readingCount += pointReadingCount;
        thresholdCrossingCount += Math.max(0, Number(summary?.thresholdCrossingCount || 0));
        if (hasRepeatedCrossings(summary)) repeatedCrossingPointCount += 1;

        const trend = normalizedTrend(summary);
        if (trend === "Declining") decliningCount += 1;
        else if (trend === "Improved") improvedCount += 1;
        else if (trend === "Stable") stableCount += 1;
        else insufficientDataCount += 1;
      });

      const knownCount = counts.protected + counts.warning + counts.unprotected;
      const attentionPoints = points.filter(needsAttention).slice().sort(compareAttention);
      const conditionContext = { decliningCount, insufficientDataCount, repeatedCrossingPointCount };
      const condition = WeeklyLocationAggregator.conditionFor(counts, conditionContext);
      const worstTestPoint = WeeklyLocationAggregator.findWorstTestPoint(points);

      return {
        locationId: locationId || points[0]?.locationId || "unassigned",
        siteName: siteName || points[0]?.testPoint?.site || "Not available",
        condition,
        conditionReason: conditionReasonFor(counts, conditionContext),
        conditionRank: CONDITION_ORDER[condition],
        counts,
        totalPoints: counts.total,
        protectedCount: counts.protected,
        warningCount: counts.warning,
        unprotectedCount: counts.unprotected,
        noDataCount: counts.noData,
        knownCount,
        knownStatusCount: knownCount,
        protectedPercentage: knownCount ? (counts.protected / knownCount) * 100 : null,
        protectedPointPercentage: knownCount ? (counts.protected / knownCount) * 100 : null,
        weightedWeeklyAverage: weightedCount ? weightedTotal / weightedCount : null,
        weightedWeeklyAverageMv: weightedCount ? weightedTotal / weightedCount : null,
        readingCount,
        thresholdCrossingCount,
        repeatedCrossingPointCount,
        decliningCount,
        improvedCount,
        stableCount,
        insufficientDataCount,
        attentionCount: attentionPoints.length,
        attentionPoints,
        worstTestPoint,
        points,
      };
    }

    static aggregate(summaries) {
      const groups = new Map();
      (Array.isArray(summaries) ? summaries : []).forEach((summary) => {
        const locationId = locationKey(summary);
        if (!groups.has(locationId)) groups.set(locationId, []);
        groups.get(locationId).push(summary);
      });

      return [...groups.entries()]
        .map(([locationId, points]) => WeeklyLocationAggregator.summarizeLocation(points, { locationId }))
        .sort((first, second) => first.conditionRank - second.conditionRank
          || second.attentionCount - first.attentionCount
          || first.siteName.localeCompare(second.siteName, undefined, { sensitivity: "base", numeric: true }));
    }

    static aggregateVisibleLocations(summaries, visibleSummaries) {
      const visibleCounts = new Map();
      (Array.isArray(visibleSummaries) ? visibleSummaries : []).forEach((summary) => {
        const key = locationKey(summary);
        visibleCounts.set(key, (visibleCounts.get(key) || 0) + 1);
      });
      return WeeklyLocationAggregator.aggregate(summaries)
        .filter((location) => visibleCounts.has(String(location.locationId)))
        .map((location) => ({
          ...location,
          visibleCount: visibleCounts.get(String(location.locationId)) || 0,
          isFiltered: (visibleCounts.get(String(location.locationId)) || 0) < location.counts.total,
        }));
    }

    static summarizeOverall(summaries) {
      return WeeklyLocationAggregator.summarizeLocation(summaries, {
        locationId: "all",
        siteName: "All locations",
      });
    }
  }

  return { WeeklyLocationAggregator, STATUS_ORDER, CONDITION_ORDER, REPEATED_CROSSING_THRESHOLD };
});
