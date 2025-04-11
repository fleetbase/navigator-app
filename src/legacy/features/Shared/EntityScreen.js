import { Entity, Order } from '@fleetbase/sdk';
import { faBarcode, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import OrderStatusBadge from 'components/OrderStatusBadge';
import { format } from 'date-fns';
import { useFleetbase, useLocale, useMountedState } from 'hooks';
import React, { createRef, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import FastImage from 'react-native-fast-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import tailwind from 'tailwind';
import { formatCurrency, formatMetaValue, getColorCode, isEmpty, logError, titleize, translate } from 'utils';

const isObjectEmpty = (obj) => isEmpty(obj) || Object.values(obj).length === 0;

const EntityScreen = ({ navigation, route }) => {
    const { _entity, _order } = route.params;

    console.log('_entity', _entity);

    const insets = useSafeAreaInsets();
    const isMounted = useMountedState();
    const actionSheetRef = createRef();
    const fleetbase = useFleetbase();
    const internalInstance = useFleetbase('int/v1');
    const [locale] = useLocale();

    const [order, setOrder] = useState(new Order(_order, fleetbase.getAdapter()));
    const [entity, setEntity] = useState(new Entity(_entity, fleetbase.getAdapter()));
    const [isEntityFieldsEditable, setEntityFieldsEditable] = useState();
    const [isLoading, setIsLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const customer = entity.getAttribute('customer');

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', () => {
            refresh();
        });
    }, [isMounted]);

    const refresh = () => {
        setIsRefreshing(true);

        return entity
            .reload()
            .then(setEntity)
            .catch(logError)
            .finally(() => {
                setIsRefreshing(false);
            });
    };

    useEffect(() => {
        const adapter = internalInstance.getAdapter();
        adapter.get('fleet-ops/settings/entity-editing-settings').then((res) => {
            const editableEntityFields = res.isEntityFieldsEditable;
            setEntityFieldsEditable(editableEntityFields);
        });
    });

    return (
        <View style={[tailwind('bg-gray-800 h-full')]}>
            <View style={[tailwind('z-50 bg-gray-800 border-b border-gray-900 shadow-lg')]}>
                <View style={tailwind('flex flex-row items-start justify-between px-4 py-2 overflow-hidden')}>
                    <View style={tailwind('flex items-start')}>
                        <Text style={tailwind('text-xl font-semibold text-white')}>{entity.id}</Text>
                        <Text style={tailwind('text-gray-50')}>{entity.getAttribute('tracking_number.tracking_number')}</Text>
                    </View>
                    <View>
                        <TouchableOpacity onPress={() => navigation.goBack()} style={tailwind('')}>
                            <View style={tailwind('rounded-full bg-gray-900 w-10 h-10 flex items-center justify-center')}>
                                <FontAwesomeIcon icon={faTimes} style={tailwind('text-red-400')} />
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
            <ScrollView
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={getColorCode('text-blue-200')} />}
            >
                <View style={tailwind('flex w-full h-full pb-60')}>
                    <View style={tailwind('bg-gray-800')}>
                        <View>
                            <View style={tailwind('flex flex-col justify-center items-center w-full')}>
                                <FastImage source={{ uri: entity.getAttribute('photo_url') }} style={{ width: 150, height: 150, margin: 20 }} />
                                <Text style={tailwind('text-lg text-white')}>{entity.getAttribute('name')}</Text>
                                <Text style={tailwind('text-gray-100')}>{entity.getAttribute('description')}</Text>
                            </View>
                            <View style={tailwind('mb-4 mt-2 px-6')}>
                                <View style={tailwind('flex rounded-md bg-blue-900 border border-blue-700')}>
                                    <View style={tailwind('flex flex-row')}>
                                        <TouchableOpacity
                                            onPress={() => navigation.push('ProofScreen', { _entity: entity.serialize(), _order: order.serialize() })}
                                            style={tailwind('flex-1 px-3 py-2 flex items-center justify-center')}
                                        >
                                            <FontAwesomeIcon icon={faBarcode} style={tailwind('text-blue-50 mb-1')} />
                                            <Text style={tailwind('text-blue-50')}>Add Proof of Delivery</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </View>
                        </View>
                        <View style={tailwind('mt-2')}>
                            <View style={tailwind('flex flex-col items-center')}>
                                <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700')}>
                                    <View style={tailwind('flex flex-row items-center')}>
                                        <Text style={tailwind('font-semibold text-gray-100')}>Customer</Text>
                                    </View>
                                </View>
                                <View style={tailwind('w-full p-4')}>
                                    {customer ? (
                                        <View style={tailwind('flex flex-row')}>
                                            <View>
                                                <FastImage source={{ uri: customer.photo_url }} style={tailwind('w-14 h-14 mr-4 rounded-md')} />
                                            </View>
                                            <View>
                                                <Text style={tailwind('font-semibold text-gray-50')}>{customer.name}</Text>
                                                <Text style={tailwind('text-gray-50')}>{customer.phone}</Text>
                                                <Text style={tailwind('text-gray-50')}>{customer.email}</Text>
                                            </View>
                                        </View>
                                    ) : (
                                        <Text style={tailwind('text-gray-100')}>No Customer</Text>
                                    )}
                                </View>
                            </View>
                        </View>
                        <View style={tailwind('mt-2')}>
                            <View style={tailwind('flex flex-col items-center')}>
                                <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700 mb-1')}>
                                    <View style={tailwind('flex flex-row items-center')}>
                                        <Text style={tailwind('font-semibold text-gray-100')}>Details</Text>
                                    </View>
                                </View>
                                <View style={tailwind('w-full py-2')}>
                                    <View style={tailwind('flex flex-row items-center justify-between pb-1 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Tracking Number</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{entity.getAttribute('tracking_number.tracking_number')}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Name</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{entity.getAttribute('name') ?? 'None'}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Status</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <OrderStatusBadge status={entity.getAttribute('status') ?? 'created'} style={tailwind('px-3 py-0.5')} />
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>SKU</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{entity.getAttribute('sku') ?? 'None'}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Internal ID</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{entity.getAttribute('internal_id')}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Type</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{entity.getAttribute('type') ?? 'entity'}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Weight</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>
                                                {entity.isAttributeFilled('weight') ? `${entity.getAttribute('weight')} ${entity.getAttribute('weight_unit')}` : 'N/A'}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Dimensions (L x W x H)</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>
                                                {entity.getAttribute('length', 0) ?? 0} x {entity.getAttribute('width', 0) ?? 0} x {entity.getAttribute('height', 0) ?? 0}{' '}
                                                {entity.getAttribute('dimensions_unit')}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Date Created</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{entity.createdAt ? format(entity.createdAt, 'PPpp') : 'None'}</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                        <View style={tailwind('mt-2')}>
                            <View style={tailwind('flex flex-col items-center')}>
                                <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700 mb-1')}>
                                    <View style={tailwind('flex flex-row items-center')}>
                                        <Text style={tailwind('font-semibold text-gray-100')}>Value</Text>
                                    </View>
                                </View>
                                <View style={tailwind('w-full py-2')}>
                                    <View style={tailwind('flex flex-row items-center justify-between pb-1 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Price</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{formatCurrency((entity.getAttribute('price') ?? 0) / 100, entity.getAttribute('currency'))}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Sales Price</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>{formatCurrency((entity.getAttribute('sale_price') ?? 0) / 100, entity.getAttribute('currency'))}</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Declared Value</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100')}>
                                                {formatCurrency((entity.getAttribute('declared_value') ?? 0) / 100, entity.getAttribute('currency'))}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                        <View style={tailwind('flex-1')}>
                                            <Text style={tailwind('text-gray-100')}>Currency</Text>
                                        </View>
                                        <View style={tailwind('flex-1 flex-col items-end')}>
                                            <Text style={tailwind('text-gray-100 uppercase')}>{entity.getAttribute('currency')}</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </View>
                        {!isObjectEmpty(entity.meta) && (
                            <View style={tailwind('mt-2')}>
                                <View style={tailwind('flex flex-col items-center')}>
                                    <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700 mb-1')}>
                                        <View style={tailwind('flex flex-row items-center')}>
                                            <Text style={tailwind('font-semibold text-gray-100')}>More Details</Text>
                                        </View>
                                    </View>
                                    <View style={tailwind('w-full py-2 -mt-1')}>
                                        {Object.keys(entity.meta).map((key, index) => (
                                            <View key={index} style={tailwind('flex flex-row items-center justify-between py-2 px-3')}>
                                                <View style={tailwind('flex-1')}>
                                                    <Text style={tailwind('text-gray-100')}>{titleize(key)}</Text>
                                                </View>
                                                <View style={tailwind('flex-1 flex-col items-end')}>
                                                    <Text style={tailwind('text-gray-100')}>{formatMetaValue(entity.meta[key])}</Text>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            </View>
                        )}
                        <View style={tailwind('mt-2')}>
                            <View style={tailwind('flex flex-col items-center')}>
                                <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700')}>
                                    <View style={tailwind('flex flex-row items-center')}>
                                        <Text style={tailwind('font-semibold text-gray-100')}>Notes</Text>
                                    </View>
                                </View>
                                <View style={tailwind('w-full p-4')}>
                                    <Text style={tailwind('text-gray-100')}>{entity.getAttribute('notes') ?? 'None'}</Text>
                                </View>
                            </View>
                        </View>
                        <View style={tailwind('mt-2')}>
                            <View style={tailwind('flex flex-col items-center')}>
                                <View style={tailwind('flex flex-row items-center justify-between w-full p-4 border-t border-b border-gray-700')}>
                                    <View style={tailwind('flex flex-row items-center')}>
                                        <Text style={tailwind('font-semibold text-gray-100')}>QR Code/ Barcode</Text>
                                    </View>
                                </View>
                                <View style={tailwind('w-full p-4 flex flex-row items-center justify-center')}>
                                    <View style={tailwind('p-2 rounded-md bg-white mr-4')}>
                                        <FastImage style={tailwind('w-18 h-18')} source={{ uri: `data:image/png;base64,${entity.getAttribute('tracking_number.qr_code')}` }} />
                                    </View>
                                    <View style={tailwind('p-2 rounded-md bg-white')}>
                                        <FastImage style={tailwind('w-40 h-18')} source={{ uri: `data:image/png;base64,${entity.getAttribute('tracking_number.barcode')}` }} />
                                    </View>
                                </View>
                            </View>
                        </View>
                        {isEntityFieldsEditable ? (
                            <TouchableOpacity
                                onPress={() => {
                                    navigation.navigate('SettingsScreen', { data: entity.getAttributes() });
                                }}
                                disabled={isLoading}
                                style={tailwind('flex py-2 px-2')}
                            >
                                <View style={tailwind('btn bg-gray-900 border border-gray-700 mt-6 ')}>
                                    <Text style={tailwind('font-semibold text-lg text-gray-50 text-center')}>{translate('Core.SettingsScreen.update')}</Text>
                                </View>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                </View>
            </ScrollView>
        </View>
    );
};

export default EntityScreen;
