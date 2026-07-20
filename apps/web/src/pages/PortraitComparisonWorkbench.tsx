import { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  BarChart3,
  ChevronRight,
  Eye,
  History,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../services/api';
import type {
  PortraitComparisonReadiness,
  PortraitComparisonSummary,
  PortraitComparisonDetail,
  DimensionAssessmentDetail,
} from '../types';

type ViewTab = 'history' | 'detail';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN');
  } catch {
    return iso;
  }
}

function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return (value * 100).toFixed(1);
}

function ReadinessStatus({ readiness }: { readiness: PortraitComparisonReadiness }) {
  const isReleased = readiness.status === 'ready';
  return (
    <div className="pc-readiness" data-testid="portrait-comparison-readiness">
      <div className="pc-readiness__header">
        <ShieldAlert size={16} />
        <span>Production Readiness</span>
        <span className={`status-badge ${isReleased ? 'status-badge--success' : 'status-badge--warning'}`}>
          {readiness.status}
        </span>
      </div>
      <div className="pc-readiness__details">
        <div className="pc-readiness__row">
          <span>Contract Version</span>
          <strong>{readiness.contractVersion}</strong>
        </div>
        <div className="pc-readiness__row">
          <span>Production Policy</span>
          <strong>{readiness.productionPolicyStatus}</strong>
        </div>
        <div className="pc-readiness__row">
          <span>Capabilities</span>
          <div className="pc-readiness__caps">
            {Object.entries(readiness.capabilities).map(([key, enabled]) => (
              <span
                key={key}
                className={`status-badge ${enabled ? 'status-badge--success' : 'status-badge--neutral'}`}
              >
                {key}: {enabled ? 'yes' : 'no'}
              </span>
            ))}
          </div>
        </div>
        {readiness.blockers.length > 0 && (
          <div className="pc-readiness__blockers">
            <AlertTriangle size={14} />
            <span>Blockers:</span>
            <ul>
              {readiness.blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {!isReleased && (
        <div className="alert-banner alert-banner--warning" data-testid="pc-create-disabled-notice">
          <AlertTriangle size={16} />
          <span>
            Production policy is <strong>not_released</strong>. Formal create is disabled. Wait for production policy release.
          </span>
        </div>
      )}
    </div>
  );
}

function DimensionTable({ assessments }: { assessments: readonly DimensionAssessmentDetail[] }) {
  if (assessments.length === 0) return <div className="empty-state"><div className="empty-state__title">No dimension assessments</div></div>;
  return (
    <div className="data-table-wrapper" data-testid="pc-dimension-table">
      <table className="data-table">
        <thead>
          <tr>
            <th>Dimension</th>
            <th>Baseline (norm)</th>
            <th>Comparison (norm)</th>
            <th>Raw Delta</th>
            <th>Similarity</th>
            <th>Weight</th>
            <th>Contribution</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {assessments.map((a) => (
            <tr key={a.dimensionKey}>
              <td style={{ fontWeight: 500 }}>{a.dimensionLabel}</td>
              <td>{a.baselineNormalizedValue !== null ? a.baselineNormalizedValue.toFixed(2) : '-'}</td>
              <td>{a.comparisonNormalizedValue !== null ? a.comparisonNormalizedValue.toFixed(2) : '-'}</td>
              <td>{a.rawDelta !== null ? a.rawDelta.toFixed(2) : '-'}</td>
              <td>{a.dimensionSimilarity !== null ? formatScore(a.dimensionSimilarity) : '-'}</td>
              <td>{a.weight}</td>
              <td>{a.weightedContribution !== null ? a.weightedContribution.toFixed(4) : '-'}</td>
              <td>
                <span className={`status-badge ${a.participation === 'included' ? 'status-badge--success' : 'status-badge--warning'}`}>
                  {a.participation}
                </span>
                {a.exclusionReason && <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--muted-foreground)' }}>({a.exclusionReason})</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PortraitComparisonWorkbench() {
  const [activeTab, setActiveTab] = useState<ViewTab>('history');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [readiness, setReadiness] = useState<PortraitComparisonReadiness | null>(null);
  const [runs, setRuns] = useState<PortraitComparisonSummary[]>([]);
  const [archiveFilter, setArchiveFilter] = useState<'active' | 'archived' | 'all'>('active');
  const [selectedRun, setSelectedRun] = useState<PortraitComparisonDetail | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const loadReadiness = useCallback(async () => {
    try {
      const res = await api.getPortraitComparisonReadiness();
      setReadiness(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to load readiness status');
    }
  }, []);

  const loadRuns = useCallback(async (filter: 'active' | 'archived' | 'all') => {
    try {
      const res = await api.getPortraitComparisonList(filter);
      setRuns(res.data.items);
    } catch (err) {
      console.error(err);
      setError('Failed to load comparison runs');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadReadiness(), loadRuns(archiveFilter)]);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setError('Failed to load portrait comparison data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [archiveFilter, loadReadiness, loadRuns]);

  const handleSelectRun = async (runId: string) => {
    setError(null);
    try {
      const res = await api.getPortraitComparisonDetail(runId);
      setSelectedRun(res.data);
      setActiveTab('detail');
    } catch (err) {
      console.error(err);
      setError(`Failed to load run detail: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  };

  const handleArchive = async (runId: string, operation: 'archived' | 'restored', currentState: 'active' | 'archived', sequence: number) => {
    setArchiveLoading(true);
    setError(null);
    try {
      await api.archivePortraitComparison(runId, operation, currentState, sequence);
      await loadRuns(archiveFilter);
      if (selectedRun?.id === runId) {
        const res = await api.getPortraitComparisonDetail(runId);
        setSelectedRun(res.data);
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'unknown error';
      if (msg.includes('409') || msg.includes('conflict') || msg.includes('stale') || msg.includes('state has changed')) {
        setError('Operation conflict: the run state has changed. Please refresh.');
      } else {
        setError(`Archive operation failed: ${msg}`);
      }
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleBackToList = () => {
    setSelectedRun(null);
    setActiveTab('history');
  };

  const getNextExpectedSequence = (detail: PortraitComparisonDetail): number => {
    if (detail.archiveEvents.length === 0) return 1;
    const maxSeq = Math.max(...detail.archiveEvents.map((e) => e.eventSequence));
    return maxSeq + 1;
  };

  if (loading) {
    return (
      <div className="pc-workbench">
        <div className="empty-state" style={{ minHeight: 300 }}>
          <div className="empty-state__title">Loading portrait comparison data...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="pc-workbench">
      <div className="pc-workbench__header">
        <div className="pc-workbench__title">
          <BarChart3 size={18} />
          <span>Portrait Comparison</span>
        </div>
        <div className="pc-workbench__tabs">
          <button
            className={`pc-workbench__tab${activeTab === 'history' ? ' pc-workbench__tab--active' : ''}`}
            onClick={() => { setActiveTab('history'); }}
            data-testid="pc-tab-history"
          >
            <History size={14} />
            History
            <span className="pc-workbench__tab-count">{runs.length}</span>
          </button>
          <button
            className={`pc-workbench__tab${activeTab === 'detail' ? ' pc-workbench__tab--active' : ''}`}
            onClick={() => setActiveTab('detail')}
            disabled={!selectedRun}
            data-testid="pc-tab-detail"
          >
            <Eye size={14} />
            Detail
          </button>
        </div>
      </div>

      {error && (
        <div className="alert-banner alert-banner--warning" data-testid="pc-error-banner">
          <AlertTriangle size={16} />
          <span>{error}</span>
          <button className="btn" onClick={() => setError(null)} style={{ marginLeft: 'auto' }}>Dismiss</button>
        </div>
      )}

      {readiness && <ReadinessStatus readiness={readiness} />}

      {activeTab === 'detail' && selectedRun ? (
        <div className="pc-detail" data-testid="pc-detail-view">
          <div className="pc-detail__header">
            <button className="btn" onClick={handleBackToList} data-testid="pc-back-to-list">
              Back to List
            </button>
            <h3>Run Detail: {selectedRun.id}</h3>
            <div className="pc-detail__actions">
              {selectedRun.archiveState === 'active' ? (
                <button
                  className="btn"
                  disabled={archiveLoading}
                  onClick={() => handleArchive(selectedRun.id, 'archived', 'active', getNextExpectedSequence(selectedRun))}
                  data-testid="pc-archive-btn"
                >
                  {archiveLoading ? <Loader2 size={14} className="sim-spin" /> : <Archive size={14} />}
                  Archive
                </button>
              ) : (
                <button
                  className="btn"
                  disabled={archiveLoading}
                  onClick={() => handleArchive(selectedRun.id, 'restored', 'archived', getNextExpectedSequence(selectedRun))}
                  data-testid="pc-restore-btn"
                >
                  {archiveLoading ? <Loader2 size={14} className="sim-spin" /> : <ArchiveRestore size={14} />}
                  Restore
                </button>
              )}
            </div>
          </div>

          <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
            <div className="metric-card metric-card--compact">
              <div className="metric-title">Mode</div>
              <div className="metric-value" style={{ fontSize: 14 }}>{selectedRun.mode}</div>
            </div>
            <div className="metric-card metric-card--compact">
              <div className="metric-title">Similarity Score</div>
              <div className="metric-value">{formatScore(selectedRun.similarityScore)}</div>
            </div>
            <div className="metric-card metric-card--compact">
              <div className="metric-title">Coverage</div>
              <div className="metric-value">{selectedRun.coverage}%</div>
            </div>
            <div className="metric-card metric-card--compact">
              <div className="metric-title">Quality Status</div>
              <div className="metric-value" style={{ fontSize: 14 }}>
                <span className={`status-badge ${selectedRun.qualityStatus === 'passed' ? 'status-badge--success' : 'status-badge--warning'}`}>
                  {selectedRun.qualityStatus}
                </span>
              </div>
            </div>
            <div className="metric-card metric-card--compact">
              <div className="metric-title">Archive State</div>
              <div className="metric-value" style={{ fontSize: 14 }}>
                <span className={`status-badge ${selectedRun.archiveState === 'active' ? 'status-badge--success' : 'status-badge--neutral'}`}>
                  {selectedRun.archiveState}
                </span>
              </div>
            </div>
            <div className="metric-card metric-card--compact">
              <div className="metric-title">Algorithm</div>
              <div className="metric-value" style={{ fontSize: 12 }}>{selectedRun.algorithmVersion}</div>
            </div>
            <div className="metric-card metric-card--compact">
              <div className="metric-title">Contract</div>
              <div className="metric-value" style={{ fontSize: 14 }}>v{selectedRun.comparisonContractVersion}</div>
            </div>
          </div>

          {selectedRun.qualityReasons.length > 0 && (
            <div className="alert-banner alert-banner--warning" style={{ marginTop: 8 }}>
              <AlertTriangle size={14} />
              <span>Quality reasons: {selectedRun.qualityReasons.join('; ')}</span>
            </div>
          )}

          <div className="pc-detail__participants">
            <div className="pc-detail__participant">
              <h4>Baseline</h4>
              <div className="pc-participant-card">
                <div><strong>{selectedRun.baseline.displayName}</strong></div>
                <div>Object: {selectedRun.baseline.family}/{selectedRun.baseline.objectType}</div>
                <div>Source: {selectedRun.baseline.source.sourceSystem}</div>
                <div>Snapshot: {selectedRun.baseline.source.snapshotId} (v{selectedRun.baseline.source.dataVersion})</div>
                <div>Period: {selectedRun.baseline.source.periodStart} — {selectedRun.baseline.source.periodEnd}</div>
                {selectedRun.baseline.source.sampleSize !== null && <div>Sample: {selectedRun.baseline.source.sampleSize}</div>}
                {selectedRun.baseline.source.confidence !== null && <div>Confidence: {(selectedRun.baseline.source.confidence * 100).toFixed(0)}%</div>}
              </div>
            </div>
            <div className="pc-detail__participant">
              <h4>Comparison</h4>
              <div className="pc-participant-card">
                <div><strong>{selectedRun.comparison.displayName}</strong></div>
                <div>Object: {selectedRun.comparison.family}/{selectedRun.comparison.objectType}</div>
                <div>Source: {selectedRun.comparison.source.sourceSystem}</div>
                <div>Snapshot: {selectedRun.comparison.source.snapshotId} (v{selectedRun.comparison.source.dataVersion})</div>
                <div>Period: {selectedRun.comparison.source.periodStart} — {selectedRun.comparison.source.periodEnd}</div>
                {selectedRun.comparison.source.sampleSize !== null && <div>Sample: {selectedRun.comparison.source.sampleSize}</div>}
                {selectedRun.comparison.source.confidence !== null && <div>Confidence: {(selectedRun.comparison.source.confidence * 100).toFixed(0)}%</div>}
              </div>
            </div>
          </div>

          <h4>Dimension Assessments</h4>
          <DimensionTable assessments={selectedRun.dimensionAssessments} />

          {selectedRun.explanationAttempts.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4>Explanation Attempts</h4>
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr><th>ID</th><th>Seq</th><th>Generator</th><th>Status</th><th>Started</th><th>Completed</th></tr>
                  </thead>
                  <tbody>
                    {selectedRun.explanationAttempts.map((ea) => (
                      <tr key={ea.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{ea.id}</td>
                        <td>{ea.attemptSequence}</td>
                        <td>{ea.generatorType}/{ea.generatorId}</td>
                        <td><span className={`status-badge ${ea.status === 'succeeded' ? 'status-badge--success' : 'status-badge--warning'}`}>{ea.status}</span></td>
                        <td>{formatDate(ea.startedAt)}</td>
                        <td>{ea.completedAt ? formatDate(ea.completedAt) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {selectedRun.archiveEvents.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4>Archive Events</h4>
              <div className="data-table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr><th>Seq</th><th>Operation</th><th>Reason</th><th>Actor</th><th>Time</th></tr>
                  </thead>
                  <tbody>
                    {selectedRun.archiveEvents.map((evt) => (
                      <tr key={evt.eventSequence}>
                        <td>{evt.eventSequence}</td>
                        <td><span className={`status-badge ${evt.operation === 'archived' ? 'status-badge--neutral' : 'status-badge--success'}`}>{evt.operation}</span></td>
                        <td>{evt.reason || '-'}</td>
                        <td>{evt.actor}</td>
                        <td>{formatDate(evt.occurredAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="pc-detail__meta" style={{ marginTop: 12, fontSize: 12, color: 'var(--muted-foreground)' }}>
            <span>Created: {formatDate(selectedRun.createdAt)}</span>
            <span>By: {selectedRun.createdByDisplayName || selectedRun.createdBy}</span>
            <span>Algorithm: {selectedRun.algorithmId} v{selectedRun.algorithmVersion}</span>
          </div>
        </div>
      ) : (
        <div className="pc-history" data-testid="pc-history-view">
          <div className="pc-history__header">
            <div className="pc-history__filters">
              <select
                className="form-control"
                value={archiveFilter}
                onChange={(e) => setArchiveFilter(e.target.value as 'active' | 'archived' | 'all')}
                data-testid="pc-archive-filter"
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
                <option value="all">All</option>
              </select>
              <button className="btn" onClick={() => loadRuns(archiveFilter)} data-testid="pc-refresh-btn">
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>
          </div>

          {runs.length === 0 ? (
            <div className="empty-state" data-testid="pc-empty-list">
              <div className="empty-state__icon">📋</div>
              <div className="empty-state__title">No comparison runs found</div>
              <p>
                {readiness?.status === 'not_released'
                  ? 'Production policy is not released. No runs can be created yet.'
                  : 'Create a comparison run to see it listed here.'}
              </p>
            </div>
          ) : (
            <div className="pc-history__list" data-testid="pc-run-list">
              {runs.map((run) => (
                <button
                  key={run.id}
                  className="pc-history__item"
                  onClick={() => handleSelectRun(run.id)}
                  data-testid={`pc-run-item-${run.id}`}
                >
                  <div className="pc-history__item-main">
                    <span className="pc-history__item-id">{run.id}</span>
                    <span className={`status-badge ${run.qualityStatus === 'passed' ? 'status-badge--success' : 'status-badge--warning'}`}>
                      {run.qualityStatus}
                    </span>
                  </div>
                  <div className="pc-history__item-meta">
                    <span>{formatDate(run.createdAt)}</span>
                    <span>{run.baselineDisplayName} vs {run.comparisonDisplayName}</span>
                    <span>Score: {formatScore(run.similarityScore)}</span>
                    <span>Coverage: {run.coverage}%</span>
                    <span>{run.mode}</span>
                  </div>
                  <ChevronRight size={16} className="pc-history__item-arrow" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
