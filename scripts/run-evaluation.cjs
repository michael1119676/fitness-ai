const fs = require("fs");
const path = require("path");
const { root } = require("./register-typescript.cjs");

const {
  runDeterministicEvaluationSuite
} = require(path.join(root, "src/lib/evaluation/scenarios.ts"));
const {
  summarizeEvaluation
} = require(path.join(root, "src/lib/evaluation/constraint-evaluator.ts"));

const results = runDeterministicEvaluationSuite();
const summary = summarizeEvaluation(results);
const percent = (value) => `${(value * 100).toFixed(1)}%`;
const report = {
  methodology: "deterministic synthetic scenario evaluation; no external AI call",
  summary,
  scenarios: results
};

console.log(JSON.stringify(report, null, 2));

if (process.argv.includes("--write")) {
  const outputPath = path.join(root, "docs/evaluation-results.md");
  const generatedAt = new Date().toISOString();
  const rows = results.map((result) =>
    `| ${result.id} | ${result.source} | ${result.validPlan ? "yes" : "no"} | ${
      result.violations.length === 0
        ? "none"
        : result.violations.map((item) => item.code).join(", ")
    } |`
  );
  const markdown = [
    "# Deterministic planning evaluation",
    "",
    `Generated: ${generatedAt}`,
    "",
    "This report is produced by `npm run evaluate:write` from synthetic inputs. It does not measure medical correctness, model accuracy, latency, or live OpenAI quality.",
    "",
    "## Measured results",
    "",
    `- Scenarios: ${summary.scenarioCount}`,
    `- Constraint-violation rate: ${percent(summary.constraintViolationRate)} (${summary.constraintViolationScenarioCount}/${summary.scenarioCount} scenarios)`,
    `- Valid-plan rate: ${percent(summary.validPlanRate)} (${summary.validPlanCount}/${summary.scenarioCount} scenarios)`,
    `- Fallback success rate: ${percent(summary.fallbackSuccessRate)} (${summary.fallbackSuccessCount}/${summary.fallbackScenarioCount} fallback scenarios)`,
    "",
    "| Scenario | Decision source | Valid plan | Violations |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "A scenario is valid when the post-validation decision and final workout plan contain no forbidden muscle/movement, unavailable equipment, unavailable movement slot, time-limit overflow, or empty active plan. A rest recommendation with no exercises is valid. Fallback success is validity among deterministic fallback scenarios.",
    ""
  ].join("\n");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, markdown);
}
