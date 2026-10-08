# Automated DISA STIG Hardening with Ansible & OpenSCAP

> **TL;DR:** I built a compliance-as-code pipeline in my lab that applies **DISA STIG** hardening to both **RHEL** and **Windows Server** using **Ansible**, then independently verifies the result by scanning each host with **OpenSCAP**. The goal was to turn a sprawling manual checklist into something idempotent, repeatable, and measurable — apply the baseline, scan, read the score, close the gaps, scan again. It's the defensive counterpart to my offensive work: the same systems, seen from the blue side.

## Scope

This was a lab project across RHEL and Windows Server VMs I controlled end to end. The objective was to automate Security Technical Implementation Guide (STIG) hardening — the Department of Defense's configuration baselines — so that bringing a fresh host into compliance was a playbook run rather than days of manual registry edits and `/etc` surgery, and to prove the result with an independent scanner instead of taking the playbook's word for it.

## Methodology

**Pick the baseline.** I started from the published STIG benchmarks for each platform and the SCAP Security Guide content, deciding which controls applied to the lab's role and documenting any that were intentionally tailored out so the deviations were explicit rather than silent.

**Harden with Ansible.** I authored and adapted Ansible roles and playbooks to apply the controls — account and password policy, auditing and logging, service and protocol lockdown, filesystem and registry settings — across both RHEL and Windows Server. Idempotency was the design goal: running the playbook twice changes nothing the second time, and a drifted host is pulled back into line on the next run.

**Verify with OpenSCAP.** Hardening you don't measure is hardening you don't have. After each apply I scanned every host with OpenSCAP (`oscap`) against the matching SCAP/STIG profile, generating a pass/fail report and a compliance score per host.

**Close the loop.** I treated the scan report as the source of truth: triage each failed rule, decide whether it was a real gap in my automation or a justified tailoring, fix the playbook, and re-scan. Iterating apply → scan → remediate drove the compliance score up while keeping every change captured in code.

## Tools

- **Configuration management:** Ansible (roles and playbooks) for cross-platform, idempotent remediation.
- **Compliance scanning:** OpenSCAP / `oscap` with SCAP Security Guide content and STIG profiles.
- **Benchmarks:** DISA STIG baselines for RHEL and Windows Server.
- **Targets:** RHEL and Windows Server VMs in an isolated lab.

## Findings

- Converted a large, error-prone manual STIG checklist into a version-controlled, repeatable pipeline that hardens a fresh RHEL or Windows Server host in a single run.
- Used independent OpenSCAP scanning to turn "we applied the STIG" into a measured compliance score, with a clear, shrinking list of exceptions.
- Demonstrated remediation of configuration drift: because the playbooks are idempotent, a host that wandered off-baseline is corrected on the next run and re-verified by scan.

## Takeaways

Most of my project work is offensive, and this was a deliberate step onto the other side of the fence. Automating STIG compliance taught me how defenders actually scale hardening — as code, measured by an independent scanner, not as a one-time manual pass that silently rots. Understanding the baseline from the inside also sharpens the offensive side: knowing exactly which controls a well-hardened host enforces tells you where the real gaps are likely to be. Compliance-as-code, verified end to end, is a discipline I'd bring to any environment.
