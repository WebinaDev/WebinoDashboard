#!/usr/bin/env node
/**
 * Edge print agent.
 *
 * A browser tab cannot put ink on thermal paper without a driver installed on the counter
 * machine, and a cloud server cannot reach a printer plugged into the shop's LAN. So one small
 * process runs on a machine inside the shop, asks the dashboard what to print, and hands the
 * bytes to the operating system's print queue.
 *
 * The three decisions that make this reliable in a café rather than in a demo:
 *
 *  1. **Spool to disk before printing.** A job that arrived but was not printed (printer off,
 *     out of paper, agent restarted) is written to a spool directory first, so nothing is lost
 *     between "the server said print" and "the paper came out".
 *  2. **Never lose a job to a crash.** A spool file is deleted only after the print command has
 *     exited successfully; a failed one stays and is retried on the next pass.
 *  3. **Say what happened.** Silence is the failure mode that ruins a service: the till shows
 *     nothing, the cook never sees the ticket, and everyone assumes someone else checked. Every
 *     failure is logged loudly and retried with backoff.
 *
 * No dependencies: fetch is built into Node 18+, and the print command is the OS's own.
 */

import { spawn } from "node:child_process"
import { mkdir, readFile, readdir, rename, writeFile, rm } from "node:fs/promises"
import path from "node:path"
import process from "node:process"

const CONFIG_PATH = process.env.WEBINO_AGENT_CONFIG ?? path.join(process.cwd(), "config.json")

function log(level, message, extra = {}) {
  const line = { at: new Date().toISOString(), level, message, ...extra }
  const stream = level === "error" ? process.stderr : process.stdout
  stream.write(JSON.stringify(line) + "\n")
}

async function loadConfig() {
  const raw = await readFile(CONFIG_PATH, "utf8")
  const config = JSON.parse(raw)

  if (!config.apiBase || !config.token) {
    throw new Error("config.json needs apiBase and token")
  }

  return {
    document: "kitchen",
    pollSeconds: 4,
    spoolDir: "./spool",
    stationId: null,
    branchId: null,
    ...config,
  }
}

/**
 * The job request.
 *
 * The server decides *which* printers and *what* layout; the agent decides how to reach a
 * printer by name. That split means a new printer is configured in the panel, not by editing a
 * file on a machine in the shop.
 */
async function requestJob(config) {
  const res = await fetch(`${config.apiBase.replace(/\/$/, "")}/api/v1/cafe/print/job`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({
      branch_id: config.branchId,
      station_id: config.stationId,
      document: config.document,
      payload: { source: "edge-agent", at: new Date().toISOString() },
    }),
    // A shop's uplink can hang rather than fail; without this the agent waits forever.
    signal: AbortSignal.timeout(20_000),
  })

  if (res.status === 401 || res.status === 403) {
    throw new Error(`authorisation failed (${res.status}) — the token is wrong or expired`)
  }

  if (!res.ok) {
    throw new Error(`job request failed (${res.status})`)
  }

  return res.json()
}

/** Write the job to the spool before attempting anything, so a crash cannot lose it. */
async function spool(config, job) {
  await mkdir(config.spoolDir, { recursive: true })
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const file = path.join(config.spoolDir, `${id}.json`)
  const temp = `${file}.tmp`

  await writeFile(temp, JSON.stringify(job, null, 2), "utf8")
  // Atomic rename: a half-written spool file that looks complete is worse than none.
  await rename(temp, file)

  return file
}

/**
 * Render a job as ESC/POS-ish plain text.
 *
 * Thermal printers take plain text with a few control bytes; a full escpos library would be
 * another dependency on a machine nobody maintains, and the layout the server sends is already
 * the one the receipt screen previews. Bold and cut are the two things that genuinely matter.
 */
