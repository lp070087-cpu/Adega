/* ═══════════════════════════════════════════════════════════════════════
   LOJA-DATA.JS — camada de dados compartilhada (SITE + PLATAFORMA)
   -----------------------------------------------------------------------
   Fonte única de:
   • tipos de negócio (TENANT_TYPES) e catálogos-modelo (BUSINESS_TEMPLATES)
   • identidade do tenant (getTenantCatalog / getTenant)
   • catálogo de produtos do tenant (getProducts / saveProducts / applyTemplate)
   Persistência: localStorage em chaves  dp_{tenantId}_*  (demo, migrável p/ Neon)
   ═══════════════════════════════════════════════════════════════════════ */

// ── storage seguros (file:// / anônimo) ─────────────────────────────────
function storeGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function storeSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function storeRemove(k){try{localStorage.removeItem(k)}catch(e){}}

// ── formatadores ────────────────────────────────────────────────────────
function fmtBRL(v){return 'R$ '+(Number(v||0)).toFixed(2).replace('.',',')}
function numBR(str){return parseFloat(String(str||'').replace(/\./g,'').replace(',','.'))||0}

// ── Tipos de negócio aceitos no cadastro ────────────────────────────────
const TENANT_TYPES = [
  {id:'bebidas',      label:'Adega / Bebidas',   emoji:'🍺', cor:'#F15A24'},
  {id:'hamburgueria', label:'Hamburgueria',      emoji:'🍔', cor:'#E11D48'},
  {id:'lanchonete',   label:'Lanchonete',        emoji:'🥪', cor:'#EA580C'},
  {id:'pizzaria',     label:'Pizzaria',          emoji:'🍕', cor:'#7C3AED'},
  {id:'acai',         label:'Açaí',              emoji:'🍧', cor:'#8B5CF6'},
  {id:'restaurante',  label:'Restaurante',       emoji:'🍽️', cor:'#B45309'},
  {id:'conveniencia', label:'Conveniência',      emoji:'🏪', cor:'#0E7490'},
  {id:'padaria',      label:'Padaria',           emoji:'🥐', cor:'#A16207'},
  {id:'mercado',      label:'Mercado',           emoji:'🛒', cor:'#15803D'},
  {id:'dark_kitchen', label:'Dark Kitchen',      emoji:'👨‍🍳', cor:'#334155'}
];
function typeById(id){return TENANT_TYPES.find(t=>t.id===id)||TENANT_TYPES[0]}

// ── imagens reais locais disponíveis (segmento bebidas/demo) ────────────
// Usadas apenas como padrão do catálogo-modelo; o cliente troca por upload.
const IMG = {
  heineken:'Public%20produtos/keineken.jpg',
  skol:'Public%20produtos/skol.jpg',
  brahmaL:'Public%20produtos/brahma%20litr%C3%A3o.jpg',
  brahminho:'Public%20produtos/Brahma%20litrinho.jpg',
  ice:'Public%20produtos/Ice.jpg',
  whisky:'Public%20produtos/whisky.jpg',
  oldparr:'Public%20produtos/Shisky%20old%20parr.jpg',
  black:'Public%20produtos/shisky%20clack%20lebel.jpg',
  tanqueray:'Public%20produtos/shisky%20tanqueray.jpg'
};

