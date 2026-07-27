# Deterministic planning evaluation

Generated: 2026-07-27T05:43:44Z

This report is produced from the current code by `npm run evaluate` using synthetic inputs. It does not measure medical correctness, model accuracy, latency, or live OpenAI response quality.

## Measured results

- Scenarios: 10
- Constraint-violation rate: 0.0% (0/10 scenarios)
- Valid-plan rate: 100.0% (10/10 scenarios)
- Fallback success rate: 100.0% (9/9 fallback scenarios)

| Scenario | Decision source | Valid plan | Violations |
| --- | --- | --- | --- |
| baseline | fallback | yes | none |
| forbidden-lower-body | fallback | yes | none |
| pain-shoulder | fallback | yes | none |
| short-15-minute-session | fallback | yes | none |
| explicit-rest | fallback | yes | none |
| low-recovery-rest | fallback | yes | none |
| unavailable-equipment | fallback | yes | none |
| no-equipment | fallback | yes | none |
| machine-only | fallback | yes | none |
| invalid-ai-slots-sanitized | openai-shaped synthetic input | yes | none |

A scenario is valid when the post-validation decision and final workout plan contain no forbidden muscle or movement, unavailable equipment, unavailable movement slot, time-limit overflow, or empty active plan. A rest recommendation with no exercises is valid. Fallback success is validity among deterministic fallback scenarios.
