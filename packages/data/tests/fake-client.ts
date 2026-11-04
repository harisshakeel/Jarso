import type { Database } from "@jarso/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";

type Result = { data: unknown; error: unknown };
export type Call = [method: string, ...args: unknown[]];

/**
 * A fake Supabase client. Each `from(table)` query records its chained calls and resolves to the
 * table's result (a function gets the recorded calls); `rpc(name)` resolves to the RPC's result.
 */
export function fakeClient(
  tables: Record<string, Result | ((calls: Call[]) => Result)> = {},
  rpcs: Record<string, Result> = {},
) {
  const queries: { table: string; calls: Call[] }[] = [];
  const resolve = (table: string, calls: Call[]): Result => {
    const result = tables[table];
    if (!result) return { data: null, error: null };
    return typeof result === "function" ? result(calls) : result;
  };
  const from = vi.fn((table: string) => {
    const calls: Call[] = [];
    queries.push({ table, calls });
    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (ok: (value: Result) => unknown, fail?: (reason: unknown) => unknown) =>
              Promise.resolve(resolve(table, calls)).then(ok, fail);
          }
          return (...args: unknown[]) => {
            calls.push([prop, ...args]);
            if (prop === "maybeSingle" || prop === "single") {
              return Promise.resolve(resolve(table, calls));
            }
            return builder;
          };
        },
      },
    );
    return builder;
  });
  // Awaitable as is, or through `.single()` / `.maybeSingle()` like a PostgREST builder.
  const rpc = vi.fn((name: string) => {
    const result = Promise.resolve(rpcs[name] ?? { data: null, error: null });
    return Object.assign(result, { single: () => result, maybeSingle: () => result });
  });
  const db = { from, rpc } as unknown as SupabaseClient<Database>;
  return { db, from, rpc, queries };
}

export const ok = (data: unknown): Result => ({ data, error: null });
