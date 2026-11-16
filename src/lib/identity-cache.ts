import { GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./aws-dynamo";
import { storageTable } from "./storage-config";
import type { VerifiedIdentity } from "./verified-identity";

const table = storageTable("bair1-access");
const key = (digest: string) => ({
  scope: { S: `auth0-identity:${digest}` },
  entry: { S: "identity" },
});

/** Shared across serverless instances; only a token digest is persisted. */
export async function readIdentity(
  digest: string,
): Promise<VerifiedIdentity | null> {
  const { Item } = await dynamoClient.send(
    new GetItemCommand({
      TableName: table,
      Key: key(digest),
      ConsistentRead: true,
    }),
  );
  if (!Item?.profile?.S) return null;
  try {
    return {
      profile: JSON.parse(Item.profile.S),
      verifiedAt: Number(Item.verifiedAt?.N),
      validUntil: Number(Item.validUntil?.N),
    };
  } catch {
    return null;
  }
}
export async function writeIdentity(
  digest: string,
  value: VerifiedIdentity,
): Promise<void> {
  await dynamoClient.send(
    new PutItemCommand({
      TableName: table,
      Item: {
        ...key(digest),
        profile: { S: JSON.stringify(value.profile) },
        verifiedAt: { N: String(value.verifiedAt) },
        validUntil: { N: String(value.validUntil) },
        expiresAt: { N: String(Math.ceil(value.validUntil / 1000)) },
      },
    }),
  );
}