// ── CATÁLOGOS-MODELO por segmento ───────────────────────────────────────
// Cada produto: {nome,cat,preco,promocao?,desc?,tipo?,opcoes?,img?,emoji?,estoque?,min?,custo?}
// tipo: 'simples' | 'variacao' (opcoes são tamanhos) | 'adicional' (opcoes são adicionais)
// A lista é COPIADA para o tenant no primeiro acesso (não fica linkada).
const BUSINESS_TEMPLATES = {
  bebidas:{
    label:'Adega / Bebidas', emoji:'🍺', cor:'#F15A24',
    cats:['Cervejas','Whisky','Vinhos','Destilados','Refrigerantes','Energéticos','Água & Gelo','Petiscos'],
    produtos:[
      {nome:'Heineken 350ml',cat:'Cervejas',preco:6.29,promocao:5.49,desc:'Pack 12 un. Puro malte, sabor inconfundível.',img:IMG.heineken,emoji:'🍺',estoque:248,min:50},
      {nome:'Skol 350ml',cat:'Cervejas',preco:4.49,promocao:3.99,desc:'Pack 12 latas. A cerveja que desce redondo.',img:IMG.skol,emoji:'🍺',estoque:312,min:50},
      {nome:'Brahma Litrão 1L',cat:'Cervejas',preco:9.90,desc:'Garrafa 1 litro, a número 1 pra dividir.',img:IMG.brahmaL,emoji:'🍺',estoque:156,min:30,tipo:'variacao',opcoes:[{nome:'300ml',preco:4.49},{nome:'1L',preco:9.90}]},
      {nome:'Brahma Litrinho 300ml',cat:'Cervejas',preco:3.29,promocao:2.99,desc:'Pack 15 garrafinhas.',img:IMG.brahminho,emoji:'🍺',estoque:189,min:30},
      {nome:'Corona Extra 330ml',cat:'Cervejas',preco:8.90,desc:'Long neck premium.',emoji:'🍺',estoque:120,min:20},
      {nome:'Budweiser 350ml',cat:'Cervejas',preco:5.49,desc:'A americana mais pedida.',emoji:'🍺',estoque:140,min:25},
      {nome:'Antarctica Original 350ml',cat:'Cervejas',preco:4.29,desc:'O sabor tradicional.',emoji:'🍺',estoque:90,min:20},
      {nome:'Jack Daniel\'s Old No.7 1L',cat:'Whisky',preco:127.90,desc:'Tennessee clássico.',img:IMG.whisky,emoji:'🥃',estoque:92,min:15},
      {nome:'Johnnie Walker Black Label 1L',cat:'Whisky',preco:159.90,desc:'Blend 12 anos.',img:IMG.black,emoji:'🥃',estoque:78,min:12},
      {nome:'Old Parr 12 Anos 1L',cat:'Whisky',preco:186.90,desc:'Escocês encorpado.',img:IMG.oldparr,emoji:'🥃',estoque:67,min:12},
      {nome:'Red Label 1L',cat:'Whisky',preco:89.90,desc:'Blend jovem e marcante.',emoji:'🥃',estoque:54,min:10},
      {nome:'Gin Tanqueray London Dry 750ml',cat:'Destilados',preco:103.90,desc:'Gin inglês clássico.',img:IMG.tanqueray,emoji:'🍸',estoque:48,min:10},
      {nome:'Vinho Tinto Chileno 750ml',cat:'Vinhos',preco:39.90,desc:'Suave e frutado.',emoji:'🍷',estoque:60,min:8},
      {nome:'Smirnoff Ice 275ml',cat:'Destilados',preco:7.10,desc:'Pack 6. Drink de vodka e limão.',img:IMG.ice,emoji:'🍹',estoque:134,min:20},
      {nome:'Coca-Cola 2L',cat:'Refrigerantes',preco:12.00,desc:'Gelada pra acompanhar.',emoji:'🥤',estoque:180,min:20,tipo:'variacao',opcoes:[{nome:'350ml',preco:5.00},{nome:'2L',preco:12.00}]},
      {nome:'Energético Red Bull 250ml',cat:'Energéticos',preco:12.90,desc:'Pra festa não parar.',emoji:'⚡',estoque:96,min:12},
      {nome:'Gelo Premium 5kg',cat:'Água & Gelo',preco:8.90,desc:'Gelo limpo e pesado.',emoji:'🧊',estoque:60,min:10}
    ]
  },

  hamburgueria:{
    label:'Hamburgueria', emoji:'🍔', cor:'#E11D48',
    cats:['Hambúrgueres','Acompanhamentos','Bebidas','Sobremesas'],
    produtos:[
      {nome:'X-Burger Clássico',cat:'Hambúrgueres',preco:22.90,desc:'Pão brioche, burger 160g, queijo e molho da casa.',emoji:'🍔',estoque:80,min:15,tipo:'adicional',opcoes:[{nome:'Bacon',preco:4.00},{nome:'Queijo extra',preco:3.50},{nome:'Ovo',preco:2.50},{nome:'Cheddar',preco:4.50}]},
      {nome:'X-Bacon',cat:'Hambúrgueres',preco:27.90,promocao:24.90,desc:'Burger 160g, bacon crocante, queijo e maionese.',emoji:'🍔',estoque:70,min:12,tipo:'adicional',opcoes:[{nome:'Bacon extra',preco:5.00},{nome:'Queijo extra',preco:3.50}]},
      {nome:'X-Salada',cat:'Hambúrgueres',preco:24.90,desc:'Burger 160g, alface, tomate e queijo.',emoji:'🥗',estoque:75,min:12},
      {nome:'X-Tudo',cat:'Hambúrgueres',preco:32.90,desc:'Burger duplo, bacon, ovo, salsicha, milho e batata palha.',emoji:'🍔',estoque:50,min:10},
      {nome:'Cheddar Duplo',cat:'Hambúrgueres',preco:29.90,desc:'Dois burgers, muito cheddar cremoso.',emoji:'🧀',estoque:45,min:8},
      {nome:'Burger de Costela',cat:'Hambúrgueres',preco:36.90,desc:'Costela desfiada, queijo prato e barbecue.',emoji:'🍖',estoque:30,min:6},
      {nome:'Batata Frita Média',cat:'Acompanhamentos',preco:12.90,desc:'Porção média crocante.',emoji:'🍟',estoque:120,min:20},
      {nome:'Batata Frita Grande',cat:'Acompanhamentos',preco:16.90,promocao:14.90,desc:'Porção grande + cheddar e bacon.',emoji:'🍟',estoque:110,min:20,tipo:'adicional',opcoes:[{nome:'Cheddar',preco:4.00},{nome:'Bacon',preco:4.00}]},
      {nome:'Onion Rings',cat:'Acompanhamentos',preco:14.90,desc:'Anéis de cebola empanados.',emoji:'🧅',estoque:60,min:10},
      {nome:'Coca-Cola Lata',cat:'Bebidas',preco:6.00,desc:'Lata 350ml gelada.',emoji:'🥤',estoque:200,min:30,tipo:'variacao',opcoes:[{nome:'Lata 350ml',preco:6.00},{nome:'2L',preco:12.00}]},
      {nome:'Guaraná Antarctica Lata',cat:'Bebidas',preco:5.50,desc:'Lata 350ml.',emoji:'🥤',estoque:180,min:30},
      {nome:'Milkshake de Chocolate',cat:'Sobremesas',preco:18.90,desc:'300ml com chantilly.',emoji:'🥤',estoque:40,min:8},
      {nome:'Combo X-Burger + Batata + Coca',cat:'Combos',preco:34.90,promocao:31.90,desc:'O clássico completo.',emoji:'🍔',estoque:60,min:10}
    ]
  },

  lanchonete:{
    label:'Lanchonete', emoji:'🥪', cor:'#EA580C',
    cats:['Lanches','Salgados','Acompanhamentos','Bebidas','Sobremesas'],
    produtos:[
      {nome:'Misto Quente',cat:'Lanches',preco:12.90,desc:'Pão de forma, presunto e queijo na chapa.',emoji:'🥪',estoque:60,min:10},
      {nome:'Bauru',cat:'Lanches',preco:16.90,desc:'Pão francês, rosbife, queijo, tomate e picles.',emoji:'🥖',estoque:55,min:10},
      {nome:'Americano',cat:'Lanches',preco:18.90,desc:'Pão francês, ovo, presunto, queijo e alface.',emoji:'🥪',estoque:50,min:8},
      {nome:'X-Egg',cat:'Lanches',preco:21.90,desc:'Hambúrguer, ovo, queijo e alface.',emoji:'🍔',estoque:45,min:8},
      {nome:'Pão na Chapa',cat:'Lanches',preco:6.90,desc:'Com manteiga, na chapa.',emoji:'🍞',estoque:120,min:20},
      {nome:'Coxinha',cat:'Salgados',preco:7.50,desc:'Frango com catupiry.',emoji:'🍗',estoque:150,min:20},
      {nome:'Pastel de Queijo',cat:'Salgados',preco:9.90,desc:'Pastel frito na hora.',emoji:'🥟',estoque:80,min:15},
      {nome:'Empada de Frango',cat:'Salgados',preco:8.50,desc:'Empada artesanal.',emoji:'🥧',estoque:70,min:12},
      {nome:'Batata Frita',cat:'Acompanhamentos',preco:13.90,desc:'Porção individual.',emoji:'🍟',estoque:90,min:15},
      {nome:'Suco de Laranja',cat:'Bebidas',preco:8.90,desc:'Laranja espremida na hora.',emoji:'🍊',estoque:40,min:6,tipo:'variacao',opcoes:[{nome:'300ml',preco:8.90},{nome:'500ml',preco:11.90}]},
      {nome:'Refrigerante Lata',cat:'Bebidas',preco:5.50,desc:'Coca / Guaraná.',emoji:'🥤',estoque:150,min:25},
      {nome:'Café Coado',cat:'Bebidas',preco:4.90,desc:'Café fresquinho.',emoji:'☕',estoque:200,min:30},
      {nome:'Torta de Frango',cat:'Sobremesas',preco:12.90,desc:'Fatia generosa.',emoji:'🥧',estoque:25,min:5}
    ]
  },

  pizzaria:{
    label:'Pizzaria', emoji:'🍕', cor:'#7C3AED',
    cats:['Pizzas Salgadas','Pizzas Doces','Bebidas','Combos'],
    produtos:[
      {nome:'Pizza Margherita',cat:'Pizzas Salgadas',preco:39.90,desc:'Molho, muçarela e manjericão.',emoji:'🍕',estoque:40,min:5,tipo:'variacao',opcoes:[{nome:'Média',preco:39.90},{nome:'Grande',preco:52.90}]},
      {nome:'Pizza Pepperoni',cat:'Pizzas Salgadas',preco:49.90,desc:'Pepperoni e muçarela.',emoji:'🍕',estoque:35,min:5,tipo:'variacao',opcoes:[{nome:'Média',preco:49.90},{nome:'Grande',preco:62.90}]},
      {nome:'Pizza Calabresa',cat:'Pizzas Salgadas',preco:44.90,desc:'Calabresa fatiada e cebola.',emoji:'🍕',estoque:38,min:5,tipo:'variacao',opcoes:[{nome:'Média',preco:44.90},{nome:'Grande',preco:57.90}]},
      {nome:'Pizza Frango com Catupiry',cat:'Pizzas Salgadas',preco:49.90,desc:'Frango desfiado e catupiry.',emoji:'🍕',estoque:32,min:4,tipo:'variacao',opcoes:[{nome:'Média',preco:49.90},{nome:'Grande',preco:62.90}]},
      {nome:'Pizza Quatro Queijos',cat:'Pizzas Salgadas',preco:54.90,desc:'Muçarela, provolone, gorgonzola e parmesão.',emoji:'🧀',estoque:28,min:4,tipo:'variacao',opcoes:[{nome:'Média',preco:54.90},{nome:'Grande',preco:67.90}]},
      {nome:'Pizza Portuguesa',cat:'Pizzas Salgadas',preco:52.90,desc:'Presunto, ovo, cebola, azeitona e ervilha.',emoji:'🍕',estoque:25,min:4,tipo:'variacao',opcoes:[{nome:'Média',preco:52.90},{nome:'Grande',preco:65.90}]},
      {nome:'Pizza Chocolate',cat:'Pizzas Doces',preco:45.90,desc:'Chocolate ao leite com morango.',emoji:'🍫',estoque:20,min:3},
      {nome:'Pizza Brigadeiro',cat:'Pizzas Doces',preco:45.90,desc:'Brigadeiro cremoso e granulado.',emoji:'🍫',estoque:20,min:3},
      {nome:'Coca-Cola 2L',cat:'Bebidas',preco:13.00,desc:'Gelada.',emoji:'🥤',estoque:90,min:10},
      {nome:'Suco de Uva Integral',cat:'Bebidas',preco:9.90,desc:'Garrafa 500ml.',emoji:'🍇',estoque:45,min:8},
      {nome:'Combo Pizza Grande + Refri 2L',cat:'Combos',preco:64.90,promocao:59.90,desc:'Escolha 1 sabor grande.',emoji:'🍕',estoque:30,min:5}
    ]
  },

  acai:{
    label:'Açaí', emoji:'🍧', cor:'#8B5CF6',
    cats:['Açaís','Complementos','Bebidas'],
    produtos:[
      {nome:'Açaí 300ml',cat:'Açaís',preco:12.90,desc:'Açaí puro batido na hora.',emoji:'🍧',estoque:100,min:15,tipo:'adicional',opcoes:[{nome:'Granola',preco:1.50},{nome:'Leite em pó',preco:1.50},{nome:'Banana',preco:1.00},{nome:'Morango',preco:2.00},{nome:'Paçoca',preco:1.50},{nome:'Leite condensado',preco:2.00}]},
      {nome:'Açaí 500ml',cat:'Açaís',preco:17.90,desc:'Açaí puro + 1 complemento grátis.',emoji:'🍧',estoque:90,min:12,tipo:'adicional',opcoes:[{nome:'Granola',preco:1.50},{nome:'Leite em pó',preco:1.50},{nome:'Banana',preco:1.00},{nome:'Morango',preco:2.00},{nome:'Paçoca',preco:1.50}]},
      {nome:'Açaí 700ml',cat:'Açaís',preco:22.90,desc:'Açaí puro + 2 complementos grátis.',emoji:'🍧',estoque:70,min:10,tipo:'adicional',opcoes:[{nome:'Granola',preco:1.50},{nome:'Leite em pó',preco:1.50},{nome:'Banana',preco:1.00},{nome:'Morango',preco:2.00},{nome:'Paçoca',preco:1.50},{nome:'Leite condensado',preco:2.00}]},
      {nome:'Cupuaçu 500ml',cat:'Açaís',preco:18.90,desc:'Cupuaçu cremoso.',emoji:'🍈',estoque:40,min:8},
      {nome:'Vitamina de Banana',cat:'Açaís',preco:13.90,desc:'Banana com leite.',emoji:'🍌',estoque:35,min:6},
      {nome:'Caldo de Cana',cat:'Bebidas',preco:8.00,desc:'Copo 400ml.',emoji:'🥤',estoque:60,min:10,tipo:'variacao',opcoes:[{nome:'400ml',preco:8.00},{nome:'600ml',preco:10.00}]},
      {nome:'Água Mineral',cat:'Bebidas',preco:3.50,desc:'Garrafa 500ml.',emoji:'💧',estoque:150,min:20},
      {nome:'Combo Açaí 500ml + 2 complementos',cat:'Açaís',preco:19.90,promocao:17.90,desc:'O favorito da casa.',emoji:'🍧',estoque:50,min:8}
    ]
  },

  restaurante:{
    label:'Restaurante', emoji:'🍽️', cor:'#B45309',
    cats:['Pratos Executivos','Marmitas','Bebidas','Sobremesas'],
    produtos:[
      {nome:'PF Bife Acebolado',cat:'Pratos Executivos',preco:24.90,desc:'Bife acebolado, arroz, feijão, salada e fritas.',emoji:'🍛',estoque:45,min:5},
      {nome:'PF Frango Grelhado',cat:'Pratos Executivos',preco:22.90,desc:'Filé de frango grelhado, arroz, feijão e salada.',emoji:'🍗',estoque:45,min:5},
      {nome:'Filé de Frango à Parmegiana',cat:'Pratos Executivos',preco:29.90,desc:'Empanado, molho, queijo, arroz e fritas.',emoji:'🧀',estoque:30,min:4},
      {nome:'PF Carne de Sol',cat:'Pratos Executivos',preco:32.90,desc:'Carne de sol com macaxeira e feijão verde.',emoji:'🥩',estoque:25,min:4},
      {nome:'Marmita Executiva',cat:'Marmitas',preco:18.90,desc:'Arroz, feijão, proteína do dia e salada.',emoji:'🥡',estoque:80,min:10,tipo:'variacao',opcoes:[{nome:'Pequena',preco:16.90},{nome:'Grande',preco:18.90}]},
      {nome:'Marmita Fit',cat:'Marmitas',preco:21.90,desc:'Arroz integral, frango grelhado e legumes.',emoji:'🥗',estoque:40,min:6},
      {nome:'Suco Natural',cat:'Bebidas',preco:7.90,desc:'Laranja, limão ou maracujá.',emoji:'🍊',estoque:60,min:8},
      {nome:'Refrigerante Lata',cat:'Bebidas',preco:5.50,desc:'Coca / Guaraná / Fanta.',emoji:'🥤',estoque:120,min:15},
      {nome:'Pudim de Leite',cat:'Sobremesas',preco:8.90,desc:'Fatia de pudim caseiro.',emoji:'🍮',estoque:25,min:4},
      {nome:'Combo Executivo + Suco',cat:'Pratos Executivos',preco:24.90,promocao:22.90,desc:'Marmita grande + suco 400ml.',emoji:'🍛',estoque:35,min:5}
    ]
  },

  conveniencia:{
    label:'Conveniência', emoji:'🏪', cor:'#0E7490',
    cats:['Bebidas','Snacks','Mercearia','Gelo','Outros'],
    produtos:[
      {nome:'Cerveja Lata 350ml',cat:'Bebidas',preco:5.90,desc:'Heineken, Skol ou Brahma.',emoji:'🍺',estoque:200,min:30},
      {nome:'Refrigerante Lata',cat:'Bebidas',preco:5.50,desc:'Coca / Guaraná.',emoji:'🥤',estoque:180,min:25},
      {nome:'Refrigerante 2L',cat:'Bebidas',preco:11.00,desc:'Coca-Cola 2L gelada.',emoji:'🥤',estoque:120,min:15},
      {nome:'Água Mineral 500ml',cat:'Bebidas',preco:3.00,desc:'Com ou sem gás.',emoji:'💧',estoque:250,min:40},
      {nome:'Energético 250ml',cat:'Bebidas',preco:12.00,desc:'Red Bull ou Monster.',emoji:'⚡',estoque:60,min:10},
      {nome:'Salgadinho 90g',cat:'Snacks',preco:8.90,desc:'Doritos, Ruffles ou Cheetos.',emoji:'🍟',estoque:80,min:12},
      {nome:'Chocolate Barra',cat:'Snacks',preco:7.50,desc:'Ao leite ou meio amargo.',emoji:'🍫',estoque:90,min:15},
      {nome:'Biscoito Recheado',cat:'Mercearia',preco:3.90,desc:'Chocolate ou morango.',emoji:'🍪',estoque:110,min:20},
      {nome:'Pão Francês (un)',cat:'Mercearia',preco:0.90,desc:'Fresquinho.',emoji:'🥖',estoque:300,min:50},
      {nome:'Gelo 5kg',cat:'Gelo',preco:9.90,desc:'Pra sua festa.',emoji:'🧊',estoque:50,min:8},
      {nome:'Isqueiro',cat:'Outros',preco:3.00,desc:'—',emoji:'🔥',estoque:100,min:15}
    ]
  },

  padaria:{
    label:'Padaria', emoji:'🥐', cor:'#A16207',
    cats:['Pães','Salgados','Doces & Bolos','Bebidas'],
    produtos:[
      {nome:'Pão Francês (un)',cat:'Pães',preco:0.90,desc:'Assado na hora.',emoji:'🥖',estoque:500,min:100},
      {nome:'Pão de Forma',cat:'Pães',preco:7.90,desc:'Fatia tradicional.',emoji:'🍞',estoque:60,min:10},
      {nome:'Croissant',cat:'Pães',preco:6.50,desc:'Folhado e amanteigado.',emoji:'🥐',estoque:40,min:8},
      {nome:'Baguete',cat:'Pães',preco:8.90,desc:'Fresquinha.',emoji:'🥖',estoque:30,min:6},
      {nome:'Pão de Queijo (un)',cat:'Salgados',preco:3.50,desc:'Mineiro, quentinho.',emoji:'🧀',estoque:150,min:25},
      {nome:'Coxinha',cat:'Salgados',preco:7.50,desc:'Frango.',emoji:'🍗',estoque:80,min:12},
      {nome:'Empada de Palmito',cat:'Salgados',preco:8.50,desc:'—',emoji:'🥧',estoque:50,min:8},
      {nome:'Sonho',cat:'Doces & Bolos',preco:7.90,desc:'Recheado com creme.',emoji:'🍩',estoque:40,min:6},
      {nome:'Bolo de Cenoura',cat:'Doces & Bolos',preco:6.90,desc:'Fatia com chocolate.',emoji:'🍰',estoque:30,min:5},
      {nome:'Bolo de Chocolate',cat:'Doces & Bolos',preco:7.50,desc:'Fatia generosa.',emoji:'🍰',estoque:30,min:5},
      {nome:'Café Expresso',cat:'Bebidas',preco:4.50,desc:'—',emoji:'☕',estoque:200,min:40},
      {nome:'Leite Quente',cat:'Bebidas',preco:5.00,desc:'Com ou sem achocolatado.',emoji:'🥛',estoque:80,min:15},
      {nome:'Suco de Laranja',cat:'Bebidas',preco:8.50,desc:'Copo 300ml.',emoji:'🍊',estoque:45,min:8}
    ]
  },

  mercado:{
    label:'Mercado', emoji:'🛒', cor:'#15803D',
    cats:['Hortifruti','Mercearia','Açougue','Bebidas','Padaria','Higiene'],
    produtos:[
      {nome:'Banana Prata (kg)',cat:'Hortifruti',preco:6.90,desc:'—',emoji:'🍌',estoque:60,min:10},
      {nome:'Maçã (kg)',cat:'Hortifruti',preco:9.90,desc:'—',emoji:'🍎',estoque:50,min:8},
      {nome:'Tomate (kg)',cat:'Hortifruti',preco:8.90,desc:'—',emoji:'🍅',estoque:45,min:8},
      {nome:'Alface',cat:'Hortifruti',preco:4.50,desc:'Unidade.',emoji:'🥬',estoque:40,min:6},
      {nome:'Arroz 5kg',cat:'Mercearia',preco:28.90,desc:'Tipo 1.',emoji:'🍚',estoque:80,min:10},
      {nome:'Feijão 1kg',cat:'Mercearia',preco:8.90,desc:'Carioca.',emoji:'🫘',estoque:90,min:12},
      {nome:'Óleo de Soja 900ml',cat:'Mercearia',preco:7.90,desc:'—',emoji:'🛢️',estoque:70,min:10},
      {nome:'Leite Integral 1L',cat:'Mercearia',preco:5.90,desc:'—',emoji:'🥛',estoque:100,min:15},
      {nome:'Ovos (12un)',cat:'Mercearia',preco:12.90,desc:'Brancos.',emoji:'🥚',estoque:60,min:8},
      {nome:'Frango Inteiro (kg)',cat:'Açougue',preco:15.90,desc:'Resfriado.',emoji:'🍗',estoque:40,min:6},
      {nome:'Carne Moída (kg)',cat:'Açougue',preco:34.90,desc:'Primeira.',emoji:'🥩',estoque:30,min:5},
      {nome:'Cerveja Lata 350ml',cat:'Bebidas',preco:5.49,desc:'Skol / Brahma.',emoji:'🍺',estoque:200,min:30},
      {nome:'Refrigerante 2L',cat:'Bebidas',preco:11.50,desc:'Coca / Guaraná.',emoji:'🥤',estoque:150,min:20},
      {nome:'Pão Francês (un)',cat:'Padaria',preco:0.90,desc:'—',emoji:'🥖',estoque:400,min:80},
      {nome:'Papel Higiênico (4un)',cat:'Higiene',preco:13.90,desc:'—',emoji:'🧻',estoque:80,min:10}
    ]
  },

  dark_kitchen:{
    label:'Dark Kitchen', emoji:'👨‍🍳', cor:'#334155',
    cats:['Lanches','Massas','Pratos','Sobremesas','Bebidas'],
    produtos:[
      {nome:'X-Burger Gourmet',cat:'Lanches',preco:29.90,desc:'Blend 180g, queijo prato e maionese da casa.',emoji:'🍔',estoque:60,min:10,tipo:'adicional',opcoes:[{nome:'Bacon',preco:5.00},{nome:'Cheddar',preco:4.50},{nome:'Ovo',preco:3.00}]},
      {nome:'X-Costela',cat:'Lanches',preco:38.90,desc:'Costela desfiada, cheddar e barbecue.',emoji:'🍖',estoque:35,min:6},
      {nome:'Batata Rústica',cat:'Lanches',preco:17.90,desc:'Com alecrim e parmesão.',emoji:'🍟',estoque:70,min:10},
      {nome:'Macarrão ao Molho Branco',cat:'Massas',preco:27.90,desc:'Fettuccine, molho branco e frango.',emoji:'🍝',estoque:30,min:5},
      {nome:'Macarrão à Bolonhesa',cat:'Massas',preco:26.90,desc:'Espaguete ao sugo com carne moída.',emoji:'🍝',estoque:30,min:5},
      {nome:'Risoto de Camarão',cat:'Pratos',preco:42.90,desc:'Risoto cremoso com camarão.',emoji:'🍤',estoque:20,min:3},
      {nome:'Bowl de Frango Grelhado',cat:'Pratos',preco:24.90,desc:'Arroz, frango e legumes no wok.',emoji:'🥗',estoque:40,min:6},
      {nome:'Brownie com Sorvete',cat:'Sobremesas',preco:16.90,desc:'Quentinho.',emoji:'🍫',estoque:35,min:5},
      {nome:'Cheesecake de Frutas Vermelhas',cat:'Sobremesas',preco:15.90,desc:'Fatia.',emoji:'🍰',estoque:25,min:4},
      {nome:'Coca-Cola Lata',cat:'Bebidas',preco:6.00,desc:'—',emoji:'🥤',estoque:150,min:20},
      {nome:'Suco de Maracujá',cat:'Bebidas',preco:8.90,desc:'300ml.',emoji:'🥤',estoque:45,min:8}
    ]
  }
};

