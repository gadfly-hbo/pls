import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { DbOverview, DbTableInfo, DbMigration, DbDataVersion, DbImportJob, DbAuditEvent, DbSchemaInfo, DbSampleInfo, DbOperationDryRunResult, DbOperationExecuteResult } from '../types';
import databaseReadme from '../../../../docs/pls-sqlite-readme.md?raw';

type TabType = 'overview' | 'tables' | 'imports' | 'versions' | 'schema' | 'audits' | 'dangerous' | 'readme';
const LOCAL_ADMIN_TOKEN = 'pls-admin-token';

function getOperationTitle(type: string): string {
  switch (type) {
    case 'IMPORT':
      return '导入数据包';
    case 'CLEAR_TABLE':
      return '清空表';
    case 'DROP_TABLE':
      return '删除表';
    case 'DELETE_VERSION':
      return '删除数据版本';
    case 'APPLY_MIGRATIONS':
      return '应用迁移';
    case 'RESET':
      return '重建数据库';
    default:
      return type;
  }
}

function getQualityReportSummary(report: unknown): string {
  if (!report || typeof report !== 'object') return '无';
  const fields = report as Record<string, unknown>;
  const batchId = typeof fields.batchId === 'string' ? fields.batchId : '';
  const dataVersion = typeof fields.dataVersion === 'string' ? fields.dataVersion : '';
  const generatedAt = typeof fields.generatedAt === 'string' ? fields.generatedAt : '';
  return [batchId, dataVersion, generatedAt].filter(Boolean).join(' · ') || '已生成';
}

