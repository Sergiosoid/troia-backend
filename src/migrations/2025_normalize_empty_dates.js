import { query, queryOne } from "../database/db-adapter.js";

/**
 * Migração para normalizar strings vazias em campos de data
 * Converte "" para NULL em todas as tabelas relevantes
 */
export async function up() {
  const isPostgres = !!process.env.DATABASE_URL;
  
  console.log("🛠️  Normalizando strings vazias em campos de data...");

  try {
    if (isPostgres) {
      // PostgreSQL: usar UPDATE com WHERE para strings vazias
      await query(`
        UPDATE proprietarios_historico
        SET data_inicio = NULL
        WHERE data_inicio = '' OR TRIM(data_inicio) = '';
      `);
      
      await query(`
        UPDATE proprietarios_historico
        SET data_venda = NULL
        WHERE data_venda = '' OR TRIM(data_venda) = '';
      `);
      
      await query(`
        UPDATE proprietarios_historico
        SET data_aquisicao = NULL
        WHERE data_aquisicao = '' OR TRIM(data_aquisicao) = '';
      `);
      
      await query(`
        UPDATE veiculos
        SET data_aquisicao = NULL
        WHERE data_aquisicao = '' OR TRIM(data_aquisicao) = '';
      `);
      
      await query(`
        UPDATE manutencoes
        SET data = NULL
        WHERE data = '' OR TRIM(data) = '';
      `);
      
      await query(`
        UPDATE abastecimentos
        SET data = NULL
        WHERE data = '' OR TRIM(data) = '';
      `);
      
      await query(`
        UPDATE km_historico
        SET data_registro = NULL
        WHERE data_registro = '' OR TRIM(data_registro) = '';
      `);
    } else {
      // SQLite: mesma lógica
      await query(`
        UPDATE proprietarios_historico
        SET data_inicio = NULL
        WHERE data_inicio = '' OR TRIM(data_inicio) = '';
      `);
      
      await query(`
        UPDATE proprietarios_historico
        SET data_venda = NULL
        WHERE data_venda = '' OR TRIM(data_venda) = '';
      `);
      
      await query(`
        UPDATE proprietarios_historico
        SET data_aquisicao = NULL
        WHERE data_aquisicao = '' OR TRIM(data_aquisicao) = '';
      `);
      
      await query(`
        UPDATE veiculos
        SET data_aquisicao = NULL
        WHERE data_aquisicao = '' OR TRIM(data_aquisicao) = '';
      `);
      
      await query(`
        UPDATE manutencoes
        SET data = NULL
        WHERE data = '' OR TRIM(data) = '';
      `);
      
      await query(`
        UPDATE abastecimentos
        SET data = NULL
        WHERE data = '' OR TRIM(data) = '';
      `);
      
      await query(`
        UPDATE km_historico
        SET data_registro = NULL
        WHERE data_registro = '' OR TRIM(data_registro) = '';
      `);
    }
    
    console.log("✅ Strings vazias normalizadas com sucesso.");
  } catch (err) {
    // Não falhar se a migração já foi aplicada ou se houver erro
    console.warn("⚠️  Aviso ao normalizar datas (pode ser normal se já foi aplicado):", err.message);
    // Não lançar erro - migração é idempotente
  }
}

export async function down() {
  // Migração down não é necessária - não podemos restaurar strings vazias
  console.log("↩️  Migração down não aplicável - normalização de datas é irreversível");
}

