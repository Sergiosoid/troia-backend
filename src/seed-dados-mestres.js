/**
 * Seed de dados mestres para fabricantes, modelos e anos
 * Executa apenas se as tabelas estiverem vazias
 */

import { query, queryOne, queryAll, isPostgres } from './database/db-adapter.js';

const fabricantesComuns = [
  'Fiat', 'Volkswagen', 'Chevrolet', 'Ford', 'Toyota', 'Honda',
  'Hyundai', 'Renault', 'Nissan', 'Peugeot', 'Citroën', 'Jeep',
  'Mitsubishi', 'Suzuki', 'Kia', 'Audi', 'BMW', 'Mercedes-Benz',
  'Volvo', 'Land Rover', 'Jaguar', 'Porsche', 'Lexus', 'Infiniti'
];

const modelosPorFabricante = {
  'Fiat': ['Uno', 'Palio', 'Siena', 'Strada', 'Toro', 'Mobi', 'Argo', 'Cronos', 'Fiorino', 'Doblo'],
  'Volkswagen': ['Gol', 'Polo', 'Virtus', 'Jetta', 'Passat', 'T-Cross', 'Nivus', 'Amarok', 'Saveiro', 'Fox'],
  'Chevrolet': ['Onix', 'Prisma', 'Cruze', 'Spin', 'Tracker', 'Equinox', 'S10', 'Montana', 'Celta', 'Corsa'],
  'Ford': ['Ka', 'Fiesta', 'Focus', 'Fusion', 'Edge', 'Ranger', 'EcoSport', 'Territory', 'Maverick', 'Bronco'],
  'Toyota': ['Corolla', 'Hilux', 'SW4', 'RAV4', 'Yaris', 'Etios', 'Prius', 'Camry', 'Land Cruiser', 'Bandeirante'],
  'Honda': ['Civic', 'City', 'Fit', 'HR-V', 'CR-V', 'WR-V', 'Accord', 'Ridgeline', 'Pilot', 'Passport'],
  'Hyundai': ['HB20', 'HB20S', 'Creta', 'Tucson', 'Santa Fe', 'iX35', 'Elantra', 'Azera', 'Veloster', 'Kona'],
  'Renault': ['Kwid', 'Logan', 'Sandero', 'Duster', 'Captur', 'Oroch', 'Fluence', 'Megane', 'Koleos', 'Kangoo'],
  'Nissan': ['March', 'Versa', 'Sentra', 'Kicks', 'X-Trail', 'Frontier', 'Leaf', 'Altima', 'Pathfinder', 'Titan'],
  'Peugeot': ['208', '2008', '3008', '5008', 'Partner', 'Expert', 'Boxer', '308', '408', '508'],
  'Citroën': ['C3', 'C4', 'C4 Cactus', 'Aircross', 'Jumper', 'Berlingo', 'C5', 'DS3', 'DS4', 'DS5'],
  'Jeep': ['Renegade', 'Compass', 'Commander', 'Wrangler', 'Grand Cherokee', 'Cherokee', 'Gladiator', 'Wagoneer'],
  'Mitsubishi': ['L200', 'Outlander', 'ASX', 'Eclipse Cross', 'Pajero', 'Lancer', 'Mirage', 'Montero'],
  'Suzuki': ['Jimny', 'Vitara', 'S-Cross', 'Swift', 'SX4', 'Grand Vitara', 'Baleno', 'Celerio'],
  'Kia': ['Picanto', 'Rio', 'Cerato', 'Optima', 'Sportage', 'Sorento', 'Soul', 'Stonic', 'Telluride', 'Carnival'],
  'Audi': ['A1', 'A3', 'A4', 'A5', 'A6', 'A8', 'Q3', 'Q5', 'Q7', 'Q8', 'TT', 'R8'],
  'BMW': ['Série 1', 'Série 3', 'Série 5', 'Série 7', 'X1', 'X3', 'X5', 'X7', 'Z4', 'i8'],
  'Mercedes-Benz': ['Classe A', 'Classe B', 'Classe C', 'Classe E', 'Classe S', 'GLA', 'GLC', 'GLE', 'GLS', 'AMG GT'],
  'Volvo': ['XC40', 'XC60', 'XC90', 'S60', 'S90', 'V40', 'V60', 'V90'],
  'Land Rover': ['Discovery', 'Range Rover', 'Range Rover Sport', 'Range Rover Evoque', 'Defender', 'Discovery Sport'],
  'Jaguar': ['XE', 'XF', 'XJ', 'F-Pace', 'E-Pace', 'I-Pace', 'F-Type'],
  'Porsche': ['911', 'Cayenne', 'Macan', 'Panamera', 'Boxster', 'Cayman', 'Taycan'],
  'Lexus': ['IS', 'ES', 'GS', 'LS', 'NX', 'RX', 'GX', 'LX', 'RC', 'LC'],
  'Infiniti': ['Q50', 'Q60', 'Q70', 'QX30', 'QX50', 'QX60', 'QX80']
};

