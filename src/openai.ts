import OpenAI from "openai";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export const openai = new OpenAI({
  apiKey: requireEnv("OPENAI_API_KEY"),
});