function templateByType(type){return BUSINESS_TEMPLATES[type]||BUSINESS_TEMPLATES.bebidas}

// ── catálogo-modelo → lista de produtos pronta para gravar ─────────────
function buildTemplateProducts(type){
  const t=templateByType(type);
  const catEmoji={Cervejas:'🍺',Whisky:'🥃',Vinhos:'🍷',Destilados:'🍸',Refrigerantes:'🥤',Energéticos:'⚡','Água & Gelo':'🧊','Hambúrgueres':'🍔','Acompanhamentos':'🍟','Sobremesas':'🍰',Bebidas:'🥤','Pizzas Salgadas':'🍕','Pizzas Doces':'🍫','Combos':'📦','Pratos Executivos':'🍛',Marmitas:'🥡','Pratos':'🍽️','Açaís':'🍧','Complementos':'🍓','Lanches':'🥪',Salgados:'🥟','Doces & Bolos':'🍰',Snacks:'🍿',Mercearia:'🛒',Gelo:'🧊',Hortifruti:'🥦',Açougue:'🥩',Padaria:'🥖',Higiene:'🧻',Massas:'🍝',Outros:'📦'};
  return t.produtos.map((p,i)=>{
    const cat=p.cat||t.cats[0]||'Geral';
    const baseEst=(p.estoque!=null)?p.estoque:100;
    const baseMin=(p.min!=null)?p.min:5;
    const custo=(p.custo!=null)?p.custo:Math.round((p.preco*0.55 + Number.EPSILON)*100)/100;
    return {
      id:'p'+(i+1),
      nome:p.nome,
      cat:cat,
      desc:p.desc||'',
      preco:p.preco,
      promocao:p.promocao||0,
      custo:custo,
      sku:'',
      codigoBarras:'',
      estoque:baseEst,
      min:baseMin,
      tipo:p.tipo||'simples',
      opcoes:Array.isArray(p.opcoes)?p.opcoes:[],
      img:p.img||'',
      emoji:p.emoji||catEmoji[cat]||'🛍️',
      ativo:true,
      tpl:type
    };
  });
}

