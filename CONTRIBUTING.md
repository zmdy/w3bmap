# Como contribuir

O projeto está na fase inicial. Consulte o [README](README.md) para conhecer a
arquitetura e o roadmap antes de propor uma implementação.

## Commits

Adotamos [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).
Use o formato:

```text
tipo(escopo opcional): descrição

Corpo opcional.

Rodapés opcionais.
```

Tipos usados no projeto:

| Tipo | Uso |
| --- | --- |
| `feat` | Nova funcionalidade |
| `fix` | Correção de erro |
| `docs` | Documentação |
| `refactor` | Reorganização de código sem mudar o comportamento |
| `perf` | Melhoria de desempenho |
| `test` | Testes |
| `build` | Build e dependências |
| `ci` | Integração contínua |
| `style` | Formatação do código |
| `chore` | Manutenção do repositório |
| `revert` | Reversão de alterações |

Use tipos em minúsculas e descrições curtas. Escopos sugeridos: `extension`,
`cli`, `probe`, `explorer`, `shared` e `repo`. O escopo é opcional.

Exemplos:

```text
chore(repo): initialize project
docs: document self-hosted connector setup
feat(extension): add connector settings
fix(probe): validate redirect destinations
feat(shared)!: change graph entity identifiers
```

Mudanças incompatíveis devem usar `!` antes de `:` ou um rodapé
`BREAKING CHANGE: descrição da incompatibilidade`. Explique a migração no corpo
quando necessário. Separe mudanças independentes em commits distintos.

Essa convenção é documentada para colaboradores; este repositório inicial ainda
não inclui validação automática de mensagens de commit.

## Alterações

- Mantenha a extensão utilizável sem o conector PHP.
- Preserve a compatibilidade do contrato JSON ou documente sua migração.
- Nunca versione tokens, credenciais ou dados privados coletados.
- Documente como verificar a alteração e execute as verificações pertinentes ao componente.
- Atualize o README quando o estado de implementação ou a configuração mudar.

Ainda não há comandos de build ou testes automatizados. Eles serão documentados
conforme os componentes forem implementados.

As contribuições são distribuídas sob a [licença MIT](LICENSE) do projeto.
