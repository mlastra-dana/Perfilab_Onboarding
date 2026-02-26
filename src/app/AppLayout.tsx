import { Stepper } from '../components/onboarding/Stepper';
import { TenantConfig } from '../data/tenants';
import { PerfilabHeader } from '../components/brand/PerfilabHeader';
import { WhatsAppWidget } from '../components/brand/WhatsAppWidget';

export function AppLayout({
  tenant,
  currentStep,
  children
}: {
  tenant: TenantConfig;
  currentStep: number;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#f7f7f7] text-perfilabDark" style={{ ['--tenant-brand' as string]: tenant.brandColor ?? '#F28C28' }}>
      <PerfilabHeader tenantName={tenant.name} logoUrl={tenant.logoUrl} phone={tenant.phone} companyId={tenant.companyId} />

      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6">
        <Stepper currentStep={currentStep} />
        {children}
      </main>

      <WhatsAppWidget whatsAppNumber={tenant.whatsAppNumber} />
    </div>
  );
}
