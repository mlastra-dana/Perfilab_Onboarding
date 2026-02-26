import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useOnboarding } from '../app/OnboardingContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { copyEmailToClipboard, openMailto } from '../lib/email/demoMail';
import { Toast } from '../components/ui/Toast';

export function SuccessPage({ companyId }: { companyId: string }) {
  const { state, resetOnboardingState } = useOnboarding();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const subject = state.submission.emailSubject ?? 'Perfilab | Onboarding recibido';
  const body = state.submission.emailBody ?? 'Reporte no disponible.';

  async function handleCopy() {
    await copyEmailToClipboard(subject, body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleBackHome() {
    resetOnboardingState();
    navigate(`/onboarding/${companyId}`);
  }

  return (
    <Card className="mx-auto max-w-3xl">
      <div className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-perfilabOrange" />
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Reporte listo para enviar</h1>
        <p className="mt-2 text-slate-600">El caso fue procesado y enviado por Cloud SMTP (demo local).</p>
        <p className="mt-4 rounded-lg bg-brand-50 p-3 text-sm font-medium text-brand-800">
          Tracking ID: {state.submission.registrationId ?? 'No disponible'}
        </p>
        <p className="mt-2 text-sm text-slate-600">Destino: {state.submission.emailTo ?? 'mlastra@danaconnect.com'}</p>
      </div>

      <div className="mt-6 space-y-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-500">Asunto</p>
          <p className="text-sm text-slate-800">{subject}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">Cuerpo</p>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-xs text-slate-700">{body}</pre>
        </div>
      </div>

      {copied ? <div className="mt-4"><Toast type="success" message="Correo copiado al portapapeles." /></div> : null}

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => openMailto(subject, body)}>
          Abrir correo
        </Button>
        <Button type="button" variant="secondary" onClick={() => void handleCopy()}>
          Copiar correo
        </Button>
        <Button type="button" onClick={handleBackHome}>
          Volver al inicio
        </Button>
      </div>
    </Card>
  );
}
