const fallbackVersion = "local";

/**
 * The release workflow injects the immutable Git SHA at runtime. Keep this
 * helper server-safe and deliberately small: the value is release metadata,
 * never a secret or a user identifier.
 */
export function deploymentVersion(env: Record<string, string | undefined> = process.env) {
  return env.DEPLOYMENT_VERSION?.trim() || env.VERCEL_GIT_COMMIT_SHA?.trim() || fallbackVersion;
}

export function shortDeploymentVersion(version = deploymentVersion()) {
  return version.length > 12 ? version.slice(0, 12) : version;
}
