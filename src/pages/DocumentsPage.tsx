import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DocumentType } from '../app/types';
import { useOnboarding } from '../app/OnboardingContext';
import { DocumentUploader } from '../components/onboarding/DocumentUploader';
import { Button } from '../components/ui/Button';
import { Toast } from '../components/ui/Toast';
import { validateDocumentFile } from '../lib/validators/documentValidators';
import { createEmptyDocument } from '../app/state';

export function DocumentsPage({ companyId }: { companyId: string }) {
  const { state, setDocument, allDocumentsValid } = useOnboarding();
  const [loadingMap, setLoadingMap] = useState<Record<DocumentType, boolean>>({
    rif: false,
    registroMercantil: false,
    cedulaRepresentante: false
  });
  const [runtimeFiles, setRuntimeFiles] = useState<Partial<Record<DocumentType, File>>>({});

  async function handleUpload(docType: DocumentType, file: File) {
    setLoadingMap((prev) => ({ ...prev, [docType]: true }));
    try {
      const previousPreview = state.documents[docType].previewUrl;
      if (previousPreview) {
        URL.revokeObjectURL(previousPreview);
      }

      const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      const result = await validateDocumentFile(docType, file);

      setDocument(docType, {
        type: docType,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        previewUrl,
        validation: result
      });

      setRuntimeFiles((prev) => ({ ...prev, [docType]: file }));
    } catch {
      setDocument(docType, {
        type: docType,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        validation: {
          status: 'error',
          checks: [{ label: 'Lectura del documento', passed: false, details: 'No se pudo validar el archivo.' }],
          error: 'No se pudo validar el archivo.'
        }
      });
    } finally {
      setLoadingMap((prev) => ({ ...prev, [docType]: false }));
    }
  }

  function handleRemove(docType: DocumentType) {
    const previous = state.documents[docType];
    if (previous.previewUrl) {
      URL.revokeObjectURL(previous.previewUrl);
    }

    setDocument(docType, createEmptyDocument(docType));
    setRuntimeFiles((prev) => {
      const next = { ...prev };
      delete next[docType];
      return next;
    });
    setLoadingMap((prev) => ({ ...prev, [docType]: false }));
  }

  return (
    <div className="space-y-6">
      <Toast type="info" message="Sus documentos se procesan en su navegador (demo)." />

      <div className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(state.documents) as DocumentType[]).map((docType) => (
          <DocumentUploader
            key={docType}
            docRecord={state.documents[docType]}
            loading={loadingMap[docType]}
            previewFile={runtimeFiles[docType]}
            onSelectFile={(file) => handleUpload(docType, file)}
            onRemoveFile={() => handleRemove(docType)}
          />
        ))}
      </div>

      <div className="flex flex-wrap justify-between gap-3">
        <Link to={`/onboarding/${companyId}`}>
          <Button variant="ghost">Volver</Button>
        </Link>
        <Link to={`/onboarding/${companyId}/excel`}>
          <Button disabled={!allDocumentsValid}>Continuar al Excel</Button>
        </Link>
      </div>
    </div>
  );
}
