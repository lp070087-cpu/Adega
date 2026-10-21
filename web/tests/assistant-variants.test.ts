import test from 'node:test';
import assert from 'node:assert/strict';
import { assistantCatalogEntries } from '../src/lib/assistant/catalog-entries';
import { catalogReply } from '../src/lib/assistant/catalog';

const product = {id:'beer',name:'Cerveja cadastrada',type:'VARIATION',price:'10.00',promotionalPrice:'8.00',stock:3,trackStock:true,available:true,globalProduct:{brand:'Marca cadastrada',packSize:12,volume:350,unit:'ml'},variations:[
  {id:'unit',productId:'beer',name:'Unidade 350 ml',priceAdjustment:'0',active:true},
  {id:'box',productId:'beer',name:'Caixa com 6 unidades de 350 ml',priceAdjustment:'38',active:true},
  {id:'paused',productId:'beer',name:'Opção pausada',priceAdjustment:'9',active:false},
  {id:'foreign',productId:'another-product',name:'Opção de outro produto',priceAdjustment:'1',active:true},
]};
test('assistant selects exact active variants, authoritative promotional adjustment and real deep links',()=>{
  const catalog=assistantCatalogEntries([product],'own');
  assert.deepEqual(catalog.map(p=>p.id),['variation:unit','variation:box']);
  assert.equal(catalog[1].price,46); assert.equal(catalog[1].stock,3);
  assert.equal(catalog[1].packSize,null); assert.equal(catalog[1].volume,null);
  const reply=catalogReply({ids:['variation:box','variation:foreign'],question:'RESULTS'},catalog,'https://example.test','own-store');
  assert.match(reply,/Caixa com 6 unidades/); assert.match(reply,/46,00/);
  assert.match(reply,/produto=beer&variacao=box/);
  assert.doesNotMatch(reply,/12 unidades|foreign|produto=variation/);
});
test('unavailable variants and invalid effective prices cannot become offers',()=>{
  assert.deepEqual(assistantCatalogEntries([{...product,stock:0}],'own'),[]);
  assert.deepEqual(assistantCatalogEntries([{...product,variations:[]}],'own'),[]);
  assert.deepEqual(assistantCatalogEntries([{...product,variations:[{...product.variations[0],priceAdjustment:'-50'}]}],'own'),[]);
});
test('optional variants preserve the normal product offer instead of replacing it',()=>{
  const catalog=assistantCatalogEntries([{...product,type:'SIMPLE'}],'own');
  assert.deepEqual(catalog.map(p=>p.id),['beer','variation:unit','variation:box']);
  assert.equal(catalog[0].price,10); assert.equal(catalog[0].promotionalPrice,8);
  const reply=catalogReply({ids:['beer'],question:'RESULTS'},catalog,'https://example.test','own-store');
  assert.match(reply,/8,00/); assert.match(reply,/produto=beer/); assert.doesNotMatch(reply,/variacao=/);
});
test('assistant combo offers respect component stock and tenant ownership',()=>{
  const component={organizationId:'own',active:true,available:true,trackStock:true,stock:5,combo:null};
  const combo={...product,type:'COMBO',variations:[],trackStock:false,stock:0,combo:{items:[{quantity:2,product:component}]}};
  assert.equal(assistantCatalogEntries([combo],'own')[0].stock,2);
  for (const changed of [{...component,stock:0},{...component,organizationId:'foreign'},{...component,available:false}]) {
    assert.deepEqual(assistantCatalogEntries([{...combo,combo:{items:[{quantity:2,product:changed}]}}],'own'),[]);
  }
});