const anoAtual = new Date().getFullYear();
const anoInicio = 1980;
const anoFim = anoAtual + 1; // Permitir até ano futuro

export const seedDadosMestres = async () => {
  try {
    console.log('🌱 Iniciando seed de dados mestres...');

    // Verificar se já existem fabricantes
    let countFabricantes = 0;
    try {
      const fabricantesExistentes = await queryAll(
        isPostgres() 
          ? 'SELECT COUNT(*) as count FROM fabricantes'
          : 'SELECT COUNT(*) as count FROM fabricantes'
      );
      countFabricantes = isPostgres() 
        ? (fabricantesExistentes?.[0]?.count || parseInt(fabricantesExistentes?.[0]?.count) || 0)
        : (fabricantesExistentes?.[0]?.count || 0);
    } catch (error) {
      // Se tabela não existir, count = 0
      if (error.message?.includes('does not exist') || error.message?.includes('não existe')) {
        countFabricantes = 0;
      } else {
        throw error;
      }
    }

    if (countFabricantes > 0) {
      console.log('  ✓ Dados mestres já populados. Pulando seed.');
      return;
    }

    console.log('  📦 Populando fabricantes...');
    const fabricantesMap = {};

    for (const nomeFabricante of fabricantesComuns) {
      try {
        // Usar query do db-adapter que já trata PostgreSQL vs SQLite
        const result = await query(
          isPostgres() 
            ? 'INSERT INTO fabricantes (nome, ativo) VALUES ($1, true) RETURNING id'
            : 'INSERT INTO fabricantes (nome, ativo) VALUES (?, true)',
          [nomeFabricante]
        );
        
        // Extrair ID conforme o tipo de banco
        let fabricanteId;
        if (isPostgres()) {
          fabricanteId = result.rows?.[0]?.id;
        } else {
          fabricanteId = result.insertId;
        }
        
        fabricantesMap[nomeFabricante] = fabricanteId;
        console.log(`    ✓ ${nomeFabricante} (ID: ${fabricanteId})`);
      } catch (error) {
        // Ignorar duplicatas
        if (error.message?.includes('UNIQUE') || error.message?.includes('duplicate')) {
          // Buscar ID existente
          const existente = await queryOne(
            isPostgres() 
              ? 'SELECT id FROM fabricantes WHERE nome = $1'
              : 'SELECT id FROM fabricantes WHERE nome = ?',
            [nomeFabricante]
          );
          if (existente) {
            fabricantesMap[nomeFabricante] = existente.id;
            console.log(`    ✓ ${nomeFabricante} já existe (ID: ${existente.id})`);
          }
        } else {
          console.error(`    ✗ Erro ao inserir ${nomeFabricante}:`, error.message);
        }
      }
    }

    console.log('  📦 Populando modelos...');
    let totalModelos = 0;

    for (const [fabricanteNome, modelos] of Object.entries(modelosPorFabricante)) {
      const fabricanteId = fabricantesMap[fabricanteNome];
      if (!fabricanteId) continue;

      for (const nomeModelo of modelos) {
        try {
          if (isPostgres()) {
            await query(
              `INSERT INTO modelos (fabricante_id, nome, ano_inicio, ano_fim, ativo) 
               VALUES ($1, $2, $3, $4, true)`,
              [fabricanteId, nomeModelo, anoInicio, anoFim]
            );
          } else {
            await query(
              `INSERT INTO modelos (fabricante_id, nome, ano_inicio, ano_fim, ativo) 
               VALUES (?, ?, ?, ?, true)`,
              [fabricanteId, nomeModelo, anoInicio, anoFim]
            );
          }
          totalModelos++;
        } catch (error) {
          // Ignorar duplicatas
          if (!error.message?.includes('UNIQUE') && !error.message?.includes('duplicate')) {
            console.error(`    ✗ Erro ao inserir ${nomeModelo}:`, error.message);
          }
        }
      }
    }

    console.log(`  ✓ ${totalModelos} modelos inseridos`);

    // Opcional: Popular anos_modelo para modelos específicos (se necessário)
    // Por enquanto, usamos ano_inicio e ano_fim da tabela modelos

    console.log('  ✓ Seed de dados mestres concluído!');
  } catch (error) {
    console.error('  ✗ Erro ao executar seed:', error);
    // Não lançar erro - seed é opcional
  }
};

