/**
 * One-time code entry: one box per digit.
 *
 * A single real text input sits invisibly over the boxes, so the system's code
 * autofill (the SMS suggestion above the keyboard), paste and backspace all
 * behave as they do in any field. The boxes only draw what it holds. They are
 * siblings of the input, never its ancestors, for the reason given in Field.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { XStack, YStack, useTheme } from 'tamagui';
import { Body, Caption, Micro } from './Text';
import { radius, space } from '../theme/tokens';

const BOX_HEIGHT = 56;

export interface CodeInputProps {
    label?: string;
    value: string;
    onChange: (code: string) => void;
    /** Called once when the last digit goes in. */
    onComplete?: (code: string) => void;
    length?: number;
    error?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    testID?: string;
}

export function CodeInput({ label, value, onChange, onComplete, length = 6, error, disabled, autoFocus, testID }: CodeInputProps) {
    const theme = useTheme();
    const inputRef = useRef<TextInput>(null);
    const [focused, setFocused] = useState(false);
    const completed = useRef('');

    useEffect(() => {
        if (value.length < length) completed.current = '';
    }, [value, length]);

    const handleChange = (text: string) => {
        const code = text.replace(/\D/g, '').slice(0, length);
        onChange(code);
        if (code.length === length && completed.current !== code) {
            completed.current = code;
            onComplete?.(code);
        }
    };

    // The box the next digit goes into; the last one once the code is full.
    const active = Math.min(value.length, length - 1);

    return (
        <YStack gap={space[2] - 2} testID={testID}>
            {label ? <Caption tone={error ? 'danger' : 'secondary'}>{label}</Caption> : null}

            <View>
                <XStack gap={space[2]} opacity={disabled ? 0.38 : 1}>
                    {Array.from({ length }, (_, index) => {
                        const isActive = focused && index === active;
                        return (
                            <View
                                key={index}
                                testID={testID ? `${testID}-box-${index}` : undefined}
                                style={{
                                    flex: 1,
                                    height: BOX_HEIGHT,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: radius.compact + 2,
                                    borderWidth: isActive || error ? 1.5 : 1,
                                    borderColor: (error ? theme.danger?.val : isActive ? theme.primary?.val : theme.border?.val) as string,
                                    backgroundColor: theme.surface?.val as string,
                                }}
                            >
                                <Body fontSize={24} fontWeight="700" tabular>
                                    {value[index] ?? ''}
                                </Body>
                            </View>
                        );
                    })}
                </XStack>

                {/* Over the boxes, so a tap anywhere on them focuses it. */}
                <Pressable style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} onPress={() => inputRef.current?.focus()} accessible={false}>
                    <TextInput
                        ref={inputRef}
                        value={value}
                        onChangeText={handleChange}
                        onFocus={() => setFocused(true)}
                        onBlur={() => setFocused(false)}
                        editable={!disabled}
                        autoFocus={autoFocus}
                        keyboardType="number-pad"
                        inputMode="numeric"
                        textContentType="oneTimeCode"
                        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
                        maxLength={length}
                        caretHidden
                        accessibilityLabel={label}
                        testID={testID ? `${testID}-input` : undefined}
                        // Invisible, but still the thing that is focused and typed into.
                        style={{ flex: 1, opacity: 0.011, color: 'transparent', fontSize: 1 }}
                    />
                </Pressable>
            </View>

            {error ? <Micro tone="danger">{error}</Micro> : null}
        </YStack>
    );
}

export default CodeInput;
