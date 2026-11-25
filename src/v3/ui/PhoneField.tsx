/**
 * Phone number entry with a country code picker.
 *
 * The value is the whole number in international form (`+6581000001`), which is
 * what the sign-in routes take. The driver picks a country and types the rest;
 * pasting or typing a number that already starts with `+` selects its country.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { XStack } from 'tamagui';
import { countries, getEmojiFlag, type TCountryCode } from 'countries-list';
import { Field } from './Field';
import { Body } from './Text';
import BottomSheetSelect, { type BottomSheetSelectRef } from './Select';
import { space } from '../theme/tokens';
import { useTranslation } from '../i18n/useTranslation';

interface CountryOption {
    code: string;
    dial: string;
    label: string;
    [key: string]: unknown;
}

const COUNTRY_OPTIONS: CountryOption[] = (Object.entries(countries) as [TCountryCode, (typeof countries)[TCountryCode]][])
    .filter(([, country]) => country.phone.length > 0)
    .map(([code, country]) => {
        const dial = String(country.phone[0]);
        return { code, dial, label: `${getEmojiFlag(code)}  ${country.name} (+${dial})` };
    })
    .sort((a, b) => a.label.slice(4).localeCompare(b.label.slice(4)));

const BY_CODE = new Map(COUNTRY_OPTIONS.map((option) => [option.code, option]));

// Longest code first, so +1242 (Bahamas) is tried before +1.
const BY_DIAL_LENGTH = [...COUNTRY_OPTIONS].sort((a, b) => b.dial.length - a.dial.length);

/** The device's region, when the platform can say. */
function deviceCountry(): string | undefined {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const localize = require('react-native-localize') as { getCountry?: () => string };
        return localize.getCountry?.();
    } catch {
        return undefined;
    }
}

/** Splits an international number into its country and the rest. */
export function splitPhone(value?: string, preferred?: string): { country?: CountryOption; local: string } {
    const digits = (value ?? '').replace(/\D/g, '');
    if (!(value ?? '').trim().startsWith('+') || !digits) return { local: digits };
    // Several countries share a code (+1, +44, +7): keep the one already chosen.
    const chosen = preferred ? BY_CODE.get(preferred) : undefined;
    const country = chosen && digits.startsWith(chosen.dial) ? chosen : BY_DIAL_LENGTH.find((option) => digits.startsWith(option.dial));
    return country ? { country, local: digits.slice(country.dial.length) } : { local: digits };
}

/** `+<code><number>`, without the leading zero a national number is written with. */
export function joinPhone(dial: string, local: string): string {
    const digits = local.replace(/\D/g, '').replace(/^0+/, '');
    return digits ? `+${dial}${digits}` : '';
}

export interface PhoneFieldProps {
    label?: string;
    /** International form, e.g. `+6581000001`. */
    value?: string;
    onChange?: (value: string) => void;
    /** ISO country code to start on; the device's region when omitted. */
    defaultCountry?: string;
    error?: string;
    hint?: string;
    disabled?: boolean;
    onBlur?: () => void;
    testID?: string;
}

export function PhoneField({ label, value, onChange, defaultCountry, error, hint, disabled, onBlur, testID }: PhoneFieldProps) {
    const { t } = useTranslation();
    const pickerRef = useRef<BottomSheetSelectRef>(null);
    const initial = useMemo(() => splitPhone(value), []); // eslint-disable-line react-hooks/exhaustive-deps
    const [country, setCountry] = useState<CountryOption>(
        () => initial.country ?? BY_CODE.get((defaultCountry ?? deviceCountry() ?? 'US').toUpperCase()) ?? (BY_CODE.get('US') as CountryOption)
    );
    const [local, setLocal] = useState(initial.local);

    const handleText = useCallback(
        (text: string) => {
            // A pasted or autofilled international number picks its own country.
            if (text.trim().startsWith('+')) {
                const parsed = splitPhone(text, country.code);
                if (parsed.country) {
                    setCountry(parsed.country);
                    setLocal(parsed.local);
                    onChange?.(joinPhone(parsed.country.dial, parsed.local));
                    return;
                }
            }
            const next = text.replace(/[^\d\s()-]/g, '');
            setLocal(next);
            onChange?.(joinPhone(country.dial, next));
        },
        [country, onChange]
    );

    const handleCountry = useCallback(
        (code: unknown) => {
            const next = BY_CODE.get(String(code));
            if (!next) return;
            setCountry(next);
            onChange?.(joinPhone(next.dial, local));
        },
        [local, onChange]
    );

    return (
        <>
            <Field
                label={label}
                value={local}
                onChangeText={handleText}
                onBlur={onBlur}
                keyboardType="phone-pad"
                autoComplete="tel"
                tabular
                error={error}
                hint={hint}
                disabled={disabled}
                testID={testID}
                leading={
                    <XStack
                        onPress={disabled ? undefined : () => pickerRef.current?.openBottomSheet()}
                        alignItems="center"
                        gap={space[1]}
                        paddingEnd={space[3]}
                        marginEnd={space[1]}
                        height="100%"
                        borderEndWidth={1}
                        borderColor="$border"
                        pressStyle={{ opacity: 0.6 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('ui.phone.changeCountry', { country: countries[country.code as TCountryCode]?.name ?? country.code })}
                        testID={testID ? `${testID}-country` : undefined}
                    >
                        <Body fontSize={18}>{getEmojiFlag(country.code as TCountryCode)}</Body>
                        <Body fontSize={16} fontWeight="600" tabular>
                            +{country.dial}
                        </Body>
                        <Body fontSize={11} tone="secondary">
                            ▾
                        </Body>
                    </XStack>
                }
            />
            <BottomSheetSelect
                ref={pickerRef}
                virtual
                value={country.code}
                options={COUNTRY_OPTIONS}
                optionValue="code"
                optionLabel="label"
                onSelect={handleCountry}
                title={t('ui.phone.countryTitle')}
                searchPlaceholder={t('ui.phone.countrySearch')}
                testID={testID ? `${testID}-countries` : undefined}
            />
        </>
    );
}

export default PhoneField;
