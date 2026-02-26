import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useOnboarding } from '../app/OnboardingContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

export function SuccessPage({ companyId }: { companyId: string }) {
  const { state } = useOnboarding();

  return (
    <Card className="mx-auto max-w-2xl text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-perfilabOrange" />
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Todo perfecto.</h1>
      <p className="mt-2 text-slate-600">
        Su documentación está en proceso de revisión final. Recibirá sus accesos en {state.tenant.slaHours} horas.
      </p>
      <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm font-medium text-brand-800">
        ID de registro: {state.submission.registrationId ?? 'No disponible'}
      </p>
      <div className="mt-6">
        <Link to={`/onboarding/${companyId}`}>
          <Button variant="secondary">Volver al inicio</Button>
        </Link>
      </div>
    </Card>
  );
}
