import TabSwitch from './TabSwitch';
import { navigatorConfig } from '../utils';

const CheckoutPickupSwitch = ({ onChange }) => {
    const prioritizePickup = navigatorConfig('prioritizePickup');
    const receivingOptions = [
        { label: 'Delivery', value: 'delivery' },
        { label: 'Pickup', value: 'pickup' },
    ];

    if (prioritizePickup) {
        receivingOptions.reverse();
    }

    const handleTabChange = (value) => {
        const isPickup = value === 'pickup';
        if (typeof onChange === 'function') {
            onChange(isPickup);
        }
    };

    return <TabSwitch options={receivingOptions} onTabChange={handleTabChange} />;
};

export default CheckoutPickupSwitch;
