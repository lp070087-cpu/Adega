import test from 'node:test';
import assert from 'node:assert/strict';
import { installedDisplayMode, observeInstalledContext } from '../src/lib/pwa-install-state';

test('install visibility detects only this app window, including iOS, never an ordinary or fullscreen tab', () => {
  assert.equal(installedDisplayMode(() => false), false);
  assert.equal(installedDisplayMode(query => query === '(display-mode: standalone)'), true);
  assert.equal(installedDisplayMode(query => query === '(display-mode: minimal-ui)'), true);
  assert.equal(installedDisplayMode(query => query === '(display-mode: fullscreen)'), false);
  assert.equal(installedDisplayMode(() => false, true), true);
});

test('appinstalled hides entry points immediately, survives display events and cleans up subscriptions', () => {
  const target = new EventTarget();
  const media = new Map<string, EventTarget & { matches: boolean }>();
  const fakeWindow = Object.assign(target, { matchMedia(query: string) {
    if (!media.has(query)) media.set(query, Object.assign(new EventTarget(), { matches: false }));
    return media.get(query)!;
  } });
  const observed: boolean[] = [];
  const stop = observeInstalledContext(fakeWindow as unknown as Window, {} as Navigator, value => observed.push(value));
  assert.deepEqual(observed, [false]);
  target.dispatchEvent(new Event('appinstalled'));
  assert.equal(observed.at(-1), true);
  media.get('(display-mode: standalone)')!.dispatchEvent(new Event('change'));
  assert.equal(observed.at(-1), true);
  stop();
  const previous = observed.length;
  target.dispatchEvent(new Event('appinstalled'));
  media.get('(display-mode: standalone)')!.dispatchEvent(new Event('change'));
  assert.equal(observed.length, previous);
});
