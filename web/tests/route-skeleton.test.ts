import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

type Element = { type: string; props: Record<string, any> };
function element(type: string | ((props: any) => Element), props: Record<string, any>): Element {
  return typeof type === 'function' ? type(props) : { type, props };
}
const compiled = ts.transpileModule(readFileSync('src/components/ui/RouteSkeleton.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} as { RouteSkeleton: (props: { variant: string; label: string }) => Element } };
new Function('require', 'module', 'exports', compiled)((name: string) => {
  assert.equal(name, 'react/jsx-runtime');
  return { jsx: element, jsxs: element, Fragment: 'fragment' };
}, loaded, loaded.exports);

function nodes(value: any): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...nodes(value.props?.children)];
}

test('loading variants expose one descriptive status and hide decorative placeholders', () => {
  for (const variant of ['dashboard', 'list', 'form', 'catalog', 'driver', 'detail']) {
    const root = loaded.exports.RouteSkeleton({ variant, label: 'Carregando pedidos…' });
    assert.equal(root.props.role, 'status');
    assert.equal(root.props['aria-live'], 'polite');
    assert.equal(root.props['aria-busy'], 'true');
    const all = nodes(root);
    assert.equal(all.filter((node) => node.props?.role === 'status').length, 1);
    assert.ok(all.some((node) => node.props?.children === 'Carregando pedidos…' && node.props.className === 'sr-only'));
    assert.ok(all.some((node) => node.props?.['aria-hidden'] === 'true'));
    assert.equal(all.filter((node) => ['input', 'button', 'a'].includes(node.type)).length, 0);
  }
});

test('skeleton animation honors reduced motion and catalog keeps compact two-column placeholders', () => {
  const all = nodes(loaded.exports.RouteSkeleton({ variant: 'catalog', label: 'Carregando cardápio…' }));
  assert.ok(all.some((node) => node.props?.className?.includes('motion-safe:animate-pulse') && node.props.className.includes('motion-reduce:animate-none')));
  assert.ok(all.some((node) => node.props?.className === 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'));
  assert.equal(all.filter((node) => node.props?.className?.includes('aspect-square')).length, 8);
});
