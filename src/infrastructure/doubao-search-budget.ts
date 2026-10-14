import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Schema } from "effect";

import { calendarDayAtOffset, parseOffsetMilliseconds } from "../domain/time.js";
import {
  DoubaoSearchError,
  type DoubaoSearchInput,
  type DoubaoSearchPage,
} from "./doubao-search.js";
import { isRecord } from "./parsing.js";

type SearchUsage = {
  source: "network" | "cache";
  fetchedAt: string;
  dailyUsed: number;
  monthlyUsed: number;
  dailyLimit: number;
  monthlyLimit: number;
};

type BudgetedSearchPage = DoubaoSearchPage & { searchUsage: SearchUsage };

type BudgetedSearch = {
  (input: DoubaoSearchInput): Promise<BudgetedSearchPage>;
  cachedSearch: (input: DoubaoSearchInput) => Promise<BudgetedSearchPage | undefined>;
};

type BudgetOptions = {
  stateFile: string;
  dailyLimit: number;
  monthlyLimit: number;
  timezoneOffset: string;
  cacheTtlMs: number;
  provider: string;
  search: (input: DoubaoSearchInput) => Promise<DoubaoSearchPage>;
  now?: () => Date;
};

const daySchema = Schema.String.pipe(Schema.filter(isCalendarDay));
const countSchema = Schema.NonNegativeInt.pipe(Schema.lessThanOrEqualTo(Number.MAX_SAFE_INTEGER));
const requestSchema = Schema.Struct({
  provider: Schema.String,
  query: Schema.String.pipe(Schema.filter((value) => value.trim() !== "" && value.length <= 100)),
  count: Schema.Int.pipe(Schema.between(1, 50)),
  day: daySchema,
  sinceDay: daySchema,
  sourcePolicy: Schema.Literal("news", "authoritative", "official"),
});
const rawPageSchema = Schema.Struct({
  provider: Schema.optional(Schema.Literal("doubao")),
  logId: Schema.optional(Schema.String),
  resultCount: countSchema,
  timeCostMs: Schema.optional(Schema.Number),
  results: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      url: Schema.String,
      rankPosition: Schema.Number,
      siteName: Schema.optional(Schema.String),
      snippet: Schema.optional(Schema.String),
      summary: Schema.optional(Schema.String),
      publishTime: Schema.optional(Schema.String),
      rankScore: Schema.optional(Schema.Number),
      authInfoDescription: Schema.optional(Schema.String),
      authInfoLevel: Schema.optional(Schema.Number),
    }),
  ),
});
const cacheEntrySchema = Schema.Struct({
  request: requestSchema,
  fetchedAt: Schema.String.pipe(
    Schema.filter((value) => {
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
    }),
  ),
  page: rawPageSchema,
});
const stateSchema = Schema.Struct({
  version: Schema.Literal(1),
  timezoneOffset: Schema.String,
  daily: Schema.Record({ key: daySchema, value: countSchema }),
  cache: Schema.Record({ key: Schema.String, value: cacheEntrySchema }),
});
type BudgetState = typeof stateSchema.Type;
type CacheRequest = typeof requestSchema.Type;
type CacheEntry = typeof cacheEntrySchema.Type;

const lockTimeoutMs = 2_000;
const lockRetryMs = 20;

