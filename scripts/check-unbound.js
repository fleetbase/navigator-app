// Lists identifiers used in a file that are neither declared nor imported in it: Babel compiles these, the phone crashes on them.
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const fs = require('fs');
const path = require('path');
const KNOWN = new Set(['undefined','NaN','Infinity','console','require','module','exports','process','global','globalThis','window','document','navigator','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame','Promise','Array','Object','String','Number','Boolean','Date','Math','JSON','Map','Set','WeakMap','WeakSet','Symbol','Error','TypeError','RangeError','RegExp','parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','encodeURI','decodeURI','Intl','fetch','Headers','AbortController','FormData','URL','URLSearchParams','Blob','localStorage','crypto','__DEV__','__APP_VERSION__','__WEB_CONFIG__','arguments','React','JSX','alert','performance','queueMicrotask','structuredClone','atob','btoa','Buffer','BigInt','Reflect','Proxy','Uint8Array','ArrayBuffer','TextEncoder','TextDecoder','escape','unescape','Response','Request','WebSocket','XMLHttpRequest','FileReader','Image','HTMLElement','Event','CustomEvent','ErrorUtils','jest','describe','it','expect','beforeEach','afterEach','beforeAll','afterAll','test','__ariaState','__ariaValue','setImmediate','clearImmediate','Function','Int8Array','Float32Array','Float64Array','Uint16Array','Uint32Array','Int16Array','Int32Array','DataView','AggregateError','WeakRef','getComputedStyle','location','history','self','MutationObserver','ResizeObserver','IntersectionObserver','Node','Element','screen','EventTarget','Atomics','SharedArrayBuffer','Uint8ClampedArray','EvalError','SyntaxError','ReferenceError','URIError','eval','nativeModuleProxy','HermesInternal']);
function walk(dir, out) { for (const f of fs.readdirSync(dir)) { const p = path.join(dir, f); const st = fs.statSync(p); if (st.isDirectory()) { if (f === '__tests__' || f === 'node_modules') continue; walk(p, out); } else if (/\.(tsx?|jsx?)$/.test(f) && !/\.d\.ts$/.test(f)) out.push(p); } return out; }
let bad = 0;
for (const file of walk(process.argv[2], [])) {
  let ast; try { ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] }); } catch (e) { console.log('PARSE', file, e.message); bad++; continue; }
  const seen = new Set();
  const inType = (p) => !!p.findParent((q) => q.node.type.startsWith('TS') && q.node.type !== 'TSAsExpression' && q.node.type !== 'TSNonNullExpression' && q.node.type !== 'TSSatisfiesExpression' || q.isTSAsExpression() && false);
  const check = (p, name) => { if (KNOWN.has(name) || p.scope.hasBinding(name, true)) return; if (inType(p)) return; seen.add(name + ':' + (p.node.loc ? p.node.loc.start.line : '?')); };
  traverse(ast, {
    Identifier(p) { if (!p.isReferencedIdentifier()) return; const par = p.parent; if (par.type === 'TSAsExpression' && par.typeAnnotation === p.node) return; check(p, p.node.name); },
    JSXIdentifier(p) { if (p.parent.type !== 'JSXOpeningElement' && p.parent.type !== 'JSXClosingElement' && !(p.parent.type === 'JSXMemberExpression' && p.parent.object === p.node)) return; const n = p.node.name; if (/^[a-z]/.test(n)) return; check(p, n); },
  });
  // `StyleSheet.absoluteFillObject` was removed from React Native: spreading it gives a view no position, and it collapses.
  if (/StyleSheet\.absoluteFillObject/.test(fs.readFileSync(file, 'utf8'))) seen.add('StyleSheet.absoluteFillObject (removed from React Native; write the position out)');
  if (seen.size) { bad++; console.log(file + '  ->  ' + [...seen].join(', ')); }
}
console.log(bad ? `${bad} file(s) with unbound names` : 'no unbound names');
