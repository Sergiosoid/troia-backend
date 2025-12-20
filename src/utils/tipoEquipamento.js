/**
 * Utilitários para tipo de equipamento
 */

/**
 * Retorna a métrica (unidade de medida) para um tipo de equipamento
 * @param {string} tipo - Tipo do equipamento
 * @returns {string} - Métrica: 'km', 'horas' ou 'configuravel'
 */
export function getMetricaPorTipo(tipo) {
  const metricas = {
    carro: 'km',
    moto: 'km',
    caminhao: 'km',
    onibus: 'km',
    barco: 'horas',
    jetski: 'horas',
    maquina_agricola: 'horas',
    maquina_industrial: 'horas',
    outro: 'configuravel'
  };
  return metricas[tipo] || 'configuravel';
}

/**
 * Valida se um tipo de equipamento é válido
 * @param {string} tipo - Tipo do equipamento
 * @returns {boolean}
 */
export function isTipoValido(tipo) {
  const tiposValidos = [
    'carro',
    'moto',
    'caminhao',
    'onibus',
    'barco',
    'jetski',
    'maquina_agricola',
    'maquina_industrial',
    'outro'
  ];
  return tiposValidos.includes(tipo);
}

