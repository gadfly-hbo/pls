import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { DbOverview, DecisionRecord, DbDataVersion, DbImportJob, DbAuditEvent } from '../types';

interface OverviewProps {
  goToView: (view: 'overview' | 'account-workbench' | 'match-core' | 'dashboard' | 'flywheel' | 'data-management') => void;
}

export default function Overview({ goToView }: OverviewProps) {
  const [loading, setLoading] = useState(true);
  const [dbOverview, setDbOverview] = useState<DbOverview | null>(null);
  
  const [channelCount, setChannelCount] = useState(0);
  const [matchRowCount, setMatchRowCount] = useState(0);
  const [matchCellCount, setMatchCellCount] = useState(0);
  
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [dataVersions, setDataVersions] = useState<DbDataVersion[]>([]);
  const [importJobs, setImportJobs] = useState<DbImportJob[]>([]);
  const [auditEvents, setAuditEvents] = useState<DbAuditEvent[]>([]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [
          overviewRes,
          channelsRes,
          heatmapRes,
          decisionsRes,
          versionsRes,
          jobsRes,
          auditsRes
        ] = await Promise.allSettled([
          api.getDbOverview(),
          api.getMatchEntities(),
          api.getHeatmap(),
          api.getDecisions(),
          api.getDbVersions(),
          api.getDbImportJobs(),
          api.getDbAuditEvents()
        ]);

        if (overviewRes.status === 'fulfilled') setDbOverview(overviewRes.value.data);
        if (channelsRes.status === 'fulfilled') setChannelCount(channelsRes.value.data?.items?.length || 0);
        if (heatmapRes.status === 'fulfilled') {
          const rows = heatmapRes.value.data?.rows || [];
          setMatchRowCount(rows.length);
          setMatchCellCount(rows.reduce((sum, row) => sum + (row.cells?.length || 0), 0));
        }
        if (decisionsRes.status === 'fulfilled') setDecisions(decisionsRes.value.data?.items || []);
        if (versionsRes.status === 'fulfilled') setDataVersions(versionsRes.value.data?.items || []);
        if (jobsRes.status === 'fulfilled') setImportJobs(jobsRes.value.data?.items || []);
        if (auditsRes.status === 'fulfilled') setAuditEvents(auditsRes.value.data?.items || []);

      } catch (err) {
        console.error('Error fetching overview data:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const pendingDecisions = decisions.filter(d => d.status === 'needs_adjustment' || d.status === 'pending_review');
  const sortedDecisions = [...decisions].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  const sortedVersions = [...dataVersions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const sortedImportJobs = [...importJobs].sort((a, b) => new Date(b.completedAt || b.startedAt).getTime() - new Date(a.completedAt || a.startedAt).getTime());
  const sortedAuditEvents = [...auditEvents].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Next steps logic
  const hasBusinessObjects = channelCount > 0 || matchRowCount > 0 || decisions.length > 0;
  const isEmptyDb = !dbOverview || dbOverview.tableCount === 0 || dbOverview.totalRows === 0 || !hasBusinessObjects;
  
  // Health
  const dmHealth = isEmptyDb ? 'danger' : 'success';
  const apHealth = channelCount === 0 ? 'warning' : 'success';
  const mcHealth = matchRowCount === 0 ? 'warning' : 'success';
  const fwHealth = pendingDecisions.length > 0 ? 'warning' : (decisions.length === 0 ? 'neutral' : 'success');

  return (
    <div className="workbench-shell" style={{ overflow: 'hidden' }}>
      <div className="page-header">
        <h1 className="page-header__title">PLS 业务总览</h1>
        <p className="page-header__subtitle">快速查看数据可用性、业务模块状态及推荐的下一步行动</p>
      </div>

      <div className="match-workbench__scroll" style={{ overflowY: 'auto', flex: 1 }}>
        <div style={{ padding: '0 var(--page-padding) 40px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1400, margin: '0 auto' }}>
          
          {/* Top Status */}
          <div className="panel">
            <h2 className="panel__title">系统与数据状态</h2>
            {loading ? (
              <div style={{ padding: 20 }}>正在加载...</div>
            ) : dbOverview ? (
              <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                <div className="metric-card">
                  <div className="metric-card__title">工作区 (Workspace)</div>
                  <div className="metric-card__value" style={{ fontSize: 18 }}>{dbOverview.workspaceId}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-card__title">数据库状态</div>
                  <div className="metric-card__value">
                    <span className={`status-badge status-badge--${dbOverview.databaseStatus === 'online' ? 'success' : 'danger'}`}>
                      {dbOverview.databaseStatus}
                    </span>
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-card__title">Schema 版本</div>
                  <div className="metric-card__value" style={{ fontSize: 18 }}>{dbOverview.schemaVersion || '无'}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-card__title">上次导入时间</div>
                  <div className="metric-card__value" style={{ fontSize: 16 }}>
                    {dbOverview.lastImportTime ? new Date(dbOverview.lastImportTime).toLocaleString() : '从未导入'}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-card__title">数据标识</div>
                  <div className="metric-card__value" style={{ fontSize: 14 }}>
                    {dbOverview.hasMockData && <span className="status-badge status-badge--warning" style={{ marginRight: 4 }}>Mock</span>}
                    {dbOverview.hasSmokeData && <span className="status-badge status-badge--info" style={{ marginRight: 4 }}>Smoke</span>}
                    {dbOverview.hasE2eData && <span className="status-badge status-badge--info" style={{ marginRight: 4 }}>E2E</span>}
                    {dbOverview.hasUserAuthorizedData && <span className="status-badge status-badge--success">用户授权数据</span>}
                    {!dbOverview.hasMockData && !dbOverview.hasSmokeData && !dbOverview.hasE2eData && !dbOverview.hasUserAuthorizedData && (
                      <span className="status-badge status-badge--neutral">空业务库或未标记数据</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state__icon">⚠️</div>
                <div className="empty-state__title">无法连接到数据库</div>
              </div>
            )}
          </div>

          {/* Recommended Next Step & Empty State Handling */}
          {isEmptyDb && !loading && (
            <div className="alert-banner alert-banner--danger" style={{ marginBottom: 0 }}>
              <div className="alert-banner__content">
                <strong>当前 Workspace 无业务数据。</strong> 请先前往“数据管理”工作台导入基础数据。
              </div>
              <button className="btn btn--primary" onClick={() => goToView('data-management')}>去导入数据</button>
            </div>
          )}

          {!isEmptyDb && !loading && (
            <div className="panel" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)', border: '1px solid var(--primary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <h3 style={{ margin: '0 0 8px 0', color: 'var(--primary)', fontSize: 16 }}>推荐下一步</h3>
                  <div style={{ color: 'var(--foreground)', fontSize: 14 }}>
                    {channelCount === 0 ? '目前没有渠道实体数据，建议先完善渠道与账号基础信息。' :
                     matchRowCount === 0 ? '已有实体数据，但尚未生成人货匹配报告，请前往人货匹配核心工作台查看或生成。' :
                     decisions.length === 0 ? '已有人货匹配结果，但尚未创建任何经营决策，请前往创建。' :
                     pendingDecisions.length > 0 ? `您有 ${pendingDecisions.length} 个经营决策待复盘或需调整，请前往经营飞轮处理。` :
                     '您的业务模块运转良好，可继续探索新品预测或监控经营飞轮。'}
                  </div>
                </div>
                <button className="btn btn--primary" onClick={() => {
                  if (channelCount === 0) goToView('account-workbench');
                  else if (matchRowCount === 0) goToView('match-core');
                  else if (decisions.length === 0 || pendingDecisions.length > 0) goToView('flywheel');
                  else goToView('dashboard');
                }}>
                  立即前往
                </button>
              </div>
            </div>
          )}

          {/* Key Metrics */}
          <div className="panel">
            <h2 className="panel__title">关键指标</h2>
            <div className="metric-grid">
              <div className="metric-card">
                <div className="metric-card__title">渠道实体数</div>
                <div className="metric-card__value">{channelCount}</div>
              </div>
              <div className="metric-card">
                <div className="metric-card__title">匹配 SKU 数</div>
                <div className="metric-card__value">{matchRowCount}</div>
              </div>
              <div className="metric-card">
                <div className="metric-card__title">匹配 Cell 数</div>
                <div className="metric-card__value">{matchCellCount}</div>
              </div>
              <div className="metric-card">
                <div className="metric-card__title">经营决策数</div>
                <div className="metric-card__value">{decisions.length}</div>
              </div>
              <div className="metric-card">
                <div className="metric-card__title">数据版本数</div>
                <div className="metric-card__value">{dataVersions.length}</div>
              </div>
              <div className="metric-card">
                <div className="metric-card__title">导入任务数</div>
                <div className="metric-card__value">{importJobs.length}</div>
              </div>
              <div className="metric-card">
                <div className="metric-card__title">操作日志数</div>
                <div className="metric-card__value">{auditEvents.length}</div>
              </div>
            </div>
          </div>

          {/* Modules Health */}
          <div className="panel">
            <h2 className="panel__title">模块状态</h2>
            <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              
              <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="flex-between">
                  <span style={{ fontWeight: 600 }}>数据管理</span>
                  <span className={`status-badge status-badge--${dmHealth}`}>
                    {dmHealth === 'success' ? '健康' : '异常'}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted-foreground)', flex: 1 }}>
                  {dmHealth === 'success' ? '基础数据及连接正常' : '数据库为空或连接失败'}
                </div>
                <button className="btn" onClick={() => goToView('data-management')}>进入</button>
              </div>

              <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="flex-between">
                  <span style={{ fontWeight: 600 }}>实体与账号画像</span>
                  <span className={`status-badge status-badge--${apHealth}`}>
                    {apHealth === 'success' ? '就绪' : '缺失'}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted-foreground)', flex: 1 }}>
                  {apHealth === 'success' ? `已加载 ${channelCount} 个实体` : '无实体画像数据'}
                </div>
                <button className="btn" onClick={() => goToView('account-workbench')}>进入</button>
              </div>

              <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="flex-between">
                  <span style={{ fontWeight: 600 }}>人货匹配核心</span>
                  <span className={`status-badge status-badge--${mcHealth}`}>
                    {mcHealth === 'success' ? '就绪' : '无数据'}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted-foreground)', flex: 1 }}>
                  {mcHealth === 'success' ? `当前有 ${matchRowCount} 条结果` : '尚未生成匹配报告'}
                </div>
                <button className="btn" onClick={() => goToView('match-core')}>进入</button>
              </div>

              <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="flex-between">
                  <span style={{ fontWeight: 600 }}>新品预测</span>
                  <span className="status-badge status-badge--neutral">待探索</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted-foreground)', flex: 1 }}>
                  输入商品特征，智能预测人群
                </div>
                <button className="btn" onClick={() => goToView('dashboard')}>进入</button>
              </div>

              <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="flex-between">
                  <span style={{ fontWeight: 600 }}>经营飞轮</span>
                  <span className={`status-badge status-badge--${fwHealth}`}>
                    {fwHealth === 'success' ? '健康' : fwHealth === 'warning' ? '待处理' : '未启动'}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted-foreground)', flex: 1 }}>
                  {fwHealth === 'warning' ? `${pendingDecisions.length} 个决策待复盘` : fwHealth === 'success' ? '运转中' : '尚未创建任何决策'}
                </div>
                <button className="btn" onClick={() => goToView('flywheel')}>进入</button>
              </div>

            </div>
          </div>

          {/* Recent Activity */}
          <div className="panel">
            <h2 className="panel__title">最近动态</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
              
              <div>
                <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--muted-foreground)' }}>最近经营决策</h3>
                {decisions.length === 0 ? (
                  <div className="empty-state" style={{ padding: '20px 0' }}>暂无决策记录</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedDecisions.slice(0, 3).map((d, index) => (
                      <div key={d.decisionId || `${d.skuId}-${d.entityId}-${index}`} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ overflow: 'hidden', marginRight: 12 }}>
                          <div style={{ fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>SKU: {d.skuId}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>实体: {d.entityId}</div>
                        </div>
                        <span className={`status-badge status-badge--${d.status === 'verified' ? 'success' : d.status === 'needs_adjustment' ? 'danger' : d.status === 'in_progress' ? 'info' : 'warning'}`} style={{ flexShrink: 0 }}>
                          {d.status === 'verified' ? '已验证' : d.status === 'needs_adjustment' ? '需调整' : d.status === 'in_progress' ? '执行中' : '待处理'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--muted-foreground)' }}>最近导入任务</h3>
                {importJobs.length === 0 ? (
                  <div className="empty-state" style={{ padding: '20px 0' }}>暂无导入任务</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedImportJobs.slice(0, 3).map((job, index) => (
                      <div key={job.jobId || `${job.sourceType}-${job.startedAt}-${index}`} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                          <span style={{ fontWeight: 500, fontSize: 13, overflowWrap: 'anywhere' }}>{job.sourceType}</span>
                          <span className={`status-badge status-badge--${job.status === 'succeeded' ? 'success' : job.status === 'failed' ? 'danger' : 'warning'}`}>
                            {job.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', overflowWrap: 'anywhere' }}>
                          {job.jobId} · {job.successCount}/{job.rowCount} rows
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--muted-foreground)' }}>最近数据版本</h3>
                {dataVersions.length === 0 ? (
                  <div className="empty-state" style={{ padding: '20px 0' }}>暂无数据版本</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedVersions.slice(0, 3).map((version, index) => (
                      <div key={version.dataVersion || `${version.source}-${version.createdAt}-${index}`} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ fontWeight: 500, fontSize: 13, overflowWrap: 'anywhere' }}>{version.dataVersion}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', overflowWrap: 'anywhere' }}>
                          {version.sourceType} · {version.rowCount} rows
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--muted-foreground)' }}>最近系统日志</h3>
                {auditEvents.length === 0 ? (
                  <div className="empty-state" style={{ padding: '20px 0' }}>暂无日志</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedAuditEvents.slice(0, 3).map((a, index) => (
                      <div key={a.eventId || `${a.operation}-${a.target}-${a.createdAt}-${index}`} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                          <span style={{ fontWeight: 500, fontSize: 13, overflowWrap: 'anywhere' }}>{a.operation}</span>
                          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>{new Date(a.createdAt).toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', overflowWrap: 'anywhere' }}>
                          目标: {a.target || '无'} | 状态: {a.status}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
