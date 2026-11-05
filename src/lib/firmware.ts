export type FirmwareStatus = "release" | "beta" | "lab";

export interface FirmwareTarget {
  slug: string;
  name: string;
  board: string;
  platformioEnv: string;
  version: string;
  status: FirmwareStatus;
  updated: string;
  firmwarePath?: string;
  factoryPackage?: boolean;
  sourcePath: string;
  sensors: string[];
  transports: string[];
  notes: string[];
}

export const firmwareTargets: FirmwareTarget[] = [
  {
    slug: "xiao-esp32s3-sps30",
    name: "SPS30 RevC factory diagnostic",
    factoryPackage: true,
    board: "Seeed XIAO ESP32S3",
    platformioEnv: "seeed_xiao_esp32s3",
    version: "bair1-xiao-sps30-1.0.0",
    status: "beta",
    updated: "2026-11-05",
    sourcePath: "firmware/Bair1_SPS30",
    firmwarePath: "/firmware/factory-sps30/Bair1-factory-USB-package.zip",
    sensors: ["Sensirion SPS30"],
    transports: ["WiFi", "HTTPS"],
    notes: [
      "Factory diagnostic: SPS30 PM1, PM2.5, PM4 and PM10 plus Wi-Fi upload. Physical reference-unit acceptance pending.",
      "RevC 1.0.3 reference: SDA D4/GPIO5, SCL D5/GPIO6, regulated 5V sensor supply, GND, SEL to GND. Check wiring before flashing.",
      "Select SPS30 in Factory USB setup. No compile-time credentials. Separate from the older D3 probe and UART builds.",
    ],
  },
  {
    slug: "xiao-esp32s3-sense-camera-air",
    name: "Sally XIAO Sense Air Camera",
    board: "Seeed XIAO ESP32S3 Sense",
    platformioEnv: "seeed_xiao_esp32s3",
    version: "3.0.0-xiao",
    status: "lab",
    updated: "2026-06-21",
    sourcePath: "sally-xiao-sense",
    sensors: ["OV2640 camera", "SparkFun BMV080", "NeoPixel"],
    transports: ["WiFi", "BLE", "WebSocket"],
    notes: [
      "Camera and air-quality firmware for XIAO ESP32S3 Sense.",
      "BMV080 uses Grove I2C on SDA D4 and SCL D5.",
      "Keep credentials in local build flags or untracked secrets only.",
    ],
  },
  {
    slug: "xiao-mg24-sense-cellular",
    name: "Bair1 MG24 Sense Cellular",
    board: "Seeed XIAO MG24 Sense",
    platformioEnv: "xiao_mg24",
    version: "0.1.0-mg24-sense",
    status: "lab",
    updated: "2026-06-21",
    sourcePath: "bair1-mg24",
    sensors: ["LSM6DS3TR-C IMU", "Analog gas/AQ", "microSD"],
    transports: ["SIM800L", "GPRS", "Offline queue"],
    notes: [
      "MG24 Sense build with IMU, OLED, microSD queue, and SIM800L upload path.",
      "SIM800L smoke-test environment is kept separately from the main firmware.",
      "Useful for mobile/off-grid Bair1 units where WiFi is unavailable.",
    ],
  },
  {
    slug: "xiao-mg24-base",
    name: "Bair1 MG24 Base",
    board: "Seeed XIAO MG24",
    platformioEnv: "sim800_smoke_test",
    version: "0.1.0-smoke-test",
    status: "lab",
    updated: "2026-06-21",
    sourcePath: "bair1-mg24",
    sensors: ["SIM800L modem"],
    transports: ["UART", "GPRS"],
    notes: [
      "Hardware validation image for the base MG24 board and SIM800L modem.",
      "Use before promoting a board to the full cellular air-quality firmware.",
    ],
  },
  {
    slug: "xiao-esp32c3-node",
    name: "OpenClaw XIAO C3 Node",
    board: "Seeed XIAO ESP32C3",
    platformioEnv: "xiao_esp32c3",
    version: "0.1.0-node",
    status: "lab",
    updated: "2026-06-21",
    sourcePath: "openclaw/openclaw-esp32c3-xiao-node-latest",
    sensors: ["OLED", "Button", "Speaker", "Grove Vision"],
    transports: ["WiFi", "BLE", "WebSocket"],
    notes: [
      "General XIAO ESP32C3 node firmware with BLE provisioning and WiFi storage.",
      "Includes hardware smoke-test coverage for common expansion board parts.",
    ],
  },
  {
    slug: "xiao-esp32s3-pmsa",
    name: "Bair1 PMSA/BMV080 Lab",
    board: "Seeed XIAO ESP32S3",
    platformioEnv: "seeed_xiao_esp32s3",
    version: "0.1.0-pmsa-lab",
    status: "lab",
    updated: "2026-06-21",
    sourcePath: "saddle-sense-pmsa-test",
    sensors: ["PMSA003I", "Bosch BMV080", "NeoPixel"],
    transports: ["WiFi", "BLE", "OTA"],
    notes: [
      "Dual particulate sensor lab firmware for Plantower PMSA003I and Bosch BMV080.",
      "Good base for Bair1 Pro and Max sensor fusion work.",
    ],
  },
];

export const firmwareStatusLabels: Record<FirmwareStatus, string> = {
  release: "Release",
  beta: "Beta",
  lab: "Lab",
};
