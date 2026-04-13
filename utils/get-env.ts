export const getEnv = (key: string, defaultValue = ""): string => {
  const v = process.env[key];
  if (v === undefined || v === "") {
    if (defaultValue !== "") return defaultValue;
    throw new Error(`Environment variable ${key} is not set`);
  }
  return v as string;
};