// ── Catálogo base de tenants demo ───────────────────────────────────────
// Este é o "Super Admin" local: catálogo de empresas que existem.
const TENANTS = [
  {id:'adega1998', nome:'Adega 1998', categoria:'Adega / Depósito de Bebidas', businessType:'bebidas', cor:'#F15A24', cnpj:'00.000.000/0001-00', whats:'5511999991998', phone:'(11) 99999-1998', endereco:'Rua das Bebidas, 1998 — Centro, São Paulo/SP', linkLoja:'', raio:12, minimo:30, taxaBase:5, taxaKm:1.2, tempoPrep:25, horario:'Seg a Sáb 9h–23h • Dom 10h–20h', plano:'Profissional', logo:'A98', logoImg:'', statusLoja:'aberta', desc:'Depósito de bebidas desde 1998. Qualidade, variedade e entrega rápida para toda a cidade.'},
  {id:'burger-ze', nome:'Burger do Zé', categoria:'Hamburgueria', businessType:'hamburgueria', cor:'#E11D48', cnpj:'11.111.111/0001-11', whats:'5511988880001', phone:'(11) 98888-0001', endereco:'Av. Paulista, 1000 — Bela Vista, São Paulo/SP', linkLoja:'', raio:8, minimo:25, taxaBase:6, taxaKm:1.5, tempoPrep:20, horario:'Todos os dias 11h–23h30', plano:'Starter', logo:'BZ', logoImg:'', statusLoja:'aberta', desc:'Hambúrguer artesanal com entrega rápida. O melhor da Paulista.'},
  {id:'pizza-prime', nome:'Pizza Prime', categoria:'Pizzaria', businessType:'pizzaria', cor:'#7C3AED', cnpj:'22.222.222/0001-22', whats:'5511977770002', phone:'(11) 97777-0002', endereco:'Rua Augusta, 2000 — Cerqueira César, São Paulo/SP', linkLoja:'', raio:10, minimo:40, taxaBase:8, taxaKm:1.0, tempoPrep:35, horario:'Ter a Dom 18h–23h59', plano:'Premium', logo:'PP', logoImg:'', statusLoja:'aberta', desc:'Pizzas artesanais de fermentação natural.'}
];

