/**
 * Minimal ambient declaration for the narrow `bun:sqlite` surface the board
 * reconciler uses. The plugin runs under Bun (which provides this module
 * natively), but the repo type-checks with `@types/node` only — without
 * `@types/bun` this import would error. This declares just what
 * board-reconcile-db.ts calls; it is NOT a full bun:sqlite typing.
 */
declare module "bun:sqlite" {
  export class Database {
    constructor(path: string, options?: { readonly?: boolean })
    query(sql: string): {
      all(...params: unknown[]): unknown[]
      get(...params: unknown[]): unknown
    }
    close(): void
  }
}
