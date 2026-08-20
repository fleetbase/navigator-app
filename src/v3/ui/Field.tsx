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
import type { TextInput } from 'react-native';
import { Input as TamaguiInput, XStack, YStack, styled } from 'tamagui';
import { Body, Caption, Micro } from './Text';
import { hitTarget, radius, space } from '../theme/tokens';

const FIELD_HEIGHT = 50;

const Shell = styled(XStack, {
    name: 'FieldShell',
    alignItems: 'center',
    height: FIELD_HEIGHT,
    borderRadius: radius.compact + 2,
    borderWidth: 1,
    borderColor: '$border',
    backgroundColor: '$surface',
    paddingLeft: space[4],
    paddingRight: space[2],
    gap: space[2],

    variants: {
        focused: {
            true: {
                borderWidth: 1.5,
                borderColor: '$primary',
                // The design's focus ring.
                shadowColor: '$primary',
                shadowOpacity: 0.17,
                shadowRadius: 3,
                shadowOffset: { width: 0, height: 0 },
            },
        },
        invalid: { true: { borderWidth: 1.5, borderColor: '$danger' } },
        disabled: { true: { opacity: 0.38 } },
        /** No trailing accessory — reclaim the right padding. */
        plain: { true: { paddingRight: space[4] } },
    } as const,
});

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
    // Tamagui adds a focus ring of its own; the shell owns that treatment.
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

    return (
        <YStack gap={space[2] - 2} testID={testID}>
            {label ? <Caption tone={error ? 'danger' : 'secondary'}>{label}</Caption> : null}

            <Shell focused={focused && !error} invalid={!!error} disabled={disabled} plain={!accessory} height={multiline ? undefined : FIELD_HEIGHT}>
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
                />
                {accessory}
            </Shell>

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
        <XStack gap={space[2]} testID={testID} accessibilityRole="radiogroup">
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
