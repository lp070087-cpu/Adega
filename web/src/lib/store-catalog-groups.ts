type Category = { id:string; name:string; slug:string; emoji:string|null };
export function groupPublishedStoreProducts<Product extends { categoryId:string|null }>(products: Product[], categories: Category[]) {
  const byCategory = new Map<string,Product[]>();
  const published = new Set(categories.map(category => category.id));
  for (const product of products) {
    const key = product.categoryId && published.has(product.categoryId) ? product.categoryId : '__sem_categoria__';
    const list = byCategory.get(key) ?? [];
    list.push(product); byCategory.set(key,list);
  }
  const groups = categories.map(category => ({category,items:byCategory.get(category.id) ?? []})).filter(group=>group.items.length>0);
  const uncategorized = byCategory.get('__sem_categoria__') ?? [];
  if(uncategorized.length) groups.push({category:{id:'__sem_categoria__',name:'Outros produtos',slug:'outros',emoji:null},items:uncategorized});
  return groups;
}
