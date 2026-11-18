import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import OrderTotal from '../src/components/OrderTotal';

jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({}) }));
jest.mock('../src/utils/format', () => ({ formatCurrency: (value) => String(value), numbersOnly: (value) => Number(String(value).replace(/[^0-9.]/g, '')) }));
jest.mock('../src/utils/math', () => ({ percentage: (a, b) => (a / 100) * b }));
jest.mock('tamagui', () => {
    const { Text, View } = require('react-native');
    return { Text, XStack: View, YStack: View, Separator: View, useTheme: () => ({}) };
});

const translations = { 'OrderTotal.subtotal': 'Sub', 'OrderTotal.deliveryFee': 'Fee', 'OrderTotal.deliveryTip': 'DTip', 'OrderTotal.tip': 'Tip', 'OrderTotal.total': 'Total' };
let mockLanguage = { ...translations };
jest.mock('../src/contexts/LanguageContext', () => ({ useLanguage: () => ({ t: (key) => mockLanguage[key] ?? key }) }));

const order = { getAttribute: (key) => ({ 'meta.currency': 'INR', 'meta.subtotal': 100, 'meta.delivery_fee': 10, 'meta.total': 110, 'meta.tip': 5 })[key] };

test('only the total row is bold, whatever language the row names are in', async () => {
    // "Total" is spelled the same as "Tip" in this language: comparing translated names would bold both.
    mockLanguage = { ...translations, 'OrderTotal.tip': 'Total' };
    let renderer;
    await ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(<OrderTotal order={order} />);
    });
    // The amount of each row is the Text whose children are an array; the row name is a plain string.
    const amountWeights = renderer.root.findAllByType(Text).filter((node) => Array.isArray(node.props.children)).map((node) => node.props.fontWeight);
    expect(amountWeights).toEqual(['normal', 'normal', 'normal', 'bold']);
});
