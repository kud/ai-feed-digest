import { spawn } from "node:child_process"
import type { DigestConfig } from "@/lib/types"

/**
 * Claude generation via the Claude Code CLI (`claude -p`), authenticated off the
 * Max-plan login — no API token. The prompt is fed on stdin (handles large
 * article corpora without arg-length limits); the response is read from stdout.
 *
 * Runs only where the `claude` CLI is installed and logged in — your Mac, or a
 * GitHub Action with CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`). Not the
 * Vercel serverless runtime; generation is a build step that commits markdown.
 */

let hasWarned = false

export interface CompletionOptions {
  /** Override the model (e.g. the fast summary model). Defaults to config.claude.model. */
  model?: string
  // effort / thinking / maxTokens are API-only knobs the CLI doesn't expose —
  // kept for call-site compatibility, ignored here.
  effort?: "low" | "medium" | "high" | "max"
  thinking?: boolean
  maxTokens?: number
}

export async function warmupClient(_config: DigestConfig): Promise<void> {
  // The CLI is invoked per request; nothing to warm up.
}

export async function requestCompletion(
  prompt: string,
  config: DigestConfig,
  opts: CompletionOptions = {},
): Promise<string | null> {
  const model = opts.model ?? config.claude.model
  const timeoutMs = config.claude.timeout_ms

  return new Promise<string | null>((resolve) => {
    const child = spawn(
      "claude",
      ["-p", "--model", model, "--output-format", "text"],
      { stdio: ["pipe", "pipe", "pipe"] },
    )

    let stdout = ""
    let stderr = ""
    let settled = false

    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }

    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      warnOnce(new Error(`claude -p timed out after ${timeoutMs}ms`))
      finish(null)
    }, timeoutMs)

    child.stdout.on("data", (chunk) => (stdout += chunk.toString()))
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()))

    child.on("error", (error) => {
      warnOnce(error)
      finish(null)
    })

    child.on("close", (code) => {
      if (code !== 0) {
        warnOnce(
          new Error(`claude -p exited with code ${code}: ${stderr.trim()}`),
        )
        finish(null)
        return
      }
      const text = stdout.trim()
      finish(text || null)
    })

    // Swallow EPIPE if the child exits before we finish writing the prompt.
    child.stdin.on("error", () => {})
    child.stdin.write(prompt)
    child.stdin.end()
  })
}

function warnOnce(error: Error) {
  if (hasWarned || process.env.NODE_ENV === "production") return
  console.warn(
    "[claude] `claude -p` error:",
    error.message,
    "Ensure the Claude Code CLI is installed and logged in (Max plan). In CI, set CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`.",
  )
  hasWarned = true
}
