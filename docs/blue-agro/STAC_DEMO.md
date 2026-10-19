# Sentinel-2 STAC — demonstração read-only (Blue Agro)

## Escopo
A página `/agro` do fork OSIRIS mantém o mapa e os focos *sintéticos* independentes.
Ao clicar em **Consultar imagens disponíveis**, um novo painel consulta somente
metadados reais de cenas Sentinel-2 L2A no Earth Search STAC da Element 84.

- Endpoint local: `GET /api/agro/satellite?farm=ba|rs`.
- Fonte externa fixa: `POST https://earth-search.aws.element84.com/v1/search`.
- Coleção: `sentinel-2-c1-l2a`; janela: últimos 180 dias.
- `query: { "eo:cloud_cover": { "lt": 35 } }` no upstream: cenas com <35% de nuvens no tile inteiro; não garante nuvem baixa no campo.
- Consulta GET somente leitura ao provedor realizada em 19/10/2026 para AOI BA com filtro STAC: retornou itens de 16/10, 06/10, 01/10 etc. Isto verifica disponibilidade do provedor, **não** o endpoint da aplicação Next.js em QA.
- As AOIs BA/RS são caixas ilustrativas e não representam polígonos ou propriedades agropecuárias reais.
- Apenas duas BBOXs públicas e ilustrativas (sem coordenadas de clientes).
- Máximo de 18 observações upstream, 6 cenas retornadas, timeout 10 s e resposta 2 MB.
- Nenhum token, credencial, webhook, mensagem, ação Odoo ou mutação no banco.
- Datas e cobertura de nuvens dos *itens*, não sensores de altura.
- Previews são links externos para STAC Browser; **não** são ortomosaicos
  processados, mapas NDVI, geometrias 3D ou estimativas de altura.

## Operação e limites
Earth Search é grátis sem SLA comercial. A API externa pode ficar indisponível.
O usuário só pode requisitar `ba` ou `rs`; não aceitar URL ou BBOX arbitrária.
A consulta não valida cobertura exata do polígono do cliente, adequação da imagem,
percentual de nuvens no talhão nem altura de árvore.

## QA antes de merge/homolog
1. `npm ci --ignore-scripts --no-audit --no-fund`
2. `npx vitest run src/lib/agro`
3. `npx tsc --noEmit` e `npm run build`
4. `GET /api/agro/satellite?farm=ba` com resultado STAC real e origem verificável.
5. `?farm=../` deve retornar HTTP 400, jamais chamar provedor externo.
6. Simular HTTP 429/500/timeout: HTTP 503 sem fuga de detalhes; UI sintética utilizável.
7. Revisar licença de basemap e atribuição; exigir Auth e isolamento por empresa
   **antes** de permitir geometrias, propriedades ou ações reais.
8. Homologar em ambiente separado; produção só após readback, rollback e aprovação.

## Próximas fases
- Reconciliar AOI com polígono real autenticado do Odoo/Traccar por empresa.
- Tiles NDVI/COG via TiTiler, com CORS e custos de processamento controlados.
- GEDI/estéreo/LiDAR para *pesquisa* de altura de árvores, com verdade de campo;
  jamais derivar altura somente de índice NDVI.
- Action Center somente com decisão humana, proveniência, limiares validados.
