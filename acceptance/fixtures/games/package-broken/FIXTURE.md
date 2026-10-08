# Fixture notes for test authors

This package is synthetic. "Kettle" is an invented static-site tool; nothing here is real course
material, personal data or a secret. The package is in the skill-template **v1.2 layout** and passes
every content-gate check (SPEC §4.29, G1 to G8). This file is part of the package, so the root
README's file table lists it.

Load it with `loadPackageFiles(dir)` from `acceptance/fixtures/core/loadPackage.mjs`. That module
also has `toV11Layout(files)` (companions moved into the track root) and `plantedDefects(files)`
(one broken copy per gate check, built in code).

## Layout

- Root: `README.md`, `COURSE-MAP.md`, `FIXTURE.md`.
- Track folder `track1/` with `README.md` and the day folders `day0/`, `day1/`, `day2/`.
- Each day folder: `README.md`, `quicklearn.md`, `deepdive.md`, `instructor_script.md`,
  `printable_handout.md`, `student_guide_dayNN.md`, `memory_recall_dayNN.md` (NN = 00, 01, 02).
- Graded items: `track1/shift/shift-pack-1.json` (Shift pack) and `track1/exam/bank.json` (exam bank).

## Days

| Index | Folder | Topic |
|---|---|---|
| 0 | `track1/day0` | Setup and first build |
| 1 | `track1/day1` | Pages and templates |
| 2 | `track1/day2` | Publishing the site |

## Day sections (every day, from `instructor_script.md`)

Day 0 uses an em dash in the time ranges, day 1 an en dash and day 2 a hyphen. The script's total
runtime line is `### Total runtime: **2.5 hours**` (9000 s); the timed sections add up to 9000 s.

| Id | Title | plannedSec | Graded |
|---|---|---|---|
| `warm-up` | Warm-up | 900 | no |
| `concept-walkthrough` | Concept walkthrough | 3600 | no |
| `break` | Break | 900 | no |
| `lab` | Lab | 2700 | no |
| `quiz` | Quiz | 900 | yes |

The heading `## Trainer notes` has no time range and is not a section.

## Diagnostic and cards

- Each `quicklearn.md` has `## 8-question diagnostic` with 8 numbered questions and `## Answer key`
  with 8 numbered answers.
- Each memory-recall file has 3 exercises, so 3 cards per day and 9 in total.

## Shift pack `shift-pack-1`

60 minutes, 4 tickets. Rubric row ids equal ticket ids; the first rubric mode is `live`.

| Ticket | Arrives (min) | SLA (min) | Priority | Variants | Check | Expected |
|---|---|---|---|---|---|---|
| T1 | 0 | 15 | p1 | 3 | answer | missing build step |
| T2 | 5 | 15 | p2 | none | command | kettle build --clean |
| T3 | 20 | 30 | p3 | 2 | file | pages/home.md |
| T4 | 30 | 20 | p2 | none | answer | expired token |

Rubric weights: live 3/2/2/3 (max 10), recorded 2/2/2/2 (max 8), emulated 1/1/1/1 (max 4).

## Exam bank `exam-1`

10 multiple-choice questions (`E1` to `E10`), each with `choices` and an `answer` letter. Pass mark
6 of 10, the same as the class default pass mark of 6 (SPEC §3).
