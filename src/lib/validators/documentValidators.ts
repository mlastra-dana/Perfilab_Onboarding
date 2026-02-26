import { DocumentType, DocumentValidationResult } from '../../app/types';
import { extractTextWithOCR } from '../ocr/tesseract';
import { extractPdfText, getPdfInfo, renderPdfPageToCanvas } from '../pdf/pdfUtils';
import { validateBasicFile } from './fileValidators';
import { formatVenezuelanId, isValidVenezuelanId, normalizeVenezuelanId } from './venezuelanId';

const ID_KEYWORDS = ['CEDULA', 'CÉDULA', 'IDENTIDAD', 'VENEZOLANO', 'NACIONALIDAD'];

export async function validateDocumentFile(
  type: DocumentType,
  file: File
): Promise<DocumentValidationResult> {
  const checks: DocumentValidationResult['checks'] = [];
  try {
    const basic = validateBasicFile(file);

    checks.push({
      label: 'Formato permitido',
      passed: basic.success,
      details: basic.errors[0]
    });

    if (!basic.success) {
      return {
        status: 'error',
        checks,
        error: basic.errors.join(' ')
      };
    }

    if (file.type.startsWith('image/')) {
      const dim = await getImageDimensions(file);
      const highQuality = Math.max(dim.width, dim.height) >= 1200;
      checks.push({
        label: 'Calidad de imagen',
        passed: highQuality,
        severity: highQuality ? 'info' : 'warning',
        details: highQuality
          ? `${dim.width}x${dim.height} detectado.`
          : `Calidad baja (${dim.width}x${dim.height}). Suba una imagen más nítida.`
      });

      if (type !== 'cedulaRepresentante') {
        return {
          status: 'valid',
          checks
        };
      }

      const text = await extractTextWithOCR(URL.createObjectURL(file));
      return buildCedulaValidationResult(text, checks);
    }

    const info = await getPdfInfo(file);
    checks.push({
      label: 'Documento PDF legible',
      passed: info.pageCount > 0,
      details: `${info.pageCount} página(s) detectada(s).`
    });

    let previewCanvas: HTMLCanvasElement | null = null;
    try {
      previewCanvas = await renderPdfPageToCanvas(file, 1);
      const highQualityPdf = Math.max(previewCanvas.width, previewCanvas.height) >= 1200;
      checks.push({
        label: 'Calidad de escaneo PDF',
        passed: highQualityPdf,
        severity: highQualityPdf ? 'info' : 'warning',
        details: highQualityPdf
          ? `Resolución de vista previa ${previewCanvas.width}x${previewCanvas.height}.`
          : 'PDF con baja resolución en primera página. Podría fallar OCR.'
      });
    } catch {
      checks.push({
        label: 'Calidad de escaneo PDF',
        passed: true,
        severity: 'warning',
        details: 'No se pudo medir resolución del PDF. Validación parcial aplicada.'
      });
    }

    if (type !== 'cedulaRepresentante') {
      return {
        status: 'valid',
        checks
      };
    }

    const pdfText = (await extractPdfText(file)).trim();
    if (pdfText) {
      return buildCedulaValidationResult(pdfText, checks);
    }

    if (previewCanvas) {
      const ocrText = (await extractTextWithOCR(previewCanvas)).trim();
      if (ocrText) {
        return buildCedulaValidationResult(ocrText, checks);
      }
    }

    checks.push({
      label: 'OCR de cédula',
      passed: false,
      severity: 'error',
      details: 'No se pudo validar automáticamente, por favor suba una imagen más nítida.'
    });

    return {
      status: 'error',
      checks,
      isIdDocument: false,
      error: 'No se pudo validar automáticamente, por favor suba una imagen más nítida.'
    };
  } catch {
    checks.push({
      label: 'Lectura del documento',
      passed: false,
      severity: 'error',
      details: 'No se pudo validar el archivo. Intente cargarlo nuevamente.'
    });

    return {
      status: 'error',
      checks,
      error: 'No se pudo validar el archivo. Intente cargarlo nuevamente.'
    };
  }
}

function buildCedulaValidationResult(
  rawText: string,
  checks: DocumentValidationResult['checks']
): DocumentValidationResult {
  const text = rawText.toUpperCase();
  const isIdDocument = ID_KEYWORDS.some((keyword) => text.includes(keyword));
  const canonicalId = normalizeVenezuelanId(rawText);
  const formattedId = canonicalId && isValidVenezuelanId(canonicalId) ? formatVenezuelanId(canonicalId) : null;

  checks.push({
    label: 'Documento parece identificación',
    passed: isIdDocument,
    severity: isIdDocument ? 'info' : 'error',
    details: isIdDocument
      ? 'Se detectaron palabras clave de identificación.'
      : 'No se detectaron palabras clave tipo cédula/identidad.'
  });

  checks.push({
    label: 'Número de cédula detectado',
    passed: Boolean(formattedId),
    severity: formattedId ? 'info' : 'error',
    details: formattedId
      ? formattedId
      : 'No se pudo leer la cédula. Asegúrese de que el documento esté nítido y que el número sea visible.'
  });

  const expiryDate = extractPossibleExpiryDate(rawText);
  let notExpired = true;

  if (expiryDate) {
    const now = new Date();
    notExpired = expiryDate.getTime() >= now.getTime();
    checks.push({
      label: 'Vigencia de documento',
      passed: notExpired,
      severity: notExpired ? 'info' : 'error',
      details: `Fecha detectada: ${formatDate(expiryDate)}.`
    });
  } else {
    checks.push({
      label: 'Vigencia de documento',
      passed: true,
      severity: 'warning',
      details: 'No se detectó fecha de vencimiento. Validación parcial.'
    });
  }

  const valid = isIdDocument && Boolean(formattedId) && notExpired;

  return {
    status: valid ? 'valid' : 'error',
    checks,
    isIdDocument,
    extractedId: formattedId ?? undefined,
    expiryDate: expiryDate ? formatDate(expiryDate) : undefined,
    error: valid
      ? undefined
      : 'La cédula no cumple validación mínima. Suba un documento más legible y vigente.'
  };
}

function extractPossibleExpiryDate(text: string) {
  const patterns = [/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/g, /(\d{4})[\/\-](\d{2})[\/\-](\d{2})/g];

  for (const regex of patterns) {
    const match = regex.exec(text);
    if (!match) continue;

    const [full] = match;
    const normalized = full.includes('/') ? full.replace(/\//g, '-') : full;
    const candidate = parseDate(normalized);
    if (candidate) return candidate;
  }

  return null;
}

function parseDate(value: string) {
  const parts = value.split('-');
  if (parts[0].length === 4) {
    const [year, month, day] = parts.map(Number);
    return safeDate(year, month, day);
  }

  const [day, month, year] = parts.map(Number);
  return safeDate(year, month, day);
}

function safeDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('es-VE');
}

function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.width, height: image.height });
    image.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    image.src = URL.createObjectURL(file);
  });
}
