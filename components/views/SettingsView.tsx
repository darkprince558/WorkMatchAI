'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Database, FileCheck2, LockKeyhole, SlidersHorizontal } from 'lucide-react';
import type { AiProviderSetting, DataSourceId, ManagerPriorityMode, WorkMatchSettings } from '@/lib/settings';
import type { MonitoringSummary } from '@/lib/monitoring/telemetry';

interface SettingsViewProps {
  settings: WorkMatchSettings;
  updateSettings: (updates: Partial<WorkMatchSettings>) => void;
}

const priorityOptions: { id: ManagerPriorityMode; label: string }[] = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'skills', label: 'Skill Fit' },
  { id: 'availability', label: 'Availability' },
  { id: 'speed', label: 'Delivery Speed' },
  { id: 'growth', label: 'Growth Opportunity' },
];

const dataSourceOptions: { id: Exclude<DataSourceId, 'microsoft365'>; label: string }[] = [
  { id: 'csv', label: 'CSV' },
  { id: 'excel', label: 'Excel' },
  { id: 'pdf', label: 'PDF' },
  { id: 'word', label: 'Word' },
];

const aiProviderOptions: { id: AiProviderSetting; label: string }[] = [
  { id: 'environment', label: 'Env' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'openai', label: 'OpenAI' },
];

