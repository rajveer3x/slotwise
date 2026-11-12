# 005 Explainable leave resolution

Scope: MVP. Dependencies: 004.

## Goal and flow

For approved leave, a coordinator sees each affected class with its first viable resolution tier, ranked candidates, score explanations and rejected alternatives. Allow selection into a draft plan, never direct publication. Extend the faculty impact preview with provisional coverage estimates clearly labelled as estimates.

Follow [ui-ux.md](../ui-ux.md)'s master/detail resolution workspace and labelled tier sequence, stacking on mobile. Candidate cards use a concise recommendation reason and keyboard-accessible disclosure for detailed scoring. Do not add unsupported confidence percentages or animated decorative boards.

## Engine contract

Input: immutable snapshot of occurrences, available resources, qualifications, leave, policies, selected batch reservations, current time and revision. Output per obligation: candidates, tier, score contributions, rejection reason codes, searchComplete flag and unresolved reason. Keep the engine pure and deterministic; persist draft plans through an authorized service.

Implement the five tiers and score rules in domain-rules.md. Distinguish no valid candidate from search incomplete. A resource chosen in one batch item cannot also be selected for an overlapping item. Re-run the remaining batch when a choice changes. Support equal-duration same-section swaps with both destination checks. Online removes room requirements only. Saturday candidates remain approval-required. No machine learning or external AI service.

## Acceptance criteria

1. Given a qualified available substitute, when solving, then tier 1 candidates appear in deterministic order with human-readable reasons.
2. Given no substitute but a valid two-class swap, when solving, then both resulting assignments pass hard constraints.
3. Given two makeups competing for one free slot, when selecting a batch, then they cannot both occupy that resource interval.
4. Given online is disabled or a lab class, when solving, then no online candidate is offered.
5. Given no valid option, when solving, then the obligation stays unresolved rather than violating a hard rule.
6. Given the same snapshot and policy version, when rerunning, then results match; an incomplete search never claims proven infeasibility.

## Checks and demo

Unit fixtures exercise each tier, rejected constraints, tie-breaks, batch contention and semester boundary. Integration-test draft ownership and revision capture. Demo a candidate explanation and an unresolved class. Cover responses and publication come later.

## Implementation prompt

```text
Read AGENTS.md, domain rules and architecture. Implement
context/feature-specs/005-resolution-engine.md with deterministic pure
TypeScript rules and an explainable resolution board. Do not publish
plans yet. Follow the common completion contract and update progress.
```
