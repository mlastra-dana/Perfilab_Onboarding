import { useMemo, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { DocumentRecord } from '../../app/types';
import { DOCUMENT_LABELS } from '../../app/state';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PdfPreview } from './PdfPreview';
import { ValidationItem } from './ValidationItem';

export function DocumentUploader({
  docRecord,
  loading,
  previewFile,
  onSelectFile
}: {
  docRecord: DocumentRecord;
  loading: boolean;
  previewFile?: File;
  onSelectFile: (file: File) => Promise<void>;
}) {
  const [dragOver, setDragOver] = useState(false);
  const fileAccept = useMemo(() => '.pdf,.png,.jpg,.jpeg,.webp', []);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    await onSelectFile(fileList[0]);
  }

  return (
    <Card className="space-y-4 animate-fadeUp">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900">{DOCUMENT_LABELS[docRecord.type]}</h3>
        <StatusBadge status={loading ? 'validating' : docRecord.validation.status} />
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label={`Subir ${DOCUMENT_LABELS[docRecord.type]}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={`rounded-xl border-2 border-dashed p-5 transition ${
          dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50'
        }`}
      >
        <div className="flex flex-col items-center gap-2 text-center text-sm text-slate-600">
          <UploadCloud className="h-6 w-6 text-brand-600" />
          <p>Arrastre y suelte su archivo aquí o selecciónelo manualmente.</p>
          <input
            type="file"
            accept={fileAccept}
            className="hidden"
            id={`input-${docRecord.type}`}
            onChange={(event) => {
              void handleFiles(event.target.files);
              event.currentTarget.value = '';
            }}
          />
          <Button variant="secondary" onClick={() => window.document.getElementById(`input-${docRecord.type}`)?.click()}>
            Seleccionar archivo
          </Button>
          <p className="text-xs text-slate-500">Solo PDF, JPG, PNG, WEBP. Máximo 10MB.</p>
        </div>
      </div>

      {docRecord.fileName ? (
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-sm font-medium text-slate-800">Archivo: {docRecord.fileName}</p>
          {docRecord.fileType?.includes('pdf') ? (
            previewFile ? (
              <PdfPreview file={previewFile} />
            ) : (
              <p className="text-xs text-slate-500">Vista previa disponible tras volver a cargar el archivo.</p>
            )
          ) : docRecord.previewUrl ? (
            <img src={docRecord.previewUrl} alt={`Vista previa de ${DOCUMENT_LABELS[docRecord.type]}`} className="max-h-56 rounded-lg" />
          ) : (
            <p className="text-xs text-slate-500">Vista previa no disponible.</p>
          )}
        </div>
      ) : null}

      <ul className="space-y-1 text-sm">
        {docRecord.validation.checks.length === 0 ? (
          <li className="text-slate-500">Aún no hay validaciones ejecutadas.</li>
        ) : (
          docRecord.validation.checks.map((check, idx) => {
            const status = check.passed ? (check.severity === 'warning' ? 'warn' : 'pass') : 'fail';
            return <ValidationItem key={`${check.label}-${idx}`} status={status} label={check.label} detail={check.details} />;
          })
        )}
      </ul>

      {docRecord.type === 'cedulaRepresentante' && docRecord.validation.extractedId ? (
        <p className="text-sm font-medium text-perfilabOrange">Cédula detectada: {docRecord.validation.extractedId}</p>
      ) : null}
    </Card>
  );
}
