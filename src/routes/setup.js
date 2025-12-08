import express from 'express';
import { query, queryOne } from '../database/db-adapter.js';
import logger from '../logger.js';

const router = express.Router();

/**
 * POST /setup/init
 * - creates a minimal users table if not exists (safe to run multiple times)
 * - returns current db time and status
 *
 * This endpoint is intended to be executed once by an admin/CI to ensure the schema required for auth exists.
 */
router.post('/init', async (req, res) => {
  try {
    // Check if DATABASE_URL exists (PostgreSQL) or use SQLite
    const isPostgres = !!process.env.DATABASE_URL;
    
    let sql;
    if (isPostgres) {
      // PostgreSQL syntax
      sql = `
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name TEXT,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );
      `;
    } else {
      // SQLite syntax
      sql = `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `;
    }
    
    await query(sql);
    
    // return DB time
    let nowRow;
    if (isPostgres) {
      nowRow = await queryOne('SELECT now() as now');
    } else {
      nowRow = await queryOne('SELECT datetime("now") as now');
    }
    const now = nowRow?.now || new Date().toISOString();
    
    res.json({ ok: true, status: 'users table ensured', time: now });
  } catch (err) {
    logger.error({ err }, 'setup-init-failed');
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Export router in a flexible way for the auto-mounter to use.
export default router;
export const routerExport = router;
export const basePath = '/setup';

