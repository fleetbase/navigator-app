/** Account: vehicle inspections (E2–E5). */
import InspectionScreen from '../../screens/InspectionScreen';
import InspectionChecklistScreen from '../../screens/InspectionChecklistScreen';
import InspectionReviewScreen from '../../screens/InspectionReviewScreen';
import InspectionResultScreen from '../../screens/InspectionResultScreen';
import InspectionDetailScreen from '../../screens/InspectionDetailScreen';
import type { InspectionFormRecord, InspectionSubmissionRecord } from '../../data';
import { useAssignedVehicle, useFocusCount, type Nav } from '../session';

type InspectionParams = {
    route: { params?: { formId?: string; vehicleId?: string; vehicleName?: string; form?: InspectionFormRecord; afterSwap?: boolean } };
    navigation: Nav;
};

export function Inspection({ route, navigation }: InspectionParams) {
    const { driverId, vehicleId, vehicleName } = useAssignedVehicle();
    const reloadToken = useFocusCount();
    return (
        <InspectionScreen
            driverId={driverId}
            vehicleId={route.params?.vehicleId ?? vehicleId}
            vehicleName={route.params?.vehicleName ?? vehicleName}
            afterSwap={route.params?.afterSwap}
            reloadToken={reloadToken}
            onStart={(form, forVehicle) =>
                navigation.navigate('InspectionChecklist', { formId: form.id, form, vehicleId: forVehicle, vehicleName: route.params?.vehicleName ?? vehicleName })
            }
            onOpenSubmission={(submission) => navigation.navigate('InspectionDetail', { submissionId: submission.id, submission })}
        />
    );
}

export function InspectionChecklist({ route, navigation }: InspectionParams) {
    const p = route.params ?? {};
    return (
        <InspectionChecklistScreen
            formId={String(p.formId ?? '')}
            vehicleId={p.vehicleId}
            vehicleName={p.vehicleName}
            seedForm={p.form}
            onPause={navigation.goBack}
            onReview={(formId, vehicleId) => navigation.navigate('InspectionReview', { formId, vehicleId, form: p.form, vehicleName: p.vehicleName })}
        />
    );
}

export function InspectionReview({ route, navigation }: InspectionParams) {
    const p = route.params ?? {};
    const { driverId, driver, odometer } = useAssignedVehicle();
    const odometerSeed = Number(odometer);
    return (
        <InspectionReviewScreen
            formId={String(p.formId ?? '')}
            vehicleId={p.vehicleId}
            vehicleName={p.vehicleName}
            driverId={driverId}
            driverName={driver?.name ?? undefined}
            seedForm={p.form}
            odometerSeed={Number.isFinite(odometerSeed) ? odometerSeed : undefined}
            onSubmitted={(outcome, _form, unsafe) => {
                if (outcome.kind === 'failed') return;
                const submission = outcome.kind === 'sent' ? outcome.submission : outcome.receipt;
                navigation.navigate('InspectionResult', { submission, vehicleName: p.vehicleName, unsafe });
            }}
        />
    );
}

export function InspectionResult({
    route,
    navigation,
}: {
    route: { params?: { submission?: InspectionSubmissionRecord; vehicleName?: string; unsafe?: boolean } };
    navigation: Nav;
}) {
    const submission = route.params?.submission;
    if (!submission) return null;
    return (
        <InspectionResultScreen
            submission={submission}
            vehicleName={route.params?.vehicleName}
            unsafe={route.params?.unsafe}
            onChooseVehicle={() => navigation.navigate('ChangeVehicle', {})}
            onMessageDispatch={() => navigation.navigate('Inbox', { screen: 'NewConversation' })}
            onDone={() => navigation.navigate('Inspection', {})}
        />
    );
}

export function InspectionDetail({ route }: { route: { params?: { submissionId?: string; submission?: InspectionSubmissionRecord } } }) {
    return <InspectionDetailScreen submissionId={String(route.params?.submissionId ?? '')} seed={route.params?.submission} />;
}
