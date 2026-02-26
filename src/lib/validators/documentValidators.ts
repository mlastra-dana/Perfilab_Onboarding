import { DocumentType, DocumentValidationResult } from '../../app/types';
import { extractTextWithOCR } from '../ocr/tesseract';
import { extractPdfText, getPdfInfo, renderPdfPageToCanvas } from '../pdf/pdfUtils';
import { validateBasicFile } from './fileValidators';
import { formatVenezuelanId, isValidVenezuelanId, normalizeVenezuelanId } from './venezuelanId';

const ID_KEYWORDS = ['CEDULA', 'CÉDULA', 'IDENTIDAD', 'VENEZOLANO', 'NACIONALIDAD'];
const RIF_KEYWORDS = ['RIF', 'SENIAT', 'REGISTRO DE INFORMACION FISCAL'];
const REGISTRO_KEYWORDS = [
  'REGISTRO MERCANTIL',
  'ACTA CONSTITUTIVA',
  'DOCUMENTO CONSTITUTIVO',
  'CAPITAL SOCIAL',
  'ASAMBLEA',
  'PROTOCOLO'
];

export async function validateDocumentFile(
  type: DocumentType,
  file: File,
  onProgress?: (progress: number) => void
): Promise<DocumentValidationResult> {
  const checks: DocumentValidationResult['checks'] = [];
  try {
    onProgress?.(5);
    const basic = validateBasicFile(file);

    checks.push({
      label: 'Formato permitido',
      passed: basic.success,
      details: basic.errors[0]
    });

    if (!basic.success) {
      onProgress?.(100);
      return {
        status: 'error',
        checks,
        error: basic.errors.join(' ')
      };
    }

    if (file.type.startsWith('image/')) {
      onProgress?.(20);
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
        onProgress?.(60);
        const text = (await extractTextWithOCR(URL.createObjectURL(file))).trim();
        onProgress?.(85);
        if (!text) {
          checks.push({
            label: 'Lectura OCR del documento',
            passed: false,
            severity: 'error',
            details: 'No se pudo leer el contenido. Suba una imagen más nítida.'
          });
          return {
            status: 'error',
            checks,
            error: 'No se pudo leer el documento automáticamente.'
          };
        }

        const docTypeCheck = buildDocumentTypeCheck(type, text);
        checks.push(docTypeCheck);
        onProgress?.(100);
        return {
          status: docTypeCheck.passed ? 'valid' : 'error',
          checks,
          error: docTypeCheck.passed
            ? undefined
            : `El archivo no parece corresponder a ${getDocTypeLabel(type)}. Verifique el documento cargado.`
        };
      }

      const text = await extractTextWithOCR(URL.createObjectURL(file));
      onProgress?.(90);
      const result = buildCedulaValidationResult(text, checks);
      onProgress?.(100);
      return result;
    }

    onProgress?.(20);
    const info = await getPdfInfo(file);
    checks.push({
      label: 'Documento PDF legible',
      passed: info.pageCount > 0,
      details: `${info.pageCount} página(s) detectada(s).`
    });

    let previewCanvas: HTMLCanvasElement | null = null;
    try {
      onProgress?.(35);
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
      onProgress?.(60);
      let textToValidate = (await extractPdfText(file)).trim();
      if (!textToValidate && previewCanvas) {
        onProgress?.(75);
        textToValidate = (await extractTextWithOCR(previewCanvas)).trim();
      }

      if (!textToValidate) {
        checks.push({
          label: 'Lectura del documento',
          passed: false,
          severity: 'error',
          details: 'No se pudo extraer texto del PDF. Suba una versión más legible.'
        });
        return {
          status: 'error',
          checks,
          error: 'No se pudo validar automáticamente el tipo de documento.'
        };
      }

      const docTypeCheck = buildDocumentTypeCheck(type, textToValidate);
      checks.push(docTypeCheck);
      onProgress?.(100);
      return {
        status: docTypeCheck.passed ? 'valid' : 'error',
        checks,
        error: docTypeCheck.passed
          ? undefined
          : `El archivo no parece corresponder a ${getDocTypeLabel(type)}. Verifique el documento cargado.`
      };
    }

    onProgress?.(60);
    const pdfText = (await extractPdfText(file)).trim();
    if (pdfText) {
      onProgress?.(90);
      const result = buildCedulaValidationResult(pdfText, checks);
      onProgress?.(100);
      return result;
    }

    if (previewCanvas) {
      onProgress?.(75);
      const ocrText = (await extractTextWithOCR(previewCanvas)).trim();
      if (ocrText) {
        onProgress?.(90);
        const result = buildCedulaValidationResult(ocrText, checks);
        onProgress?.(100);
        return result;
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
    onProgress?.(100);
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

function buildDocumentTypeCheck(type: DocumentType, rawText: string): DocumentValidationResult['checks'][number] {
  const normalized = normalizeText(rawText);
  const { keywords, minHits, label } = getTypeRules(type);
  const hits = keywords.filter((keyword) => normalized.includes(keyword));
  const passed = hits.length >= minHits;

  return {
    label,
    passed,
    severity: passed ? 'info' : 'error',
    details: passed
      ? `Coincidencias: ${hits.slice(0, 3).join(', ')}`
      : `No se detectaron palabras clave esperadas de ${getDocTypeLabel(type)}.`
  };
}

function getTypeRules(type: DocumentType) {
  if (type === 'rif') {
    return {
      label: 'Documento corresponde a RIF',
      keywords: RIF_KEYWORDS.map(normalizeText),
      minHits: 1
    };
  }

  return {
    label: 'Documento corresponde a Registro Mercantil / Acta',
    keywords: REGISTRO_KEYWORDS.map(normalizeText),
    minHits: 1
  };
}

function getDocTypeLabel(type: DocumentType) {
  if (type === 'rif') return 'RIF';
  if (type === 'registroMercantil') return 'Registro Mercantil / Acta Constitutiva';
  return 'Cédula';
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
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
  const normalizedText = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();

  const keywordRegex = /(VENC|VENCIMIENTO|EXPIRA|EXPIRACION|CADUCA|HASTA)/g;
  const keywordPositions: number[] = [];
  let keywordMatch: RegExpExecArray | null = keywordRegex.exec(normalizedText);
  while (keywordMatch) {
    keywordPositions.push(keywordMatch.index);
    keywordMatch = keywordRegex.exec(normalizedText);
  }

  const dateRegex = /(\d{2}[\/\-\.]\d{2}[\/\-\.]\d{4}|\d{4}[\/\-\.]\d{2}[\/\-\.]\d{2})/g;
  const candidates: Array<{ date: Date; index: number }> = [];
  let dateMatch: RegExpExecArray | null = dateRegex.exec(normalizedText);
  while (dateMatch) {
    const [rawDate] = dateMatch;
    const parsed = parseDate(rawDate.replace(/[/.]/g, '-'));
    if (parsed) {
      candidates.push({ date: parsed, index: dateMatch.index });
    }
    dateMatch = dateRegex.exec(normalizedText);
  }

  if (candidates.length === 0) return null;

  const nearKeyword = candidates.filter(({ index }) =>
    keywordPositions.some((keywordIndex) => Math.abs(keywordIndex - index) <= 40)
  );

  if (nearKeyword.length > 0) {
    return nearKeyword.sort((a, b) => b.date.getTime() - a.date.getTime())[0].date;
  }

  const now = new Date();
  const futureOrCurrent = candidates.filter(({ date }) => date.getTime() >= now.getTime());
  if (futureOrCurrent.length > 0) {
    return futureOrCurrent.sort((a, b) => a.date.getTime() - b.date.getTime())[0].date;
  }

  return candidates.sort((a, b) => b.date.getTime() - a.date.getTime())[0].date;
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
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
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
