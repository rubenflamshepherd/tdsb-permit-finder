export type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

export type DatabaseConfig =
  | { kind: "direct" }
  | {
      kind: "cloud-sql";
      instanceConnectionName: string;
      database: string;
      schema: string;
      user: string;
      password: string;
      poolMax: number;
      credentials?: ServiceAccountCredentials;
    };

type Environment = Record<string, string | undefined>;

function required(env: Environment, name: string): string {
  const value = env[name];
  if (!value?.trim()) throw new Error(`${name} is required when CLOUD_SQL_INSTANCE_CONNECTION_NAME is set`);
  return value;
}

function poolMax(env: Environment): number {
  const raw = env.CLOUD_SQL_POOL_MAX ?? "2";
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 20) {
    throw new Error("CLOUD_SQL_POOL_MAX must be an integer between 1 and 20");
  }
  return value;
}

function serviceAccountCredentials(raw: string | undefined): ServiceAccountCredentials | undefined {
  if (!raw?.trim()) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("GCP_SERVICE_ACCOUNT_KEY_JSON must contain valid JSON");
  }

  if (
    typeof parsed !== "object"
    || parsed === null
    || !("client_email" in parsed)
    || typeof parsed.client_email !== "string"
    || !parsed.client_email.trim()
    || !("private_key" in parsed)
    || typeof parsed.private_key !== "string"
    || !parsed.private_key.trim()
  ) {
    throw new Error("GCP_SERVICE_ACCOUNT_KEY_JSON must contain client_email and private_key");
  }

  return parsed as ServiceAccountCredentials;
}

export function readDatabaseConfig(env: Environment = process.env): DatabaseConfig {
  const instanceConnectionName = env.CLOUD_SQL_INSTANCE_CONNECTION_NAME?.trim();
  if (!instanceConnectionName) return { kind: "direct" };

  return {
    kind: "cloud-sql",
    instanceConnectionName,
    database: required(env, "CLOUD_SQL_DATABASE").trim(),
    schema: env.CLOUD_SQL_SCHEMA?.trim() || "tdsb_finder",
    user: required(env, "CLOUD_SQL_USER").trim(),
    password: required(env, "CLOUD_SQL_PASSWORD"),
    poolMax: poolMax(env),
    credentials: serviceAccountCredentials(env.GCP_SERVICE_ACCOUNT_KEY_JSON),
  };
}
