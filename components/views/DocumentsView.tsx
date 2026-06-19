'use client';

import { useMemo, useState } from 'react';
import { AlertCircle, Database, Download, FileText, FolderOpen, Search } from 'lucide-react';
import type { Task } from '@/lib/types';
import { downloadWorkMatchDocument, formatFileSize, getProjectDocuments } from '@/lib/document-vault';

interface DocumentsViewProps {
  tasks: Task[];
  onOpenTask: (taskId: string) => void;
}

export default function DocumentsView({ tasks, onOpenTask }: DocumentsViewProps) {
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('All');
  const documents = useMemo(() => getProjectDocuments(tasks), [tasks]);
  const projectsWithDocuments = useMemo(
    () => Array.from(new Set(documents.map((document) => document.taskName))).sort(),
    [documents]
  );
  const filteredDocuments = documents.filter((document) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery =
      !normalizedQuery ||
      document.fileName.toLowerCase().includes(normalizedQuery) ||
      document.taskName.toLowerCase().includes(normalizedQuery);
    const matchesProject = projectFilter === 'All' || document.taskName === projectFilter;
    return matchesQuery && matchesProject;
  });
  const storedBinaryCount = documents.filter((document) => Boolean(document.dataUrl)).length;

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Document Vault</h1>
          <p className="mt-1 text-sm text-gray-500">Project requirement files and imported source documents.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:w-[360px]">
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="text-[10px] font-bold uppercase text-gray-500">Documents</div>
            <div className="text-xl font-black text-gray-900">{documents.length}</div>
          </div>
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="text-[10px] font-bold uppercase text-gray-500">Stored Files</div>
            <div className="text-xl font-black text-red-600">{storedBinaryCount}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded border border-gray-200 bg-white p-3 shadow-sm md:grid-cols-[1fr_240px]">
        <label className="relative text-xs font-bold text-gray-700">
          <Search className="absolute left-3 top-[33px] h-4 w-4 text-gray-400" />
          Search
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search files or projects..."
            className="mt-1 w-full rounded border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
          />
        </label>
        <label className="text-xs font-bold text-gray-700">
          Project
          <select
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
            className="mt-1 w-full rounded border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
          >
            <option>All</option>
            {projectsWithDocuments.map((project) => (
              <option key={project}>{project}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
        <div className="h-full overflow-auto">
          <table className="w-full min-w-[920px] table-fixed text-left text-sm">
            <colgroup>
              <col />
              <col style={{ width: '260px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '150px' }} />
              <col style={{ width: '190px' }} />
            </colgroup>
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-bold">File</th>
                <th className="px-4 py-3 font-bold">Project</th>
                <th className="px-4 py-3 font-bold">Size</th>
                <th className="px-4 py-3 font-bold">Storage</th>
                <th className="px-4 py-3 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredDocuments.map((document) => (
                <tr key={document.id} className="hover:bg-gray-50">
                  <td className="px-4 py-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
                      <div className="min-w-0">
                        <div className="truncate font-bold text-gray-900">{document.fileName}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          Linked {new Date(document.linkedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() => onOpenTask(document.taskId)}
                      className="flex max-w-full items-center gap-2 rounded px-2 py-1 text-left text-xs font-bold text-gray-800 hover:bg-gray-100"
                    >
                      <FolderOpen className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                      <span className="truncate">{document.taskName}</span>
                    </button>
                  </td>
                  <td className="px-4 py-4 text-xs font-bold text-gray-700">{formatFileSize(document.sizeBytes)}</td>
                  <td className="px-4 py-4">
                    {document.dataUrl ? (
                      <span className="inline-flex items-center gap-1.5 rounded bg-green-50 px-2 py-1 text-[10px] font-bold uppercase text-green-700">
                        <Database className="h-3 w-3" /> Stored
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase text-amber-700">
                        <AlertCircle className="h-3 w-3" /> Metadata only
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!document.dataUrl}
                        onClick={() => downloadWorkMatchDocument(document)}
                        className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredDocuments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                    No documents match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
