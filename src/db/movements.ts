import { newId } from '@/lib/id';
import { db, type PlascoDb } from './dexie';
import type { ID, Movement, MovementType } from './types';

/** Raised when a movement would push a location below zero pieces. */
export class InsufficientStockError extends Error {
  constructor(
    readonly productId: ID,
    readonly locationId: ID,
    readonly available: number,
    readonly requested: number,
  ) {
    super('InsufficientStock');
    this.name = 'InsufficientStockError';
  }
}

export class AlreadyUndoneError extends Error {
  constructor(readonly movementId: ID) {
    super('AlreadyUndone');
    this.name = 'AlreadyUndoneError';
  }
}

export class MovementNotFoundError extends Error {
  constructor(readonly movementId: ID) {
    super('MovementNotFound');
    this.name = 'MovementNotFoundError';
  }
}

export interface MovementInput {
  productId: ID;
  locationId: ID;
  type: MovementType;
  /** Signed pieces. */
  qty: number;
  unitCost?: number;
  unitPrice?: number;
  refId?: ID;
  undoOf?: ID;
  note?: string;
  at?: number;
}

/**
 * Appends a movement and updates the cached level. Must run inside a
 * read-write transaction that includes `movements` and `stockLevels`.
 */
async function writeMovement(target: PlascoDb, input: MovementInput): Promise<Movement> {
  const qty = Math.round(input.qty);
  if (!Number.isFinite(qty) || qty === 0) {
    throw new Error('MovementQtyMustBeNonZero');
  }

  const at = input.at ?? Date.now();
  const movement: Movement = {
    id: newId(),
    productId: input.productId,
    locationId: input.locationId,
    type: input.type,
    qty,
    unitCost: input.unitCost,
    unitPrice: input.unitPrice,
    refId: input.refId,
    undoOf: input.undoOf,
    note: input.note,
    at,
    createdAt: at,
    updatedAt: at,
  };

  const key: [ID, ID] = [input.productId, input.locationId];
  const existing = await target.stockLevels.get(key);
  const current = existing?.qty ?? 0;
  const next = current + qty;
  if (next < 0) {
    throw new InsufficientStockError(input.productId, input.locationId, current, qty);
  }

  await target.movements.add(movement);
  await target.stockLevels.put({
    productId: input.productId,
    locationId: input.locationId,
    qty: next,
    bin: existing?.bin,
    updatedAt: at,
  });

  return movement;
}

/** Rule 7: this is the only writer of `stockLevels` besides rebuildStockLevels(). */
export async function applyMovement(
  input: MovementInput,
  target: PlascoDb = db,
): Promise<Movement> {
  return target.transaction('rw', target.movements, target.stockLevels, async () =>
    writeMovement(target, input),
  );
}

export interface TransferResult {
  refId: ID;
  out: Movement;
  in: Movement;
}

/** Two movements sharing one refId, in one transaction. */
export async function applyTransfer(
  productId: ID,
  fromLocationId: ID,
  toLocationId: ID,
  qty: number,
  options: { note?: string; at?: number } = {},
  target: PlascoDb = db,
): Promise<TransferResult> {
  if (fromLocationId === toLocationId) throw new Error('TransferSameLocation');
  const pieces = Math.abs(Math.round(qty));
  if (pieces === 0) throw new Error('MovementQtyMustBeNonZero');
  const refId = newId();

  return target.transaction('rw', target.movements, target.stockLevels, async () => {
    const out = await writeMovement(target, {
      productId,
      locationId: fromLocationId,
      type: 'transfer_out',
      qty: -pieces,
      refId,
      note: options.note,
      at: options.at,
    });
    const back = await writeMovement(target, {
      productId,
      locationId: toLocationId,
      type: 'transfer_in',
      qty: pieces,
      refId,
      note: options.note,
      at: options.at,
    });
    return { refId, out, in: back };
  });
}

async function undoOne(target: PlascoDb, movement: Movement): Promise<Movement> {
  return writeMovement(target, {
    productId: movement.productId,
    locationId: movement.locationId,
    type: movement.type === 'transfer_in' ? 'transfer_out' : movement.type === 'transfer_out' ? 'transfer_in' : movement.type,
    qty: -movement.qty,
    refId: movement.refId,
    undoOf: movement.id,
    note: movement.note,
  });
}

/** Compensating movement. Cannot run twice, and an undo cannot itself be undone. */
export async function undoMovement(id: ID, target: PlascoDb = db): Promise<Movement> {
  return target.transaction('rw', target.movements, target.stockLevels, async () => {
    const movement = await target.movements.get(id);
    if (!movement) throw new MovementNotFoundError(id);
    if (movement.undoOf) throw new AlreadyUndoneError(id);

    const existingUndo = await target.movements.where('id').notEqual(id).filter((m) => m.undoOf === id).first();
    if (existingUndo) throw new AlreadyUndoneError(id);

    // Undoing one leg of a transfer undoes both.
    if (movement.type === 'transfer_out' || movement.type === 'transfer_in') {
      const partnerType = movement.type === 'transfer_out' ? 'transfer_in' : 'transfer_out';
      const partner = movement.refId
        ? await target.movements
            .filter((m) => m.refId === movement.refId && m.type === partnerType && m.id !== movement.id)
            .first()
        : undefined;
      if (partner) {
        const partnerUndo = await target.movements.filter((m) => m.undoOf === partner.id).first();
        if (partnerUndo) throw new AlreadyUndoneError(partner.id);
        await undoOne(target, partner);
      }
    }

    return undoOne(target, movement);
  });
}

/** Levels for one product across every location. */
export async function productLevels(
  productId: ID,
  target: PlascoDb = db,
): Promise<Array<{ locationId: ID; qty: number; bin?: string }>> {
  const rows = await target.stockLevels.where('productId').equals(productId).toArray();
  return rows.map((r) => ({ locationId: r.locationId, qty: r.qty, bin: r.bin }));
}
