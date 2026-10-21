import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
// Artes editáveis. As fotografias são incorporadas sem alterar seus bytes.
const templates=[
 ['cervejas','cervejas/heineken-lata-350ml.jpeg','#133c2b','Seu próximo','brinde começa aqui.','Explore as cervejas da loja.'],
 ['whisky','whisky/whisky-red-label-1l.jpeg','#392619','Uma seleção','para apreciar.','Conheça os whiskies disponíveis.'],
 ['refrigerantes','refrigerantes/guarana-antarctica-garrafa-2l.jpeg','#183e46','Mais sabor','para acompanhar.','Explore os refrigerantes da loja.'],
];
for(const [name,photo,color,line1,line2,subtitle] of templates){
 const image=readFileSync(resolve('public/catalog/bebidas',photo)).toString('base64');
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520"><title>Modelo mobile ${name}</title><defs><radialGradient id="glow"><stop stop-color="#ffffff" stop-opacity=".15"/><stop offset="1" stop-color="${color}"/></radialGradient></defs><rect width="800" height="520" fill="${color}"/><circle cx="630" cy="350" r="420" fill="url(#glow)"/><text x="56" y="82" fill="#ffffff" opacity=".65" font-family="Arial,sans-serif" font-size="20" letter-spacing="5">SUA VITRINE</text><rect x="490" y="50" width="260" height="420" rx="32" fill="#fff"/><image x="505" y="65" width="230" height="390" preserveAspectRatio="xMidYMid meet" href="data:image/jpeg;base64,${image}"/><g fill="#fff" font-family="Arial,sans-serif"><text x="56" y="220" font-size="38" font-weight="700">${line1}</text><text x="56" y="272" font-size="38" font-weight="700">${line2}</text><text x="56" y="330" font-size="20" opacity=".8">${subtitle}</text></g><path d="M56 400h110" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>`;
 writeFileSync(resolve('public/catalog/banners',`mobile-${name}.svg`),svg);
}
