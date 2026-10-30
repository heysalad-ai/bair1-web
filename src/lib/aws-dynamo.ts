import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const explicitCredentials =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
      }
    : undefined;

export const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "eu-west-2",
  credentials: explicitCredentials,
});
