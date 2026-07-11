import { Connector, IpAddressTypes } from "@google-cloud/cloud-sql-connector";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { GoogleAuth } from "google-auth-library";
import { readDatabaseConfig } from "./database-config";

type PrismaState = {
  clientPromise?: Promise<PrismaClient>;
  connector?: Connector;
};

const globalForPrisma = globalThis as typeof globalThis & { prismaState?: PrismaState };
const state = globalForPrisma.prismaState ?? {};
globalForPrisma.prismaState = state;

async function createPrismaClient(): Promise<PrismaClient> {
  const config = readDatabaseConfig();
  if (config.kind === "direct") return new PrismaClient();

  const auth = config.credentials
    ? new GoogleAuth({
        credentials: config.credentials,
        scopes: ["https://www.googleapis.com/auth/sqlservice.admin"],
      })
    : undefined;
  const connector = new Connector(auth ? { auth } : undefined);

  try {
    const connectorOptions = await connector.getOptions({
      instanceConnectionName: config.instanceConnectionName,
      ipType: IpAddressTypes.PUBLIC,
    });
    const adapter = new PrismaPg(
      {
        ...connectorOptions,
        user: config.user,
        password: config.password,
        database: config.database,
        options: `-c search_path=${config.schema}`,
        max: config.poolMax,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
      },
      { schema: config.schema },
    );
    state.connector = connector;
    return new PrismaClient({ adapter });
  } catch (error) {
    connector.close();
    throw error;
  }
}

export function getPrisma(): Promise<PrismaClient> {
  if (state.clientPromise) return state.clientPromise;

  const clientPromise = createPrismaClient();
  state.clientPromise = clientPromise;
  void clientPromise.catch(() => {
    if (state.clientPromise === clientPromise) state.clientPromise = undefined;
  });
  return clientPromise;
}

export async function disconnectPrisma(): Promise<void> {
  const clientPromise = state.clientPromise;
  state.clientPromise = undefined;

  try {
    if (clientPromise) await (await clientPromise).$disconnect();
  } finally {
    state.connector?.close();
    state.connector = undefined;
  }
}
