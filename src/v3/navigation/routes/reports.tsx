/** Account: fuel log and issues. */
import FuelLogScreen from '../../screens/FuelLogScreen';
import FuelReportScreen from '../../screens/FuelReportScreen';
import FuelReportCreateScreen from '../../screens/FuelReportCreateScreen';
import IssuesScreen from '../../screens/IssuesScreen';
import IssueDetailScreen from '../../screens/IssueDetailScreen';
import IssueCreateScreen from '../../screens/IssueCreateScreen';
import { vehicleOf, type FuelReportRecord, type IssueRecord } from '../../data';
import { useAssignedVehicle, useDriverId, useFocusCount, type Nav } from '../session';

export function FuelLog({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const reloadToken = useFocusCount();
    return (
        <FuelLogScreen
            driverId={driverId}
            reloadToken={reloadToken}
            onOpenReport={({ report, previous }) => navigation.navigate('FuelReport', { report, previous })}
            // The newest fill goes along so the form can check the odometer against it.
            onCreate={({ last }) => navigation.navigate('FuelReportCreate', { last })}
        />
    );
}

export function FuelReport({ route }: { route: { params?: { report?: FuelReportRecord; previous?: FuelReportRecord } } }) {
    const report = route.params?.report;
    if (!report) return null;
    return <FuelReportScreen report={report} previous={route.params?.previous} />;
}

export function FuelReportCreate({ route, navigation }: { route: { params?: { last?: FuelReportRecord; currency?: string } }; navigation: Nav }) {
    const { driverId, driver, vehicleId, vehicleName } = useAssignedVehicle();
    const last = route.params?.last;
    return (
        <FuelReportCreateScreen
            driverId={driverId}
            // The server files the report against the driver's assigned vehicle, so
            // a previous fill only means anything if it was on that same vehicle.
            lastReport={last && (!last.vehicle?.id || !vehicleId || last.vehicle.id === vehicleId) ? last : undefined}
            // The driver's own currency (the Driver resource falls back to their
            // country's); without it every cost was filed as US dollars.
            currency={route.params?.currency ?? driver?.currency ?? undefined}
            vehicleName={vehicleName}
            plate={vehicleOf(driver)?.plate_number}
            onDone={() => navigation.goBack()}
        />
    );
}

export function Issues({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const reloadToken = useFocusCount();
    return (
        <IssuesScreen
            driverId={driverId}
            reloadToken={reloadToken}
            onOpenIssue={(issue) => navigation.navigate('IssueDetail', { issue })}
            onCreate={() => navigation.navigate('IssueCreate', {})}
        />
    );
}

export function IssueDetail({ route }: { route: { params?: { issue?: IssueRecord } } }) {
    const issue = route.params?.issue;
    if (!issue) return null;
    return <IssueDetailScreen issue={issue} />;
}

export function IssueCreate({ route, navigation }: { route: { params?: { about?: string } }; navigation: Nav }) {
    const { driverId, vehicleName } = useAssignedVehicle();
    return <IssueCreateScreen driverId={driverId} initialType={route.params?.about} vehicleName={vehicleName} onDone={() => navigation.goBack()} />;
}