export function createBudgetedDoubaoSearch(options: BudgetOptions): BudgetedSearch {
  validateOptions(options);
  const stateFile = resolve(options.stateFile);
  const provider = normalizeProvider(options.provider);
  const now = options.now ?? (() => new Date());
  const pending = new Map<string, Promise<BudgetedSearchPage>>();

  const search = (input: DoubaoSearchInput) => {
    const request = parseRequest(input);
    const key = cacheKey(request);
    const current = pending.get(key);
    if (current) return current;
    const operation = execute(input, request, key).finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  };
  return Object.assign(search, {
    cachedSearch: async (input: DoubaoSearchInput) => {
      const result = await inspectBudget(parseRequest(input), false);
      return result.cached;
    },
  });

  function parseRequest(input: DoubaoSearchInput): CacheRequest {
    const request = Schema.decodeUnknownSync(requestSchema)({
      ...input,
      provider,
      sinceDay: input.sinceDay ?? input.day,
    });
    if (request.sinceDay > request.day) throw new Error("Invalid search start date.");
    return request;
  }

  function inspectBudget(request: CacheRequest, reserve: boolean) {
    return withStateLock(stateFile, async () => {
      const state = await loadState(stateFile, options.timezoneOffset);
      const instant = now();
      const usage = usageFor(state, instant, options);
      const cached = findCache(state, request, instant.getTime(), options.cacheTtlMs);
      if (cached) {
        return {
          cached: {
            ...cached.page,
            results: cached.page.results.map((result) => ({ ...result })),
            searchUsage: { ...usage, source: "cache" as const, fetchedAt: cached.fetchedAt },
          },
          usage,
        };
      }
      if (usage.dailyUsed >= options.dailyLimit || usage.monthlyUsed >= options.monthlyLimit) {
        throw new DoubaoSearchError(
          "local_budget_exhausted",
          `Local search budget exhausted (daily ${usage.dailyUsed}/${options.dailyLimit}, monthly ${usage.monthlyUsed}/${options.monthlyLimit}).`,
        );
      }
      if (!reserve) return { usage };
      const day = calendarDayAtOffset(instant.toISOString(), options.timezoneOffset);
      await saveState(stateFile, {
        ...state,
        // Retaining prior days prevents a clock rollback or a historical occurrence from
        // resetting a previously consumed daily or monthly allowance.
        daily: { ...state.daily, [day]: usage.dailyUsed + 1 },
      });
      return {
        usage: {
          ...usage,
          dailyUsed: usage.dailyUsed + 1,
          monthlyUsed: usage.monthlyUsed + 1,
        },
      };
    });
  }

  async function execute(
    input: DoubaoSearchInput,
    request: CacheRequest,
    key: string,
  ): Promise<BudgetedSearchPage> {
    const reservation = await inspectBudget(request, true);
    if (reservation.cached) return reservation.cached;

    // The reservation remains consumed when the provider fails; retries re-enter this wrapper.
    const page = await options.search(input);
    const fetchedAt = now().toISOString();
    if (isRawDoubaoPage(page)) {
      const rawPage = Schema.decodeUnknownSync(rawPageSchema)(page);
      await withStateLock(stateFile, async () => {
        const state = await loadState(stateFile, options.timezoneOffset);
        const cache = Object.fromEntries(
          Object.entries(state.cache).filter(([, entry]) =>
            isFresh(entry, Date.parse(fetchedAt), options.cacheTtlMs),
          ),
        );
        await saveState(stateFile, {
          ...state,
          cache: { ...cache, [key]: { request, fetchedAt, page: rawPage } },
        });
      });
    }
    return {
      ...page,
      searchUsage: { ...reservation.usage, source: "network", fetchedAt },
    };
  }
}

function validateOptions(options: BudgetOptions): void {
  if (
    !Number.isSafeInteger(options.dailyLimit) ||
    options.dailyLimit < 0 ||
    !Number.isSafeInteger(options.monthlyLimit) ||
    options.monthlyLimit < 0 ||
    !Number.isSafeInteger(options.cacheTtlMs) ||
    options.cacheTtlMs < 0 ||
    options.stateFile.trim() === ""
  ) {
    throw new Error("Doubao search budgets, cache TTL and state file must be valid.");
  }
  parseOffsetMilliseconds(options.timezoneOffset);
}

function normalizeProvider(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Doubao search provider must be an HTTP URL.");
  }
  // Credentials and request parameters never belong in a persistent provider identity.
  return `${url.origin}${url.pathname.replace(/\/+$/u, "")}`;
}

function cacheKey(request: CacheRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        request.provider,
        request.query,
        request.count,
        request.day,
        request.sinceDay,
        request.sourcePolicy,
      ]),
    )
    .digest("hex");
}

