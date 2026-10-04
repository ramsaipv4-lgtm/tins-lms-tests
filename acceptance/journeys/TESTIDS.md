# Test ids the journeys use that SPEC §6 does not name yet

SPEC §6 says every element a journey touches carries the `data-testid` named in the journey's file header.
The ids below are used by the hidden journeys but are **not** in SPEC v1. Add them to SPEC §6 (or change the
journeys) before the gate counts. Everything else is found by accessible role and English name; each journey's
header lists the names it relies on.

`<personId>` is the full id, e.g. `roster-person:l1`. `<n>` counts from 1, `<index>` from 0.

| Test id | Element | Used by |
|---|---|---|
| `app-ready` | App shell root; visible once the shell is interactive (rendered, handlers attached) | every journey, AC-100–102, smoke |
| `class-schedule`, `schedule-day-<index>` | Class schedule after publishing; one entry per class day | AC-80 |
| `gate-check-<checkId>` | One row per gate check inside `gate-report`, with `data-state="pass\|fail\|waived"` | AC-80 |
| `roster-<personId>` | A learner's row in the trainer's roster/attendance roll (text includes "verified" / "dropped" / "active") | AC-82, AC-152, AC-159 |
| `diag-q-<n>` | Question n (display order) of a diagnostic: radios or a text box | AC-84, AC-95 |
| `cards-due-count` | Number of cards due now (text contains the number) | AC-85, AC-89, AC-95 |
| `score-row-<rubricRowId>` | One row per rubric row inside `shift-score` | AC-86 |
| `standup-summary` | Stand-up summary; a blocked answer has `data-blocked="true"` (or is in `<mark>`) | AC-87 |
| `poker-result` | Result after `poker-reveal`: all cards, consensus or low/high voters asked to explain | AC-87 |
| `score-history` | A grade's history (original and corrected scores) | AC-88 |
| `doubt-list` | Doubt queue; each doubt is a `role=listitem` | AC-91 |
| `exit-tally` | Exit-ticket tally; each choice is a `role=listitem` ending with its count | AC-92 |
| `explain-covered`, `explain-missing`, `explain-misconceptions` | Explain-it-back feedback lists | AC-93 |
| `mastery-map` | Mastery map | AC-95 |
| `handover-pack` | Substitute's handover pack | AC-150 |
| `self-learn` | Self-learn (AI-delivered) player | AC-151 |
| `drop-confirm` | Drop confirmation dialog listing the `dropPlan` actions | AC-152 |
| `shift-timer` | Shift countdown showing the (accommodated) limit | AC-153 |
| `syllabus-draft`, `change-log` | Drafted syllabus; cohort change log with dates | AC-154 |
| `first-run` | First-run screen with the 4 choices | AC-155 |
| `home-<space>` (e.g. `home-learner`) | Home screen of a role space | AC-155 |
| `coach-plan` | Current coaching plan (shows its version) | AC-156 |
| `day-timeline` | Coach day timeline | AC-156 |
| `trainer-pack`, `package-library` | Per-day trainer pack; package library | AC-157 |
| `rehearsal-report` | Planned vs actual after a rehearsal | AC-158 |
| `learner-notes` | Trainer notes on a learner's profile | AC-159 |
| `digest`, `digest-<personId>` | Friday at-risk digest; one row per learner (level + reasons + `wa-<personId>`) | AC-160 |
| `lab-clusters` | Lab results grouped by failing checks; each cluster a `role=listitem` | AC-160 |
| `review-checklist`, `review-score` | Peer-review checklist; the review's score | AC-161 |
| `pair-timer` | Pair-programming swap timer | AC-161 |
| `portfolio-preview` | `<iframe>` previewing the generated portfolio | AC-162 |
| `incident-page` | Incident page with the acknowledge timer | AC-164 |
| `certificate-id` | Issued certificate id (12 Crockford characters) | AC-165 |
| `item-analysis`, `item-row-<itemId>` | Item analysis; a row has `data-flag="true"` when flagged | AC-166 |
| `misconception-suggestions` | Suggested misconceptions; each a `role=listitem` with Accept / Edit / Reject | AC-166 |
| `package-diff` | Changes between an uploaded package and the current one (days and questions) | AC-166 |
| `fire-drill`, `data-meter` | Fire-drill wizard; data meter | AC-167 |
| `heading-strike`, `celebration-wall` | Heading Strike round; team badges / merged-PR wall | AC-168 |
| `forge-exercise` | Practice-forge exercise, `data-state="todo\|done"` | AC-170 |

Also used, but not new:

- `toolbar-rectangle`, `toolbar-text`: upstream Excalidraw's own test ids; the board fork should keep them (AC-97).
- `setup-check` (SPEC): its items carry `data-state="pass\|fail"` (green/red) (AC-81).
- `section-<id>` (SPEC): rendered **only** for released sections; a locked section must not use this id (AC-83).
- `shot-confirm` (SPEC): treated as the confirmation panel holding the fields labelled "Calories" and "Protein" and a
  "Confirm" button (AC-94).
