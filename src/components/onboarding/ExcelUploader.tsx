import { ChangeEvent } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { ExcelValidationState } from '../../app/types';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Progress } from '../ui/Progress';
import { StatusBadge } from '../ui/Badge';

export function ExcelUploader({
  excel,
  loading,
  onSelect
}: {
  excel: ExcelValidationState;
  loading: boolean;
  onSelect: (file: File) => Promise<void>;
}) {
  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await onSelect(file);
    event.target.value = '';
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Carga de Excel masivo</h3>
        <StatusBadge status={loading ? 'validating' : excel.status} />
      </div>

      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-brand-300 bg-brand-50 p-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-6 w-6 text-brand-700" />
          <div>
            <p className="text-sm font-medium text-brand-900">Seleccione archivo .xlsx</p>
            <p className="text-xs text-brand-700">Se procesa localmente en su navegador.</p>
          </div>
        </div>
        <Button type="button" variant="secondary">
          Buscar
        </Button>
        <input type="file" accept=".xlsx" onChange={(e) => void handleChange(e)} className="hidden" />
      </label>

      {loading || excel.processedRows > 0 ? (
        <Progress
          value={excel.processedRows}
          max={Math.max(excel.totalRows, 1)}
          label={`Procesando fila ${excel.processedRows}/${excel.totalRows || '?'}`}
        />
      ) : null}

      {excel.totalRows > 0 ? (
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat label="Total" value={excel.totalRows} />
          <Stat label="Válidas" value={excel.validRows} />
          <Stat label="Inválidas" value={excel.invalidRows} />
          <Stat label="Estado" value={excel.status === 'valid' ? '100% OK' : 'Con errores'} />
        </div>
      ) : null}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}
