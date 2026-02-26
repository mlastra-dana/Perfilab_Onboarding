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
  const [uploadingMap, setUploadingMap] = useState<Record<DocumentType, boolean>>({
    rif: false,
    registroMercantil: false,
    cedulaRepresentante: false
  });
  const [uploadProgressMap, setUploadProgressMap] = useState<Record<DocumentType, number>>({
    rif: 0,
    registroMercantil: 0,
    cedulaRepresentante: 0
  });
  const [validationProgressMap, setValidationProgressMap] = useState<Record<DocumentType, number>>({
    rif: 0,
    registroMercantil: 0,
    cedulaRepresentante: 0
  });
  const [runtimeFiles, setRuntimeFiles] = useState<Partial<Record<DocumentType, File>>>({});

  async function handleUpload(docType: DocumentType, file: File) {
    setUploadingMap((prev) => ({ ...prev, [docType]: true }));
    setUploadProgressMap((prev) => ({ ...prev, [docType]: 0 }));
    setValidationProgressMap((prev) => ({ ...prev, [docType]: 0 }));

    await simulateUpload((progress) => {
      setUploadProgressMap((prev) => ({ ...prev, [docType]: progress }));
    });

    setUploadingMap((prev) => ({ ...prev, [docType]: false }));
    setLoadingMap((prev) => ({ ...prev, [docType]: true }));

    const previousPreview = state.documents[docType].previewUrl;
    if (previousPreview) {
      URL.revokeObjectURL(previousPreview);
    }

    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    setRuntimeFiles((prev) => ({ ...prev, [docType]: file }));

    const result = await validateDocumentFile(docType, file, (progress) => {
      setValidationProgressMap((prev) => ({ ...prev, [docType]: progress }));
    });

    setDocument(docType, {
      type: docType,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      previewUrl,
      validation: result
    });

    setLoadingMap((prev) => ({ ...prev, [docType]: false }));
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
    setUploadingMap((prev) => ({ ...prev, [docType]: false }));
    setUploadProgressMap((prev) => ({ ...prev, [docType]: 0 }));
    setValidationProgressMap((prev) => ({ ...prev, [docType]: 0 }));
  }

  return (
    <div className="space-y-6">
      <Toast type="info" message="Sus documentos se procesan en su navegador (demo)." />

      <div className="grid gap-4 lg:grid-cols-3">
        {(Object.keys(state.documents) as DocumentType[]).map((docType) => (
          <DocumentUploader
            key={docType}
            docRecord={state.documents[docType]}
            loading={loadingMap[docType] || uploadingMap[docType]}
            isUploading={uploadingMap[docType]}
            uploadProgress={uploadProgressMap[docType]}
            validationProgress={validationProgressMap[docType]}
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

async function simulateUpload(onProgress: (progress: number) => void) {
  return new Promise<void>((resolve) => {
    let value = 0;
    onProgress(0);
    const timer = setInterval(() => {
      value += 14;
      if (value >= 100) {
        onProgress(100);
        clearInterval(timer);
        resolve();
        return;
      }
      onProgress(value);
    }, 35);
  });
}
