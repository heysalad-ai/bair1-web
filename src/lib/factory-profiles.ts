export const FACTORY_PROFILES = {
  "bme280-adc": { label: "BME280 + dual ADC", version: "bair1-xiao-bme-adc-1.1.0", folder: "factory-bme280", wiring: "BME280: SDA D4/GPIO5, SCL D5/GPIO6; ADC D3 and D2." },
  "sps30-i2c": { label: "SPS30 · RevC I²C", version: "bair1-xiao-sps30-1.0.0", folder: "factory-sps30", wiring: "RevC 1.0.3: SDA D4/GPIO5, SCL D5/GPIO6, SEL to GND, common GND, regulated 5 V sensor supply. Do not apply 5 V to GPIO. Not the D3 probe or UART build." },
} as const;
export type FactoryProfile = keyof typeof FACTORY_PROFILES;
export function factoryProfile(value: unknown): FactoryProfile {
  if (value === undefined) return "bme280-adc"; // Existing clients and records.
  if (value !== "bme280-adc" && value !== "sps30-i2c") throw new RangeError("Select a supported sensor configuration.");
  return value;
}
