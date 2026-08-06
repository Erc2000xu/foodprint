# Foodprint V2 deployment package

This directory contains the non-secret production deployment templates for the Tencent Cloud Lighthouse runtime.

- `compose.production.yml` runs the Next.js standalone image as a non-root container.
- `nginx/foodprint-http.conf` defines privacy-aware access-log fields and the request-rate zone in the Nginx `http` context.
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
