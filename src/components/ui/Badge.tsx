import { ValidationStatus } from '../../app/types';

type BadgeStatus = ValidationStatus | 'na';

const labelMap: Record<BadgeStatus, string> = {
  pending: 'Pendiente',
  validating: 'Validando',
  valid: 'Válido',
  error: 'Error',
  na: 'No aplica'
};

const colorMap: Record<BadgeStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  validating: 'border border-orange-200 bg-orange-50 text-perfilabOrangeDark',
  valid: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  error: 'bg-red-100 text-red-700',
  na: 'border border-slate-200 bg-slate-50 text-slate-600'
};

export function StatusBadge({ status }: { status: BadgeStatus }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${colorMap[status]}`}>{labelMap[status]}</span>;
}
