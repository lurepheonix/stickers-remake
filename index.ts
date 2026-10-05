import * as fs from "fs";
import * as path from "path";
import { parseArgs } from "node:util";
import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

export interface RawMessageItem {
  text: string;
  h?: number; // Hour (0-23)
  m?: number; // Minute (0-59)
}

interface QuoteMessagePayload {
  from: {
    id: number;
    first_name: string;
  };
  text: string;
  date: number; // Unix timestamp in seconds
  avatar: boolean;
}

interface Config {
  apiUrl: string;
  firstName: string;
  userId: number;
  backgroundColor: string;
  borderStyle: string;
  borderColor: string;
  scale: number;
  quoteType: string;
  format: string;
  avatar: boolean;
  delayMs: number;
  delimiter: string;
  filenamePattern: string;
  inputFile: string;
  outputDir: string;
}

const HELP_TEXT = `Usage: tsx index.ts [options] [input] [output]

Generate quote stickers from a JSON/text batch file.

Arguments:
  input                  Input file (.json or plain text) [default: message.example.json]
  output                 Output directory [default: ./stickers]

Options:
  --api-url <url>        Quote API endpoint (required, or QUOTE_API_URL)
  --first-name <name>    Sender first name (required, or QUOTE_FIRST_NAME)
  --user-id <id>         Sender user id (or QUOTE_USER_ID, default: 12345678)
  --bg-color <color>     Background color (or QUOTE_BG_COLOR)
  --border-style <style> Border style (or QUOTE_BORDER_STYLE, default: solid)
  --border-color <color> Border color (or QUOTE_BORDER_COLOR)
  --scale <n>            Image scale (or QUOTE_SCALE, default: 2)
  --type <type>          Quote payload type (or QUOTE_TYPE, default: quote)
  --format <format>      Output format (or QUOTE_FORMAT, default: webp)
  --avatar               Show avatar (or QUOTE_AVATAR=true)
  --no-avatar            Hide avatar (or QUOTE_AVATAR=false)
  --delay-ms <ms>        Delay between requests (or QUOTE_DELAY_MS, default: 0)
  --delimiter <d>        Multi-message delimiter (or QUOTE_DELIMITER, default: ~)
  --filename-pattern <p> Output pattern, {n} = 1-based index (or QUOTE_FILENAME_PATTERN, default: sticker_{n}.webp)
  --help                 Show this help
`;

/**
 * Parses CLI flags/positionals, merges them over env vars, and validates
 * the result with t3-env (zod). CLI wins over env. Required values
 * (apiUrl, firstName) error when missing from both.
 */
function loadConfig(): Config {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "api-url": { type: "string" },
      "first-name": { type: "string" },
      "user-id": { type: "string" },
      "bg-color": { type: "string" },
      "border-style": { type: "string" },
      "border-color": { type: "string" },
      scale: { type: "string" },
      type: { type: "string" },
      format: { type: "string" },
      avatar: { type: "boolean" },
      "no-avatar": { type: "boolean" },
      "delay-ms": { type: "string" },
      delimiter: { type: "string" },
      "filename-pattern": { type: "string" },
      input: { type: "string" },
      output: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const avatarCli =
    values.avatar === true || values["no-avatar"] === true
      ? values.avatar === true
        ? "true"
        : "false"
      : undefined;

  const env = createEnv({
    server: {
      QUOTE_API_URL: z.url(),
      QUOTE_FIRST_NAME: z.string().min(1),
      QUOTE_USER_ID: z.coerce.number().int().default(12345678),
      QUOTE_BG_COLOR: z.string().min(1).default("#342c40/#251f2c"),
      QUOTE_BORDER_STYLE: z.string().min(1).default("solid"),
      QUOTE_BORDER_COLOR: z.string().min(1).default("#595364"),
      QUOTE_SCALE: z.coerce.number().int().positive().default(2),
      QUOTE_TYPE: z.string().min(1).default("quote"),
      QUOTE_FORMAT: z.string().min(1).default("webp"),
      QUOTE_AVATAR: z.coerce.boolean().default(true),
      QUOTE_DELAY_MS: z.coerce.number().int().min(0).default(0),
      QUOTE_DELIMITER: z.string().min(1).default("~"),
      QUOTE_FILENAME_PATTERN: z
        .string()
        .min(1)
        .default("sticker_{n}.webp"),
    },
    runtimeEnv: {
      QUOTE_API_URL: values["api-url"] ?? process.env.QUOTE_API_URL,
      QUOTE_FIRST_NAME: values["first-name"] ?? process.env.QUOTE_FIRST_NAME,
      QUOTE_USER_ID: values["user-id"] ?? process.env.QUOTE_USER_ID,
      QUOTE_BG_COLOR: values["bg-color"] ?? process.env.QUOTE_BG_COLOR,
      QUOTE_BORDER_STYLE:
        values["border-style"] ?? process.env.QUOTE_BORDER_STYLE,
      QUOTE_BORDER_COLOR:
        values["border-color"] ?? process.env.QUOTE_BORDER_COLOR,
      QUOTE_SCALE: values.scale ?? process.env.QUOTE_SCALE,
      QUOTE_TYPE: values.type ?? process.env.QUOTE_TYPE,
      QUOTE_FORMAT: values.format ?? process.env.QUOTE_FORMAT,
      QUOTE_AVATAR: avatarCli ?? process.env.QUOTE_AVATAR,
      QUOTE_DELAY_MS: values["delay-ms"] ?? process.env.QUOTE_DELAY_MS,
      QUOTE_DELIMITER: values.delimiter ?? process.env.QUOTE_DELIMITER,
      QUOTE_FILENAME_PATTERN:
        values["filename-pattern"] ?? process.env.QUOTE_FILENAME_PATTERN,
    },
    emptyStringAsUndefined: true,
  });

  return {
    apiUrl: env.QUOTE_API_URL,
    firstName: env.QUOTE_FIRST_NAME,
    userId: env.QUOTE_USER_ID,
    backgroundColor: env.QUOTE_BG_COLOR,
    borderStyle: env.QUOTE_BORDER_STYLE,
    borderColor: env.QUOTE_BORDER_COLOR,
    scale: env.QUOTE_SCALE,
    quoteType: env.QUOTE_TYPE,
    format: env.QUOTE_FORMAT,
    avatar: env.QUOTE_AVATAR,
    delayMs: env.QUOTE_DELAY_MS,
    delimiter: env.QUOTE_DELIMITER,
    filenamePattern: env.QUOTE_FILENAME_PATTERN,
    inputFile: values.input ?? positionals[0] ?? "message.example.json",
    outputDir: values.output ?? positionals[1] ?? "./stickers",
  };
}