function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function usageFor(
  state: BudgetState,
  instant: Date,
  options: BudgetOptions,
): Omit<SearchUsage, "source" | "fetchedAt"> {
  const day = calendarDayAtOffset(instant.toISOString(), options.timezoneOffset);
  const monthlyUsed = Object.entries(state.daily)
    .filter(([recordDay]) => recordDay.startsWith(day.slice(0, 7)))
    .reduce((total, [, used]) => total + used, 0);
  if (!Number.isSafeInteger(monthlyUsed)) {
    throw stateError("Local search budget contains an invalid monthly total.");
  }
  return {
    dailyUsed: state.daily[day] ?? 0,
    monthlyUsed,
    dailyLimit: options.dailyLimit,
    monthlyLimit: options.monthlyLimit,
  };
}

function findCache(
  state: BudgetState,
  request: CacheRequest,
  instant: number,
  ttlMs: number,
): CacheEntry | undefined {
  return Object.values(state.cache)
    .filter(
      (entry) =>
        isFresh(entry, instant, ttlMs) &&
        entry.request.provider === request.provider &&
        entry.request.query === request.query &&
        entry.request.count === request.count &&
        entry.request.sourcePolicy === request.sourcePolicy &&
        entry.request.sinceDay <= request.sinceDay &&
        entry.request.day >= request.day,
    )
    .sort((left, right) => Date.parse(right.fetchedAt) - Date.parse(left.fetchedAt))[0];
}

function isFresh(entry: CacheEntry, instant: number, ttlMs: number): boolean {
  const age = instant - Date.parse(entry.fetchedAt);
  return age >= 0 && age < ttlMs;
}

function isRawDoubaoPage(page: DoubaoSearchPage): boolean {
  return (
    (page.provider === undefined || page.provider === "doubao") &&
    page.fallback === undefined &&
    page.results.every((result) => result.sourceVerification === undefined)
  );
}

async function loadState(path: string, timezoneOffset: string): Promise<BudgetState> {
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (cause) {
    if (hasCode(cause, "ENOENT")) {
      return { version: 1, timezoneOffset, daily: {}, cache: {} };
    }
    throw stateError("Cannot read local search budget state.");
  }
  try {
    const state = Schema.decodeUnknownSync(stateSchema)(JSON.parse(contents), {
      onExcessProperty: "error",
    });
    if (state.timezoneOffset !== timezoneOffset) {
      throw stateError("Local search budget timezone differs from the configured timezone.");
    }
    for (const [key, entry] of Object.entries(state.cache)) {
      if (
        key !== cacheKey(entry.request) ||
        entry.request.sinceDay > entry.request.day ||
        normalizeProvider(entry.request.provider) !== entry.request.provider
      ) {
        throw stateError("Invalid local search cache entry.");
      }
    }
    return state;
  } catch (cause) {
    if (cause instanceof DoubaoSearchError) throw cause;
    throw stateError("Local search budget state is invalid; preserve it for recovery.");
  }
}

async function saveState(path: string, state: BudgetState): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(`${JSON.stringify(state)}\n`, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
    const directory = await open(dirname(path), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch {
    throw stateError("Cannot persist local search budget state.");
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

async function withStateLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const lockPath = `${path}.lock`;
  try {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  } catch {
    throw stateError("Cannot create local search budget directory.");
  }
  const deadline = Date.now() + lockTimeoutMs;
  let lock;
  while (!lock) {
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (cause) {
      if (!hasCode(cause, "EEXIST")) throw stateError("Cannot lock local search budget state.");
      if (Date.now() >= deadline) {
        throw stateError("Local search budget lock timed out; preserve the lock for recovery.");
      }
      await delay(lockRetryMs);
    }
  }
  const result = await Promise.resolve()
    .then(operation)
    .then(
      (value) => ({ ok: true as const, value }),
      (cause: unknown) => ({ ok: false as const, cause }),
    );
  try {
    await lock.close();
    await unlink(lockPath);
  } catch {
    throw stateError("Cannot release local search budget lock.");
  }
  if (!result.ok) throw result.cause;
  return result.value;
}

function hasCode(cause: unknown, code: string): boolean {
  return (cause instanceof Error || isRecord(cause)) && "code" in cause && cause.code === code;
}

function stateError(message: string): DoubaoSearchError {
  return new DoubaoSearchError("local_budget_state", message);
}
