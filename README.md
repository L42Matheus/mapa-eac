# Mapa 3D do Convento — planejamento de ornamentação

Arquivo pronto: **`mapa-convento.html`** (abra com duplo clique no Chrome ou Edge; funciona offline, não precisa de servidor).

## O que dá pra fazer
- **Girar**: arrastar com o botão esquerdo · **Mover**: segurar **Espaço** e arrastar, botão direito ou setas do teclado · **Zoom**: roda do mouse.
- **＋ Adicionar ponto** → clique em qualquer lugar do mapa. O painel abre para dar nome, cor e anotações.
- **＋ Adicionar vídeos/fotos** (ou arraste os arquivos para o painel). Clique na miniatura para assistir em tela grande.
- **Mover ponto**, **Excluir**, **Ir até o ponto** (a câmera voa até ele) e busca na lista da esquerda.
- **🖼 Imagem do mapa**: carregue o PNG original da planta — ele é colado no chão, alinhado com o 3D.
- **Paredes**: controle de transparência para enxergar dentro dos cômodos.
- **Exportar / Importar**: JSON com os pontos e anotações (backup ou para compartilhar posições).

## Onde ficam os vídeos
Tudo é salvo no próprio navegador (IndexedDB), no computador em que foi adicionado. Os vídeos **não** ficam dentro do HTML.
- Abra sempre o arquivo do mesmo lugar/navegador para ver os mesmos dados.
- Limpar dados de navegação do Chrome/Edge apaga os pontos e mídias — use **Exportar** como backup das posições e mantenha os vídeos originais guardados.
- Para passar para outra pessoa: envie o HTML + o JSON exportado; ela anexa os vídeos de novo.

## Editar a planta
`src/layout.js` tem cada cômodo em coordenadas de pixel da imagem original (1600×1131). Ajuste/adicione e rode:

```bash
npm install
npm run build
```
