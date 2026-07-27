# platform/config — `@kotodama/platform/config`

Env config from `effect/Config` (Tech spec §2.5). Registry + loader both live here; the loading
contract is documented on `config-provider-live.ts` itself. **Env files live git-ignored at the repo
root only** (`.env.example` is the template) — never a per-package `.env*` (Bun would silently
auto-load it from cwd, forking the config source).

- **`AwsClientConfig`** — the **single source of AWS client wiring** for every SDK client (SQS + S3):
  `{ region, endpoint?, credentials }`, resolved from env and **flattened from `Option` here, once**,
  so a service is just `new SQSClient(yield* AwsClientConfig)`. `AWS_ACCESS_KEY_ID`/`_SECRET_ACCESS_KEY`
  are **required** (missing ⇒ `ConfigError` at layer build — fail fast; every target has them);
  `AWS_SESSION_TOKEN` + `AWS_ENDPOINT_URL` are genuinely optional (Lambda role / LocalStack). The
  cred env keys are **private to this composer** — services consume the bundle, not the parts.