function render(job) {
  const payload = job.payload ?? {}
  const order = payload.order ?? payload
  const lines = []

  const width = Number(job.layout?.paper_width_mm ?? 80) >= 76 ? 48 : 32
  const line = (char = "-") => lines.push(char.repeat(width))
  const pair = (left, right) => {
    const leftText = String(left ?? "")
    const rightText = String(right ?? "")
    const gap = Math.max(1, width - leftText.length - rightText.length)
    lines.push(leftText + " ".repeat(gap) + rightText)
  }

  if (job.layout?.header_title) {
    lines.push(`\x1b\x61\x01${job.layout.header_title}\x1b\x61\x00`)
  }

  lines.push(`\x1b\x45\x01${job.document === "kitchen" ? "KITCHEN" : "RECEIPT"}\x1b\x45\x00`)
  if (order.number) lines.push(`#${order.number}`)
  line()

  const items = Array.isArray(order.items) ? order.items : []
  for (const item of items) {
    const quantity = Number(item.quantity ?? 1)
    const name = String(item.product_name ?? item.name ?? "")
    if (job.layout?.kitchen_hides_prices !== false) {
      lines.push(`${quantity} x ${name}`)
    } else {
      pair(`${quantity} x ${name}`, item.total_minor ?? "")
    }
    if (item.note) lines.push(`   * ${item.note}`)
  }

  line()

  if (job.layout?.kitchen_hides_prices === false && order.total_minor != null) {
    pair("TOTAL", order.total_minor)
  }

  if (job.layout?.footer_note) {
    line()
    lines.push(String(job.layout.footer_note))
  }

  // Partial cut, then full cut: a printer that understands only one of them still cuts.
  lines.push("\x1d\x56\x42\x00")
  lines.push("\x1d\x56\x00")

  return lines.join("\n") + "\n"
}

/** Run the configured print command, resolving on exit code 0 only. */
function printWith(command, text) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ["pipe", "ignore", "pipe"] })

    let stderr = ""
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })

    child.on("error", (error) => reject(error))
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`print command exited ${code}: ${stderr.trim()}`))
      }
    })

    child.stdin.end(text)
  })
}

/** A printer with no command configured is a routing mistake, and it is reported as one. */
function commandFor(config, printerName) {
  const entry = config.printers?.[printerName]
  if (entry?.command) return entry.command
  if (config.defaultPrinter && config.printers?.[config.defaultPrinter]?.command) {
    return config.printers[config.defaultPrinter].command
  }
  return null
}

async function printJob(config, job, spoolFile) {
  const printers = Array.isArray(job.printers) ? job.printers : []

  if (printers.length === 0) {
    // The server already said this out loud; the agent logs it rather than silently dropping it.
    log("warn", "no printer routed for this document", { document: job.document })
    await rm(spoolFile, { force: true })
    return
  }

  const text = render(job)

  for (const printer of printers) {
    const command = commandFor(config, printer.name)

    if (!command) {
      log("error", "printer is routed but the agent has no command for it", { printer: printer.name })
      // Keep the spool file: a person can configure the printer and the next pass will print it.
      return
    }

    await printWith(command, text)
    log("info", "printed", { printer: printer.name, document: job.document })
  }

  await rm(spoolFile, { force: true })
}

/** Everything left in the spool from a previous run, oldest first. */
async function replaySpool(config) {
  let entries

  try {
    entries = await readdir(config.spoolDir)
  } catch {
    return
  }

  const files = entries.filter((name) => name.endsWith(".json")).sort()

  for (const name of files) {
    const file = path.join(config.spoolDir, name)

    try {
      const job = JSON.parse(await readFile(file, "utf8"))
      await printJob(config, job, file)
    } catch (error) {
      // A spool file that will not print stays put and is retried on the next pass, rather
      // than being deleted to make the directory tidy.
      log("error", "spooled job failed", { file: name, error: String(error?.message ?? error) })
      return
    }
  }
}

async function main() {
  const config = await loadConfig()

  log("info", "agent starting", {
    apiBase: config.apiBase,
    document: config.document,
    stationId: config.stationId,
    pollSeconds: config.pollSeconds,
  })

  let backoffMs = 0

  // The loop never exits: a print agent that stops is a kitchen that stops.
  for (;;) {
    try {
      await replaySpool(config)

      const job = await requestJob(config)

      if (job?.data?.routed) {
        const file = await spool(config, job.data)
        await printJob(config, job.data, file)
      }

      backoffMs = 0
      await new Promise((resolve) => setTimeout(resolve, config.pollSeconds * 1000))
    } catch (error) {
      // Back off to a minute at most: a printer that is off should not become a busy loop, and
      // a network blip should not become an hour of silence.
      backoffMs = Math.min(60_000, backoffMs === 0 ? 2_000 : backoffMs * 2)
      log("error", "poll failed", { error: String(error?.message ?? error), retryInMs: backoffMs })
      await new Promise((resolve) => setTimeout(resolve, backoffMs))
    }
  }
}

main().catch((error) => {
  log("error", "agent could not start", { error: String(error?.message ?? error) })
  process.exit(1)
})
