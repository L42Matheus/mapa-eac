// Planta do convento em coordenadas de pixel da imagem original (1600 x 1131).
// x cresce para a direita, y cresce para baixo (como na imagem).
// type: room | bath | hall | green | water | path | wood | entrance | dorm
export const MAP_W = 1600;
export const MAP_H = 1131;

const R = (label, x, y, w, h, type = 'room', group = '') => ({ label, x, y, w, h, type, group });

export const AREAS = [
  // ---------- Áreas externas (chão) ----------
  R('Luau / Piquenique', 35, 560, 410, 390, 'green', 'Externo'),
  R('Gincana', 1390, 0, 210, 610, 'green', 'Externo'),
  R('Quadra', 1390, 790, 210, 170, 'water', 'Externo'),
  R('Jardim interno', 695, 535, 225, 210, 'green', 'Externo'),
  R('Jardim esquerdo', 305, 1010, 340, 121, 'green', 'Externo'),
  R('Jardim direito', 825, 1010, 340, 121, 'green', 'Externo'),
  R('Calçada', 305, 950, 860, 60, 'path', 'Externo'),
  R('Entrada (cascalho)', 645, 1010, 180, 121, 'path', 'Externo'),
  R('Portaria', 710, 945, 80, 60, 'entrance', 'Externo'),

  // ---------- Bloco da Bodega (topo) ----------
  R('Cozinha Bodega', 330, 30, 145, 90, 'room', 'Bodega'),
  R('Apoio Bodega', 475, 30, 120, 90, 'room', 'Bodega'),
  R('Bodega', 595, 30, 175, 90, 'room', 'Bodega'),
  R('Passagem Bodega', 600, 120, 65, 90, 'wood', 'Bodega'),

  // ---------- Bloco Cozinha / Refeitório ----------
  R('Cozinha Refeição', 330, 205, 70, 90, 'room', 'Cozinha'),
  R('Cozinha (central)', 400, 195, 240, 215, 'room', 'Cozinha'),
  R('Cozinha Lanche', 640, 210, 130, 90, 'room', 'Cozinha'),
  R('Corredor cozinha', 640, 300, 130, 110, 'hall', 'Cozinha'),

  // ---------- Bloco esquerdo ----------
  R('Banheiro', 50, 380, 70, 55, 'bath', 'Plenário 2'),
  R('Banheiro', 50, 440, 70, 55, 'bath', 'Plenário 2'),
  R('Comunicação', 50, 495, 70, 55, 'room', 'Plenário 2'),
  R('Plenário 2', 120, 375, 160, 175, 'room', 'Plenário 2'),
  R('Refeitório Adolescentes', 280, 375, 170, 135, 'room', 'Plenário 2'),
  R('Corredor', 280, 510, 170, 40, 'hall', 'Plenário 2'),

  // ---------- Salas de apoio (fileira central) ----------
  R('Apresentação', 635, 410, 45, 95, 'room', 'Apoio'),
  R('Palestras', 680, 410, 40, 95, 'room', 'Apoio'),
  R('Form. F', 720, 410, 35, 95, 'room', 'Apoio'),
  R('Geral', 755, 410, 40, 95, 'room', 'Apoio'),
  R('Finanças', 795, 410, 40, 95, 'room', 'Apoio'),
  R('Banheiro', 835, 410, 60, 48, 'bath', 'Apoio'),
  R('Banheiro', 835, 458, 60, 47, 'bath', 'Apoio'),
  R('Banheiros', 920, 420, 95, 90, 'bath', 'Apoio'),
  R('Sala 33', 1060, 420, 80, 85, 'room', 'Apoio'),

  // ---------- Tendas (coluna direita) ----------
  ...['Apoio Fam.', 'Teatro', 'Teatro', 'Teatro', 'Lanche', 'Lanche', 'Bem-estar', 'Bem-estar', 'Bem-estar']
    .map((l, i) => R(l, 955, 45 + i * 40.5, 60, 40.5, 'room', 'Tendas')),
  ...['Saída p/ Bodega', 'Animação', 'Animação', 'Animação', 'Refeição', 'Refeição', 'Limpeza', 'Limpeza', 'Limpeza', 'Apoio Comunicação']
    .map((l, i) => R(l, 1065, 45 + i * 36.5, 60, 36.5, 'room', 'Tendas')),
  R('Corredor Tendas', 1015, 45, 50, 365, 'hall', 'Tendas'),

  // ---------- Centro ----------
  R('Corredor principal', 280, 505, 850, 35, 'hall', 'Centro'),
  R('Corredor', 450, 540, 45, 250, 'hall', 'Centro'),
  R('Corredor', 620, 540, 75, 250, 'hall', 'Centro'),
  R('Corredor', 920, 505, 90, 270, 'hall', 'Centro'),
  R('Sala Central', 495, 540, 125, 250, 'room', 'Centro'),
  R('Dormitórios', 1010, 505, 120, 210, 'dorm', 'Centro'),
  R('Som', 1010, 715, 120, 60, 'room', 'Centro'),
  R('Plenário 1', 960, 775, 170, 170, 'room', 'Centro'),
  R('Apoio Oração', 1160, 475, 120, 65, 'room', 'Oração'),
  R('Oração', 1160, 540, 120, 60, 'room', 'Oração'),

  // ---------- Entrada / recepção ----------
  R('Banheiro', 640, 775, 50, 55, 'bath', 'Entrada'),
  R('Recepção', 690, 775, 130, 170, 'room', 'Entrada'),
  R('Sala 24', 820, 775, 100, 85, 'room', 'Entrada'),
  R('Papelaria', 820, 860, 100, 85, 'room', 'Entrada'),
  R('Escada', 920, 775, 40, 55, 'path', 'Entrada'),
  R('Corredor', 640, 830, 50, 115, 'hall', 'Entrada'),

  // ---------- Famílias ----------
  R('Banheiro', 395, 775, 55, 105, 'bath', 'Famílias'),
  R('Corredor', 450, 775, 190, 105, 'hall', 'Famílias'),
  R('Fam', 395, 880, 55, 65, 'room', 'Famílias'),
  R('Fam', 450, 880, 60, 65, 'room', 'Famílias'),
  R('Ap. Fam', 510, 880, 45, 65, 'room', 'Famílias'),
  R('Fam', 555, 880, 60, 65, 'room', 'Famílias'),
  R('Fam', 615, 880, 75, 65, 'room', 'Famílias'),

  // ---------- Dormitórios (baixo esquerda) ----------
  R('Banheiro', 40, 1010, 60, 35, 'bath', 'Dormitórios'),
  R('Banheiro', 230, 1010, 60, 35, 'bath', 'Dormitórios'),
  R('Dormitórios', 40, 1045, 250, 65, 'dorm', 'Dormitórios'),
];

// Gazebos do Luau (octógonos) e árvores: [x, y, raio]
export const GAZEBOS = [[130, 685, 55], [355, 640, 55], [155, 860, 55]];
export const TREES = [
  [255, 725, 30], [320, 870, 30], [735, 580, 18], [870, 595, 28], [745, 700, 25], [875, 695, 28],
  [545, 1085, 40], [940, 1060, 25], [1560, 560, 12],
];
// Caminho de pedra do jardim interno (aproximado, em px)
export const STONE_PATH = [[805, 745], [805, 700], [790, 660], [770, 620], [780, 590], [810, 575], [840, 590], [850, 620], [830, 660], [815, 700], [815, 745]];
