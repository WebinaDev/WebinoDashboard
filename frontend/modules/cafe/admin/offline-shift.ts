"use client";

/**
 * The shift a till was working under when it lost the network.
 *
 * The offline queue already protects the sale itself. What it did not protect is the thing that
 * makes the sale auditable afterwards: which drawer it went into.
 *
 * `OrderIntake::resolveBranch` decides a sale's branch from, in order, an explicit choice, the
 * cashier's **open shift**, and the tenant's only branch. Offline, the open shift is a fact the
 * browser knew seconds ago and the server can no longer answer — so a shop with two counters
 * would have its offline sales land unattributed, and the cash pickup at close would come out
 * short with no way to say which counter it belonged to.
 *
 * So the till writes down the shift while it can, and stamps that value onto every queued sale.
 * On replay the sale is attributed to the counter it was sold at, even if the cashier has since
 * closed that shift and opened another.
 */

const SHIFT_KEY = "webino.cafe.pos.shift.v1";

export type ShiftContext = {
  /** Drawer id, or null when the tenant runs a single branch and has no shift. */
  shift_id: number | null;
  branch_id: number | null;
  opened_at: string | null;
  /** When this record was captured; a stale stamp is better than a confident wrong one. */
  captured_at: string;
};

function available(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

/** Remember the shift the till is trading under. Called whenever the server tells us. */
export function rememberShift(
  context: Omit<ShiftContext, "captured_at">,
): ShiftContext {
  const row: ShiftContext = {
    ...context,
    captured_at: new Date().toISOString(),
  };

  if (available()) {
    try {
      window.localStorage.setItem(SHIFT_KEY, JSON.stringify(row));
    } catch {
      // Quota or private mode: the in-memory caller still has the value.
    }
  }

  return row;
}

export function readShift(): ShiftContext | null {
  if (!available()) return null;
  try {
    const raw = window.localStorage.getItem(SHIFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShiftContext;

    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

export function forgetShift(): void {
  if (!available()) return;
  try {
    window.localStorage.removeItem(SHIFT_KEY);
  } catch {
    // Nothing to do; a stale shift is corrected by the next rememberShift().
  }
}

/**
 * The fields an offline sale must carry so it is attributable on replay.
 *
 * Only ids. A shift's *money* must never be replayed from the browser: expected cash is derived
 * on the server from the sale itself, and sending a figure from a client would let a stale tab
 * restate the drawer.
 */
export function attributionFields(): { shift_id?: number; branch_id?: number } {
  const context = readShift();
  if (!context) return {};

  const fields: { shift_id?: number; branch_id?: number } = {};
  if (context.shift_id !== null) fields.shift_id = context.shift_id;
  if (context.branch_id !== null) fields.branch_id = context.branch_id;

  return fields;
}

/**
 * How stale the remembered shift is, in minutes.
 *
 * A till that has been offline for a day and then syncs is still correct to attribute — the sale
 * happened then, not now — but the screen should say so rather than imply the shift is live.
 */
export function shiftAgeMinutes(): number | null {
  const context = readShift();
  if (!context?.captured_at) return null;

  const captured = Date.parse(context.captured_at);
  if (Number.isNaN(captured)) return null;

  return Math.max(0, Math.round((Date.now() - captured) / 60_000));
}
