import { TenantConfig } from '../data/tenants';

export type DocumentType = 'rif' | 'registroMercantil' | 'cedulaRepresentante';
export type ValidationStatus = 'pending' | 'validating' | 'valid' | 'error';

export type DocumentCheck = {
  label: string;
  passed: boolean;
  details?: string;
  severity?: 'info' | 'warning' | 'error';
};

export type DocumentValidationResult = {
  status: ValidationStatus;
  checks: DocumentCheck[];
  isIdDocument?: boolean;
  extractedId?: string;
  expiryDate?: string;
  error?: string;
};

export type DocumentRecord = {
  type: DocumentType;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  previewUrl?: string;
  validation: DocumentValidationResult;
};

export type ExcelRowIssue = {
  rowNumber: number;
  reasons: string[];
  rowData: Record<string, unknown>;
};

export type ExcelValidationState = {
  status: ValidationStatus;
  totalRows: number;
  processedRows: number;
  validRows: number;
  invalidRows: number;
  headers: string[];
  previewRows: Record<string, unknown>[];
  issues: ExcelRowIssue[];
};

export type SubmissionState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  registrationId?: string;
  error?: string;
  submittedAt?: string;
};

export type OnboardingState = {
  companyId: string;
  tenant: TenantConfig;
  documents: Record<DocumentType, DocumentRecord>;
  excel: ExcelValidationState;
  submission: SubmissionState;
};
