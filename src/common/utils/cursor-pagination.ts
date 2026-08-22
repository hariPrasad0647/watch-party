import { z } from 'zod';

export interface CursorData {
  createdAt: Date;
  id: string;
}

export interface KeysetPaginationParams {
  limit?: number;
  before?: string; // opaque cursor
  after?: string;  // opaque cursor
}

export interface PaginatedKeysetResult<T> {
  items: T[];
  pagination: {
    nextBefore: string | null;
    nextAfter: string | null;
    hasMoreBefore: boolean;
    hasMoreAfter: boolean;
  };
}

const cursorSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string()
});

/**
 * Encodes a cursor into an opaque base64 string
 */
export function encodeCursor(createdAt: Date, id: string): string {
  const json = JSON.stringify({
    createdAt: createdAt.toISOString(),
    id
  });
  return Buffer.from(json, 'utf-8').toString('base64');
}

/**
 * Decodes an opaque cursor back into data
 */
export function decodeCursor(cursor: string): CursorData | null {
  try {
    const json = Buffer.from(cursor, 'base64').toString('utf-8');
    const data = JSON.parse(json);
    const parsed = cursorSchema.parse(data);
    return {
      createdAt: new Date(parsed.createdAt),
      id: parsed.id
    };
  } catch (err) {
    return null;
  }
}

/**
 * Generates Prisma where/orderBy clauses for keyset pagination.
 *
 * For before (older messages):
 * WHERE (createdAt, id) < (cursor.createdAt, cursor.id)
 * ORDER BY createdAt DESC, id DESC
 *
 * For after (newer messages):
 * WHERE (createdAt, id) > (cursor.createdAt, cursor.id)
 * ORDER BY createdAt ASC, id ASC
 */
export function getKeysetPaginationOptions(params: KeysetPaginationParams) {
  const limit = Math.max(1, Math.min(100, params.limit || 50));
  
  if (params.before) {
    const cursor = decodeCursor(params.before);
    if (cursor) {
      return {
        take: limit + 1, // take 1 extra to determine hasMore
        orderBy: [
          { createdAt: 'desc' as const },
          { id: 'desc' as const }
        ],
        where: {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            {
              createdAt: cursor.createdAt,
              id: { lt: cursor.id }
            }
          ]
        }
      };
    }
  }
  
  if (params.after) {
    const cursor = decodeCursor(params.after);
    if (cursor) {
      return {
        take: limit + 1,
        orderBy: [
          { createdAt: 'asc' as const },
          { id: 'asc' as const }
        ],
        where: {
          OR: [
            { createdAt: { gt: cursor.createdAt } },
            {
              createdAt: cursor.createdAt,
              id: { gt: cursor.id }
            }
          ]
        }
      };
    }
  }

  // Default: latest messages (acting like a 'before' query from now)
  return {
    take: limit + 1,
    orderBy: [
      { createdAt: 'desc' as const },
      { id: 'desc' as const }
    ],
    where: {}
  };
}

/**
 * Helper to build the paginated response
 * @param data Data returned from DB (could contain limit + 1 items)
 * @param limit The requested limit
 * @param isAfter True if this was an `after` query
 * @param getCursorFn function to extract Date and id from a record
 */
export function buildKeysetPaginatedResult<T>(
  data: T[],
  limit: number,
  isAfter: boolean,
  getCursorFn: (item: T) => { createdAt: Date; id: string }
): PaginatedKeysetResult<T> {
  const hasMore = data.length > limit;
  
  // Remove the extra item used for checking hasMore
  const items = hasMore ? data.slice(0, limit) : [...data];
  
  // If it was a default or 'before' query, the DB returned them DESC (newest first).
  // The API contract requires returning them oldest -> newest.
  if (!isAfter) {
    items.reverse();
  }

  // Determine the new cursors based on the currently returned items
  let nextBefore = null;
  let nextAfter = null;

  if (items.length > 0) {
    const oldest = items[0];
    const newest = items[items.length - 1];

    const oldestCursor = getCursorFn(oldest as T);
    const newestCursor = getCursorFn(newest as T);

    // If we fetched 'before' (older), then if hasMore is true, there are even older messages.
    // nextBefore is always the oldest in the current batch.
    nextBefore = encodeCursor(oldestCursor.createdAt, oldestCursor.id);
    
    // nextAfter is always the newest in the current batch
    nextAfter = encodeCursor(newestCursor.createdAt, newestCursor.id);
  }

  return {
    items,
    pagination: {
      nextBefore,
      nextAfter,
      // If querying 'before', we have more 'before' if DB returned > limit. We always have more 'after' if items exist, though they might just poll.
      // We set hasMoreBefore to true if isAfter is false and hasMore is true.
      hasMoreBefore: !isAfter ? hasMore : false, 
      hasMoreAfter: isAfter ? hasMore : false
    }
  };
}
