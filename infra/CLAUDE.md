# infra — `@lexiai/infra`

Local dev infra (Docker Compose) now; Pulumi production stack later.

- `local/docker-compose.yml`: **dev** Postgres (`lexiai_dev`) + LocalStack (SQS + S3) + Jaeger.
  No test DB is provisioned — DB tests use a throwaway Testcontainers Postgres
  (`@lexiai/database/testing`), so there's no `init/` SQL to seed a `lexiai_test`.
- Scripts: `local:up` / `local:down` (stop + remove containers, **keeps** data volumes) /
  `local:clean` (`down -v` — also removes volumes) / `local:logs`.
- No production deps yet; never imported by application code.
