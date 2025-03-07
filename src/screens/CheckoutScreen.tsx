import React from 'react';
import { navigatorConfig } from '../utils';
import QPayCheckoutScreen from './QPayCheckoutScreen';
import StripeCheckoutScreen from './StripeCheckoutScreen';
import PaypalCheckoutScreen from './PaypalCheckoutScreen';
import { StripeCheckoutProvider } from '../contexts/StripeCheckoutContext';

const CheckoutScreen = () => {
    if (navigatorConfig('paymentGateway') === 'stripe') {
        return (
            <StripeCheckoutProvider>
                <StripeCheckoutScreen />
            </StripeCheckoutProvider>
        );
    }

    if (navigatorConfig('paymentGateway') === 'qpay') {
        return <QPayCheckoutScreen />;
    }

    if (navigatorConfig('paymentGateway') === 'paypal') {
        return <PaypalCheckoutScreen />;
    }
};

export default CheckoutScreen;
