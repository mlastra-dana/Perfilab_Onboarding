import { Navigate, useLocation, useParams } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { getTenantByCompanyId } from '../data/tenants';
import { OnboardingProvider } from './OnboardingContext';
import { WelcomePage } from '../pages/WelcomePage';
import { DocumentsPage } from '../pages/DocumentsPage';
import { ExcelPage } from '../pages/ExcelPage';
import { ReviewPage } from '../pages/ReviewPage';
import { SuccessPage } from '../pages/SuccessPage';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

function resolveStep(segment?: string) {
  switch (segment) {
    case undefined:
    case '':
      return { step: 1, key: 'welcome' };
    case 'documents':
      return { step: 2, key: 'documents' };
    case 'excel':
      return { step: 3, key: 'excel' };
    case 'review':
      return { step: 4, key: 'review' };
    case 'success':
      return { step: 4, key: 'success' };
    default:
      return { step: 1, key: 'notfound' };
  }
}

export function OnboardingFlow() {
  const params = useParams<{ companyId?: string; step?: string }>();
  const location = useLocation();

  const queryCompanyId = new URLSearchParams(location.search).get('companyId');
  const companyId = params.companyId ?? queryCompanyId ?? '';

  if (!params.companyId && queryCompanyId) {
    return <Navigate to={`/onboarding/${queryCompanyId}`} replace />;
  }

  if (!companyId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Falta el identificador de empresa</h1>
          <p className="mt-2 text-slate-600">Use la ruta `/onboarding/:companyId` o `?companyId=` para iniciar.</p>
        </Card>
      </div>
    );
  }

  const tenant = getTenantByCompanyId(companyId);

  if (!tenant) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Empresa no registrada</h1>
          <p className="mt-2 text-slate-600">No encontramos el `companyId` `{companyId}` en el tenant registry.</p>
          <a href="https://wa.me/584128194750" target="_blank" rel="noreferrer" className="mt-4 inline-block">
            <Button>Contactar soporte</Button>
          </a>
        </Card>
      </div>
    );
  }

  const segment = location.pathname.split('/')[3];
  const { step, key } = resolveStep(segment);

  return (
    <OnboardingProvider companyId={companyId} tenant={tenant}>
      <AppLayout tenant={tenant} currentStep={step}>
        {key === 'welcome' ? <WelcomePage tenant={tenant} companyId={companyId} /> : null}
        {key === 'documents' ? <DocumentsPage companyId={companyId} /> : null}
        {key === 'excel' ? <ExcelPage companyId={companyId} /> : null}
        {key === 'review' ? <ReviewPage companyId={companyId} /> : null}
        {key === 'success' ? <SuccessPage companyId={companyId} /> : null}
        {key === 'notfound' ? (
          <Card className="text-center">
            <h1 className="text-xl font-bold text-slate-900">Paso no encontrado</h1>
            <p className="mt-2 text-slate-600">La ruta no corresponde a un paso válido del onboarding.</p>
          </Card>
        ) : null}
      </AppLayout>
    </OnboardingProvider>
  );
}
