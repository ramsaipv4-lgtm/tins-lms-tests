# Day 2 memory recall

Close your notes before you start.

## Exercise 1 — Recite the deploy checklist (5 min)

**What to do:** Write the four steps you run before a deploy, from memory.

**The answer (check after):** Clean, build, check links, then deploy to staging first.

## Exercise 2 — Spot the leaked token (5 min)

**What to do:** Explain why a token in a committed file is a problem and what you do next.

**The answer (check after):** Anyone with the repo can use it; rotate the token and remove the file from history.

## Exercise 3 — Explain a rollback (5 min)

**What to do:** Explain in two sentences when and how you roll back a deploy.

**The answer (check after):** When the new deploy breaks the site, run kettle rollback to restore the previous one.
