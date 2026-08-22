/**
 * Form fields.
 *
 * The design specifies label / focused / error as one system with an optional
 * trailing selector (unit, currency). v2 had three near-identical 9-11KB
 * components (MoneyInput, UnitInput, PhoneInput) that each re-implemented the
 * same field-plus-picker shape, so a fix to one never reached the others.
 *
 * `Field` is the shell. `PickerField` composes it with a selector.
 */
import { forwardRef, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Input as TamaguiInput, XStack, YStack, styled, useTheme } from 'tamagui';
import { Body, Caption, Micro } from './Text';
import { hitTarget, radius, space } from '../theme/tokens';

const FIELD_HEIGHT = 50;

/**
 * The field's frame is a plain `View`, not a Tamagui `styled()` stack.
 *
 * As `styled(XStack)` it had a variant, `focused`, toggled from the input's own
 * `onFocus`. **Changing a variant on the styled wrapper makes the child
 * TextInput resign first responder**, so the field focused and was blurred again
 * within the same tap: no caret, no keyboard, nothing typeable anywhere in v3.
 * The focus ring was destroying the focus it existed to show.
 *
 * Measured on device with the input instrumented — the touch reached the input
 * and `onFocus` fired (`foc 1 blr 1`), and the native node was never remounted
 * (`mounts 1`), so this is an explicit blur, not a remount. Holding the wrapper's
 * props constant while still re-rendering kept focus (`blr 0`), which isolates
 * the variant change as the cause.
 *
 * A plain `View` takes an ordinary style object, so the same visual change no
 * longer disturbs the child. Tamagui is fine everywhere else in the library, and
 * fine as an *ancestor* of a field — it is a styled wrapper immediately around a
 * text input, whose props change while that input is focused, that breaks.
 */
/**
 * The focus ring is drawn by a **sibling overlay**, never by an ancestor of the
 * input. That is the whole reason this component is shaped the way it is.
 *
 * Originally the ring was a `focused` variant on the `styled(XStack)` that
 * contained the input, toggled from the input's own `onFocus`. **Changing the
 * style of any ancestor of a focused TextInput makes it resign first
 * responder**, so the field focused and blurred within the same tap: no caret,
 * no keyboard, nothing typeable anywhere in v3 — sign-in included. The focus
 * ring was destroying the focus it existed to show.
 *
 * Measured on device with the input instrumented:
 *
 *   - the touch reached the input and `onFocus` fired, then `onBlur` at once
 *     (`foc 1 blr 1`), and the native node was never remounted (`mounts 1`) —
 *     an explicit blur, not a remount;
 *   - holding the wrapper's props constant while still re-rendering kept focus
 *     (`blr 0`, caret, typing, list filtering), which isolates the style change;
 *   - a plain `View` wrapper whose style still changed blurred it too, so this
 *     is not a Tamagui quirk;
 *   - moving the ring one level out, to the grandparent, blurred it as well.
 *
 * So `Frame` — everything from the input upwards — is constant by contract, and
 * the ring is an absolutely-positioned sibling that only ever changes its own
 * style. Changing a sibling is safe; changing an ancestor is not.
 */
const RING_RADIUS = radius.compact + 2;

/** Constant by contract: nothing here may depend on focus or error state. */
function useFrameStyle(plain: boolean, multiline?: boolean, disabled?: boolean) {
    const theme = useTheme();
    return {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        height: multiline ? undefined : FIELD_HEIGHT,
        minHeight: multiline ? FIELD_HEIGHT : undefined,
        borderRadius: RING_RADIUS,
        borderWidth: 1,
        borderColor: theme.border?.val as string,
        backgroundColor: theme.surface?.val as string,
        paddingLeft: space[4],
        paddingRight: plain ? space[4] : space[2],
        gap: space[2],
        opacity: disabled ? 0.38 : 1,
    };
}

/**
 * Always mounted, so focus does not add or remove a node either — only this
 * sibling's own style changes. Transparent until there is something to show.
 */
function useRingStyle(focused?: boolean, invalid?: boolean) {
    const theme = useTheme();
    const active = focused || invalid;
    const color = (invalid ? theme.danger?.val : theme.primary?.val) as string;

    return {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: RING_RADIUS,
        borderWidth: active ? 1.5 : 0,
        borderColor: active ? color : 'transparent',
        ...(focused && !invalid
            ? { shadowColor: color, shadowOpacity: 0.17, shadowRadius: 3, shadowOffset: { width: 0, height: 0 } }
            : null),
    };
}

const BareInput = styled(TamaguiInput, {
    name: 'FieldInput',
    flex: 1,
    borderWidth: 0,
    backgroundColor: '$transparent',
    paddingHorizontal: 0,
    height: FIELD_HEIGHT - 2,
    fontFamily: '$body',
    fontSize: 16,
    color: '$textPrimary',
    // Tamagui adds a focus ring of its own; the ring overlay owns that
    // treatment. This must stay empty of anything that changes on focus.
    focusStyle: { borderWidth: 0, outlineWidth: 0 },
});

