import { DocumentType, DocumentValidationResult } from '../../app/types';
import { extractTextWithOCR } from '../ocr/tesseract';
import { extractPdfText, renderPdfPageToCanvas } from '../pdf/pdfUtils';
import { validateBasicFile } from './fileValidators';

type DemoSlotValidation = {
  status: 'valid' | 'invalid';
  message: string;
  confidence: 'high' | 'low';
};

type StrongSignals = {
  cedula: boolean;
  rif: boolean;
  mercantil: boolean;
};

const RIF_STRONG_REGEX = /\b[VEJG]-?\s*\d{7,9}\s*-?\s*\d\b/i;

export async function validateDocumentFile(
  type: DocumentType,
  file: File,
  onProgress?: (progress: number) => void
): Promise<DocumentValidationResult> {
  const checks: DocumentValidationResult['checks'] = [];

  try {
    onProgress?.(10);
    const basic = validateBasicFile(file);

    checks.push({
      label: 'Formato permitido',
      passed: basic.success,
      details: basic.errors[0]
    });

    if (!basic.success) {
      onProgress?.(100);
      return finalizeValidationResult(type, {
        status: 'error',
        checks,
        error: basic.errors.join(' ')
      });
    }

    onProgress?.(55);
    const demoResult =
      type === 'rif'
        ? await validateRif(file)
        : type === 'registroMercantil'
          ? await validateRegistroMercantilActa(file)
          : await validateCedula(file);
    checks.push({
      label: 'Tipo de documento',
      passed: demoResult.status === 'valid',
      details: demoResult.message
    });

    onProgress?.(100);
    return finalizeValidationResult(type, {
      status: demoResult.status === 'valid' ? 'valid' : 'error',
      confidence: demoResult.confidence,
      checks,
      isIdDocument: type === 'cedulaRepresentante' ? demoResult.status === 'valid' : undefined,
      error: demoResult.status === 'invalid' ? demoResult.message : undefined
    });
  } catch {
    onProgress?.(100);
    checks.push({
      label: 'Tipo de documento',
      passed: false,
      details: `No corresponde a ${getDocTypeLabel(type)}.`
    });

    return finalizeValidationResult(type, {
      status: 'error',
      confidence: 'low',
      checks,
      isIdDocument: false,
      error: `Este archivo no corresponde a ${getDocTypeLabel(type)}.`
    });
  }
}

export async function validateRif(file: File): Promise<DemoSlotValidation> {
  const text = await extractDocumentTextBestEffort(file);
  const signals = detectStrongSignals(text);

  if (signals.rif && !signals.cedula && !signals.mercantil) {
    return {
      status: 'valid',
      confidence: 'high',
      message: 'Documento aceptado.'
    };
  }

  if (signals.cedula || signals.mercantil || (signals.rif && (signals.cedula || signals.mercantil))) {
    return {
      status: 'invalid',
      confidence: 'high',
      message: 'Este archivo no corresponde a RIF.'
    };
  }

  return {
    status: 'invalid',
    confidence: 'low',
    message: 'Este archivo no corresponde a RIF.'
  };
}

export async function validateRegistroMercantilActa(file: File): Promise<DemoSlotValidation> {
  const text = await extractDocumentTextBestEffort(file);
  const signals = detectStrongSignals(text);

  if (signals.mercantil && !signals.cedula && !signals.rif) {
    return {
      status: 'valid',
      confidence: 'high',
      message: 'Documento aceptado.'
    };
  }

  if (signals.cedula || signals.rif || (signals.mercantil && (signals.cedula || signals.rif))) {
    return {
      status: 'invalid',
      confidence: 'high',
      message: 'Este archivo no corresponde a Registro Mercantil/Acta.'
    };
  }

  return {
    status: 'invalid',
    confidence: 'low',
    message: 'Este archivo no corresponde a Registro Mercantil/Acta.'
  };
}

export async function validateCedula(file: File): Promise<DemoSlotValidation> {
  const text = await extractDocumentTextBestEffort(file);
  const signals = detectStrongSignals(text);

  if (signals.cedula && !signals.rif && !signals.mercantil) {
    return {
      status: 'valid',
      confidence: 'high',
      message: 'Documento aceptado.'
    };
  }

  if (signals.rif || signals.mercantil || (signals.cedula && (signals.rif || signals.mercantil))) {
    return {
      status: 'invalid',
      confidence: 'high',
      message: 'Este archivo no corresponde a Cédula.'
    };
  }

  return {
    status: 'invalid',
    confidence: 'low',
    message: 'Este archivo no corresponde a Cédula.'
  };
}

async function extractDocumentTextBestEffort(file: File) {
  const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');

  if (isPdf) {
    try {
      const pdfText = (await extractPdfText(file, 2)).trim();
      if (pdfText.length > 0) return pdfText;
    } catch {
      // Best effort: if text layer read fails, try OCR and keep flow permissive.
    }

    try {
      const firstPageCanvas = await renderPdfPageToCanvas(file, 1);
      return (await extractTextWithOCR(firstPageCanvas)).trim();
    } catch {
      return '';
    }
  }

  if (file.type.startsWith('image/')) {
    const imageUrl = URL.createObjectURL(file);
    try {
      return (await extractTextWithOCR(imageUrl)).trim();
    } catch {
      return '';
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  }

  return '';
}

function detectStrongSignals(value: string): StrongSignals {
  const text = normalizeText(value);
  const hasCedulaStrong =
    text.includes('cedula de identidad') ||
    text.includes('republica bolivariana') ||
    text.includes('venezolano') ||
    (text.includes('apellidos') && text.includes('nombres'));
  const hasRifStrong =
    text.includes('seniat') || text.includes('registro de informacion fiscal') || RIF_STRONG_REGEX.test(value);
  const hasMercantilStrong =
    text.includes('registro mercantil') ||
    text.includes('acta') ||
    text.includes('asamblea') ||
    text.includes('junta directiva') ||
    text.includes('tomo') ||
    text.includes('folio') ||
    text.includes('notaria');

  return {
    cedula: hasCedulaStrong,
    rif: hasRifStrong,
    mercantil: hasMercantilStrong
  };
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getDocTypeLabel(type: DocumentType) {
  if (type === 'rif') return 'RIF';
  if (type === 'registroMercantil') return 'Registro Mercantil/Acta';
  return 'Cédula';
}

function finalizeValidationResult(type: DocumentType, result: DocumentValidationResult): DocumentValidationResult {
  const diagnostics = result.checks.map((check) => {
    const status = check.passed ? (check.severity ?? 'info') : 'error';
    return `[${status}] ${check.label}${check.details ? `: ${check.details}` : ''}`;
  });

  const uiStatus =
    result.status === 'valid'
      ? {
          state: 'ok' as const,
          title: 'Documento aceptado.',
          message: 'Documento aceptado.'
        }
      : {
          state: 'error' as const,
          title: 'Documento inválido',
          message: result.error ?? `Este archivo no corresponde a ${getDocTypeLabel(type)}.`
        };

  if (import.meta.env.DEV) {
    console.debug(`[document-validation:${type}]`, {
      status: result.status,
      error: result.error,
      diagnostics
    });
  }

  return {
    ...result,
    uiStatus,
    internalDiagnostics: diagnostics
  };
}
