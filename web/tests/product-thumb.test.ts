import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

// Execute the real component lifecycle with isolated hooks/DOM and no browser/DB.
function harness(candidates: string[]) {
  const slots: any[] = []; let cursor = 0; const effects: Array<() => void> = [];
  const hooks = {
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value: any) => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial: any) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(fn: any) { return fn(); },
    useCallback(fn: any) { return fn; },
    useEffect(fn: any, deps: any[]) { const i = cursor++; if (!slots[i] || deps.some((d, n) => d !== slots[i][n])) { slots[i] = deps; effects.push(fn); } },
  };
  const jsx = (type: any, props: any) => ({ type, props });
  const imports: Record<string, any> = { react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': { Package: 'fallback' }, '@/lib/utils': { cn: (...v: any[]) => v.join(' ') }, '@/lib/catalog-images': { productImageCandidates: () => candidates } };
  const module = { exports: {} as any };
  const code = ts.transpileModule(readFileSync('src/components/catalog/ProductThumb.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)((name: string) => { if (!(name in imports)) throw new Error(name); return imports[name]; }, module, module.exports);
  function render(dom: { complete: boolean; naturalWidth: number }) {
    cursor = 0; const tree = module.exports.ProductThumb({ alt: 'Produto', size: 48 });
    const image = tree.props.children.find((child: any) => child?.type === 'img');
    if (image) image.props.ref.current = dom;
    effects.splice(0).forEach(fn => fn());
    return image;
  }
  return { render };
}

test('thumbnail recovers image failure before hydration and eventually renders fallback', () => {
  const h = harness(['/missing.webp', '/missing.jpg']);
  assert.equal(h.render({ complete: true, naturalWidth: 0 }).props.src, '/missing.webp');
  assert.equal(h.render({ complete: true, naturalWidth: 0 }).props.src, '/missing.jpg');
  assert.equal(h.render({ complete: true, naturalWidth: 0 }), undefined);
});

test('cached successful image becomes visible; duplicate failure events do not skip a candidate', () => {
  const h = harness(['/missing.webp', '/exact.jpg']);
  const first = h.render({ complete: false, naturalWidth: 0 });
  assert.equal(first.props.style.visibility, 'hidden');
  first.props.onError(); first.props.onError();
  assert.equal(h.render({ complete: true, naturalWidth: 100 }).props.src, '/exact.jpg');
  assert.equal(h.render({ complete: true, naturalWidth: 100 }).props.style.visibility, 'visible');
});
