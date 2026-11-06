const assert = require("node:assert/strict");
const trend = require("../www/js/trend-presentation.js");

assert.deepEqual(
  trend.getTrendPresentation({ deltaMv: -18 }).semantic,
  "improved",
  "a more-negative reading is an improvement",
);
assert.equal(trend.getTrendPresentation({ deltaMv: 85 }).semantic, "worsened");
assert.equal(trend.getTrendPresentation({ deltaMv: -5 }).semantic, "stable");
assert.equal(trend.getTrendPresentation({ deltaMv: 5 }).semantic, "stable");
assert.equal(trend.getTrendPresentation({ deltaMv: null }).semantic, "unknown");
assert.equal(trend.getTrendPresentation({ deltaMv: -20, semanticStatus: "Worsened" }).semantic, "worsened", "database semantic trend takes precedence when supplied");

const improvedMarkup = trend.renderTrendValue({ deltaMv: -18 });
assert.match(improvedMarkup, /fa-arrow-trend-up/);
assert.match(improvedMarkup, /Improved/);
assert.match(improvedMarkup, /aria-label="-18 mV, Improved"/);

const unknownMarkup = trend.renderTrendValue({ deltaMv: null, context: "comparison" });
assert.match(unknownMarkup, /fa-circle-minus/);
assert.match(unknownMarkup, /No comparison/);
assert.match(unknownMarkup, />—</);

console.log("trend-presentation: corrosion-specific direction, stable tolerance, icons and accessible labels passed");
