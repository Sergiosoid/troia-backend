# 🔄 GUIA - Adaptar Rotas para PostgreSQL

## 📋 RESUMO

As rotas atualmente usam SQLite. Para produção no Render, precisam ser adaptadas para PostgreSQL.

## 🔧 ESTRATÉGIA

Criar um helper que detecta qual banco usar e fornece uma interface unificada.

## 📝 EXEMPLO: Adaptar auth.js

### Antes (SQLite):
```javascript
import sqlite3 from 'sqlite3';
const db = new sqlite3.Database(dbPath);

db.get('SELECT id FROM usuarios WHERE email = ?', [email], (err, row) => {
  // ...
});

stmt.run(nome, email, senhaHash, function(err) {
  const id = this.lastID;
  // ...
});
```

### Depois (PostgreSQL):
```javascript
import { query, queryOne, execute } from '../database/postgres.js';
import { isPostgres } from '../database/db-adapter.js';

// Para SELECT
if (isPostgres()) {
  const row = await queryOne('SELECT id FROM usuarios WHERE email = $1', [email]);
} else {
  // SQLite (código antigo)
}

// Para INSERT
if (isPostgres()) {
  const result = await execute(
    'INSERT INTO usuarios (nome, email, senha) VALUES ($1, $2, $3) RETURNING id',
    [nome, email, senhaHash]
  );
  const id = result.insertId;
} else {
  // SQLite (código antigo)
}
```

## 🔑 DIFERENÇAS PRINCIPAIS

### 1. Parâmetros
- SQLite: `?`
- PostgreSQL: `$1, $2, $3...`

### 2. Last Insert ID
- SQLite: `this.lastID`
- PostgreSQL: `RETURNING id` + `result.insertId`

### 3. Callbacks vs Promises
- SQLite: Callbacks
- PostgreSQL: Promises (async/await)

### 4. Tipos de Dados
- SQLite: `TEXT`, `INTEGER`, `REAL`
- PostgreSQL: `VARCHAR(n)`, `INTEGER`, `DECIMAL(10,2)`

## 📚 ARQUIVOS A ADAPTAR

1. `backend/src/routes/auth.js`
2. `backend/src/routes/proprietarios.js`
3. `backend/src/routes/veiculos.js`
4. `backend/src/routes/manutencoes.js`

## ⚠️ NOTA

Por enquanto, o sistema detecta automaticamente qual banco usar via `DATABASE_URL`.
As rotas ainda precisam ser adaptadas para suportar ambos os bancos.

**Solução temporária:** Em produção, todas as rotas usarão PostgreSQL automaticamente.

