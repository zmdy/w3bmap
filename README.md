# w3bm@p

**Discover · Analyze · Connect · Visualize**

Plataforma open source para descoberta de tecnologias web e mapeamento de páginas,
infraestrutura e relacionamentos, com dados sob o controle do usuário.

> **Status:** repositório inicializado. Os componentes abaixo estão planejados e
> ainda não foram implementados. Não há aplicação executável nesta etapa.

## Arquitetura

O w3bm@p adota uma arquitetura local-first: sem conta obrigatória, banco de dados
ou backend centralizado. Coletores independentes produzirão um formato JSON comum,
que poderá ser consolidado no Graph Explorer.

| Componente planejado | Responsabilidade | Tecnologias previstas |
| --- | --- | --- |
| Extension | Identificar tecnologias, páginas, links e recursos no navegador; configurar e consultar o conector do usuário | JavaScript, Chrome Manifest V3 |
| PHP Connector | Enriquecer descobertas com DNS, RDAP, certificados, HTTP e outras fontes públicas | PHP 8+, cURL, OpenSSL |
| CLI | Coletar dados pelo terminal e exportar JSON, em modo independente ou conectado ao PHP | Shell, PowerShell e lançador BAT |
| Graph Explorer | Importar, correlacionar e visualizar entidades, relações e evidências | SPA, Cytoscape.js |
| Shared | Definir o esquema JSON e compartilhar assinaturas de tecnologias | JSON, JSON Schema |

### Conector PHP autogerenciado e opcional

Cada usuário instalará o arquivo `w3bmap.php` em sua própria hospedagem, VPS ou
servidor local e configurará o endereço e a chave de autenticação na extensão.
**O projeto não oferecerá um endpoint PHP público ou central.** A extensão poderá
coletar dados pelo navegador sem instalar o conector.

O fluxo previsto é:

1. Instalar a extensão Chrome.
2. Opcionalmente, instalar o conector PHP em um servidor controlado pelo usuário.
3. Informar o endpoint e a chave nas configurações da extensão.
4. Testar a conexão e consultar os módulos disponíveis.
5. Complementar as descobertas do navegador com consultas ao conector.
6. Explorar os resultados em um grafo e exportar os dados em JSON.

A CLI terá dois modos: **standalone**, com ferramentas locais, e **connected**,
usando o mesmo protocolo do conector PHP.

## Estrutura planejada

```text
w3bmap/
├── extension/          # Extensão Chrome e configurações do conector
├── cli/                # w3bmap.sh, w3bmap.ps1 e w3bmap.bat
├── probe/              # w3bmap.php, distribuído como arquivo único
├── explorer/           # Interface compartilhada de grafos
├── shared/             # schema.json e fingerprints.json
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

Os diretórios de implementação serão adicionados conforme cada componente for
desenvolvido.

## Contrato de dados planejado

Os coletores compartilharão um JSON versionado com entidades (`nodes`), relações
(`edges`) e metadados de coleta. Cada descoberta deverá registrar origem, data,
evidência e confiança, distinguindo relações verificadas de associações prováveis.
O esquema formal e suas regras de correlação serão definidos em `shared/`.

Exemplo ilustrativo mínimo, ainda sujeito à definição do esquema:

```json
{
  "schema_version": "1.0",
  "tool": "w3bm@p",
  "target": "example.com",
  "source": "extension",
  "nodes": [
    { "id": "domain:example.com", "type": "domain", "label": "example.com" },
    { "id": "page:https://example.com/about", "type": "page", "label": "/about" }
  ],
  "edges": [
    {
      "source": "domain:example.com",
      "target": "page:https://example.com/about",
      "type": "contains"
    }
  ]
}
```

## Connector API planejada

O PHP será um arquivo único, sem Composer obrigatório ou banco de dados.
Todas as operações exigirão autenticação. As chamadas abaixo descrevem a proposta
do protocolo; ainda não são endpoints funcionais:

```text
GET  /w3bmap.php?action=capabilities
GET  /w3bmap.php?action=dns&domain=example.com
GET  /w3bmap.php?action=rdap&domain=example.com
GET  /w3bmap.php?action=ssl&domain=example.com
GET  /w3bmap.php?action=headers&domain=example.com
GET  /w3bmap.php?action=technologies&domain=example.com
GET  /w3bmap.php?action=sitemap&domain=example.com
POST /w3bmap.php?action=analyze
```

Os módulos previstos incluem DNS, RDAP, certificados, cabeçalhos HTTP, tecnologias,
robots.txt, sitemaps e links. Diagnósticos do ambiente PHP e inspeção de diretórios
locais serão recursos separados, desabilitados por padrão e habilitados apenas
explicitamente pelo operador. Consultas extensas serão priorizadas na CLI.

### Requisitos de segurança para implementação

- Autenticação por token, inclusive na consulta de capacidades, e HTTPS para endpoints remotos.
- Permissões de origem na extensão concedidas para os hosts utilizados.
- Limitação de requisições, tempo de execução e tamanho das respostas.
- Validação e autorização dos destinos consultados pelo conector.
- Bloqueio de destinos privados, loopback e metadados de nuvem por padrão, com validação de resolução DNS e redirecionamentos.
- Credenciais fora do código versionado e dos arquivos JSON exportados.
- Descoberta de rotas por links e sitemaps; sem força bruta de diretórios na API.

As consultas e os diagnósticos devem respeitar o escopo autorizado pelo operador.

## Roadmap

- [x] Inicializar Git, documentação, licença e convenção de commits.
- [ ] Definir o esquema JSON e criar o Graph Explorer com importação e exportação.
- [ ] Implementar a extensão Chrome com coleta local e identificação de tecnologias.
- [ ] Implementar a CLI multiplataforma e os modos standalone e connected.
- [ ] Implementar o conector PHP e sua integração opcional com a extensão.
- [ ] Correlacionar entidades e evidências de múltiplas fontes.

## Contribuições

Leia [CONTRIBUTING.md](CONTRIBUTING.md). Os commits seguem
[Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/),
por exemplo: `feat(extension): add connector settings`.

## Licença

Distribuído sob a [licença MIT](LICENSE). Copyright (c) 2026 Hudson.
