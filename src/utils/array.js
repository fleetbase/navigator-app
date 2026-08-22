/**
 * Array coercion helpers, split out of `utils/index.js`.
 *
 * `config/default.js` needed exactly one function from that barrel — `toArray`
 * — and importing the barrel to get it closed a cycle:
 *
 *     navigator.config.ts → config/default.js → src/utils/index.js
 *                        ↖──────────────────────────────┘
 *
 * The barrel imports `navigator.config` itself, so whichever module loaded
 * first handed the other a half-initialised namespace. It happened to work
 * because the values are only read inside function bodies, which is to say it
 * worked by luck rather than by construction; adding one top-level read
 * anywhere in that ring would have produced an undefined at start-up.
 *
 * These have no imports at all, so nothing that pulls them in can form a cycle.
 */

export function isArray(target) {
    return Array.isArray(target);
}

export function toArray(target, delimiter = ',') {
    if (isArray(target)) {
        return target;
    }

    if (typeof target === 'string') {
        return target.split(delimiter);
    }

    return Array.from(target);
}
