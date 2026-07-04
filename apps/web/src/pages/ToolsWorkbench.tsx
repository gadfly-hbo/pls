import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { ToolDefinition, ToolRun, DbOperationDryRunResult } from '../types';

const CATEGORY_MAP: Record<string, string> = {
  profile_extract: '画像提取',
  business_aggregate: '明细聚合',
  format_convert: '格式转换'
};

export default function ToolsWorkbench() {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [runs, setRuns] = useState<ToolRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'catalog' | 'recent_runs'>('catalog');
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Form State
  const [inputPath, setInputPath] = useState('');
  const [outputDir, setOutputDir] = useState('');
  const [parameters, setParameters] = useState('{\n  \n}');
  const [executing, setExecuting] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<any>(null);

  // Import State
  const [importDryRun, setImportDryRun] = useState<DbOperationDryRunResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importConfirmText, setImportConfirmText] = useState('');

  // Preview State
  const [previewArtifactId, setPreviewArtifactId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    fetchTools();
  }, []);

  const fetchTools = async () => {
    setLoading(true);
    try {
      const [toolsRes, runsRes] = await Promise.all([
        api.getTools(),
        api.getToolRuns()
      ]);
      setTools(toolsRes.data.items);
      setRuns(runsRes.data.items);
      if (toolsRes.data.items.length > 0) {
        setSelectedToolId(toolsRes.data.items[0].toolId);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDryRunTool = async () => {
    if (!selectedToolId) return;
    setExecuting(true);
    setDryRunResult(null);
    try {
      let parsedParams = {};
      try {
        parsedParams = JSON.parse(parameters);
      } catch {
        // ignore
      }
      const res = await api.executeToolRunDryRun(selectedToolId, { inputPath, outputDir, parameters: parsedParams });
      setDryRunResult(res.data);
    } catch (e: any) {
      alert('Dry Run Failed: ' + e.message);
    } finally {
      setExecuting(false);
    }
  };

  const handleExecuteTool = async () => {
    if (!selectedToolId) return;
    setExecuting(true);
    try {
      let parsedParams = {};
      try {
        parsedParams = JSON.parse(parameters);
      } catch {
        // ignore
      }
      const res = await api.executeToolRun(selectedToolId, { inputPath, outputDir, parameters: parsedParams });
      
      // Add to recent runs and switch view
      setRuns(prev => [res.data, ...prev]);
      setActiveTab('recent_runs');
      setSelectedRunId(res.data.runId);
      setDryRunResult(null);
    } catch (e: any) {
      alert('Execution Failed: ' + e.message);
    } finally {
      setExecuting(false);
    }
  };

  const handleImportDryRun = async () => {
    if (!selectedRunId) return;
    setImporting(true);
    try {
      const res = await api.importToolRunDryRun(selectedRunId);
      setImportDryRun(res.data);
    } catch (e: any) {
      alert('Import Dry Run Failed: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  const handlePreviewArtifact = async (artifactId: string) => {
    if (!selectedRunId) return;
    setPreviewArtifactId(artifactId);
    setPreviewLoading(true);
    setPreviewContent('');
    try {
      const text = await api.getToolArtifactContent(selectedRunId, artifactId);
      setPreviewContent(text);
    } catch (e: any) {
      setPreviewContent('Failed to load artifact: ' + e.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleFormalImport = async () => {
    if (!selectedRunId || !importConfirmText) return;
    setImporting(true);
    try {
      await api.importToolRun(selectedRunId, importConfirmText);
      alert('导入成功！');
      setShowImportModal(false);
      setImportConfirmText('');
    } catch (e: any) {
      alert('导入失败: ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  const groupedTools = useMemo(() => {
    const groups: Record<string, ToolDefinition[]> = {};
    tools.forEach(t => {
      const cat = t.category || 'other';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(t);
    });
    return groups;
  }, [tools]);

  const selectedTool = tools.find(t => t.toolId === selectedToolId);
  const selectedRun = runs.find(r => r.runId === selectedRunId);

  return (
    <div className="account-workbench">
      <div className="page-header">
        <div className="page-header__info">
          <h2 className="page-header__title">本地工具工作台</h2>
          <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
            执行本地提取与聚合任务，生成标准数据包
          </div>
        </div>
      </div>

      <div className="account-workbench__body dashboard-grid">
        {/* Sidebar */}
        <div className="workbench-sidebar">
          <div className="segmented-control" style={{ margin: '0 16px 12px' }}>
            <button 
              className={`segmented-control__btn${activeTab === 'catalog' ? ' segmented-control__btn--active' : ''}`}
              onClick={() => setActiveTab('catalog')}
            >
              工具目录
            </button>
            <button 
              className={`segmented-control__btn${activeTab === 'recent_runs' ? ' segmented-control__btn--active' : ''}`}
              onClick={() => setActiveTab('recent_runs')}
            >
              最近运行
            </button>
          </div>
          
          <div className="workbench-sidebar__list">
            {loading ? (
              <div className="empty-state">
                <div className="empty-state__title">加载中...</div>
              </div>
            ) : activeTab === 'catalog' ? (
              Object.entries(groupedTools).map(([cat, list]) => (
                <div key={cat} className="workbench-sidebar__group">
                  <div className="workbench-sidebar__group-label">
                    {CATEGORY_MAP[cat] || cat}
                  </div>
                  <div className="workbench-sidebar__group-items">
                    {list.map(t => (
                      <div 
                        key={t.toolId}
                        className={`entity-list-item${selectedToolId === t.toolId ? ' entity-list-item--selected' : ''}`}
                        onClick={() => { setSelectedToolId(t.toolId); setDryRunResult(null); }}
                      >
                        <div className="entity-list-item__name">{t.name}</div>
                        <div className="entity-list-item__id">{t.toolId}</div>
                        <div className="entity-list-item__footer">
                          <span>{t.version}</span>
                          <span className={`status-badge ${t.riskLevel === 'L1' ? 'status-badge--success' : 'status-badge--warning'}`}>
                            {t.riskLevel}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="workbench-sidebar__group">
                <div className="workbench-sidebar__group-items">
                  {runs.length === 0 && (
                    <div className="empty-state" style={{ padding: 20 }}>
                      <div className="empty-state__title">暂无运行记录</div>
                    </div>
                  )}
                  {runs.map(r => (
                    <div 
                      key={r.runId}
                      className={`entity-list-item${selectedRunId === r.runId ? ' entity-list-item--selected' : ''}`}
                      onClick={() => { setSelectedRunId(r.runId); setImportDryRun(null); }}
                    >
                      <div className="entity-list-item__name">{r.toolId}</div>
                      <div className="entity-list-item__id" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.runId}</div>
                      <div className="entity-list-item__footer">
                        <span>{new Date(r.startedAt).toLocaleString()}</span>
                        <span className={`status-badge status-badge--${r.status === 'succeeded' ? 'success' : 'neutral'}`}>
                          {r.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="workbench-detail" style={{ overflow: 'auto' }}>
          {error && <div className="alert-banner alert-banner--warning" style={{ margin: 16 }}>⚠️ {error}</div>}
          
          {activeTab === 'catalog' && selectedTool ? (
            <div style={{ padding: 20 }}>
              <div className="page-header" style={{ padding: 0, border: 'none', marginBottom: 20, background: 'transparent' }}>
                <div>
                  <h2 className="page-header__title" style={{ fontSize: 20 }}>{selectedTool.name}</h2>
                  <div style={{ color: 'var(--muted-foreground)', marginTop: 4, fontSize: 14 }}>{selectedTool.description}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span className="status-badge status-badge--neutral">版本: {selectedTool.version}</span>
                  <span className={`status-badge ${selectedTool.riskLevel === 'L1' ? 'status-badge--success' : 'status-badge--warning'}`}>
                    风险: {selectedTool.riskLevel}
                  </span>
                </div>
              </div>

              <div className="panel">
                <h3 className="panel__title">执行配置</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-item">
                    <label>输入路径 (支持格式: {selectedTool.inputFormats.join(', ')})</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="输入本地文件或目录绝对路径" 
                      value={inputPath}
                      onChange={e => setInputPath(e.target.value)}
                    />
                  </div>
                  <div className="form-item">
                    <label>输出目录</label>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="留空则由系统自动生成在 data/local/tool-runs/" 
                      value={outputDir}
                      onChange={e => setOutputDir(e.target.value)}
                    />
                  </div>
                  <div className="form-item">
                    <label>执行参数 (JSON 格式)</label>
                    <textarea 
                      className="form-control" 
                      rows={5}
                      style={{ fontFamily: 'monospace', resize: 'vertical' }}
                      value={parameters}
                      onChange={e => setParameters(e.target.value)}
                    />
                  </div>
                  
                  {dryRunResult && (
                    <div style={{ padding: 16, background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)' }}>
                      {(dryRunResult.isValid || dryRunResult.status === 'planned') ? (
                        <div style={{ color: 'var(--success)', fontSize: 13, marginBottom: 8 }}>✅ 配置校验通过</div>
                      ) : (
                        <div style={{ color: 'var(--destructive)', fontSize: 13, marginBottom: 8 }}>❌ 配置校验失败</div>
                      )}
                      {dryRunResult.warnings && dryRunResult.warnings.length > 0 && (
                        <div style={{ color: 'var(--warning)', fontSize: 13 }}>
                          <strong>Warnings:</strong>
                          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                            {dryRunResult.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                    <button className="btn" onClick={handleDryRunTool} disabled={executing}>
                      {executing ? '执行中...' : '校验配置 (Dry Run)'}
                    </button>
                    <button className="btn btn-primary" onClick={handleExecuteTool} disabled={executing || !inputPath}>
                      {executing ? '执行中...' : '开始执行'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === 'recent_runs' && selectedRun ? (
            <div style={{ padding: 20 }}>
              <div className="page-header" style={{ padding: 0, border: 'none', marginBottom: 20, background: 'transparent' }}>
                <div>
                  <h2 className="page-header__title" style={{ fontSize: 20 }}>运行详情</h2>
                  <div style={{ color: 'var(--muted-foreground)', marginTop: 4, fontSize: 14 }}>
                    工具: {selectedRun.toolId} | 工作区: {selectedRun.workspaceId}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span className={`status-badge status-badge--${selectedRun.status === 'succeeded' ? 'success' : 'danger'}`}>
                    {selectedRun.status}
                  </span>
                  <span className="status-badge status-badge--neutral">
                    耗时: {((new Date(selectedRun.finishedAt || Date.now()).getTime() - new Date(selectedRun.startedAt).getTime()) / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>

              <div className="metric-grid" style={{ marginBottom: 20 }}>
                <div className="metric-card metric-card--compact" style={{ background: 'var(--background)' }}>
                  <div className="metric-title">输入路径</div>
                  <div className="metric-value" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis' }} title={selectedRun.inputPath}>
                    {selectedRun.inputPath}
                  </div>
                </div>
                <div className="metric-card metric-card--compact" style={{ background: 'var(--background)' }}>
                  <div className="metric-title">输出目录</div>
                  <div className="metric-value" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis' }} title={selectedRun.outputDir}>
                    {selectedRun.outputDir}
                  </div>
                </div>
              </div>

              {selectedRun.warnings && selectedRun.warnings.length > 0 && (
                <div className="alert-banner alert-banner--warning" style={{ marginBottom: 20 }}>
                  <strong>Warnings:</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                    {selectedRun.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              {selectedRun.errors && selectedRun.errors.length > 0 && (
                <div className="alert-banner alert-banner--danger" style={{ marginBottom: 20 }}>
                  <strong>Errors:</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                    {selectedRun.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}

              <div className="panel">
                <h3 className="panel__title">产物列表 (Artifacts)</h3>
                {selectedRun.artifacts.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>暂无产物</div>
                ) : (
                  <div className="data-table-wrapper">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>文件名称</th>
                          <th>类型</th>
                          <th>相对路径</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRun.artifacts.map(a => (
                          <tr key={a.artifactId}>
                            <td style={{ fontWeight: 500 }}>{a.name}</td>
                            <td><span className="status-badge status-badge--neutral">{a.type}</span></td>
                            <td style={{ color: 'var(--muted-foreground)' }}>{a.path}</td>
                            <td>
                              <button className="btn" style={{ height: 26, padding: '0 8px', fontSize: 12 }} onClick={() => handlePreviewArtifact(a.artifactId)}>预览</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {selectedRun.qualityReport && (
                <div className="panel">
                  <h3 className="panel__title">质量报告</h3>
                  <pre style={{ margin: 0, padding: 12, background: 'var(--background)', borderRadius: 8, fontSize: 12, overflowX: 'auto', border: '1px solid var(--border)' }}>
                    {JSON.stringify(selectedRun.qualityReport, null, 2)}
                  </pre>
                </div>
              )}

              <div className="panel">
                <h3 className="panel__title">导入数据管理</h3>
                <div style={{ color: 'var(--muted-foreground)', fontSize: 13, marginBottom: 16 }}>
                  将当前提取/聚合的数据包导入至工作区数据库中。导入前请先执行 Dry Run 评估影响范围。
                </div>
                
                {importDryRun && (
                  <div style={{ padding: 16, background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Import Dry Run 分析</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                      <div><strong>影响表：</strong> {importDryRun.affectedTables.join(', ')}</div>
                      <div><strong>影响行数：</strong> {importDryRun.affectedRows}</div>
                    </div>
                    {importDryRun.warnings && importDryRun.warnings.length > 0 && (
                      <div style={{ marginTop: 12, color: 'var(--warning)' }}>
                        <strong>Warnings:</strong>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                          {importDryRun.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button className="btn" onClick={handleImportDryRun} disabled={importing || selectedRun.status !== 'succeeded'}>
                    {importing ? '分析中...' : '评估影响 (Dry Run)'}
                  </button>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <button className="btn btn-primary" onClick={() => setShowImportModal(true)} disabled={!importDryRun}>
                      正式导入
                    </button>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="empty-state" style={{ minHeight: '100%', border: 'none' }}>
              <div className="empty-state__icon">👈</div>
              <div className="empty-state__title">请在左侧选择一个工具或运行记录</div>
            </div>
          )}
        </div>
      </div>

      {/* Import Modal */}
      {showImportModal && importDryRun && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal" style={{ background: 'var(--card)', padding: 24, borderRadius: 12, width: 480 }}>
            <h3 className="modal__title" style={{ marginTop: 0 }}>确认导入</h3>
            <div className="modal__body">
              <div style={{ color: 'var(--destructive)', marginBottom: 12, fontSize: 14 }}>
                请确认您已阅读 Dry Run 分析结果。继续操作将直接修改数据库。
              </div>
              <div className="form-item">
                <label style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>确认文本 (请输入: {importDryRun.requiredConfirmText})</label>
                <input 
                  type="text" 
                  className="form-control"
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  value={importConfirmText}
                  onChange={e => setImportConfirmText(e.target.value)}
                  placeholder="输入确认文本"
                />
              </div>
            </div>
            <div className="modal__footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
              <button className="btn" onClick={() => setShowImportModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleFormalImport} disabled={importConfirmText !== importDryRun.requiredConfirmText || importing}>
                {importing ? '执行中...' : '确认导入'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewArtifactId && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="modal" style={{ background: 'var(--card)', padding: 24, borderRadius: 12, width: 800, maxWidth: '90vw', height: '80vh', display: 'flex', flexDirection: 'column' }}>
            <h3 className="modal__title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 0 }}>
              <span>产物预览</span>
              <button className="btn" style={{ height: 24, padding: '0 8px' }} onClick={() => setPreviewArtifactId(null)}>关闭</button>
            </h3>
            <div className="modal__body" style={{ flex: 1, overflow: 'auto', background: 'var(--background)', margin: '16px 0', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
              {previewLoading ? (
                <div style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>加载中...</div>
              ) : (
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 13, fontFamily: 'monospace' }}>
                  {previewContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