export default function SettingsView({ settings, updateSettings }: SettingsViewProps) {
  const [monitoring, setMonitoring] = useState<MonitoringSummary | null>(null);
  const selectedPriority = priorityOptions.find((option) => option.id === settings.defaultManagerPriority) ?? priorityOptions[0];
  const selectedAiProvider = aiProviderOptions.find((option) => option.id === settings.aiProvider) ?? aiProviderOptions[0];
  const enabledSourceCount = dataSourceOptions.filter((source) => settings.enabledDataSources[source.id]).length;

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      fetch('/api/monitoring/summary', { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : undefined))
        .then((summary: MonitoringSummary | undefined) => {
          if (summary) setMonitoring(summary);
        })
        .catch(() => undefined);
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [settings.aiProvider]);

  const updateDataSource = (sourceId: DataSourceId, enabled: boolean) => {
    updateSettings({
      enabledDataSources: {
        ...settings.enabledDataSources,
        [sourceId]: enabled,
      },
    });
  };

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Controls for review policy, scoring defaults, and enabled data sources.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <FileCheck2 className="w-5 h-5 text-red-600" />
            <h2 className="font-bold text-gray-900">Review Policy</h2>
          </div>
          <label className="flex items-center justify-between gap-4 border border-gray-200 rounded p-3 text-sm font-medium text-gray-800">
            Manager review required
            <input
              type="checkbox"
              checked={settings.requireReview}
              onChange={(event) => updateSettings({ requireReview: event.target.checked })}
              className="h-4 w-4 accent-red-600"
            />
          </label>
          <label className="mt-3 flex items-center justify-between gap-4 border border-gray-200 rounded p-3 text-sm font-medium text-gray-800">
            Audit trail visible
            <input
              type="checkbox"
              checked={settings.showAuditTrail}
              onChange={(event) => updateSettings({ showAuditTrail: event.target.checked })}
              className="h-4 w-4 accent-red-600"
            />
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-5 h-5 text-red-600" />
          <h2 className="font-bold text-gray-900">Recommendation Provider</h2>
          </div>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="AI provider">
            {aiProviderOptions.map((option) => {
              const selected = settings.aiProvider === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => updateSettings({ aiProvider: option.id })}
                  aria-pressed={selected}
                  className={`px-2 py-2 rounded border text-xs font-bold ${
                    selected ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="mt-4 border border-gray-200 rounded p-3">
            <div className="text-[10px] font-bold uppercase text-gray-500">Active Recommendation Service</div>
            <div className="mt-1 text-sm font-black text-gray-900">
              {monitoring ? `${providerLabel(monitoring.ai.provider)} / ${monitoring.ai.model}` : 'Loading'}
            </div>
            <div className={`mt-1 text-xs font-bold ${monitoring?.ai.configured ? 'text-green-700' : 'text-yellow-700'}`}>
              {monitoring ? (monitoring.ai.configured ? 'Ready' : 'Missing key') : 'Checking'}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <SlidersHorizontal className="w-5 h-5 text-red-600" />
            <h2 className="font-bold text-gray-900">Matching Defaults</h2>
          </div>
          <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
            Default manager priority
            <select
              value={settings.defaultManagerPriority}
              onChange={(event) => updateSettings({ defaultManagerPriority: event.target.value as ManagerPriorityMode })}
              className="mt-2 w-full px-3 py-2 border border-gray-200 rounded bg-white text-sm font-medium text-gray-900"
            >
              {priorityOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block mt-4 text-xs font-bold text-gray-600 uppercase tracking-wider">
            Import confidence threshold
            <div className="flex items-center gap-3 mt-2">
              <input
                type="range"
                min="50"
                max="99"
                value={settings.importConfidenceThreshold}
                onChange={(event) => updateSettings({ importConfidenceThreshold: Number(event.target.value) })}
                className="w-full accent-red-600"
              />
              <span className="text-sm font-bold text-gray-900 w-10">{settings.importConfidenceThreshold}%</span>
            </div>
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-5 h-5 text-red-600" />
            <h2 className="font-bold text-gray-900">Data Sources</h2>
          </div>
          {dataSourceOptions.map((source) => (
            <label key={source.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 border-gray-100 text-sm">
              <span className="flex items-center gap-2 font-medium text-gray-800">
                <input
                  type="checkbox"
                  checked={settings.enabledDataSources[source.id]}
                  onChange={(event) => updateDataSource(source.id, event.target.checked)}
                  className="h-4 w-4 accent-red-600"
                />
                {source.label}
              </span>
              <span
                className={`text-xs font-bold ${settings.enabledDataSources[source.id] ? 'text-green-700' : 'text-gray-400'}`}
              >
                {settings.enabledDataSources[source.id] ? 'Working' : 'Disabled'}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <LockKeyhole className="w-5 h-5 text-red-600" />
          <h2 className="font-bold text-gray-900">Governance Status</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            settings.requireReview ? 'Manager review enforced' : 'Manager review relaxed',
            settings.showAuditTrail ? 'Audit trail visible' : 'Audit trail hidden',
            `${selectedPriority.label} matching default`,
            `${selectedAiProvider.label} AI provider`,
            `${settings.importConfidenceThreshold}% import threshold`,
            `${enabledSourceCount} data source${enabledSourceCount === 1 ? '' : 's'} enabled`,
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 border border-gray-200 rounded p-3 text-sm font-bold text-gray-800">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              {item}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-5 h-5 text-red-600" />
          <h2 className="font-bold text-gray-900">System Monitoring</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricTile label="AI Cost" value={`$${(monitoring?.ai.estimatedCostUsd ?? 0).toFixed(6)}`} />
          <MetricTile label="Backup Response Rate" value={`${monitoring?.ai.fallbackRate ?? 0}%`} />
          <MetricTile label="Parser Events" value={monitoring?.parsers.failureEvents ?? 0} />
          <MetricTile label="Route Errors" value={monitoring?.routes.errorEvents ?? 0} />
        </div>
        <div className="mt-3 text-xs text-gray-500">
          {monitoring
            ? `${monitoring.persistenceMode === 'supabase' ? 'Durable' : 'Session'} monitoring store. ${monitoring.ai.totalRuns} recommendation run${monitoring.ai.totalRuns === 1 ? '' : 's'} tracked.`
            : 'Monitoring summary has not loaded yet.'}
        </div>
      </div>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-gray-200 rounded p-3">
      <div className="text-[10px] font-bold uppercase text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-black text-gray-900">{value}</div>
    </div>
  );
}

function providerLabel(provider: string) {
  if (provider === 'gemini') return 'Gemini';
  if (provider === 'openai') return 'OpenAI';
  return provider;
}
