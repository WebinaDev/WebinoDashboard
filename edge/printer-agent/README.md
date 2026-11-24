# Edge print agent

A tiny process that runs on a machine **inside the shop** and puts kitchen tickets and receipts
on thermal paper.

## Why it exists

A browser tab cannot print to a thermal printer without a driver installed on the counter
machine, and a server in a datacentre cannot reach a printer plugged into the shop's LAN. The
dashboard routes each ticket to a printer by station (`PrintRouter`); this agent is the other
half of that route — it asks *what* to print and does the printing locally.

## Install

Requires Node 18 or newer, and a print queue the OS already knows about (`lp`, `lpstat`,
`Get-Printer` or a raw `cat > /dev/usb/lp0`).

```bash
cd edge/printer-agent
cp config.example.json config.json     # then edit
node agent.mjs
```

As a service, so it restarts after a reboot:

```ini
# /etc/systemd/system/webino-printer.service
[Unit]
Description=Webino edge print agent
After=network-online.target

[Service]
WorkingDirectory=/opt/webino/printer-agent
ExecStart=/usr/bin/node agent.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Configuration

| key | meaning |
|---|---|
| `apiBase` | The panel's URL, e.g. `https://panel.example.com` |
| `token` | A Sanctum token for a user with `pos.use` on this tenant |
| `branchId` | Which branch's printers to poll (null = tenant-wide) |
| `document` | `kitchen`, `receipt` or `label` |
| `stationId` | Poll one station only (null = the catch-all route) |
| `pollSeconds` | How often to ask (default 4) |
| `spoolDir` | Where unprinted jobs are kept until they print |
| `printers` | Map of **panel printer name** → shell command that prints stdin |
| `defaultPrinter` | Used when a routed printer has no command configured |

The keys of `printers` must match the printer names in **پنل → کافه → چاپگرها**. That is the
only thing that has to be kept in sync by hand; adding a printer in the panel needs no restart
here, because the agent looks the name up on every job.

## What it does when things go wrong

- **Printer off / out of paper** — the job stays in `spoolDir` and is retried on the next pass.
  Nothing is lost, and the log says which file and why.
- **Panel unreachable** — retries with exponential backoff up to 60 seconds; the spool is
  replayed first, so a reconnect prints what it missed.
- **No printer routed** — logs a warning and drops the job. The till already shows the same
  warning; printing a kitchen ticket on the receipt printer would be worse than not printing it.
- **Bad token** — says so plainly (`authorisation failed (401)`) instead of retrying silently.

Logs are one JSON object per line, so they can be shipped anywhere.