// catálogo dinâmico: base + tenants criados no fluxo/Super Admin (dp_sa_tenants)
function getTenantCatalog(){
  const base=TENANTS.slice();
  const raw=storeGet('dp_sa_tenants');
  if(raw){try{
    const extras=JSON.parse(raw);
    if(Array.isArray(extras)){
      extras.forEach(t=>{
        if(!base.some(b=>b.id===t.id)){
          base.push(Object.assign({businessType:'bebidas',statusLoja:'aberta',logo:'T',logoImg:'',desc:'',phone:'',linkLoja:'',raio:8,minimo:20,taxaBase:5,taxaKm:1.5,tempoPrep:25,horario:'',plano:t.plano||'Starter'},t));
        }
      });
    }
  }catch(e){}}
  return base;
}

// inferência do tipo de negócio pela categoria (para dados antigos sem businessType)
function inferType(cat){
  const c=String(cat||'').toLowerCase();
  if(c.includes('bebida')||c.includes('adega')||c.includes('depósito'))return 'bebidas';
  if(c.includes('hamburguer'))return 'hamburgueria';
  if(c.includes('lanchonete')||c.includes('sanduíche')||c.includes('sanduiche'))return 'lanchonete';
  if(c.includes('pizza'))return 'pizzaria';
  if(c.includes('açaí')||c.includes('acai'))return 'acai';
  if(c.includes('restaurante')||c.includes('marmita'))return 'restaurante';
  if(c.includes('conveniência')||c.includes('conveniencia'))return 'conveniencia';
  if(c.includes('padaria')||c.includes('confeitaria'))return 'padaria';
  if(c.includes('mercado')||c.includes('mercearia'))return 'mercado';
  if(c.includes('dark'))return 'dark_kitchen';
  return 'bebidas';
}

