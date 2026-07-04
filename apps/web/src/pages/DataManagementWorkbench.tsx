import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { DbOverview, DbTableInfo, DbMigration, DbDataVersion, DbImportJob, DbAuditEvent, DbSchemaInfo, DbSampleInfo, DbOperationDryRunResult, DbOperationExecuteResult } from '../types';

type TabType = 'overview' | 'tables' | 'imports' | 'versions' | 'schema' | 'audits' | 'dangerous';

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
  const [opAdminToken, setOpAdminToken] = useState('pls-admin-token');
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
      const res = await api.dryRunDbOperation(type, target, opAdminToken);
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
      const res = await api.executeDbOperation(opType, opTarget, opConfirmText, opAdminToken);
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
  ];

  return (
    <div className="data-management-workbench">
      <div className="page-header">
        <div className="page-header__info">
          <h2 className="page-header__title">数据管理</h2>
          <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
            管理工作台：查看并管理 SQLite 状态、库表、导入历史及操作审计
          </div>
        </div>
      </div>

      <div className="segmented-control" style={{ margin: '0 20px 20px', display: 'flex', gap: 8, overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`btn ${activeTab === tab.key ? 'btn--primary' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '0 20px' }}>
        {loading && <div style={{ marginBottom: 16 }}>正在加载...</div>}

        {!loading && activeTab === 'overview' && overview && (
          <div className="panel">
            <h3 className="panel__title">数据库总览</h3>
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              <div className="metric-card"><div className="metric-card__title">工作区</div><div className="metric-card__value">{overview.workspaceId}</div></div>
              <div className="metric-card"><div className="metric-card__title">状态</div><div className="metric-card__value">{overview.databaseStatus}</div></div>
              <div className="metric-card"><div className="metric-card__title">Schema 版本</div><div className="metric-card__value">{overview.schemaVersion}</div></div>
              <div className="metric-card">
                <div className="metric-card__title">Migration 状态</div>
                <div className="metric-card__value" style={{ fontSize: 16 }}>
                  {overview.migrationStatus.applied} / {overview.migrationStatus.total} 
                  {overview.migrationStatus.failed > 0 && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>({overview.migrationStatus.failed} failed)</span>}
                </div>
              </div>
              <div className="metric-card"><div className="metric-card__title">表 / 视图数量</div><div className="metric-card__value">{overview.tableCount} / {overview.viewCount}</div></div>
              <div className="metric-card"><div className="metric-card__title">总行数</div><div className="metric-card__value">{overview.totalRows}</div></div>
            </div>

            <h4 style={{ marginTop: 24, marginBottom: 12 }}>数据标识</h4>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span className={`status-badge ${overview.hasMockData ? 'status-badge--warning' : 'status-badge--neutral'}`}>Mock 数据: {overview.hasMockData ? '存在' : '无'}</span>
              <span className={`status-badge ${overview.hasSmokeData ? 'status-badge--warning' : 'status-badge--neutral'}`}>Smoke 数据: {overview.hasSmokeData ? '存在' : '无'}</span>
              <span className={`status-badge ${overview.hasE2eData ? 'status-badge--warning' : 'status-badge--neutral'}`}>E2E 数据: {overview.hasE2eData ? '存在' : '无'}</span>
              <span className={`status-badge ${overview.hasUserAuthorizedData ? 'status-badge--success' : 'status-badge--neutral'}`}>用户授权数据: {overview.hasUserAuthorizedData ? '存在' : '无'}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginTop: 24 }}>
              <div className="panel" style={{ margin: 0, padding: 16 }}>
                <h4 style={{ margin: '0 0 12px 0' }}>最近导入</h4>
                {imports.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                    {imports.slice(0, 3).map((imp, index) => (
                      <li key={imp.jobId || `recent-import-${index}`} style={{ marginBottom: 4 }}>
                        {new Date(imp.startedAt).toLocaleString()} - {imp.sourceType} 
                        <span className={`status-badge status-badge--${imp.status === 'succeeded' ? 'success' : 'neutral'}`} style={{ marginLeft: 8 }}>{imp.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : <span style={{ fontSize: 13, color: 'var(--muted)' }}>暂无导入记录</span>}
              </div>
              <div className="panel" style={{ margin: 0, padding: 16 }}>
                <h4 style={{ margin: '0 0 12px 0' }}>最近危险操作</h4>
                {audits.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                    {audits.slice(0, 3).map((aud, index) => (
                      <li key={aud.eventId || `recent-audit-${index}`} style={{ marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {new Date(aud.createdAt).toLocaleString()} - <strong>{aud.operation}</strong> on {aud.target}
                        <span className={`status-badge status-badge--${aud.status === 'success' ? 'success' : 'danger'}`} style={{ marginLeft: 8 }}>{aud.status}</span>
                      </li>
                    ))}
                  </ul>
                ) : <span style={{ fontSize: 13, color: 'var(--muted)' }}>暂无危险操作记录</span>}
              </div>
            </div>
          </div>
        )}

        {!loading && activeTab === 'tables' && (
          <div className="panel">
            <h3 className="panel__title">库表明细</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 4px' }}>表/视图名</th>
                    <th style={{ padding: '8px 4px' }}>类型</th>
                    <th style={{ padding: '8px 4px' }}>行数</th>
                    <th style={{ padding: '8px 4px' }}>所属域</th>
                    <th style={{ padding: '8px 4px' }}>系统表</th>
                    <th style={{ padding: '8px 4px' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {tables.map(t => (
                    <tr key={t.name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 4px', fontWeight: 500 }}>{t.name}</td>
                      <td style={{ padding: '8px 4px' }}>{t.type}</td>
                      <td style={{ padding: '8px 4px' }}>{t.rowCount}</td>
                      <td style={{ padding: '8px 4px' }}>{t.domain}</td>
                      <td style={{ padding: '8px 4px' }}>
                        {t.isSystem ? <span className="status-badge status-badge--warning">是</span> : <span className="status-badge status-badge--neutral">否</span>}
                      </td>
                      <td style={{ padding: '8px 4px' }}>
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
              <div style={{ marginTop: 24, padding: 16, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h4 style={{ margin: 0 }}>表详情: {selectedTable}</h4>
                  <button className="btn" onClick={() => setSelectedTable(null)}>关闭</button>
                </div>
                
                <h5 style={{ marginTop: 12, marginBottom: 8 }}>Schema</h5>
                {tableSchema ? (
                  <pre style={{ background: 'var(--panel)', padding: 12, borderRadius: 6, fontSize: 12, overflowX: 'auto', border: '1px solid var(--border)' }}>
                    {tableSchema.sql}
                  </pre>
                ) : <div>加载 Schema 中...</div>}

                <h5 style={{ marginTop: 16, marginBottom: 8 }}>前 50 行样例</h5>
                {tableSample ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 12, width: 'max-content' }}>
                      <thead>
                        <tr>
                          {tableSample.columns.map((c, i) => (
                            <th key={i} style={{ border: '1px solid var(--border)', padding: '4px 8px', background: 'var(--panel)' }}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableSample.rows.map((row, rIdx) => (
                          <tr key={rIdx}>
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} style={{ border: '1px solid var(--border)', padding: '4px 8px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {tableSample.rows.length === 0 && (
                          <tr><td colSpan={tableSample.columns.length} style={{ border: '1px solid var(--border)', padding: '8px', textAlign: 'center' }}>无数据</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : <div>加载样例数据中...</div>}
              </div>
            )}
          </div>
        )}

        {!loading && activeTab === 'imports' && (
          <div className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <h3 className="panel__title" style={{ margin: 0 }}>数据导入历史</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select id="importPackage" className="btn" style={{ background: 'var(--bg)', padding: '6px 12px', borderRadius: '8px' }}>
                  <option value="douyin-bi">douyin-bi</option>
                  <option value="demo">demo</option>
                </select>
                <button className="btn btn--primary" onClick={() => {
                  const pkg = (document.getElementById('importPackage') as HTMLSelectElement)?.value || 'douyin-bi';
                  handleStartOperation('IMPORT', pkg);
                }}>导入数据包</button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 4px' }}>Job ID</th>
                    <th style={{ padding: '8px 4px' }}>数据源类型</th>
                    <th style={{ padding: '8px 4px' }}>状态</th>
                    <th style={{ padding: '8px 4px' }}>行数 (成功/错误)</th>
                    <th style={{ padding: '8px 4px' }}>开始时间</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((job, index) => (
                    <tr key={job.jobId || `import-${index}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 4px' }}>{job.jobId}</td>
                      <td style={{ padding: '8px 4px' }}>{job.sourceType}</td>
                      <td style={{ padding: '8px 4px' }}>
                        <span className={`status-badge ${job.status === 'succeeded' ? 'status-badge--success' : 'status-badge--neutral'}`}>{job.status}</span>
                      </td>
                      <td style={{ padding: '8px 4px' }}>{job.rowCount} ({job.successCount} / {job.errorCount})</td>
                      <td style={{ padding: '8px 4px' }}>{new Date(job.startedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {imports.length === 0 && <tr><td colSpan={5} style={{ padding: 12, textAlign: 'center' }}>暂无导入记录</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && activeTab === 'versions' && (
          <div className="panel">
            <h3 className="panel__title">数据版本管理</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 4px' }}>版本号</th>
                    <th style={{ padding: '8px 4px' }}>来源</th>
                    <th style={{ padding: '8px 4px' }}>类型</th>
                    <th style={{ padding: '8px 4px' }}>导入行数</th>
                    <th style={{ padding: '8px 4px' }}>创建时间</th>
                    <th style={{ padding: '8px 4px' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v, index) => (
                    <tr key={v.dataVersion || `version-${index}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 4px', fontWeight: 500 }}>{v.dataVersion}</td>
                      <td style={{ padding: '8px 4px' }}>{v.source}</td>
                      <td style={{ padding: '8px 4px' }}>{v.sourceType}</td>
                      <td style={{ padding: '8px 4px' }}>{v.rowCount}</td>
                      <td style={{ padding: '8px 4px' }}>{new Date(v.createdAt).toLocaleString()}</td>
                      <td style={{ padding: '8px 4px' }}>
                        <button className="btn btn--danger" onClick={() => handleStartOperation('DELETE_VERSION', v.dataVersion)}>删除</button>
                      </td>
                    </tr>
                  ))}
                  {versions.length === 0 && <tr><td colSpan={5} style={{ padding: 12, textAlign: 'center' }}>暂无数据版本</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && activeTab === 'schema' && (
          <div className="panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <h3 className="panel__title" style={{ margin: 0 }}>Schema 变更记录</h3>
              <button className="btn btn--primary" onClick={() => handleStartOperation('APPLY_MIGRATIONS', 'all')}>Apply Migrations</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 4px' }}>版本</th>
                    <th style={{ padding: '8px 4px' }}>迁移名称</th>
                    <th style={{ padding: '8px 4px' }}>状态</th>
                    <th style={{ padding: '8px 4px' }}>执行时间</th>
                    <th style={{ padding: '8px 4px' }}>校验和</th>
                  </tr>
                </thead>
                <tbody>
                  {migrations.map((m, index) => (
                    <tr key={m.version || `migration-${index}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 4px', fontWeight: 500 }}>{m.version}</td>
                      <td style={{ padding: '8px 4px' }}>{m.name}</td>
                      <td style={{ padding: '8px 4px' }}>
                        <span className={`status-badge ${m.status === 'applied' ? 'status-badge--success' : 'status-badge--warning'}`}>{m.status}</span>
                      </td>
                      <td style={{ padding: '8px 4px' }}>{new Date(m.appliedAt).toLocaleString()}</td>
                      <td style={{ padding: '8px 4px', fontFamily: 'monospace' }}>{m.checksum}</td>
                    </tr>
                  ))}
                  {migrations.length === 0 && <tr><td colSpan={5} style={{ padding: 12, textAlign: 'center' }}>暂无迁移记录</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && activeTab === 'audits' && (
          <div className="panel">
            <h3 className="panel__title">操作日志</h3>
            
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <input 
                type="text" 
                placeholder="按操作类型过滤 (Operation)..." 
                value={auditFilterOp} 
                onChange={e => setAuditFilterOp(e.target.value)}
                className="input"
                style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 4 }}
              />
              <input 
                type="text" 
                placeholder="按目标过滤 (Target)..." 
                value={auditFilterTarget} 
                onChange={e => setAuditFilterTarget(e.target.value)}
                className="input"
                style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 4 }}
              />
              <select 
                value={auditFilterStatus} 
                onChange={e => setAuditFilterStatus(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)' }}
              >
                <option value="">所有状态</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 4px' }}>事件 ID</th>
                    <th style={{ padding: '8px 4px' }}>操作类型</th>
                    <th style={{ padding: '8px 4px' }}>目标</th>
                    <th style={{ padding: '8px 4px' }}>状态</th>
                    <th style={{ padding: '8px 4px' }}>错误信息</th>
                    <th style={{ padding: '8px 4px' }}>发生时间</th>
                    <th style={{ padding: '8px 4px' }}>快照</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.filter(a => 
                    (!auditFilterOp || a.operation.toLowerCase().includes(auditFilterOp.toLowerCase())) &&
                    (!auditFilterTarget || a.target.toLowerCase().includes(auditFilterTarget.toLowerCase())) &&
                    (!auditFilterStatus || a.status === auditFilterStatus)
                  ).map((evt, index) => (
                    <tr key={evt.eventId || `audit-${index}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 4px' }}>{evt.eventId}</td>
                      <td style={{ padding: '8px 4px', fontWeight: 500 }}>{evt.operation}</td>
                      <td style={{ padding: '8px 4px' }}>{evt.target}</td>
                      <td style={{ padding: '8px 4px' }}>
                        <span className={`status-badge ${evt.status === 'success' ? 'status-badge--success' : 'status-badge--danger'}`}>{evt.status}</span>
                      </td>
                      <td style={{ padding: '8px 4px', color: 'var(--danger)' }}>{evt.error || '-'}</td>
                      <td style={{ padding: '8px 4px' }}>{new Date(evt.createdAt).toLocaleString()}</td>
                      <td style={{ padding: '8px 4px' }}>
                        {evt.snapshot ? <pre style={{ margin: 0, fontSize: 10, maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{JSON.stringify(evt.snapshot)}</pre> : '-'}
                      </td>
                    </tr>
                  ))}
                  {audits.length === 0 && <tr><td colSpan={6} style={{ padding: 12, textAlign: 'center' }}>暂无操作日志</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'dangerous' && (
          <div className="panel">
            <h3 className="panel__title" style={{ color: 'var(--danger)' }}>危险操作</h3>
            <div className="alert-banner alert-banner--warning">
              <div className="alert-banner__icon">⚠️</div>
              <div className="alert-banner__content">
                <strong>注意：</strong> 重建整个数据库将清空所有数据并重新运行迁移，请谨慎操作。
              </div>
            </div>
            
            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
               <button className="btn btn--danger" onClick={() => handleStartOperation('RESET', 'ws_demo')}>重建整个数据库 (Rebuild)</button>
            </div>
          </div>
        )}

      </div>

      {opModalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--bg)', padding: 24, borderRadius: 8, width: 500, maxWidth: '90vw' }}>
            <h3 style={{ color: 'var(--danger)', marginTop: 0 }}>危险操作: {opType}</h3>
            <p style={{ fontWeight: 500 }}>目标: {opTarget}</p>
            {opExecuteResult ? (
              <div style={{ marginBottom: 16 }}>
                <div className={`alert-banner alert-banner--${opExecuteResult.status === 'success' || opExecuteResult.success ? 'success' : 'danger'}`}>
                  <div className="alert-banner__content">
                    <strong>执行结果:</strong> {opExecuteResult.status || (opExecuteResult.success ? 'success' : 'failed')}
                  </div>
                </div>
                {opExecuteResult.auditId && <p style={{ margin: '8px 0 4px' }}><strong>Audit ID:</strong> {opExecuteResult.auditId}</p>}
                {opExecuteResult.warnings && opExecuteResult.warnings.length > 0 && (
                  <div style={{ margin: '8px 0', padding: 8, background: 'var(--panel)', color: 'var(--danger)', borderRadius: 4 }}>
                    <strong>Warnings:</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 13 }}>
                      {opExecuteResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                )}
                {opExecuteResult.afterSnapshot && (
                  <div style={{ marginTop: 8 }}>
                    <strong>After Snapshot:</strong>
                    <pre style={{ margin: '4px 0 0', fontSize: 11, background: 'var(--bg)', padding: 8, borderRadius: 4, maxHeight: 150, overflow: 'auto' }}>
                      {JSON.stringify(opExecuteResult.afterSnapshot, null, 2)}
                    </pre>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
                  <button className="btn" onClick={() => setOpModalOpen(false)}>完成 / 关闭</button>
                </div>
              </div>
            ) : (
              <>
                {opExecuting && !opDryRun ? <div style={{ marginBottom: 16 }}>加载影响分析中...</div> : null}
                {opDryRun && (
                  <div style={{ marginBottom: 16, padding: 12, background: 'var(--panel)', borderRadius: 4 }}>
                    <p style={{ margin: '4px 0' }}><strong>影响表:</strong> {opDryRun.affectedTables?.join(', ') || '无'}</p>
                    <p style={{ margin: '4px 0' }}><strong>影响行数:</strong> {opDryRun.affectedRows}</p>
                    <p style={{ margin: '4px 0', color: opDryRun.hasUserAuthorized ? 'var(--danger)' : 'inherit' }}>
                      <strong>是否包含用户授权数据:</strong> {opDryRun.hasUserAuthorized ? '是 (高危)' : '否'}
                    </p>
                    <p style={{ margin: '4px 0' }}><strong>是否包含审计/历史:</strong> {opDryRun.hasAuditHistory ? '是' : '否'}</p>
                    {opDryRun.warnings && opDryRun.warnings.length > 0 && (
                      <div style={{ margin: '8px 0 4px', color: 'var(--danger)' }}>
                        <strong>Warnings:</strong>
                        <ul style={{ margin: '4px 0 0', paddingLeft: 20, fontSize: 13 }}>
                          {opDryRun.warnings.map((w, i) => <li key={i}>{w}</li>)}
                        </ul>
                      </div>
                    )}
                    {opDryRun.qualityReport && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                        <p style={{ margin: '0 0 4px', fontWeight: 600 }}>质量报告:</p>
                        <pre style={{ margin: 0, fontSize: 11, background: 'var(--bg)', padding: 8, borderRadius: 4, maxHeight: 150, overflow: 'auto' }}>
                          {JSON.stringify(opDryRun.qualityReport, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
                {opError && <div style={{ color: 'var(--danger)', marginBottom: 16 }}>{opError}</div>}
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>Admin Token:</label>
                  <input 
                    type="password" 
                    value={opAdminToken} 
                    onChange={e => setOpAdminToken(e.target.value)} 
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: 4, boxSizing: 'border-box' }}
                  />
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                    请输入 <code>{opDryRun?.requiredConfirmText || '加载中...'}</code> 以确认执行:
                  </label>
                  <input 
                    type="text" 
                    value={opConfirmText} 
                    onChange={e => setOpConfirmText(e.target.value)} 
                    style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: 4, boxSizing: 'border-box' }}
                    disabled={!opDryRun}
                  />
                </div>
                
                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
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
