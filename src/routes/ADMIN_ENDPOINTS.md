# Endpoints Administrativos

## POST /api/admin/reset-operational-data

Endpoint administrativo para resetar dados operacionais do banco de dados.

### Requisitos de Segurança

1. **JWT válido**: Token de autenticação no header `Authorization: Bearer <token>`
2. **Role admin**: Usuário deve ter `role === 'admin'`
3. **Variável de ambiente**: `ENABLE_ADMIN_RESET=true` deve estar configurada
4. **Confirmação explícita**: Body deve conter `{ confirm: "RESET_ALL_DATA" }`

### Request

```http
POST /api/admin/reset-operational-data
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "confirm": "RESET_ALL_DATA"
}
```

### Response (Sucesso)

```json
{
  "success": true,
  "message": "Dados operacionais resetados com sucesso",
  "totalDeleted": 250,
  "summary": {
    "km_historico": { "deleted": 150, "skipped": false },
    "abastecimentos": { "deleted": 45, "skipped": false },
    "manutencoes": { "deleted": 30, "skipped": false },
    "ocr_usage": { "deleted": 10, "skipped": false },
    "veiculo_compartilhamentos": { "deleted": 5, "skipped": false },
    "proprietarios_historico": { "deleted": 8, "skipped": false },
    "proprietarios": { "deleted": 2, "skipped": false },
    "veiculos": { "deleted": 0, "skipped": false }
  }
}
```

### Response (Erro - Endpoint Desabilitado)

```json
{
  "error": "Endpoint administrativo desabilitado",
  "message": "O reset de dados operacionais via API está desabilitado. Use o script CLI se necessário."
}
```

**Status Code**: `403 Forbidden`

### Response (Erro - Confirmação Inválida)

```json
{
  "error": "Confirmação inválida",
  "message": "É necessário enviar { confirm: \"RESET_ALL_DATA\" } no body para executar o reset."
}
```

**Status Code**: `400 Bad Request`

### Response (Erro - Acesso Negado)

```json
{
  "error": "Acesso negado"
}
```

**Status Code**: `403 Forbidden`

### Response (Erro - Token Inválido)

```json
{
  "error": "Token inválido ou expirado"
}
```

**Status Code**: `401 Unauthorized`

### Response (Erro - Erro Interno)

```json
{
  "error": "Erro ao executar reset de dados",
  "message": "Ocorreu um erro ao resetar os dados operacionais. A transação foi revertida automaticamente."
}
```

**Status Code**: `500 Internal Server Error`

### O que é LIMPADO

- `km_historico`
- `abastecimentos`
- `manutencoes`
- `ocr_usage`
- `veiculo_compartilhamentos`
- `proprietarios_historico`
- `proprietarios`
- `veiculos`

### O que é PRESERVADO

- `usuarios` (sempre preservado via endpoint)
- `fabricantes`
- `modelos`
- `anos_modelo`
- Qualquer tabela de seed ou dados mestres

### Características

- ✅ **Transação atômica**: Tudo ou nada (rollback automático em caso de erro)
- ✅ **Idempotente**: Pode rodar múltiplas vezes sem erro
- ✅ **Seguro**: Não apaga estrutura, seeds ou dados mestres
- ✅ **Logs estruturados**: Todas as operações são logadas
- ✅ **Tratamento de erros robusto**: Nunca derruba o servidor
- ✅ **Erros SQL tratados**: Erros 22007 e 42P18 são capturados e tratados

### Configuração

Adicione no `.env`:

```env
ENABLE_ADMIN_RESET=true
```

**IMPORTANTE**: 
- Por padrão, o endpoint está **DESABILITADO** (`ENABLE_ADMIN_RESET` não definida ou `false`)
- Apenas habilite em ambientes de staging/testes
- **NUNCA** habilite em produção sem necessidade explícita

### Exemplo de Uso (cURL)

```bash
curl -X POST https://api.troia.com/api/admin/reset-operational-data \
  -H "Authorization: Bearer <seu_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{"confirm": "RESET_ALL_DATA"}'
```

### Exemplo de Uso (JavaScript)

```javascript
const response = await fetch('https://api.troia.com/api/admin/reset-operational-data', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${jwtToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    confirm: 'RESET_ALL_DATA',
  }),
});

const result = await response.json();
console.log(result);
```

### Logs

Todas as operações são logadas com:
- `userId`: ID do usuário que executou o reset
- `userEmail`: Email do usuário
- `ip`: IP de origem da requisição
- `totalDeleted`: Total de registros deletados
- `summary`: Resumo detalhado por tabela

### Segurança

1. **Múltiplas camadas de proteção**:
   - JWT obrigatório
   - Role admin obrigatória
   - Variável de ambiente obrigatória
   - Confirmação explícita obrigatória

2. **Logs de auditoria**: Todas as tentativas (sucesso ou falha) são logadas

3. **Tratamento de erros**: Erros não expõem detalhes internos do sistema

4. **Transação atômica**: Em caso de erro, tudo é revertido automaticamente
