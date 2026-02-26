import { DocumentType, OnboardingState } from './types';
import { TenantConfig } from '../data/tenants';

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  rif: 'RIF',
  registroMercantil: 'Registro Mercantil',
  cedulaRepresentante: 'Cédula del Representante'
};

export function createEmptyDocument(type: DocumentType) {
  return {
    type,
    validation: {
      status: 'pending' as const,
      checks: []
    }
  };
}

export function createInitialState(companyId: string, tenant: TenantConfig): OnboardingState {
  return {
    companyId,
    tenant,
    documents: {
      rif: createEmptyDocument('rif'),
      registroMercantil: createEmptyDocument('registroMercantil'),
      cedulaRepresentante: createEmptyDocument('cedulaRepresentante')
    },
    excel: {
      status: 'pending',
      totalRows: 0,
      processedRows: 0,
      validRows: 0,
      invalidRows: 0,
      headers: [],
      previewRows: [],
      issues: []
    },
    submission: {
      status: 'idle'
    }
  };
}

const STORAGE_PREFIX = 'onboarding_portal_state';

export function getStorageKey(companyId: string) {
  return `${STORAGE_PREFIX}:${companyId}`;
}

export function saveState(state: OnboardingState) {
  const key = getStorageKey(state.companyId);
  localStorage.setItem(key, JSON.stringify(state));
}

export function loadState(companyId: string): OnboardingState | null {
  const raw = localStorage.getItem(getStorageKey(companyId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OnboardingState;
  } catch {
    return null;
  }
}
