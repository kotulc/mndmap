/** A batch client for taggly, with a cache that survives a crash.
 *
 *  Every request goes to a command's `/batch` endpoint. A batch that keeps
 *  failing is split in half until the one input that breaks it stands alone,
 *  so a bad passage costs itself and nothing else. Results are appended to a
 *  JSONL cache keyed by what was asked, as each batch lands: a run that stops
 *  halfway resumes where it stopped, and an unchanged passage is never asked
 *  about twice. */

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";


/** How often one batch is tried before it is split, and the first wait between. */
const TRIES = 3;
const WAIT = 2000;


/** The commands a taggly instance serves, and the model behind each; throws
 *  with a readable reason when nothing answers. */
export async function status(url) {
  try {
    const response = await fetch(`${url}/status`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    throw new Error(`taggly at ${url} is unreachable (${error.message}); start it with \`taggly start\``);
  }
}

/** The JSONL cache: a map of key → result, loaded once and appended to. */
export function cache(path) {
  const held = new Map();
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const { key, value } = JSON.parse(line);
        held.set(key, value);
      } catch {
        // A line cut short by a crash; its batch is simply asked again.
      }
    }
  }
  const put = (key, value) => {
    held.set(key, value);
    appendFileSync(path, `${JSON.stringify({ key, value })}\n`);
  };
  return { held, put };
}

/** The cache key for one input to one command: the command, the model behind
 *  it, its params and the input itself. */
export function key(command, model, params, input) {
  return createHash("sha1").update(JSON.stringify([command, model, params, input])).digest("hex");
}

/** Run `inputs` through a command in batches of `size`, calling `done(index,
 *  output)` as each lands and `failed(index, error)` for any that cannot run. */
export async function run(url, command, params, inputs, { size, timeout, done, failed }) {
  for (let at = 0; at < inputs.length; at += size) {
    const indices = [...Array(Math.min(size, inputs.length - at)).keys()].map((n) => at + n);
    await settle(indices);
  }

  /** One batch, bisected on failure. */
  async function settle(indices) {
    try {
      const outputs = await post(indices.map((n) => inputs[n]));
      indices.forEach((n, i) => done(n, outputs[i]));
    } catch (error) {
      // taggly went away: stop the run, the cache holds everything so far
      if (error.cause?.code === "ECONNREFUSED") throw new Error(`taggly at ${url} stopped answering`);
      if (indices.length === 1) return failed(indices[0], error);
      const half = Math.ceil(indices.length / 2);
      await settle(indices.slice(0, half));
      await settle(indices.slice(half));
    }
  }

  /** One POST, retried with a growing wait when the failure may pass. */
  async function post(items) {
    const query = new URLSearchParams(params).toString();
    for (let attempt = 1; ; attempt++) {
      try {
        const response = await fetch(`${url}/${command}/batch?${query}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
          signal: AbortSignal.timeout(timeout),
        });
        if (response.ok) return (await response.json()).items;
        const reason = new Error(`${command}: HTTP ${response.status} ${await response.text()}`);
        if (response.status < 500) throw Object.assign(reason, { final: true });
        throw reason;
      } catch (error) {
        if (error.final || attempt >= TRIES) throw error;
        await new Promise((resolve) => setTimeout(resolve, WAIT * 2 ** (attempt - 1)));
      }
    }
  }
}