/**
 * Calculates Unix timestamp for given hour and minute on today's date.
 */
function getUnixTimestamp(h?: number, m?: number): number {
  const now = new Date();
  if (h !== undefined) now.setHours(h);
  if (m !== undefined) now.setMinutes(m);
  now.setSeconds(0, 0);

  return Math.floor(now.getTime() / 1000);
}

/**
 * Reads and normalizes input data into an array of message items.
 * Handles JSON files as well as plain text (splitting lines/delimiter).
 */
function parseBatchInput(filePath: string, delimiter: string): RawMessageItem[] {
  const absolutePath = path.resolve(filePath);
  const rawData = fs.readFileSync(absolutePath, "utf-8");

  if (filePath.endsWith(".json")) {
    const parsed = JSON.parse(rawData);

    if (Array.isArray(parsed)) {
      return parsed.flatMap((item) => {
        if (typeof item === "string") {
          // If string contains delimiter, split into separate message items
          return item
            .split(delimiter)
            .map((t) => ({ text: t.trim() }))
            .filter((i) => i.text);
        }
        return item;
      });
    }
  }

  // Handle plain text file line-by-line and split on delimiter
  const lines = rawData
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const items: RawMessageItem[] = [];

  for (const line of lines) {
    const segments = line
      .split(delimiter)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const segment of segments) {
      items.push({ text: segment });
    }
  }

  return items;
}

/**
 * Generates a single sticker buffer for a message item.
 */
async function generateStickerBuffer(
  item: RawMessageItem,
  config: Config,
): Promise<Buffer> {
  const payloadMessages: QuoteMessagePayload[] = item.text
    .split(config.delimiter)
    .map((part) => {
      return {
        from: {
          id: config.userId,
          first_name: config.firstName,
        },
        text: part,
        date: getUnixTimestamp(item.h, item.m),
        avatar: config.avatar,
      };
    });

  const payload = {
    type: config.quoteType,
    format: config.format,
    backgroundColor: config.backgroundColor,
    borderStyle: config.borderStyle,
    borderColor: config.borderColor,
    scale: config.scale,
    messages: payloadMessages,
  };

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function resolveFilename(pattern: string, index: number): string {
  return pattern.replaceAll("{n}", String(index + 1));
}

/**
 * Iterates through all parsed messages and generates individual sticker files.
 */
async function processBatch(config: Config) {
  try {
    const items = parseBatchInput(config.inputFile, config.delimiter);
    console.log(items);

    console.log(`Found ${items.length} message(s) to convert to stickers...\n`);

    if (!fs.existsSync(config.outputDir)) {
      fs.mkdirSync(config.outputDir, { recursive: true });
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const fileName = resolveFilename(config.filenamePattern, i);
      const outputPath = path.join(config.outputDir, fileName);

      console.log(
        `[${i + 1}/${items.length}] Processing: "${item.text.slice(0, 30)}..."`,
      );

      try {
        const buffer = await generateStickerBuffer(item, config);
        fs.writeFileSync(outputPath, buffer);
        console.log(`  └ Saved -> ${outputPath}`);
      } catch (err: any) {
        console.error(`  └ Failed:`, err.message);
      }

      // Small delay between requests to avoid hitting rate limits
      if (config.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, config.delayMs));
      }
    }

    console.log("\nBatch sticker creation complete!");
  } catch (error: any) {
    console.error("Error during batch execution:", error.message);
  }
}

// --- CLI EXECUTION ---
try {
  const config = loadConfig();
  await processBatch(config);
} catch (error: any) {
  console.error(error.message ?? error);
  console.error("\nRun with --help to see usage.");
  process.exit(1);
}
