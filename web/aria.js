/** The DOM equivalents of `accessibilityState` and `accessibilityValue` (see babel-plugin-rn-props.js). */
const STATES = ['busy', 'checked', 'disabled', 'expanded', 'selected'];

export function ariaState(state) {
    const attributes = {};
    for (const name of STATES) {
        if (state?.[name] !== undefined) attributes[`aria-${name}`] = state[name];
    }
    return attributes;
}

export function ariaValue(value) {
    return {
        'aria-valuemin': value?.min,
        'aria-valuemax': value?.max,
        'aria-valuenow': value?.now,
        'aria-valuetext': value?.text,
    };
}
