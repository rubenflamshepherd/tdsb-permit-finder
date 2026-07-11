import { describe, expect, it } from "vitest";
import { readDatabaseConfig } from "../lib/database-config";

const cloudEnv = {
  CLOUD_SQL_INSTANCE_CONNECTION_NAME: "project:northamerica-northeast1:tdsb-db",
  CLOUD_SQL_DATABASE: "tdsb_permit_finder_production",
  CLOUD_SQL_USER: "tdsb_prod_app",
  CLOUD_SQL_PASSWORD: "not-a-real-password",
};

describe("readDatabaseConfig", () => {
  it("uses direct Prisma connections when Cloud SQL is not configured", () => {
    expect(readDatabaseConfig({ DATABASE_URL: "postgresql://localhost/local" })).toEqual({ kind: "direct" });
    expect(readDatabaseConfig({ CLOUD_SQL_INSTANCE_CONNECTION_NAME: "  " })).toEqual({ kind: "direct" });
  });

  it("parses Cloud SQL configuration with a serverless-safe default pool", () => {
    expect(readDatabaseConfig(cloudEnv)).toEqual({
      kind: "cloud-sql",
      instanceConnectionName: cloudEnv.CLOUD_SQL_INSTANCE_CONNECTION_NAME,
      database: cloudEnv.CLOUD_SQL_DATABASE,
      schema: "tdsb_finder",
      user: cloudEnv.CLOUD_SQL_USER,
      password: cloudEnv.CLOUD_SQL_PASSWORD,
      poolMax: 2,
      credentials: undefined,
    });
  });

  it("accepts an explicit pool size for sync jobs", () => {
    expect(readDatabaseConfig({ ...cloudEnv, CLOUD_SQL_POOL_MAX: "10" })).toMatchObject({ poolMax: 10 });
  });

  it("accepts an explicit target schema", () => {
    expect(readDatabaseConfig({ ...cloudEnv, CLOUD_SQL_SCHEMA: "custom" })).toMatchObject({ schema: "custom" });
  });

  it.each(["public, malicious", "schema-name", "1schema"])('rejects invalid schema name "%s"', (schema) => {
    expect(() => readDatabaseConfig({ ...cloudEnv, CLOUD_SQL_SCHEMA: schema })).toThrow(
      "CLOUD_SQL_SCHEMA must be a valid PostgreSQL identifier",
    );
  });

  it.each(["0", "21", "1.5", "many"])('rejects invalid pool size "%s"', (poolMax) => {
    expect(() => readDatabaseConfig({ ...cloudEnv, CLOUD_SQL_POOL_MAX: poolMax })).toThrow(
      "CLOUD_SQL_POOL_MAX must be an integer between 1 and 20",
    );
  });

  it.each(["CLOUD_SQL_DATABASE", "CLOUD_SQL_USER", "CLOUD_SQL_PASSWORD"] as const)(
    "requires %s in Cloud SQL mode",
    (name) => {
      expect(() => readDatabaseConfig({ ...cloudEnv, [name]: undefined })).toThrow(
        `${name} is required when CLOUD_SQL_INSTANCE_CONNECTION_NAME is set`,
      );
    },
  );

  it("parses an inline service-account key for Vercel", () => {
    const credentials = {
      type: "service_account",
      project_id: "project",
      client_email: "vercel@project.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nexample\n-----END PRIVATE KEY-----\n",
    };
    expect(readDatabaseConfig({
      ...cloudEnv,
      GCP_SERVICE_ACCOUNT_KEY_JSON: JSON.stringify(credentials),
    })).toMatchObject({ credentials });
  });

  it("rejects malformed or incomplete service-account JSON", () => {
    expect(() => readDatabaseConfig({ ...cloudEnv, GCP_SERVICE_ACCOUNT_KEY_JSON: "{" })).toThrow(
      "GCP_SERVICE_ACCOUNT_KEY_JSON must contain valid JSON",
    );
    expect(() => readDatabaseConfig({
      ...cloudEnv,
      GCP_SERVICE_ACCOUNT_KEY_JSON: JSON.stringify({ client_email: "missing-key@example.com" }),
    })).toThrow("GCP_SERVICE_ACCOUNT_KEY_JSON must contain client_email and private_key");
  });
});
