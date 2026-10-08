# Day 2 quick learn: Publishing the site

Read this in ten minutes, then take the diagnostic. The full lesson is in the [deep dive](deepdive.md).

## 8-question diagnostic

1. Which command publishes the built site?
2. Which flag chooses the staging target?
3. Which file lists the deploy targets?
4. Which environment variable holds the deploy token?
5. Which command shows the last deploy result?
6. Which command rolls back to the previous deploy?
7. Which HTTP status means the site is up?
8. Which file must never be committed to the repo?

## Answer key

1. kettle deploy
2. --target staging
3. targets.toml
4. KETTLE_TOKEN
5. kettle status
6. kettle rollback
7. 200
8. .env
