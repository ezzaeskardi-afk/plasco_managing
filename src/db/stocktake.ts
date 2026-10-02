import { db as defaultDb, type PlascoDb } from './dexie';
import { applyMovement, undoMovement } from './movements';
import type { ID, Movement, StockTake } from './types';

/**
 * Stock-take sessions change stock only through these two functions, and always in one
 * transaction: a half-applied count would silently corrupt the shelf (AGENTS.md rule 7).
 */

export class StockTakeNotFoundError extends Error {
  constructor(id: ID) {
    super(`StockTakeNotFound:${id}`);
    this.name = 'StockTakeNotFoundError';
  }
}

export class StockTakeNotOpenError extends Error {
  constructor(readonly status: StockTake['status']) {
    super(`StockTakeNotOpen:${status}`);
    this.name = 'StockTakeNotOpenError';
  }
}

export interface ApplyStockTakeResult {
  sessionId: ID;
  /** Movements written by this apply, in order. Empty means nothing changed on the shelf. */
  movements: Movement[];
  /** Counted products whose number already matched the system quantity. */
  unchanged: number;
}

export async function applyStockTake(
  sessionId: ID,
  options: { treatUncountedAsZero?: boolean } = {},
  target: PlascoDb = defaultDb,
): Promise<ApplyStockTakeResult> {
  return target.transaction(
    'rw',
    [target.stockTakes, target.stockTakeItems, target.products, target.movements, target.stockLevels],
    async () => {
      const session = await target.stockTakes.get(sessionId);
      if (!session) throw new StockTakeNotFoundError(sessionId);
      if (session.status !== 'open') throw new StockTakeNotOpenError(session.status);

      const items = await target.stockTakeItems.where('stockTakeId').equals(sessionId).toArray();
      const countedIds = new Set(items.map((item) => item.productId));
      const movements: Movement[] = [];
      let unchanged = 0;

      const applyCount = async (productId: ID, counted: number) => {
        const level = await target.stockLevels.get([productId, session.locationId]);
        const delta = counted - (level?.qty ?? 0);
        if (delta === 0) {
          unchanged += 1;
          return;
        }
        movements.push(
          await applyMovement(
            {
              productId,
              locationId: session.locationId,
              type: 'count',
              qty: delta,
              refId: session.id,
            },
            target,
          ),
        );
      };

      for (const item of items) await applyCount(item.productId, item.counted);

      if (options.treatUncountedAsZero) {
        for (const product of await target.products.toArray()) {
          if (product.deletedAt || countedIds.has(product.id)) continue;
          await applyCount(product.id, 0);
        }
      }

      const at = Date.now();
      await target.stockTakes.update(sessionId, { status: 'applied', appliedAt: at, updatedAt: at });
      return { sessionId, movements, unchanged };
    },
  );
}

export interface RevertStockTakeResult {
  sessionId: ID;
  /** Count movements compensated by this revert. */
  reverted: number;
}

/** Undo of an apply: compensating movements, then the session reopens for another review. */
export async function revertStockTake(
  sessionId: ID,
  target: PlascoDb = defaultDb,
): Promise<RevertStockTakeResult> {
  return target.transaction(
    'rw',
    [target.stockTakes, target.movements, target.stockLevels],
    async () => {
      const session = await target.stockTakes.get(sessionId);
      if (!session) throw new StockTakeNotFoundError(sessionId);
      if (session.status !== 'applied') throw new StockTakeNotOpenError(session.status);

      const originals = await target.movements
        .where('refId')
        .equals(sessionId)
        .filter((movement) => movement.type === 'count' && !movement.undoOf)
        .toArray();

      let reverted = 0;
      for (const movement of originals) {
        const alreadyUndone = await target.movements.filter((m) => m.undoOf === movement.id).count();
        if (alreadyUndone > 0) continue;
        await undoMovement(movement.id, target);
        reverted += 1;
      }

      await target.stockTakes.update(sessionId, {
        status: 'open',
        appliedAt: undefined,
        updatedAt: Date.now(),
      });
      return { sessionId, reverted };
    },
  );
}
