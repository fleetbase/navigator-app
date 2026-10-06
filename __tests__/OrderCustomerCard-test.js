import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';

const mockNavigation = {
    navigate: jest.fn(),
    getState: jest.fn(() => ({ routeNames: ['DriverOrderManagement', 'Order'] })),
    getParent: jest.fn(() => mockTabNavigation),
};
const mockTabNavigation = {
    getState: jest.fn(() => ({ routeNames: ['DriverTaskTab', 'DriverChatTab'] })),
    getParent: jest.fn(() => undefined),
};
const mockChat = {
    getOrderChannel: jest.fn(),
    setCurrentChannel: jest.fn(),
};
const mockToast = { info: jest.fn(), error: jest.fn() };

jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));
jest.mock('../src/contexts/ChatContext', () => ({ useChat: () => mockChat }));
jest.mock('../src/utils/toast', () => ({ toast: mockToast }));
jest.mock('react-native-fast-image', () => 'FastImage');
jest.mock('@fortawesome/react-native-fontawesome', () => ({ FontAwesomeIcon: () => null }));
jest.mock('tamagui', () => {
    const React = require('react');
    const { View, Text, Pressable } = require('react-native');
    const passthrough = ({ children }) => React.createElement(View, null, children);
    const Button = ({ children, onPress, disabled }) => React.createElement(Pressable, { onPress, disabled, testID: 'button' }, children);
    Button.Icon = passthrough;
    Button.Text = ({ children }) => React.createElement(Text, null, children);
    const Avatar = passthrough;
    Avatar.Image = () => null;
    return {
        YStack: passthrough,
        XStack: passthrough,
        Separator: () => null,
        Text: ({ children }) => React.createElement(Text, null, children),
        Avatar,
        Button,
        useTheme: () => ({ infoText: { val: '#000' } }),
    };
});

const OrderCustomerCard = require('../src/components/OrderCustomerCard').default;

const customer = { id: 'customer_1', name: 'Jane Customer' };
const storefrontOrder = {
    id: 'order_mine',
    getAttribute: (key) => ({ uuid: 'uuid-mine', public_id: 'order_mine', meta: { storefront_id: 'store_1' } })[key],
};
const regularOrder = {
    id: 'order_plain',
    getAttribute: (key) => ({ uuid: 'uuid-plain', public_id: 'order_plain', meta: {} })[key],
};

async function render(props) {
    let renderer;
    await ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(<OrderCustomerCard customer={customer} {...props} />);
    });
    return renderer;
}

function findChatButton(renderer) {
    return renderer.root
        .findAll((node) => node.props.testID === 'button' && typeof node.props.onPress === 'function')
        .find((node) => node.findAllByType(Text).some((text) => text.props.children === 'Chat'));
}

function buttonLabels(renderer) {
    return renderer.root.findAllByType(Text).map((node) => node.props.children);
}

beforeEach(() => {
    jest.clearAllMocks();
});

test('hides the chat button for orders that are not storefront orders', async () => {
    expect(buttonLabels(await render({ order: regularOrder }))).not.toContain('Chat');
    expect(buttonLabels(await render({ order: null }))).not.toContain('Chat');
});

test('hides the chat button when the chat tab is not enabled', async () => {
    mockTabNavigation.getState.mockReturnValueOnce({ routeNames: ['DriverTaskTab'] });
    expect(buttonLabels(await render({ order: storefrontOrder }))).not.toContain('Chat');
});

test('opens the order chat channel when it exists', async () => {
    const channel = { id: 'chat_mine', meta: { storefront_order_uuid: 'uuid-mine' } };
    mockChat.getOrderChannel.mockResolvedValue(channel);

    const renderer = await render({ order: storefrontOrder });
    expect(buttonLabels(renderer)).toContain('Chat');

    await ReactTestRenderer.act(() => findChatButton(renderer).props.onPress());

    expect(mockChat.getOrderChannel).toHaveBeenCalledWith(storefrontOrder);
    expect(mockChat.setCurrentChannel).toHaveBeenCalledWith(channel);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('DriverChatTab', { screen: 'ChatChannel', params: { channel }, initial: false });
    expect(mockToast.info).not.toHaveBeenCalled();
});

test('shows a message instead of navigating when the order has no chat channel yet', async () => {
    mockChat.getOrderChannel.mockResolvedValue(null);

    const renderer = await render({ order: storefrontOrder });
    await ReactTestRenderer.act(() => findChatButton(renderer).props.onPress());

    expect(mockToast.info).toHaveBeenCalledWith('Chat with this customer is not available for this order yet.');
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
    expect(mockChat.setCurrentChannel).not.toHaveBeenCalled();
});

test('shows an error when looking up the channel fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockChat.getOrderChannel.mockRejectedValue(new Error('network'));

    const renderer = await render({ order: storefrontOrder });
    await ReactTestRenderer.act(() => findChatButton(renderer).props.onPress());

    expect(mockToast.error).toHaveBeenCalledWith('Unable to open chat for this order.');
    expect(mockNavigation.navigate).not.toHaveBeenCalled();
});
