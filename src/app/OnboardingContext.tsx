import { PropsWithChildren, createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { TenantConfig } from '../data/tenants';
import { DocumentRecord, DocumentType, ExcelValidationState, OnboardingState, SubmissionState } from './types';
import { createInitialState, loadState, saveState } from './state';

type Action =
  | { type: 'set_document'; payload: { docType: DocumentType; record: DocumentRecord } }
  | { type: 'set_excel'; payload: ExcelValidationState }
  | { type: 'set_submission'; payload: SubmissionState }
  | { type: 'reset'; payload: OnboardingState };

type ContextValue = {
  state: OnboardingState;
  setDocument: (docType: DocumentType, record: DocumentRecord) => void;
  setExcel: (excel: ExcelValidationState) => void;
  setSubmission: (submission: SubmissionState) => void;
  resetState: () => void;
  allDocumentsValid: boolean;
  excelValid: boolean;
  canSubmit: boolean;
};

const OnboardingContext = createContext<ContextValue | null>(null);

function reducer(state: OnboardingState, action: Action): OnboardingState {
  switch (action.type) {
    case 'set_document':
      return {
        ...state,
        documents: {
          ...state.documents,
          [action.payload.docType]: action.payload.record
        }
      };
    case 'set_excel':
      return {
        ...state,
        excel: action.payload
      };
    case 'set_submission':
      return {
        ...state,
        submission: action.payload
      };
    case 'reset':
      return action.payload;
    default:
      return state;
  }
}

export function OnboardingProvider({ companyId, tenant, children }: PropsWithChildren<{ companyId: string; tenant: TenantConfig }>) {
  const restored = loadState(companyId);
  const [state, dispatch] = useReducer(reducer, restored ?? createInitialState(companyId, tenant));

  useEffect(() => {
    saveState(state);
  }, [state]);

  const value = useMemo<ContextValue>(() => {
    const allDocumentsValid = Object.values(state.documents).every((doc) => doc.validation.status === 'valid');
    const excelValid = state.excel.status === 'valid' && state.excel.totalRows > 0;

    return {
      state,
      setDocument: (docType, record) => dispatch({ type: 'set_document', payload: { docType, record } }),
      setExcel: (excel) => dispatch({ type: 'set_excel', payload: excel }),
      setSubmission: (submission) => dispatch({ type: 'set_submission', payload: submission }),
      resetState: () => dispatch({ type: 'reset', payload: createInitialState(companyId, tenant) }),
      allDocumentsValid,
      excelValid,
      canSubmit: allDocumentsValid && excelValid
    };
  }, [companyId, state, tenant]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error('useOnboarding debe usarse dentro de OnboardingProvider');
  }
  return context;
}
