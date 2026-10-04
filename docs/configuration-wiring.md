# Configuration wiring

Configuration is the single editor for session output and saved defaults. Deliverable renders a summary of the same config. An accepted session keeps its configuration for running, reopening and exporting; new defaults cannot rewrite it.

| Setting | Consumer |
| --- | --- |
| Litigant count | Seat synchronization, server limits, quote and debate loop |
| Master intelligence / saved explicit model | Provider catalog resolution before quote and execution |
| Per-seat intelligence and provider / Auto | Same catalog resolver; explicit master inheritance discards stale seat models |
| Conscience | Governing instructions in seat system prompts; actual token usage billing |
| Debate mode | Litigant prompt instructions |
| Independent / chain | Own argument history versus full debate history |
| Review target | Auditor score compared to target before approval / pause |
| Maximum iterations | Debate loop ceiling, validated from 1 through 20 |
| Maximum credits | Quote reservation and per-call spending checks; runtime displays the configured cap |
| Response depth | Debate token limits and final answer prompt / token limit |
| Answer style | Moderator and final answer prompts |
| Document creation | Answer-only skips building; document forces building; auto follows moderator routing |
| Document type | Architect blueprint instructions |
| Response view | Shared sessionOutput selection for session result, history, shared report and exports |
| Download format | TXT, Markdown, JSON, Word or PDF dispatcher |

`CourtConfigSchema` validates and normalizes configuration. Old `outputScope` values are translated once when read and are not retained; unused `outputPreference` is removed. There is no second runtime selector. Document creation resolves conflicting old artifact flags before use. API preference updates and template validation use the same field contract.

`sessionOutput` preserves the underlying court record and selects the requested presentation. Choosing individual responses does not skip the audit or run additional AI calls. The transcript and caveats remain accessible. Estimates remain estimates: actual usage is settled from provider token counts.

Validation covers normalization, configuration restoration, master/per-seat resolution, generation directives, document routing, all response selections, shared export content and browser interactions. Existing billing, ownership, credit-cap and continuation regression suites remain required deployment gates.
