# Project agent instructions

Follow `C:\Users\coldh\Desktop\agent-control-plane\instructions\GLOBAL.md`.
Before editing, read `docs/agent/HANDOFF.md` and `docs/agent/DECISIONS.md`.
Update `docs/agent/HANDOFF.md` before ending a turn that changes implementation state.

Use the installed TypeSafe skill at `.agents/skills/typesafe-ai/SKILL.md`
when working on this project, following its documented scope and live-docs guidance.
The user explicitly requested this skill. Preserve the project's existing stack
and keep deterministic rules, calculations, rendering and execution in code, as
the skill directs; apply TypeSafe judgments where the requested feature needs
semantic understanding.
