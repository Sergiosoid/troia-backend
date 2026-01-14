# ⚠️ Rotas Temporárias de Desenvolvimento

## ⚠️ ATENÇÃO: ROTAS TEMPORÁRIAS ⚠️

**ESTAS ROTAS DEVEM SER REMOVIDAS APÓS USO EM PRODUÇÃO**

Estas rotas são temporárias e foram criadas para permitir configuração inicial em produção quando não há outro meio de criar o primeiro admin.

---

## POST /api/dev/make-me-admin

Rota temporária para promover um usuário a admin pelo email.

### ⚠️ Requisitos de Segurança

1. **NODE_ENV === 'production'**: Só funciona em produção
2. **ALLOW_DEV_ADMIN === 'true'**: Variável de ambiente obrigatória
3. **Email válido**: Body deve conter `{ "email": "string" }`

### Request

```http
POST /api/dev/make-me-admin
Content-Type: application/json

{
  "email": "usuario@exemplo.com"
}
```

### Response (Sucesso)

```json
{
  "success": true,
  "message": "Usuário promovido a admin com sucesso",
  "user": {
    "id": 1,
    "nome": "Nome do Usuário",
    "email": "usuario@exemplo.com",
    "role": "admin"
  },
  "warning": "⚠️ Esta é uma rota temporária. Remova após uso."
}
```

### Response (Usuário já é admin)

```json
{
  "success": true,
  "message": "Usuário já é admin",
  "user": {
    "id": 1,
    "nome": "Nome do Usuário",
    "email": "usuario@exemplo.com",
    "role": "admin"
  }
}
```

### Response (Erro - Ambiente não-produção)

```json
{
  "error": "Rota não disponível",
  "message": "Esta rota só está disponível em ambiente de produção."
}
```

**Status Code**: `403 Forbidden`

### Response (Erro - ALLOW_DEV_ADMIN não habilitado)

```json
{
  "error": "Rota desabilitada",
  "message": "Esta rota está desabilitada. Configure ALLOW_DEV_ADMIN=true para habilitar."
}
```

**Status Code**: `403 Forbidden`

### Response (Erro - Email inválido)

```json
{
  "error": "Email inválido",
  "message": "É necessário fornecer um email válido no body: { \"email\": \"seu@email.com\" }"
}
```

**Status Code**: `400 Bad Request`

### Response (Erro - Usuário não encontrado)

```json
{
  "error": "Usuário não encontrado",
  "message": "Nenhum usuário encontrado com o email: usuario@exemplo.com"
}
```

**Status Code**: `404 Not Found`

### Configuração

Adicione no `.env` do ambiente de produção:

```env
NODE_ENV=production
ALLOW_DEV_ADMIN=true
```

**⚠️ IMPORTANTE**: 
- Configure `ALLOW_DEV_ADMIN=true` **APENAS** quando necessário
- **REMOVA** a variável ou defina como `false` após uso
- **DELETE** o arquivo `src/routes/dev.js` após promover o primeiro admin

### Exemplo de Uso (cURL)

```bash
curl -X POST https://api.troia.com/api/dev/make-me-admin \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@troia.com"}'
```

### Exemplo de Uso (JavaScript)

```javascript
const response = await fetch('https://api.troia.com/api/dev/make-me-admin', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'admin@troia.com',
  }),
});

const result = await response.json();
console.log(result);
```

### Logs

A operação é logada com nível **WARN** para destacar que é uma rota temporária:

```
⚠️ USUÁRIO PROMOVIDO A ADMIN VIA ROTA TEMPORÁRIA
{
  userId: 1,
  email: "admin@troia.com",
  nome: "Nome do Usuário",
  roleAnterior: "cliente",
  roleNovo: "admin",
  ip: "xxx.xxx.xxx.xxx",
  timestamp: "2025-01-XX...",
  rota: "/dev/make-me-admin",
  aviso: "ROTA TEMPORÁRIA - REMOVER APÓS USO"
}
```

### Checklist de Remoção

Após promover o primeiro admin:

- [ ] Verificar que o usuário foi promovido corretamente
- [ ] Testar login com o novo admin
- [ ] Remover `ALLOW_DEV_ADMIN=true` do `.env` ou definir como `false`
- [ ] **DELETAR** o arquivo `src/routes/dev.js`
- [ ] Remover a importação de `devRouter` em `src/routes/index.js`
- [ ] Fazer commit: `chore(backend): remove rota temporária /dev/make-me-admin`
- [ ] Deploy da remoção

### Segurança

1. **Múltiplas camadas de proteção**:
   - Só funciona em produção
   - Variável de ambiente obrigatória
   - Validação de email

2. **Logs de auditoria**: Todas as operações são logadas com nível WARN

3. **Tratamento de erros**: Erros não expõem detalhes internos

4. **Idempotente**: Pode ser chamada múltiplas vezes sem problema (retorna sucesso se já for admin)

---

## ⚠️ LEMBRE-SE: REMOVER APÓS USO ⚠️

Esta rota é **TEMPORÁRIA** e deve ser **REMOVIDA** após promover o primeiro admin em produção.
