import { DocumentType, DocumentValidationResult } from '../../app/types';
import { extractTextWithOCR } from '../ocr/tesseract';
import { extractPdfText, getPdfInfo, renderPdfPageToCanvas } from '../pdf/pdfUtils';
import { validateBasicFile } from './fileValidators';
import { formatVenezuelanId, isValidVenezuelanId, normalizeVenezuelanId } from './venezuelanId';

const ID_KEYWORDS = ['CEDULA DE IDENTIDAD', 'REPUBLICA BOLIVARIANA DE VENEZUELA', 'VENEZOLANO', 'IDENTIDAD', 'NACIONALIDAD'];
const RIF_KEYWORDS = ['RIF', 'SENIAT', 'REGISTRO DE INFORMACION FISCAL'];
const REGISTRO_KEYWORDS = [
  'REGISTRO MERCANTIL',
  'ACTA CONSTITUTIVA',
  'DOCUMENTO CONSTITUTIVO',
  'CAPITAL SOCIAL',
  'ASAMBLEA',
  'PROTOCOLO'
];

const MIN_IMAGE_SIDE = 800;
const HIGH_QUALITY_SIDE = 1200;

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
      const dataUrl = await readFileAsDataURL(file);
      onProgress?.(20);

      const dim = await getImageDimensionsFromDataUrl(dataUrl);
      const qualityOk = Math.max(dim.width, dim.height) >= MIN_IMAGE_SIDE;
      const highQuality = Math.max(dim.width, dim.height) >= HIGH_QUALITY_SIDE;

      checks.push({
        label: 'Calidad de imagen',
        passed: qualityOk,
        severity: qualityOk ? (highQuality ? 'info' : 'warning') : 'error',
        details: qualityOk
          ? `${dim.width}x${dim.height} detectado.`
          : `Resolución insuficiente (${dim.width}x${dim.height}). Suba una imagen con lado mayor >= ${MIN_IMAGE_SIDE}px.`
      });

      if (!qualityOk) {
        onProgress?.(100);
        return {
          status: 'error',
          checks,
          error: 'La resolución del documento es demasiado baja.'
        };
      }

      if (type !== 'cedulaRepresentante') {
        onProgress?.(60);
        const text = await safeExtractText(dataUrl);
        onProgress?.(85);

        if (!text.trim()) {
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

      onProgress?.(55);
      const ocrAttempt = await extractCedulaTextFromRotations(dataUrl);
      onProgress?.(85);

      const result = buildCedulaValidationResult(ocrAttempt.text, checks, {
        fileName: file.name,
        allowPartial: true,
        partialHint: ocrAttempt.text.trim()
          ? undefined
          : 'No se pudo leer texto (modo demo). Continuaremos con validación parcial.'
      });

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
    let qualityOk = true;

    try {
      onProgress?.(35);
      previewCanvas = await renderPdfPageToCanvas(file, 1);
      const side = Math.max(previewCanvas.width, previewCanvas.height);
      const highQualityPdf = side >= HIGH_QUALITY_SIDE;
      qualityOk = side >= MIN_IMAGE_SIDE;

      checks.push({
        label: 'Calidad de escaneo PDF',
        passed: qualityOk,
        severity: qualityOk ? (highQualityPdf ? 'info' : 'warning') : 'error',
        details: qualityOk
          ? `Resolución de vista previa ${previewCanvas.width}x${previewCanvas.height}.`
          : `Resolución insuficiente (${previewCanvas.width}x${previewCanvas.height}). Suba un PDF más nítido.`
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
        textToValidate = (await safeExtractText(previewCanvas)).trim();
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

    if (!qualityOk) {
      onProgress?.(100);
      return {
        status: 'error',
        checks,
        isIdDocument: false,
        error: 'La resolución del documento es demasiado baja.'
      };
    }

    onProgress?.(60);
    let cedulaText = (await extractPdfText(file)).trim();
    if (!cedulaText && previewCanvas) {
      onProgress?.(75);
      cedulaText = (await safeExtractText(previewCanvas)).trim();
    }

    const result = buildCedulaValidationResult(cedulaText, checks, {
      fileName: file.name,
      allowPartial: true,
      partialHint: cedulaText
        ? undefined
        : 'No se pudo leer texto (modo demo). Continuaremos con validación parcial.'
    });

    onProgress?.(100);
    return result;
  } catch {
    onProgress?.(100);

    if (type === 'cedulaRepresentante') {
      return buildCedulaValidationResult('', checks, {
        allowPartial: true,
        partialHint: 'No se pudo leer texto (modo demo). Continuaremos con validación parcial.'
      });
    }

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
  checks: DocumentValidationResult['checks'],
  options?: { allowPartial?: boolean; partialHint?: string; fileName?: string }
): DocumentValidationResult {
  const normalized = normalizeText(rawText);
  const hasKeyword = ID_KEYWORDS.some((keyword) => normalized.includes(normalizeText(keyword)));
  const hasIdPattern = /(?:^|\b)[VE][\-\s]?\d{6,8}(?:\b|$)/i.test(rawText);
  const isIdDocument = hasKeyword || hasIdPattern;

  const canonicalId = normalizeVenezuelanId(rawText);
  const formattedId = canonicalId && isValidVenezuelanId(canonicalId) ? formatVenezuelanId(canonicalId) : null;

  const hasReadableSignals = rawText.trim().length > 0 && (isIdDocument || Boolean(formattedId));
  const allowPartial = Boolean(options?.allowPartial);

  if (!rawText.trim()) {
    checks.push({
      label: 'Lectura del documento',
      passed: true,
      severity: 'warning',
      details: options?.partialHint ?? 'No se pudo leer texto (modo demo). Continuaremos con validación parcial.'
    });
  }

  const looksLikeByFileName = Boolean(options?.fileName && /(cedula|c[eé]dula|identidad|ci)/i.test(options.fileName));
  const idDetected = isIdDocument || looksLikeByFileName || allowPartial;

  checks.push({
    label: 'Documento parece identificación',
    passed: idDetected,
    severity: idDetected && !isIdDocument ? 'warning' : idDetected ? 'info' : 'error',
    details: idDetected
      ? isIdDocument
        ? 'Se detectaron palabras clave de identificación.'
        : 'Documento parece identificación (validación parcial).'
      : 'No se detectaron palabras clave tipo cédula/identidad.'
  });

  checks.push({
    label: 'Número de cédula detectado',
    passed: Boolean(formattedId) || allowPartial,
    severity: formattedId ? 'info' : 'warning',
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

  const validBySignals = hasReadableSignals ? isIdDocument || Boolean(formattedId) : allowPartial;
  const valid = validBySignals && notExpired;

  return {
    status: valid ? 'valid' : 'error',
    checks,
    isIdDocument: idDetected,
    extractedId: formattedId ?? undefined,
    expiryDate: expiryDate ? formatDate(expiryDate) : undefined,
    error: valid ? undefined : 'La cédula no cumple validación mínima. Suba un documento más legible y vigente.'
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

async function extractCedulaTextFromRotations(dataUrl: string): Promise<{ text: string; score: number; angle: number }> {
  const image = await loadImageFromDataUrl(dataUrl);
  const angles = [0, 90, 180, 270];
  let best = { text: '', score: 0, angle: 0 };

  for (const angle of angles) {
    const canvas = createRotatedCanvas(image, angle);
    const text = (await safeExtractText(canvas)).trim();
    const score = scoreCedulaText(text);

    if (score > best.score) {
      best = { text, score, angle };
    }

    if (score >= 3) {
      return { text, score, angle };
    }
  }

  return best;
}

function scoreCedulaText(text: string) {
  if (!text.trim()) return 0;
  const normalized = normalizeText(text);
  const keywordHits = ID_KEYWORDS.reduce((total, keyword) => {
    return normalized.includes(normalizeText(keyword)) ? total + 1 : total;
  }, 0);

  const idHit = /(?:^|\b)[VE][\-\s]?\d{6,8}(?:\b|$)/i.test(text) ? 2 : 0;
  return keywordHits + idHit;
}

function safeExtractText(source: string | HTMLCanvasElement) {
  return extractTextWithOCR(source).catch(() => '');
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('No se pudo leer imagen.'));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error('No se pudo leer imagen.'));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
    image.src = dataUrl;
  });
}

async function getImageDimensionsFromDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  const image = await loadImageFromDataUrl(dataUrl);
  return { width: image.width, height: image.height };
}

function createRotatedCanvas(image: HTMLImageElement, angle: number) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return canvas;

  const radians = (angle * Math.PI) / 180;
  const swap = angle % 180 !== 0;
  canvas.width = swap ? image.height : image.width;
  canvas.height = swap ? image.width : image.height;

  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(radians);
  context.drawImage(image, -image.width / 2, -image.height / 2);

  return canvas;
}