export interface FieldProps {
    label?: string;
    value?: string;
    placeholder?: string;
    /** Message shown beneath in danger tone. Presence implies the invalid state. */
    error?: string;
    /** Quiet helper text, shown when there is no error. */
    hint?: string;
    disabled?: boolean;
    /** Right-hand accessory: a unit pill, currency selector, or plain text. */
    accessory?: React.ReactNode;
    /** Numeric values must be tabular so digits don't jitter while typing. */
    tabular?: boolean;
    keyboardType?: 'default' | 'numeric' | 'decimal-pad' | 'phone-pad' | 'email-address';
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
    multiline?: boolean;
    /**
     * Masks the value. Kept as a Field variant rather than a separate
     * component so a password field inherits the same label / focus / error /
     * accessory treatment as every other field.
     */
    secure?: boolean;
    onChangeText?: (text: string) => void;
    onBlur?: () => void;
    testID?: string;
}

export const Field = forwardRef<TextInput, FieldProps>(function Field(
    { label, value, placeholder, error, hint, disabled, accessory, tabular, keyboardType, autoCapitalize, multiline, secure, onChangeText, onBlur, testID },
    ref
) {
    const [focused, setFocused] = useState(false);
    const frame = useFrameStyle(!accessory, multiline, disabled);
    const ring = useRingStyle(focused && !error, !!error);

    return (
        <YStack gap={space[2] - 2} testID={testID}>
            {label ? <Caption tone={error ? 'danger' : 'secondary'}>{label}</Caption> : null}

            {/* The ring is a sibling of the frame, never an ancestor of the input. */}
            <View>
                <View style={frame} testID={testID ? `${testID}-frame` : undefined}>
                    <BareInput
                        ref={ref as never}
                        value={value}
                        placeholder={placeholder}
                        placeholderTextColor="$textMuted"
                        editable={!disabled}
                        keyboardType={keyboardType}
                        autoCapitalize={autoCapitalize}
                        multiline={multiline}
                        secureTextEntry={secure}
                        fontVariant={tabular ? ['tabular-nums'] : undefined}
                        onChangeText={onChangeText}
                        onFocus={() => setFocused(true)}
                        onBlur={() => {
                            setFocused(false);
                            onBlur?.();
                        }}
                        accessibilityLabel={label}
                        testID={testID ? `${testID}-input` : undefined}
                    />
                    {accessory}
                </View>
                <View pointerEvents="none" style={ring} testID={testID ? `${testID}-ring` : undefined} />
            </View>

            {error ? <Micro tone="danger">{error}</Micro> : hint ? <Micro>{hint}</Micro> : null}
        </YStack>
    );
});

/**
 * The trailing pill inside a field — "GBP ▾", "L ▾", "km".
 * `onPress` makes it a selector; without it, it is a static unit label.
 */
export function FieldAccessory({ label, onPress, testID }: { label: string; onPress?: () => void; testID?: string }) {
    if (!onPress) {
        return (
            <Micro paddingRight={space[2]} testID={testID}>
                {label}
            </Micro>
        );
    }
    return (
        <XStack
            testID={testID}
            onPress={onPress}
            alignItems="center"
            justifyContent="center"
            height={38}
            paddingHorizontal={space[3]}
            borderRadius={radius.compact - 1}
            borderWidth={1}
            borderColor="$border"
            backgroundColor="$surfaceRaised"
            pressStyle={{ opacity: 0.7 }}
            accessibilityRole="button"
            accessibilityLabel={`Change ${label}`}
        >
            <Body fontSize={13} fontWeight="700">
                {label} ▾
            </Body>
        </XStack>
    );
}

/** Segmented control — metric/imperial, order/vehicle/route, priority. */
export function Segmented<T extends string>({
    options,
    value,
    onChange,
    testID,
}: {
    options: { value: T; label: string }[];
    value: T;
    onChange: (v: T) => void;
    testID?: string;
}) {
    return (
        // `width: 100%` because every option inside is `flex: 1`. Without a
        // width of its own the group collapses to zero in any row that does not
        // stretch it, and the options render as slivers — which is exactly what
        // happened to the theme picker in Settings, leaving it untappable.
        <XStack width="100%" gap={space[2]} testID={testID} accessibilityRole="radiogroup">
            {options.map((o) => {
                const selected = o.value === value;
                return (
                    <XStack
                        key={o.value}
                        flex={1}
                        height={hitTarget.min}
                        alignItems="center"
                        justifyContent="center"
                        borderRadius={radius.compact + 1}
                        borderWidth={selected ? 1.5 : 1}
                        borderColor={selected ? '$primary' : '$border'}
                        backgroundColor={selected ? '$primaryFill' : '$surface'}
                        pressStyle={{ opacity: 0.7 }}
                        onPress={() => onChange(o.value)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                    >
                        <Body fontSize={13} fontWeight="700" tone={selected ? 'brand' : 'secondary'}>
                            {o.label}
                        </Body>
                    </XStack>
                );
            })}
        </XStack>
    );
}

export default Field;
