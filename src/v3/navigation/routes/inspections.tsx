/** Account: vehicle inspections (E2–E5). */
import InspectionScreen from '../../screens/InspectionScreen';
import InspectionChecklistScreen from '../../screens/InspectionChecklistScreen';
import InspectionReviewScreen from '../../screens/InspectionReviewScreen';
import InspectionResultScreen from '../../screens/InspectionResultScreen';
import InspectionDetailScreen from '../../screens/InspectionDetailScreen';
import type { InspectionFormRecord, InspectionOrderContext, InspectionSubmissionRecord } from '../../data';
import { useAssignedVehicle, useFocusCount, type Nav } from '../session';

type InspectionParams = {
    /*
     * `order` is set when a step of an order needs the inspection: the screens
     * say which order and step, the submission carries the link, and the result
     * goes back to the order. These screens are registered under Jobs as well
     * as Account for that, since `navigate` resolves within the current stack.
     */
    route: { params?: { formId?: string; vehicleId?: string; vehicleName?: string; form?: InspectionFormRecord; afterSwap?: boolean; order?: InspectionOrderContext } };
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
            orderContext={p.order}
            onPause={navigation.goBack}
            onReview={(formId, vehicleId) => navigation.navigate('InspectionReview', { formId, vehicleId, form: p.form, vehicleName: p.vehicleName, order: p.order })}
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
            orderContext={p.order}
            onSubmitted={(outcome, _form, unsafe) => {
                if (outcome.kind === 'failed') return;
                const submission = outcome.kind === 'sent' ? outcome.submission : outcome.receipt;
                navigation.navigate('InspectionResult', { submission, vehicleName: p.vehicleName, unsafe, order: p.order });
            }}
        />
    );
}

export function InspectionResult({
    route,
    navigation,
}: {
    route: { params?: { submission?: InspectionSubmissionRecord; vehicleName?: string; unsafe?: boolean; order?: InspectionOrderContext } };
    navigation: Nav;
}) {
    const submission = route.params?.submission;
    const order = route.params?.order;
    if (!submission) return null;
    return (
        <InspectionResultScreen
            submission={submission}
            vehicleName={route.params?.vehicleName}
            unsafe={route.params?.unsafe}
            orderContext={order}
            // From an order the vehicle screens are under Account, not in this stack.
            onChooseVehicle={() => (order ? navigation.navigate('Account', { screen: 'ChangeVehicle', params: {}, initial: false }) : navigation.navigate('ChangeVehicle', {}))}
            onMessageDispatch={() => navigation.navigate('Inbox', { screen: 'NewConversation' })}
            // Back to the order, which is still in this stack: it takes the step by itself once.
            onDone={() => (order ? navigation.navigate('OrderDetail', { orderId: order.orderId }) : navigation.navigate('Inspection', {}))}
        />
    );
}

export function InspectionDetail({ route }: { route: { params?: { submissionId?: string; submission?: InspectionSubmissionRecord } } }) {
    return <InspectionDetailScreen submissionId={String(route.params?.submissionId ?? '')} seed={route.params?.submission} />;
}
