# stickers-remake

Generate quote stickers (WebP) from a batch of messages via a quote-image API.

## Prerequisites

- Node.js 20+
- pnpm

```sh
pnpm install
```

## Configuration

Copy the example env file and fill in the required values:

```sh
cp .env.example .env
```

| Variable               | Required | Default             | Description                                  |
| ---------------------- | -------- | ------------------- | -------------------------------------------- |
| `QUOTE_API_URL`        | yes      | —                   | Quote API endpoint (must return an image)    |
| `QUOTE_FIRST_NAME`     | yes      | —                   | Sender first name shown on the quote         |
| `QUOTE_USER_ID`        | no       | `12345678`          | Sender user id                               |
| `QUOTE_BG_COLOR`       | no       | `#342c40/#251f2c`   | Background color / gradient                  |
| `QUOTE_BORDER_STYLE`   | no       | `solid`             | Border style                                 |
| `QUOTE_BORDER_COLOR`   | no       | `#595364`           | Border color                                 |
| `QUOTE_SCALE`          | no       | `2`                 | Image scale                                  |
| `QUOTE_TYPE`           | no       | `quote`             | Quote payload type                           |
| `QUOTE_FORMAT`         | no       | `webp`              | Output format                                |
| `QUOTE_AVATAR`         | no       | `true`              | Show avatar (`true`/`false`)                 |
| `QUOTE_DELAY_MS`       | no       | `0`                 | Delay between requests, in milliseconds      |
| `QUOTE_DELIMITER`      | no       | `~`                 | Splits one entry into a multi-message quote  |
| `QUOTE_FILENAME_PATTERN` | no     | `sticker_{n}.webp`  | Output name, `{n}` = 1-based index           |

Every variable can be overridden with a CLI flag (CLI wins over env).
Run `pnpm start -- --help` for the full flag list.

Example `.env`:

```env
QUOTE_API_URL=https://quote.example.com/generate.webp
QUOTE_FIRST_NAME=Jane Doe
QUOTE_USER_ID=12345678
QUOTE_DELAY_MS=0
```

## Input format

JSON array (`message.example.json` is a ready-made sample):

```json
[
  { "text": "First message~second half of the quote", "h": 9, "m": 15 },
  { "text": "A plain single message" },
  "A bare string entry"
]
```

- `text` — message text. Occurrences of the delimiter (`~` by default) split the entry into a multi-message quote.
- `h` / `m` — optional hour/minute stamped on the quote (defaults to now).
- Plain-text files also work: one message per line, same delimiter rules.

## Usage

```sh
# using .env + defaults (message.example.json -> ./stickers)
pnpm start

# explicit input / output
pnpm start -- message.example.json ./stickers

# everything via flags (no .env needed for required values)
pnpm start -- \
  --api-url https://quote.example.com/generate.webp \
  --first-name "Jane Doe" \
  --input message.example.json \
  --output ./stickers \
  --delay-ms 100
```

Other useful commands:

```sh
pnpm typecheck   # tsc --noEmit
```

## How it works

1. `parseBatchInput` reads the input file and normalizes entries.
2. Each entry is POSTed as JSON to the quote API.
3. The returned image bytes are saved to `<output>/<filename-pattern>`.
4. Failures are logged per message without stopping the batch.
