/** Account: fuel log and issues. */
import FuelLogScreen from '../../screens/FuelLogScreen';
import FuelReportScreen from '../../screens/FuelReportScreen';
import FuelReportCreateScreen from '../../screens/FuelReportCreateScreen';
import IssuesScreen from '../../screens/IssuesScreen';
import IssueDetailScreen from '../../screens/IssueDetailScreen';
import IssueCreateScreen from '../../screens/IssueCreateScreen';
import type { FuelReportRecord, IssueRecord } from '../../data';
import { useDriverId, useFocusCount, type Nav } from '../session';

export function FuelLog({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    const reloadToken = useFocusCount();
    return (
        <FuelLogScreen
            driverId={driverId}
            reloadToken={reloadToken}
            onOpenReport={({ report, previous }) => navigation.navigate('FuelReport', { report, previous })}
            onCreate={() => navigation.navigate('FuelReportCreate', {})}
        />
    );
}

export function FuelReport({ route }: { route: { params?: { report?: FuelReportRecord; previous?: FuelReportRecord } } }) {
    const report = route.params?.report;
    if (!report) return null;
    return <FuelReportScreen report={report} previous={route.params?.previous} />;
}

export function FuelReportCreate({ route, navigation }: { route: { params?: { last?: FuelReportRecord; currency?: string } }; navigation: Nav }) {
    const driverId = useDriverId();
    return (
        <FuelReportCreateScreen
            driverId={driverId}
            lastReport={route.params?.last}
            currency={route.params?.currency}
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

export function IssueCreate({ navigation }: { navigation: Nav }) {
    const driverId = useDriverId();
    return <IssueCreateScreen driverId={driverId} onDone={() => navigation.goBack()} />;
}