// getTenant(id): base + overrides salvos em dp_tenant_{id} (normaliza campos)
function getTenant(id){
  const list=getTenantCatalog();
  const t=list.find(x=>x.id===id)||list[0];
  let saved=null;
  const s=storeGet('dp_tenant_'+id);
  if(s){try{saved=JSON.parse(s)}catch(e){}}
  const merged=Object.assign({},t,saved||{});
  // normaliza
  if(!merged.businessType)merged.businessType=inferType(merged.categoria);
  if(!merged.categoria&&merged.businessType)merged.categoria=typeById(merged.businessType).label;
  if(!merged.statusLoja)merged.statusLoja='aberta';
  if(!merged.logoImg)merged.logoImg='';
  if(!merged.logo)merged.logo=(merged.nome||'L').split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
  if(merged.whats&&!String(merged.whats).startsWith('55'))merged.whats=String(merged.whats).replace(/\D/g,'');
  if(merged.logoImg==='')merged.logoImg=saved&&saved.logoImg?saved.logoImg:'';
  return merged;
}
function saveTenant(tenant){
  storeSet('dp_tenant_'+tenant.id,JSON.stringify(tenant));
  // garante que aparece no catálogo dinâmico p/ os outros apps
  ensureTenantInSaCatalog(tenant);
}
function ensureTenantInSaCatalog(tenant){
  const key='dp_sa_tenants';
  let arr=[];
  const raw=storeGet(key);
  if(raw){try{arr=JSON.parse(raw)||[]}catch(e){arr=[]}}
  const i=arr.findIndex(x=>x.id===tenant.id);
  const entry={id:tenant.id,nome:tenant.nome,categoria:tenant.categoria,businessType:tenant.businessType,cor:tenant.cor,plano:tenant.plano,logo:tenant.logo,logoImg:tenant.logoImg,statusLoja:tenant.statusLoja,whats:tenant.whats,phone:tenant.phone,endereco:tenant.endereco,raio:tenant.raio,minimo:tenant.minimo,taxaBase:tenant.taxaBase,taxaKm:tenant.taxaKm,tempoPrep:tenant.tempoPrep,horario:tenant.horario,desc:tenant.desc};
  if(i>=0)arr[i]=Object.assign({},arr[i],entry);
  else arr.push(entry);
  storeSet(key,JSON.stringify(arr));
}

