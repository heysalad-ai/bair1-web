import { createHash } from "node:crypto";
import {
  TransactWriteItemsCommand,
  TransactionCanceledException,
} from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./aws-dynamo";
import { storageTable } from "./storage-config";
import { accessStoreEnabled } from "./access-store";

// Request reservations, not billing meters. No refund on downstream failure:
// retries and concurrent workers must not bypass a provider-call ceiling.
export const serviceBudgets = {
  chat: { subject: 30, global: 300 },
  voice: { subject: 10, global: 100 },
  environment: { subject: 120, global: 1000 },
  insight: { subject: 40, global: 100 },
  workspace: { subject: 50, global: 500 },
  share: { subject: 50, global: 500 },
  geolocation: { subject: 120, global: 1000 },
} as const;
export class UsageBudgetError extends Error {
  constructor(public status: 429 | 503) {
    super(
      status === 429
        ? "Daily service limit reached. Try again tomorrow (UTC)."
        : "Service usage controls are unavailable. Try again later.",
    );
  }
}
export async function reserveUsage(
  service: keyof typeof serviceBudgets,
  subject: string,
  now = Date.now(),
) {
  if (
    !accessStoreEnabled() ||
    (["chat", "voice", "environment", "insight", "geolocation"].includes(
      service,
    ) &&
      process.env.BAIR1_PAID_FEATURES_ENABLED !== "true")
  )
    throw new UsageBudgetError(503);
  const day = new Date(now).toISOString().slice(0, 10),
    budget = serviceBudgets[service];
  const subjectHash = createHash("sha256").update(subject).digest("hex");
  try {
    await dynamoClient.send(
      new TransactWriteItemsCommand({
        TransactItems: [
          { name: "global", limit: budget.global },
          { name: subjectHash, limit: budget.subject },
        ].map((scope) => ({
          Update: {
            TableName: storageTable("bair1-access"),
            Key: {
              scope: { S: `usage:${service}:${day}` },
              entry: { S: scope.name },
            },
            UpdateExpression: "SET expiresAt = :ttl ADD #count :one",
            ConditionExpression:
              "attribute_not_exists(#count) OR #count < :limit",
            ExpressionAttributeNames: { "#count": "count" },
            ExpressionAttributeValues: {
              ":one": { N: "1" },
              ":limit": { N: String(scope.limit) },
              ":ttl": {
                N: String(Math.floor(now / 86400000) * 86400 + 2 * 86400),
              },
            },
          },
        })),
      }),
    );
  } catch (error) {
    if (
      error instanceof TransactionCanceledException &&
      error.CancellationReasons?.some(
        (reason) => reason.Code === "ConditionalCheckFailed",
      )
    )
      throw new UsageBudgetError(429);
    throw new UsageBudgetError(503);
  }
}
export async function usageGate(
  service: keyof typeof serviceBudgets,
  subject: string,
): Promise<Response | null> {
  try {
    await reserveUsage(service, subject);
    return null;
  } catch (error) {
    const status = error instanceof UsageBudgetError ? error.status : 503;
    return Response.json(
      {
        error:
          error instanceof UsageBudgetError
            ? error.message
            : "Service unavailable",
      },
      {
        status,
        headers: {
          "Cache-Control": "private, no-store",
          ...(status === 429
            ? {
                "Retry-After": String(
                  Math.ceil((86400000 - (Date.now() % 86400000)) / 1000),
                ),
              }
            : {}),
        },
      },
    );
  }
}
