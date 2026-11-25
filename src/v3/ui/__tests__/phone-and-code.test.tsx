import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { TamaguiProvider, Theme } from 'tamagui';
import config from '../../theme';
import { CodeInput } from '../CodeInput';
import { joinPhone, splitPhone } from '../PhoneField';
import { decodePolyline } from '../../data/routeGeo';

describe('phone number parts', () => {
    it('joins a country code and a national number, dropping the national leading zero', () => {
        expect(joinPhone('65', '8100 0001')).toBe('+6581000001');
        expect(joinPhone('44', '07700 900123')).toBe('+447700900123');
        expect(joinPhone('1', '(980) 934-1969')).toBe('+19809341969');
        expect(joinPhone('65', '')).toBe('');
    });

    it('finds the country of an international number, longest code first', () => {
        expect(splitPhone('+6581000001')).toMatchObject({ country: { code: 'SG', dial: '65' }, local: '81000001' });
        // +1242 is the Bahamas, not the United States with a number starting 242.
        expect(splitPhone('+12425550100').country?.dial).toBe('1242');
        expect(splitPhone('+447700900123').local).toBe('7700900123');
    });

    it('keeps the chosen country when several share a code', () => {
        expect(splitPhone('+14165550100', 'CA').country?.code).toBe('CA');
        expect(splitPhone('+6581000001', 'CA').country?.code).toBe('SG');
    });

    it('leaves a number without a plus as the national part', () => {
        expect(splitPhone('81000001')).toEqual({ local: '81000001' });
        expect(splitPhone('')).toEqual({ local: '' });
    });
});

describe('decodePolyline', () => {
    it('decodes the reference polyline', () => {
        // Google's documented example.
        expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
            { latitude: 38.5, longitude: -120.2 },
            { latitude: 40.7, longitude: -120.95 },
            { latitude: 43.252, longitude: -126.453 },
        ]);
    });

    it('draws nothing for a missing or unreadable route', () => {
        expect(decodePolyline(null)).toEqual([]);
        expect(decodePolyline('')).toEqual([]);
        // A precision-6 string read as precision 5 leaves the globe.
        expect(decodePolyline('_izlhA~rlgdF_{geC~ywl@')).toEqual([]);
    });
});

describe('CodeInput', () => {
    async function mount(node: React.ReactNode) {
        let tree: ReactTestRenderer.ReactTestRenderer;
        await ReactTestRenderer.act(async () => {
            tree = ReactTestRenderer.create(
                <TamaguiProvider config={config} defaultTheme="light">
                    <Theme name="light">{node}</Theme>
                </TamaguiProvider>
            );
        });
        // @ts-expect-error assigned inside act
        return tree as ReactTestRenderer.ReactTestRenderer;
    }

    function Harness({ onComplete }: { onComplete: (code: string) => void }) {
        const [value, setValue] = React.useState('');
        return <CodeInput value={value} onChange={setValue} onComplete={onComplete} testID="code" />;
    }

    it('keeps digits only, to its length, and reports the full code once', async () => {
        const onComplete = jest.fn();
        const t = await mount(<Harness onComplete={onComplete} />);
        const input = () => t.root.findAll((n) => n.props?.testID === 'code-input')[0];
        const typeText = (text: string) => ReactTestRenderer.act(() => input().props.onChangeText(text));

        typeText('12a3');
        expect(input().props.value).toBe('123');
        expect(onComplete).not.toHaveBeenCalled();

        typeText('1234567890');
        expect(input().props.value).toBe('123456');
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(onComplete).toHaveBeenCalledWith('123456');

        // The same code again is not a second completion; a corrected one is.
        typeText('123456');
        expect(onComplete).toHaveBeenCalledTimes(1);
        typeText('12345');
        typeText('123457');
        expect(onComplete).toHaveBeenCalledTimes(2);

        expect(t.root.findAll((n) => typeof n.props?.testID === 'string' && /^code-box-\d$/.test(n.props.testID) && typeof n.type !== 'string')).toHaveLength(6);
        ReactTestRenderer.act(() => t.unmount());
    });
});
