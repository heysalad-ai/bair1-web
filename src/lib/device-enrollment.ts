import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  PutItemCommand,
  UpdateItemCommand,
  ConditionalCheckFailedException,
} from "@aws-sdk/client-dynamodb";
import { dynamoClient } from "./aws-dynamo";
import { storageTable } from "./storage-config";
import { getDevice } from "./devices";

const table = storageTable("bair1-devices");
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** Platform provisioning returns one-time proof once; storage holds only a hash. */
export async function provisionEnrollment(deviceId: string, name: string) {
  const code = randomBytes(24).toString("base64url"),
    expiresAt = Math.floor(Date.now() / 1000) + 86400;
  await dynamoClient.send(
    new PutItemCommand({
      TableName: table,
      Item: {
        deviceId: { S: deviceId },
        name: { S: name },
        visibility: { S: "private" },
        status: { S: "provisioning" },
        createdAt: { S: new Date().toISOString() },
        ownershipVersion: { S: randomUUID() },
        enrollmentHash: { S: hash(code) },
        enrollmentExpiresAt: { N: String(expiresAt) },
      },
      ConditionExpression: "attribute_not_exists(deviceId)",
    }),
  );
  return { code, expiresAt };
}

export async function claimEnrollment(
  deviceId: string,
  code: string,
  ownerId: string,
  orgId: string,
  name: string,
) {
  try {
    await dynamoClient.send(
      new UpdateItemCommand({
        TableName: table,
        Key: { deviceId: { S: deviceId } },
        UpdateExpression:
          "SET ownerId = :owner, orgId = :org, #n = :name REMOVE enrollmentHash, enrollmentExpiresAt",
        ConditionExpression:
          "(attribute_not_exists(ownerId) OR ownerId = :empty) AND enrollmentHash = :hash AND enrollmentExpiresAt > :now",
        ExpressionAttributeNames: { "#n": "name" },
        ExpressionAttributeValues: {
          ":owner": { S: ownerId },
          ":org": { S: orgId },
          ":name": { S: name },
          ":empty": { S: "" },
          ":hash": { S: hash(code) },
          ":now": { N: String(Math.floor(Date.now() / 1000)) },
        },
      }),
    );
    return getDevice(deviceId);
  } catch (error) {
    if (error instanceof ConditionalCheckFailedException) return null;
    throw error;
  }
}