export default function DataManagementWorkbench() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [loading, setLoading] = useState(false);

  // State for data
  const [overview, setOverview] = useState<DbOverview | null>(null);
  const [tables, setTables] = useState<DbTableInfo[]>([]);
  const [imports, setImports] = useState<DbImportJob[]>([]);
  const [versions, setVersions] = useState<DbDataVersion[]>([]);
  const [migrations, setMigrations] = useState<DbMigration[]>([]);
  const [audits, setAudits] = useState<DbAuditEvent[]>([]);

  // State for Table Details modal/drawer
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSchema, setTableSchema] = useState<DbSchemaInfo | null>(null);
  const [tableSample, setTableSample] = useState<DbSampleInfo | null>(null);

  // State for dangerous operations
  const [opModalOpen, setOpModalOpen] = useState(false);
  const [opType, setOpType] = useState<string>('');
  const [opTarget, setOpTarget] = useState<string>('');
  const [opDryRun, setOpDryRun] = useState<DbOperationDryRunResult | null>(null);
  const [opConfirmText, setOpConfirmText] = useState('');
  const [opError, setOpError] = useState<string | null>(null);
  const [opExecuting, setOpExecuting] = useState(false);
  const [opExecuteResult, setOpExecuteResult] = useState<DbOperationExecuteResult | null>(null);

  // State for audits filter
  const [auditFilterOp, setAuditFilterOp] = useState('');
  const [auditFilterTarget, setAuditFilterTarget] = useState('');
  const [auditFilterStatus, setAuditFilterStatus] = useState('');

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  const loadData = async (tab: TabType) => {
    setLoading(true);
    try {
      if (tab === 'overview') {
        const [res, importRes, auditRes] = await Promise.all([
          api.getDbOverview(),
          api.getDbImportJobs(),
          api.getDbAuditEvents()
        ]);
        setOverview(res.data);
        setImports(importRes.data.items);
        setAudits(auditRes.data.items);
      } else if (tab === 'tables') {
        const res = await api.getDbTables();
        setTables(res.data.items);
      } else if (tab === 'imports') {
        const res = await api.getDbImportJobs();
        setImports(res.data.items);
      } else if (tab === 'versions') {
        const res = await api.getDbVersions();
        setVersions(res.data.items);
      } else if (tab === 'schema') {
        const res = await api.getDbMigrations();
        setMigrations(res.data.items);
      } else if (tab === 'audits') {
        const res = await api.getDbAuditEvents();
        setAudits(res.data.items);
      } else if (tab === 'readme' || tab === 'dangerous') {
        return;
      }
    } catch (e) {
      console.error('Failed to load DB admin data:', e);
    } finally {
      setLoading(false);
    }
  };

  const viewTableDetails = async (tableName: string) => {
    setSelectedTable(tableName);
    setTableSchema(null);
    setTableSample(null);
    try {
      const [schemaRes, sampleRes] = await Promise.all([
        api.getDbSchema(tableName),
        api.getDbSample(tableName)
      ]);
      setTableSchema(schemaRes.data);
      setTableSample(sampleRes.data);
    } catch (e) {
      console.error('Failed to load table details', e);
    }
  };

  const handleStartOperation = async (type: string, target: string) => {
    setOpType(type);
    setOpTarget(target);
    setOpDryRun(null);
    setOpExecuteResult(null);
    setOpConfirmText('');
    setOpError(null);
    setOpModalOpen(true);
    setOpExecuting(true);
    try {
      const res = await api.dryRunDbOperation(type, target, LOCAL_ADMIN_TOKEN);
      setOpDryRun(res.data);
    } catch (e: any) {
      setOpError('Dry run failed: ' + e.message);
    } finally {
      setOpExecuting(false);
    }
  };

  const handleExecuteOperation = async () => {
    setOpError(null);
    setOpExecuting(true);
    try {
      const res = await api.executeDbOperation(opType, opTarget, opConfirmText, LOCAL_ADMIN_TOKEN);
      setOpExecuteResult(res.data);
      loadData(activeTab);
    } catch (e: any) {
      setOpError('Operation failed: ' + e.message);
    } finally {
      setOpExecuting(false);
    }
  };

  const tabs: { key: TabType; label: string }[] = [
    { key: 'overview', label: '总览' },
    { key: 'tables', label: '库表' },
    { key: 'imports', label: '导入' },
    { key: 'versions', label: '版本' },
    { key: 'schema', label: 'Schema' },
    { key: 'audits', label: '操作日志' },
    { key: 'dangerous', label: '危险操作' },
    { key: 'readme', label: 'README' },
  ];

  return (
    <div className="data-management-workbench" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="page-header">
        <div className="page-header__info">
          <h2 className="page-header__title">数据管理</h2>
          <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
            管理工作台：查看并管理 SQLite 状态、库表、导入历史及操作审计
          </div>
        </div>
      </div>

      <div className="segmented-control" style={{ display: 'flex', gap: 4, overflowX: 'auto', flexWrap: 'wrap' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`segmented-control__btn${activeTab === tab.key ? ' segmented-control__btn--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {loading && <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--muted-foreground)' }}>正在加载...</div>}

        {!loading && activeTab === 'overview' && overview && (
          <div className="panel">
            <h3 className="panel__title">数据库总览</h3>
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
              <div className="metric-card"><div className="metric-card__title">工作区</div><div className="metric-card__value">{overview.workspaceId}</div></div>
              <div className="metric-card"><div className="metric-card__title">状态</div><div className="metric-card__value">{overview.databaseStatus}</div></div>
              <div className="metric-card"><div className="metric-card__title">Schema 版本</div><div className="metric-card__value">{overview.schemaVersion}</div></div>
              <div className="metric-card">
                <div className="metric-card__title">Migration 状态</div>
                <div className="metric-card__value" style={{ fontSize: 15 }}>
                  {overview.migrationStatus.applied} / {overview.migrationStatus.total} 
                  {overview.migrationStatus.failed > 0 && <span style={{ color: 'var(--destructive)', marginLeft: 8 }}>({overview.migrationStatus.failed} failed)</span>}
                </div>
              </div>
              <div className="metric-card"><div className="metric-card__title">表 / 视图数量</div><div className="metric-card__value">{overview.tableCount} / {overview.viewCount}</div></div>
              <div className="metric-card"><div className="metric-card__title">总行数</div><div className="metric-card__value">{overview.totalRows}</div></div>
            </div>

            <h4 style={{ marginTop: 20, marginBottom: 10, fontSize: 14 }}>数据标识</h4>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className={`status-badge ${overview.hasMockData ? 'status-badge--warning' : 'status-badge--neutral'}`}>Mock 数据: {overview.hasMockData ? '存在' : '无'}</span>
              <span className={`status-badge ${overview.hasSmokeData ? 'status-badge--warning' : 'status-badge--neutral'}`}>Smoke 数据: {overview.hasSmokeData ? '存在' : '无'}</span>
              <span className={`status-badge ${overview.hasE2eData ? 'status-badge--warning' : 'status-badge--neutral'}`}>E2E 数据: {overview.hasE2eData ? '存在' : '无'}</span>
              <span className={`status-badge ${overview.hasUserAuthorizedData ? 'status-badge--success' : 'status-badge--neutral'}`}>用户授权数据: {overview.hasUserAuthorizedData ? '存在' : '无'}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 20 }}>
              <div className="panel" style={{ margin: 0, padding: 14 }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>最近导入</h4>
                {imports.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {imports.slice(0, 3).map((imp, index) => (
                      <li key={imp.jobId || `recent-import-${index}`} style={{ marginBottom: 4 }}>
                        {new Date(imp.startedAt).toLocaleString()} - {imp.sourceType} 
                        <span className={`status-badge status-badge--${imp.status === 'succeeded' ? 'success' : 'neutral'}`} style={{ marginLeft: 6 }}>{imp.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>暂无导入记录</span>}
              </div>
              <div className="panel" style={{ margin: 0, padding: 14 }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>最近危险操作</h4>
                {audits.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                    {audits.slice(0, 3).map((aud, index) => (
                      <li key={aud.eventId || `recent-audit-${index}`} style={{ marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {new Date(aud.createdAt).toLocaleString()} - <strong>{aud.operation}</strong> on {aud.target}
                        <span className={`status-badge status-badge--${aud.status === 'success' ? 'success' : 'danger'}`} style={{ marginLeft: 6 }}>{aud.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>暂无危险操作记录</span>}
              </div>
            </div>
          </div>
        )}

        {!loading && activeTab === 'tables' && (
          <div className="panel">
            <h3 className="panel__title">库表明细</h3>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>表/视图名</th>
                    <th>类型</th>
                    <th>行数</th>
                    <th>所属域</th>
                    <th>系统表</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map(t => (
                    <tr key={t.name}>
                      <td style={{ fontWeight: 500 }}>{t.name}</td>
                      <td>{t.type}</td>
                      <td>{t.rowCount}</td>
                      <td>{t.domain}</td>
                      <td>
                        {t.isSystem ? <span className="status-badge status-badge--warning">是</span> : <span className="status-badge status-badge--neutral">否</span>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button className="btn" onClick={() => viewTableDetails(t.name)}>详情</button>
                          {t.isClearable && <button className="btn btn--danger" onClick={() => handleStartOperation('CLEAR_TABLE', t.name)}>清空</button>}
                          {t.isDeletable && <button className="btn btn--danger" onClick={() => handleStartOperation('DROP_TABLE', t.name)}>删除</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedTable && (
              <div style={{ marginTop: 20, padding: 14, background: 'var(--background)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div className="flex-between" style={{ marginBottom: 10 }}>
                  <h4 style={{ margin: 0, fontSize: 14 }}>表详情: {selectedTable}</h4>
                  <button className="btn" onClick={() => setSelectedTable(null)}>关闭</button>
                </div>
                
                <h5 style={{ marginTop: 10, marginBottom: 6, fontSize: 13 }}>Schema</h5>
                {tableSchema ? (
                  <pre style={{ background: 'var(--card)', padding: 10, borderRadius: 6, fontSize: 11, overflowX: 'auto', border: '1px solid var(--border)', margin: 0 }}>
                    {tableSchema.sql}
                  </pre>
                ) : <div style={{ fontSize: 13 }}>加载 Schema 中...</div>}

                <h5 style={{ marginTop: 14, marginBottom: 6, fontSize: 13 }}>前 50 行样例</h5>
                {tableSample ? (
                  <div className="data-table-wrapper">
                    <table className="data-table" style={{ width: 'max-content' }}>
                      <thead>
                        <tr>
                          {tableSample.columns.map((c, i) => (
                            <th key={i}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableSample.rows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {tableSample.rows.length === 0 && (
                          <tr><td colSpan={tableSample.columns.length} style={{ textAlign: 'center' }}>无数据</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : <div style={{ fontSize: 13 }}>加载样例数据中...</div>}
              </div>
            )}
          </div>
        )}

        {!loading && activeTab === 'imports' && (
          <div className="panel">
            <div className="flex-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <h3 className="panel__title" style={{ margin: 0 }}>数据导入历史</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select id="importPackage" className="form-control" style={{ width: 'auto', fontSize: 13 }}>
                  <option value="douyin-bi">douyin-bi</option>
                  <option value="demo">demo</option>
                </select>
                <button className="btn btn--primary" onClick={() => {
                  const pkg = (document.getElementById('importPackage') as HTMLSelectElement)?.value || 'douyin-bi';
                  handleStartOperation('IMPORT', pkg);
                }}>导入数据包</button>
              </div>
            </div>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>数据源类型</th>
                    <th>状态</th>
                    <th>行数 (成功/错误)</th>
                    <th>开始时间</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((job, index) => (
                    <tr key={job.jobId || `import-${index}`}>
                      <td>{job.jobId}</td>
                      <td>{job.sourceType}</td>
                      <td>
                        <span className={`status-badge ${job.status === 'succeeded' ? 'status-badge--success' : 'status-badge--neutral'}`}>{job.status}</span>
                      </td>
                      <td>{job.rowCount} ({job.successCount} / {job.errorCount})</td>
                      <td>{new Date(job.startedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {imports.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center' }}>暂无导入记录</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && activeTab === 'versions' && (
          <div className="panel">
            <h3 className="panel__title">数据版本管理</h3>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>版本号</th>
                    <th>来源</th>
                    <th>类型</th>
                    <th>导入行数</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v, index) => (
                    <tr key={v.dataVersion || `version-${index}`}>
                      <td style={{ fontWeight: 500 }}>{v.dataVersion}</td>
                      <td>{v.source}</td>
                      <td>{v.sourceType}</td>
                      <td>{v.rowCount}</td>
                      <td>{new Date(v.createdAt).toLocaleString()}</td>
                      <td>
                        <button className="btn btn--danger" onClick={() => handleStartOperation('DELETE_VERSION', v.dataVersion)}>删除</button>
                      </td>
                    </tr>
                  ))}
                  {versions.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center' }}>暂无数据版本</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && activeTab === 'schema' && (
          <div className="panel">
            <div className="flex-between" style={{ marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <h3 className="panel__title" style={{ margin: 0 }}>Schema 变更记录</h3>
              <button className="btn btn--primary" onClick={() => handleStartOperation('APPLY_MIGRATIONS', 'all')}>Apply Migrations</button>
            </div>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>版本</th>
                    <th>迁移名称</th>
                    <th>状态</th>
                    <th>执行时间</th>
                    <th>校验和</th>
                  </tr>
                </thead>
                <tbody>
                  {migrations.map((m, index) => (
                    <tr key={m.version || `migration-${index}`}>
                      <td style={{ fontWeight: 500 }}>{m.version}</td>
                      <td>{m.name}</td>
                      <td>
                        <span className={`status-badge ${m.status === 'applied' ? 'status-badge--success' : 'status-badge--warning'}`}>{m.status}</span>
                      </td>
                      <td>{new Date(m.appliedAt).toLocaleString()}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{m.checksum}</td>
                    </tr>
                  ))}
                  {migrations.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center' }}>暂无迁移记录</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && activeTab === 'audits' && (
          <div className="panel">
            <h3 className="panel__title">操作日志</h3>
            
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <input 
                type="text" 
                placeholder="按操作类型过滤..." 
                value={auditFilterOp} 
                onChange={e => setAuditFilterOp(e.target.value)}
                className="form-control"
                style={{ width: 'auto', flex: '0 1 160px' }}
              />
              <input 
                type="text" 
                placeholder="按目标过滤..." 
                value={auditFilterTarget} 
                onChange={e => setAuditFilterTarget(e.target.value)}
                className="form-control"
                style={{ width: 'auto', flex: '0 1 160px' }}
              />
              <select 
                value={auditFilterStatus} 
                onChange={e => setAuditFilterStatus(e.target.value)}
                className="form-control"
                style={{ width: 'auto', flex: '0 1 120px' }}
              >
                <option value="">所有状态</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>事件 ID</th>
                    <th>操作类型</th>
                    <th>目标</th>
                    <th>状态</th>
                    <th>错误信息</th>
                    <th>发生时间</th>
                    <th>快照</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.filter(a => 
                    (!auditFilterOp || a.operation.toLowerCase().includes(auditFilterOp.toLowerCase())) &&
                    (!auditFilterTarget || a.target.toLowerCase().includes(auditFilterTarget.toLowerCase())) &&
                    (!auditFilterStatus || a.status === auditFilterStatus)
                  ).map((evt, index) => (
                    <tr key={evt.eventId || `audit-${index}`}>
                      <td style={{ fontSize: 11 }}>{evt.eventId}</td>
                      <td style={{ fontWeight: 500 }}>{evt.operation}</td>
                      <td>{evt.target}</td>
                      <td>
                        <span className={`status-badge ${evt.status === 'success' ? 'status-badge--success' : 'status-badge--danger'}`}>{evt.status}</span>
                      </td>
                      <td style={{ color: 'var(--destructive)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{evt.error || '-'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{new Date(evt.createdAt).toLocaleString()}</td>
                      <td>
                        {evt.snapshot ? <pre style={{ margin: 0, fontSize: 10, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{JSON.stringify(evt.snapshot)}</pre> : '-'}
                      </td>
                    </tr>
                  ))}
                  {audits.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center' }}>暂无操作日志</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'dangerous' && (
          <div className="panel">
            <h3 className="panel__title" style={{ color: 'var(--destructive)' }}>危险操作</h3>
            <div className="alert-banner alert-banner--warning">
              ⚠️ <strong>注意：</strong> 重建整个数据库将清空所有数据并重新运行迁移，请谨慎操作。
            </div>
            
            <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
               <button className="btn btn--danger" onClick={() => handleStartOperation('RESET', 'ws_demo')}>重建整个数据库 (Rebuild)</button>
            </div>
          </div>
        )}

        {activeTab === 'readme' && (
          <div className="panel database-readme">
            <h3 className="panel__title">SQLite 库表 README</h3>
            <pre className="database-readme__content">{databaseReadme}</pre>
          </div>
        )}

      </div>

      {opModalOpen && (
        <div className="operation-modal">
          <div className="operation-modal__dialog">
            <div className="operation-modal__header">
              <div>
                <h3 className="operation-modal__title">{getOperationTitle(opType)}</h3>
                <div className="operation-modal__target">目标: {opTarget}</div>
              </div>
              <button className="btn" onClick={() => setOpModalOpen(false)}>关闭</button>
            </div>
            {opExecuteResult ? (
              <div>
                <div className={`alert-banner alert-banner--${opExecuteResult.status === 'success' || opExecuteResult.success ? 'success' : 'danger'}`}>
                  <strong>执行结果:</strong> {opExecuteResult.status || (opExecuteResult.success ? 'success' : 'failed')}
                </div>
                {opExecuteResult.auditId && <p style={{ margin: '8px 0 4px', fontSize: 13 }}><strong>Audit ID:</strong> {opExecuteResult.auditId}</p>}
                {opExecuteResult.warnings && opExecuteResult.warnings.length > 0 && (
                  <div style={{ margin: '8px 0', padding: 8, background: 'var(--background)', color: 'var(--destructive)', borderRadius: 6, fontSize: 13 }}>
                    <strong>Warnings:</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>
                      {opExecuteResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
                {opExecuteResult.afterSnapshot && (
                  <div style={{ marginTop: 8 }}>
                    <strong style={{ fontSize: 13 }}>After Snapshot:</strong>
                    <pre style={{ margin: '4px 0 0', fontSize: 11, background: 'var(--background)', padding: 8, borderRadius: 4, maxHeight: 140, overflow: 'auto', border: '1px solid var(--border)' }}>
                      {JSON.stringify(opExecuteResult.afterSnapshot, null, 2)}
                    </pre>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                  <button className="btn" onClick={() => setOpModalOpen(false)}>完成 / 关闭</button>
                </div>
              </div>
            ) : (
              <>
                {opExecuting && !opDryRun ? <div style={{ marginBottom: 14, fontSize: 13 }}>加载影响分析中...</div> : null}
                {opDryRun && (
                  <div className="operation-modal__impact">
                    <div className="operation-modal__impact-grid">
                      <div>
                        <span className="operation-modal__label">影响行数</span>
                        <strong>{opDryRun.affectedRows}</strong>
                      </div>
                      <div>
                        <span className="operation-modal__label">用户授权数据</span>
                        <strong className={opDryRun.hasUserAuthorized ? 'operation-modal__danger' : ''}>
                          {opDryRun.hasUserAuthorized ? '包含' : '不包含'}
                        </strong>
                      </div>
                      <div>
                        <span className="operation-modal__label">审计/历史</span>
                        <strong>{opDryRun.hasAuditHistory ? '包含' : '不包含'}</strong>
                      </div>
                    </div>
                    <div className="operation-modal__tables">
                      <span className="operation-modal__label">影响表:</span>
                      <span>{opDryRun.affectedTables?.join(', ') || '无'}</span>
                    </div>
                    {opDryRun.warnings && opDryRun.warnings.length > 0 && (
                      <div style={{ margin: '8px 0 4px', color: 'var(--destructive)' }}>
                        <strong style={{ fontSize: 13 }}>Warnings:</strong>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 12 }}>
                          {opDryRun.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}
                    {opDryRun.qualityReport && (
                      <details className="operation-modal__quality">
                        <summary>质量报告: {getQualityReportSummary(opDryRun.qualityReport)}</summary>
                        <pre>
                          {JSON.stringify(opDryRun.qualityReport, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                )}
                {opError && <div style={{ color: 'var(--destructive)', marginBottom: 14, fontSize: 13 }}>{opError}</div>}

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
                    请输入 <code style={{ background: 'var(--secondary)', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>{opDryRun?.requiredConfirmText || '加载中...'}</code> 以确认执行:
                  </label>
                  <input 
                    type="text" 
                    value={opConfirmText} 
                    onChange={e => setOpConfirmText(e.target.value)} 
                    className="form-control"
                    disabled={!opDryRun}
                  />
                </div>
                
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={() => setOpModalOpen(false)}>取消</button>
                  <button 
                    className="btn btn--danger" 
                    onClick={handleExecuteOperation}
                    disabled={opExecuting || !opDryRun || opConfirmText !== opDryRun.requiredConfirmText}
                  >
                    确认执行
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
