import { useState, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ScrollView, RefreshControl } from 'react-native';
import { Text, YStack, useTheme } from 'tamagui';
import { endOfYear, format, startOfYear, subDays } from 'date-fns';
import { useOrderManager } from '../contexts/OrderManagerContext';
import OrderCard from '../components/OrderCard';
import CalendarStrip from 'react-native-calendar-strip';

const DriverOrderManagementScreen = () => {
    const theme = useTheme();
    const navigation = useNavigation();
    const calendar = useRef();
    const { currentOrders, setCurrentDate, currentDate, reloadCurrentOrders, isFetchingCurrentOrders } = useOrderManager();
    const startingDate = subDays(new Date(currentDate), 2);
    const datesWhitelist = [new Date(), { start: startOfYear(new Date()), end: endOfYear(new Date()) }];

    return (
        <YStack flex={1} bg='$surface'>
            <YStack bg='$background' pb='$2'>
                <CalendarStrip
                    scrollable
                    ref={calendar}
                    datesWhitelist={datesWhitelist}
                    style={{ height: 100, paddingTop: 10, paddingBottom: 15 }}
                    calendarColor={'transparent'}
                    calendarHeaderStyle={{ color: theme['$gray-300'].val, fontSize: 14 }}
                    calendarHeaderContainerStyle={{ marginBottom: 20 }}
                    dateNumberStyle={{ color: theme['$gray-500'].val, fontSize: 12 }}
                    dateNameStyle={{ color: theme['$gray-500'].val, fontSize: 12 }}
                    dayContainerStyle={{ padding: 0, height: 60 }}
                    highlightDateNameStyle={{ color: theme['$gray-100'].val, fontSize: 12 }}
                    highlightDateNumberStyle={{ color: theme['$gray-100'].val, fontSize: 12 }}
                    highlightDateContainerStyle={{ backgroundColor: theme['$blue-500'].val, borderRadius: 6 }}
                    iconContainer={{ flex: 0.1 }}
                    numDaysInWeek={5}
                    startingDate={startingDate}
                    selectedDate={new Date(currentDate)}
                    onDateSelected={(selectedDate) => setCurrentDate(format(new Date(selectedDate), 'yyyy-MM-dd'))}
                    iconLeft={require('../../assets/nv-arrow-left.png')}
                    iconRight={require('../../assets/nv-arrow-right.png')}
                />
            </YStack>
            <ScrollView
                refreshControl={<RefreshControl refreshing={isFetchingCurrentOrders} onRefresh={reloadCurrentOrders} tintColor={theme.borderColor.val} />}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled={true}
            >
                <YStack py='$4' px='$2' space='$4'>
                    {currentOrders.map((order) => (
                        <OrderCard key={order.id} order={order} />
                    ))}
                </YStack>
            </ScrollView>
        </YStack>
    );
};

export default DriverOrderManagementScreen;
