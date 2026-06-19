export type ManagerPriorityMode = 'balanced' | 'skills' | 'availability' | 'speed' | 'growth';
export type DataSourceId = 'csv' | 'excel' | 'pdf' | 'word' | 'microsoft365';
export type EnabledDataSources = Record<DataSourceId, boolean>;
export type AiProviderId = 'openai' | 'gemini';
export type AiProviderSetting = 'environment' | AiProviderId;

export interface WorkMatchSettings {
  aiProvider: AiProviderSetting;
  defaultManagerPriority: ManagerPriorityMode;
  importConfidenceThreshold: number;
  requireReview: boolean;
  showAuditTrail: boolean;
  enabledDataSources: EnabledDataSources;
}

export const initialWorkMatchSettings: WorkMatchSettings = {
  aiProvider: 'environment',
  defaultManagerPriority: 'balanced',
  importConfidenceThreshold: 85,
  requireReview: true,
  showAuditTrail: true,
  enabledDataSources: {
    csv: true,
    excel: true,
    pdf: true,
    word: true,
    microsoft365: false,
  },
};
