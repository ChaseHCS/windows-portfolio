# Black-Box Jailbreak Testing of Foundation LLMs

> **TL;DR:** I ran black-box red-team evaluations against the safety guardrails of several foundation large language models — no model internals, only the interfaces a normal user has — to measure how reliably they refused disallowed requests and to map the *classes* of prompting that degraded those refusals. The work was systematic and measurement-driven, and anything I found that actually worked went to the vendor rather than into public writing. This report describes methodology and results at a high level; it contains no working bypass prompts.

## Scope

Testing was black-box by design: I treated each model as an opaque system and interacted only through its public chat or API surface, using my own accounts and within the providers' terms for security testing where applicable. I had no access to weights, training data, or system internals — which is exactly the position a real adversary occupies, and the reason black-box evaluation is worth doing.

The objective was to answer an empirical question: *how robust is the refusal behavior, and under what kinds of pressure does it bend?* I was measuring guardrail reliability, not building a toolkit to defeat it. Deliverables are a methodology, a taxonomy, and measurements — deliberately non-operational.

## Methodology

**Define the target behavior.** I started by fixing a clear, category-based definition of what a correctly-aligned model *should* refuse, so that "success" and "failure" were measurable rather than vibes. Each probe was scored against that rubric.

**Build a harness.** I scripted a test harness so prompts could be issued consistently and every transcript logged — same request, controlled variations, recorded outcome. Consistency matters because model behavior is stochastic; a single lucky or unlucky response proves nothing.

**Probe systematically, by technique class.** Rather than one-off clever prompts, I organized attempts into recognized families of guardrail-pressure — for example persona and framing shifts, instruction-hierarchy confusion, input obfuscation, and multi-turn escalation across a conversation. I varied one dimension at a time so I could attribute any change in behavior to a specific lever.

**Measure, don't anecdote.** For each model and each technique class I tracked refusal-versus-compliance rates across repeated trials, holding model version and sampling settings constant where I could and recording them where I couldn't. The output was a comparison grid, not a highlight reel.

**Disclose responsibly.** Where a technique reliably degraded a safety behavior, I treated it as a vulnerability: reported to the relevant provider and kept the working specifics out of any public artifact, including this one.

## Tools

- **Python** for the test harness, prompt orchestration, and result logging.
- **Provider APIs and chat interfaces** as the only points of contact with each model.
- **Prompt engineering** as the core technique, applied adversarially and structured as controlled experiments.
- **A logging / evaluation layer** to capture transcripts and compute per-technique success rates for comparison across models and versions.

## Findings

Kept intentionally high-level and non-actionable:

- Guardrail robustness was **uneven across models and across request categories** — a model solid against one class of pressure was often noticeably softer against another.
- **Multi-turn pressure generally outperformed single-shot attempts.** Refusals that held firm to a direct ask were more likely to erode when the same goal was approached gradually across a conversation.
- Behavior was **sensitive to framing and to sampling settings**, which is why single examples are misleading and repeated, controlled trials are the only honest way to report a result.
- The practical upshot: LLM safety is an **empirical, moving target**, not a solved checkbox — the right question is "how often, under what pressure," not "can it ever be made to."

## Takeaways

This project reframed AI safety for me as a measurement discipline that borrows directly from traditional security: define the policy, model the adversary, probe systematically, quantify, and disclose. The same instinct that drives binary analysis — assume the system has states its designers didn't intend, then go find them — transfers cleanly to language models. It's also the clearest example in my work of security research done with the brakes on: the value is in the measurement and the disclosure, not in publishing anything that makes a model easier to misuse.
