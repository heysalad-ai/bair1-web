import type { Device } from "./devices";
import { storageTable } from "./storage-config";
/** Conditional writes cannot cross an enrollment or owner change. */
export function registryCondition(
  device: Pick<Device, "deviceId" | "ownerId" | "ownershipVersion">,
) {
  return {
    TableName: storageTable("bair1-devices"),
    Key: { deviceId: { S: device.deviceId } },
    ConditionExpression:
      "(ownerId = :owner OR (attribute_not_exists(ownerId) AND :owner = :empty)) AND (ownershipVersion = :version OR (attribute_not_exists(ownershipVersion) AND :version = :legacy))",
    ExpressionAttributeValues: {
      ":owner": { S: device.ownerId },
      ":empty": { S: "" },
      ":version": { S: device.ownershipVersion ?? "legacy" },
      ":legacy": { S: "legacy" },
    },
  };
}
