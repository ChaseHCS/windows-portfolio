# Windows Dynamic Analysis & Exploit Development

> **TL;DR:** In an isolated lab I ran Windows PE executables under instrumentation and a debugger to watch how they actually behaved at runtime, hunting for **logic flaws** — the places where a program trusts input, state, or ordering it shouldn't — and then built working proof-of-concept exploits against those flaws. The emphasis was on *dynamic* behavior: what the binary does when you feed it the unexpected, not just what the disassembly says it should do. This report is sanitized to methodology and outcomes; it contains no weaponized payloads or target names.

## Scope

All analysis was performed against software I owned or was explicitly authorized to test, inside a snapshot-based Windows VM with no network path to anything outside my control. The objective was research and skill-building: take a compiled Windows executable, observe it running, and find the logic errors — missing checks, broken assumptions about state, mishandled edge cases — that let a program be driven somewhere its author never intended. Where I found one, I wrote a proof-of-concept exploit to prove the flaw was real and reachable, and stopped there.

Deliverables were kept at PoC altitude on purpose: enough to demonstrate the flaw in the lab and reason about impact, nothing turnkey.

## Methodology

**Runtime observation over static assumption.** I started each target by running it under a debugger and process-monitoring tooling and simply watching: which files and registry keys it touched, how it parsed input, where it branched on values I could influence, and what state it carried between operations. Dynamic analysis surfaces the behavior that a static read of the code can miss — race windows, order-of-operations bugs, and trust decisions made at runtime.

**Hunting logic flaws.** Rather than chasing only memory-corruption bugs, I focused on logic: validation that happened in the wrong place or not at all, checks that could be satisfied without meeting their intent, state that could be desynchronized, and privilege or trust assumptions that didn't hold once I controlled the inputs. These are often the more interesting findings because they live above the mitigations.

**Driving the unexpected.** With a hypothesis formed, I fed the program malformed, boundary, and out-of-order inputs and watched how its internal state responded, iterating toward a condition the developer clearly hadn't anticipated. I triaged each anomaly to root cause instead of stopping at the first odd behavior.

**Building the PoC.** Once a flaw was understood, I wrote Python tooling to drive the target to the vulnerable state reliably and demonstrate the exploit in the lab. Repeatability was the bar — a one-in-ten result isn't a finding, it's noise.

## Tools

- **Debugging:** x64dbg and WinDbg for runtime inspection and control-flow tracing.
- **Behavioral monitoring:** Sysinternals (Process Monitor, Process Explorer) to observe file, registry, and process activity live.
- **Static support:** Ghidra / IDA to orient on the code paths worth watching at runtime.
- **Scripting:** Python to automate interaction and to build the PoC drivers.
- **Environment:** a network-isolated, snapshot-restored Windows VM.

## Findings

- Developed a repeatable dynamic-analysis workflow that takes an unknown Windows binary from first run to a validated, lab-proven logic-flaw exploit.
- Built the habit of reasoning about a program as a running system with mutable state, which is where logic flaws hide, rather than as a static listing.
- Produced reusable Python PoC tooling that makes a discovered flaw reproducible on demand — the difference between "I think this is a bug" and "here is the bug, triggered reliably."

## Takeaways

Logic flaws are a humbling class of bug: the code can be memory-safe, pass every mitigation, and still be exploitable because it trusted the wrong thing at the wrong moment. Learning to find them meant learning to watch software instead of just reading it. That runtime-first instinct — assume the program has states its designers never tested, then go drive it into one — is the same muscle I use everywhere else in my security work, and it fed directly into my OSCP preparation.
