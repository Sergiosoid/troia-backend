# Scripts de Manutenção do Banco de Dados

## reset-operational-data.js

Script para resetar dados operacionais do banco, mantendo estrutura, seeds e dados mestres intactos.

### Objetivo

Limpar dados de teste/desenvolvimento para preparar ambiente limpo para testes do MVP.

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

- `usuarios` (por padrão)
- `fabricantes`
- `modelos`
- `anos_modelo`
- Qualquer tabela de seed ou dados mestres

### Uso

#### Reset padrão (preserva usuários)

```bash
npm run reset:data
```

ou

```bash
RESET_USERS=false npm run reset:data
```

#### Reset completo (inclui usuários, exceto admin)

```bash
RESET_USERS=true npm run reset:data
```

### Características

- ✅ **Transação atômica**: Tudo ou nada (rollback automático em caso de erro)
- ✅ **Idempotente**: Pode rodar múltiplas vezes sem erro
- ✅ **Seguro**: Não apaga estrutura, seeds ou dados mestres
- ✅ **Logs claros**: Mostra exatamente o que foi deletado
- ✅ **Compatível**: Funciona com PostgreSQL e SQLite

### Exemplo de Saída

```
🔄 Iniciando reset de dados operacionais...

📋 Configuração:
   - Resetar usuários: NÃO
   - Banco: PostgreSQL

✅ Transação iniciada (PostgreSQL)

📦 Limpando tabelas operacionais...

Limpando km_historico...
  ✓ km_historico: 150 registro(s) deletado(s)
Limpando abastecimentos...
  ✓ abastecimentos: 45 registro(s) deletado(s)
...

✅ Transação commitada com sucesso

📊 Resumo da limpeza:
──────────────────────────────────────────────────
  km_historico: 150 registro(s) deletado(s)
  abastecimentos: 45 registro(s) deletado(s)
  ...
──────────────────────────────────────────────────
  Total: 250 registro(s) deletado(s)

✅ Reset de dados operacionais concluído com sucesso!
```

### ⚠️ Avisos Importantes

1. **NÃO execute em produção** sem backup
2. **NÃO execute automaticamente** - script é manual
3. **Teste primeiro** em ambiente de desenvolvimento
4. **Backup recomendado** antes de executar

### Troubleshooting

#### Erro: "Tabela não existe"
- Normal se a tabela ainda não foi criada
- Script continua e pula tabelas inexistentes

#### Erro: "Foreign key constraint"
- Verifique a ordem de deleção (já está correta no script)
- Certifique-se de que não há dados órfãos

#### Erro de conexão
- Verifique `DATABASE_URL` no `.env`
- Certifique-se de que o banco está acessível
