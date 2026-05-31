# infra — `@lexiai/infra`

Local dev infra (Docker Compose) now; Pulumi production stack later.

- `local/docker-compose.yml`: Postgres (`lexiai_dev` + `lexiai_test`) + LocalStack (SQS + S3).
- Scripts: `local:up` / `local:down` / `local:logs`.
- No production deps yet; never imported by application code.
