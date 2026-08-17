# Foodprint V2 deployment package

This directory contains the non-secret production deployment templates for the Tencent Cloud Lighthouse runtime.

- `compose.production.yml` runs the Next.js standalone image as a non-root container.
- `nginx/foodprint-http.conf` defines privacy-aware access-log fields (including request/upstream timings) and separate page/API/auth request-rate zones in the Nginx `http` context.
- `nginx/foodprint.conf` terminates TLS, redirects `www` to the canonical host, and proxies only to `127.0.0.1:3000`.
- `systemd/foodprint-compose.service` starts the Compose project after Docker is available.

The server must provide these paths before enabling the service:

```text
/etc/foodprint/production.env   # real runtime values; mode 0600
/opt/foodprint/current          # the checked-out/released application tree
/opt/foodprint/current/.deployment.env # non-secret image/version metadata
```

`.deployment.env` contains only release metadata, for example:

```dotenv
FOODPRINT_IMAGE=foodprint:git-sha
DEPLOYMENT_VERSION=git-sha
FOODPRINT_ENV_FILE=/etc/foodprint/production.env
```

The systemd unit runs Docker as root, while the SSH `deploy` account receives only the three systemd commands in `systemd/foodprint-deploy.sudoers`. Do not grant that account membership in the `docker` group.

Never put certificate private keys, Supabase service-role keys, database passwords, or filled environment files in this directory or in Git.

## One-time Tencent Cloud release setup

The production release workflow uploads an immutable image bundle as the
restricted `deploy` user and invokes one root-owned installer through sudo.
Before enabling `RELEASE_AUTOMATION_ENABLED=true`, a root operator must install
the new installer and sudo rule on the existing host:

For the first bootstrap, the files are not yet present in the old release. Use
the Tencent Cloud console or an already-approved root transport to copy these
two files to the host, then run the following as root. Do not grant the
`deploy` account unrestricted sudo or Docker access.

```bash
# After copying the two repository files to /tmp as foodprint-install-release
# and foodprint-deploy.sudoers:
sudo install -m 0755 /tmp/foodprint-install-release \
  /usr/local/sbin/foodprint-install-release
sudo install -m 0440 /tmp/foodprint-deploy.sudoers \
  /etc/sudoers.d/foodprint-deploy
sudo visudo -cf /etc/sudoers.d/foodprint-deploy
sudo install -d -o deploy -g deploy -m 0750 /opt/foodprint/incoming
sudo rm -f /tmp/foodprint-install-release /tmp/foodprint-deploy.sudoers
```

On later releases the same files are available under
`/opt/foodprint/current/deploy/`; the root operator may reinstall them from
there when the installer or sudo rule changes.

The workflow runs `sudo -n /usr/local/sbin/foodprint-install-release --check`
before it writes any production migration. This check validates the required
runtime variable names without printing their values, checks the systemd and
Nginx baseline, and confirms that the incoming directory is writable.

The existing `/etc/foodprint/production.env` must be reviewed once before the
first V2.3 release. It must contain the production Supabase values, the
existing server-only service-role and encryption values, and these V2.3 values:

```dotenv
NEXT_PUBLIC_APP_URL=https://foodprint.com.cn
NEXT_PUBLIC_MAP_PROVIDER=amap
AMAP_JS_KEY=<AMap Web端(JS API) key>
AMAP_SECURITY_KEY=<AMap JS security key>
DISCOVERY_DYNAMIC_MAP_ENABLED=true
```

Keep the file mode at `0600`. `AMAP_SECURITY_KEY` never belongs in the browser,
GitHub Actions, or Supabase client configuration. The separate Web Service key
used by `amap-poi-search` remains a Supabase Edge Function secret.

## One-time control-plane configuration

1. In the AMap console create or select a **Web端（JS API）** key and its
   matching JS security key. Add the exact production host
   `foodprint.com.cn` to the JS key's domain whitelist. The canonical `www`
   host redirects before the app loads; it is not a second application origin.
   Keep a separate test key for local experiments rather than adding local
   hosts to the production key.
2. In Supabase Edge Function Secrets, set `AMAP_WEBSERVICE_KEY` to the Web
   Service key used by `amap-poi-search`, and set
   `APP_ALLOWED_ORIGINS=https://foodprint.com.cn` (a comma-separated list is
   allowed only when each extra origin is intentional). Do not put either
   value in the browser bundle.
3. In Supabase Auth URL configuration, set the Site URL to
   `https://foodprint.com.cn` and allow
   `https://foodprint.com.cn/auth/callback`. Keep an old Vercel callback only
   during the rollback window if it is still needed.
4. In Supabase, do not paste the V2.3 migration into SQL Editor. After the PR
   is merged, the release workflow's `supabase db push` applies it once. Run
   the repository's production migration audit first; if history is missing,
   stop and reconcile it according to `docs/RELEASE_SOP.md`.

The JS key and security proxy are separate from the POI search path: the map
uses Tencent Cloud `/api/amap/_AMapService/`, while POI search uses the
Supabase Edge Function. Both must be configured for the full acceptance flow.

## GitHub Actions inputs

Repository Actions **secrets** required by `.github/workflows/release.yml`:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`
- `TENCENT_HOST`
- `TENCENT_DEPLOY_USER` (normally `deploy`)
- `TENCENT_SSH_PRIVATE_KEY`
- `TENCENT_KNOWN_HOSTS`
- `PRODUCTION_NEXT_PUBLIC_SUPABASE_URL`
- `PRODUCTION_NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Repository Actions **variables**:

- `TENCENT_PORT` (normally `22`)
- `PRODUCTION_NEXT_PUBLIC_ICP_RECORD`
- `RELEASE_AUTOMATION_ENABLED` — keep `false` until the host, Supabase,
  AMap, SSH key and migration audit have all been checked; then set it to
  `true`.

Populate `TENCENT_KNOWN_HOSTS` from a host key that the operator has verified
out-of-band; do not disable host-key checking. Do not paste any of the values
above into chat or commit them to the repository.

## Release behavior and rollback

The workflow runs from `main` only and requires the manual confirmation string
`DEPLOY_PRODUCTION`. It performs a migration dry-run, applies pending
migrations, deploys `amap-poi-search`, builds the image, uploads the bundle,
switches `/opt/foodprint/current`, restarts the systemd service, and checks
`/api/health`. The server installer keeps the previous release and restores it
if the service, health check, or Nginx reload fails.

No routine production SQL Editor operation is required. Schema changes and
Edge Function code go through the release workflow. Keep the old
`amap-static-map` Edge Function during the V2.3 observation window; retire it
only after the dynamic-map release has been stable and its logs show no active
callers.
