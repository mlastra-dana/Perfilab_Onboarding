import * as XLSX from 'xlsx';
import { ExcelValidationState } from '../../app/types';
import { validateExcelRow } from '../validators/excelValidators';

type ProgressFn = (processed: number, total: number) => void;

export async function parseExcelWithValidation(
  file: File,
  onProgress?: ProgressFn
): Promise<ExcelValidationState> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const issues: ExcelValidationState['issues'] = [];
  const previewRows: Record<string, unknown>[] = [];

  let processedRows = 0;
  let validRows = 0;
  const totalRows = rows.length;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const validation = validateExcelRow(row);

    if (previewRows.length < 20) {
      previewRows.push(row);
    }

    if (validation.valid) {
      validRows += 1;
    } else {
      issues.push({
        rowNumber: index + 2,
        reasons: validation.issues,
        rowData: row
      });
    }

    processedRows += 1;
    onProgress?.(processedRows, totalRows);

    if (index % 50 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const invalidRows = totalRows - validRows;

  return {
    status: invalidRows === 0 && totalRows > 0 ? 'valid' : 'error',
    totalRows,
    processedRows,
    validRows,
    invalidRows,
    headers,
    previewRows,
    issues
  };
}

export function buildInvalidRowsCsv(issues: ExcelValidationState['issues']) {
  if (!issues.length) return '';

  const columns = Object.keys(issues[0].rowData);
  const header = ['fila', 'motivo', ...columns].join(',');

  const lines = issues.map((issue) => {
    const cells = columns.map((col) => sanitizeCsvCell(String(issue.rowData[col] ?? '')));
    return [issue.rowNumber, sanitizeCsvCell(issue.reasons.join(' | ')), ...cells].join(',');
  });

  return [header, ...lines].join('\n');
}

function sanitizeCsvCell(value: string) {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}