// ── Produtos do tenant (com versão p/ renovar catálogo-modelo) ──────────
const CAT_VERSION = 3; // suba p/ reaplicar templates em tenants já existentes
function getProducts(tenantId){
  const key='dp_'+tenantId+'_products';
  const verKey='dp_'+tenantId+'_catVersion';
  const raw=storeGet(key);
  const ver=parseInt(storeGet(verKey)||'0',10)||0;
  if(raw&&ver>=CAT_VERSION){
    try{const arr=JSON.parse(raw);if(Array.isArray(arr))return arr}catch(e){}
  }
  // semente a partir do template do segmento do tenant
  const ten=getTenant(tenantId);
  const arr=buildTemplateProducts(ten.businessType);
  storeSet(key,JSON.stringify(arr));
  storeSet(verKey,String(CAT_VERSION));
  return arr;
}
function saveProducts(tenantId,arr){
  storeSet('dp_'+tenantId+'_products',JSON.stringify(arr));
  storeSet('dp_'+tenantId+'_catVersion',String(CAT_VERSION));
}
function applyTemplate(tenantId){
  const ten=getTenant(tenantId);
  const arr=buildTemplateProducts(ten.businessType);
  saveProducts(tenantId,arr);
  return arr;
}
// renomeia categorias após mudança de segmento (evita restos da categoria anterior)
function normalizeCatByTemplate(products,type){
  const t=templateByType(type);
  const valid=new Set(t.cats);
  return products.map(p=>{if(!valid.has(p.cat))p.cat=t.cats[0];return p});
}
