import Dexie from 'dexie'

// Local-first database. Everything lives in the browser via IndexedDB.
// No server, no account, no sync — see README for the tradeoffs and
// the export/import backup feature that covers for it.
export const db = new Dexie('DartsAppDB')

db.version(1).stores({
  players: '++id, name, createdAt',
  matches: '++id, mode, format, status, createdAt, finishedAt',
  legs: '++id, matchId, legNumber, status, createdAt, finishedAt',
  throws: '++id, matchId, legId, playerId, mode, target, hit, createdAt',
})

export async function ensureDefaultPlayer() {
  const count = await db.players.count()
  if (count === 0) {
    await db.players.add({ name: 'Player 1', createdAt: Date.now() })
  }
}

export async function exportAllData() {
  const [players, matches, legs, throws] = await Promise.all([
    db.players.toArray(),
    db.matches.toArray(),
    db.legs.toArray(),
    db.throws.toArray(),
  ])
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    players,
    matches,
    legs,
    throws,
  }
}

export async function importAllData(payload) {
  if (!payload || !Array.isArray(payload.players)) {
    throw new Error('That file does not look like a darts app backup.')
  }
  await db.transaction('rw', db.players, db.matches, db.legs, db.throws, async () => {
    await db.players.clear()
    await db.matches.clear()
    await db.legs.clear()
    await db.throws.clear()
    await db.players.bulkAdd(payload.players)
    await db.matches.bulkAdd(payload.matches || [])
    await db.legs.bulkAdd(payload.legs || [])
    await db.throws.bulkAdd(payload.throws || [])
  })
}
