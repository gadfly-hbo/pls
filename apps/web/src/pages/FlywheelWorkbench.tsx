import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { DecisionRecord, ActionRecord } from '../types';
import { translateChannel } from '../utils/translate';

/** Map decision status to StatusBadge CSS class */
function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'pending_execution': return 'status-badge--neutral';
    case 'in_progress': return 'status-badge--warning';
    case 'pending_review': return 'status-badge--warning';
    case 'verified': return 'status-badge--success';
    case 'needs_adjustment': return 'status-badge--danger';
    default: return 'status-badge--neutral';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending_execution': return '待执行';
    case 'in_progress': return '执行中';
    case 'pending_review': return '待复盘';
    case 'verified': return '已验证';
    case 'needs_adjustment': return '需调整';
    default: return '未知';
  }
}

function getActionTypeLabel(type: string): string {
  switch (type) {
    case 'launch': return '铺货/投流';
    case 'adjust_budget': return '调整预算';
    case 'optimize_content': return '优化内容';
    default: return type;
  }
}

function translateSourceType(sourceType?: string): string {
  switch (sourceType) {
    case 'single_product_portrait': return '单品画像预测';
    case 'product_channel_match': return '人货匹配结果';
    case 'campaign_product_strategy': return '活动商品策略';
    case 'manual_strategy': return '手动输入策略';
    default: return sourceType || '未知';
  }
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(0)}%`;
}

export default function FlywheelWorkbench({ initialDecisionId }: { initialDecisionId?: string }) {
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDecisionId, setSelectedDecisionId] = useState<string>('');

  const [newActionType, setNewActionType] = useState('launch');
  const [newActionDesc, setNewActionDesc] = useState('');

  const [feedbackSummary, setFeedbackSummary] = useState('');
  const [feedbackEffect, setFeedbackEffect] = useState<'positive' | 'neutral' | 'negative' | 'unknown'>('unknown');
  const [feedbackDeviation, setFeedbackDeviation] = useState('');
  const [feedbackAdjustment, setFeedbackAdjustment] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.getDecisions();
      setDecisions(res.data.items);
      if (initialDecisionId) {
        setSelectedDecisionId(initialDecisionId);
      } else if (res.data.items.length > 0) {
        setSelectedDecisionId(res.data.items[0].decisionId);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDecisionId]);

  const selectedDecision = decisions.find(d => d.decisionId === selectedDecisionId) || null;

  const updateStatus = async (status: DecisionRecord['status']) => {
    if (!selectedDecision) return;
    try {
      await api.updateDecision(selectedDecision.decisionId, { status });
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const addAction = async () => {
    if (!selectedDecision || !newActionDesc) return;
    try {
      const action: ActionRecord = {
        actionId: `act_${Date.now()}`,
        type: newActionType,
        description: newActionDesc,
        status: 'pending'
      };
      const newActions = [...selectedDecision.actions, action];
      await api.updateDecision(selectedDecision.decisionId, { actions: newActions, status: 'in_progress' });
      setNewActionDesc('');
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const submitFeedback = async () => {
    if (!selectedDecision || !feedbackSummary) return;
    try {
      const feedback = {
        summary: feedbackSummary,
        effectJudgment: feedbackEffect,
        audienceDeviation: feedbackDeviation,
        adjustments: feedbackAdjustment ? [feedbackAdjustment] : [],
        submittedAt: new Date().toISOString()
      };
      await api.updateDecision(selectedDecision.decisionId, { feedback, status: 'verified' });
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading && decisions.length === 0) {
    return (
      <div className="empty-state" style={{ minHeight: 300 }}>
        <div className="empty-state__title">加载飞轮数据中...</div>
      </div>
    );
  }

  return (
    <div className="flywheel-workbench">

      {/* Top Bar */}
      <div className="page-header">
        <div className="page-header__info">
          <h2 className="page-header__title">经营飞轮与策略闭环</h2>
          <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
            从匹配建议到行动执行，追踪反馈并闭环优化
          </div>
        </div>
      </div>

      <div className="flywheel-workbench__body">

        {/* Left: Decision List */}
        <div className="workbench-sidebar">
          <h3 className="workbench-sidebar__title">决策追踪列表</h3>
          <div className="workbench-sidebar__list">
            {decisions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state__icon">📋</div>
                <div className="empty-state__title">暂无决策记录</div>
                <div>从人货匹配工作台创建经营决策</div>
              </div>
            ) : (
              <div className="workbench-sidebar__group-items">
                {decisions.map(d => (
                  <div
                    key={d.decisionId}
                    className={`entity-list-item flywheel-decision-item${selectedDecisionId === d.decisionId ? ' entity-list-item--selected' : ''}`}
                    onClick={() => setSelectedDecisionId(d.decisionId)}
                  >
                    <div className="flex-between" style={{ marginBottom: 4 }}>
                      <span className="entity-list-item__name">{d.skuId}</span>
                      <span className={`status-badge ${getStatusBadgeClass(d.status)}`}>
                        {getStatusLabel(d.status)}
                      </span>
                    </div>
                    <div className="entity-list-item__id">实体: {translateChannel(d.entityId)}</div>
                    <div className="entity-list-item__footer">
                      <span>{new Date(d.updatedAt).toLocaleDateString()}</span>
                      <span>{d.owner}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Decision Detail */}
        <div className="flywheel-workbench__detail">
          {!selectedDecision ? (
            <div className="empty-state" style={{ minHeight: 200 }}>
              <div className="empty-state__icon">👈</div>
              <div className="empty-state__title">请在左侧选择一条决策记录</div>
              <div>查看执行状态、行动记录和反馈复盘</div>
            </div>
          ) : (
            <>
              {/* Decision Summary */}
              <div className="panel">
                <div className="flex-between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                  <h3 className="panel__title" style={{ margin: 0 }}>决策执行与追踪看板</h3>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      className="btn"
                      onClick={() => updateStatus('in_progress')}
                      disabled={selectedDecision.status !== 'pending_execution'}
                    >标记执行中</button>
                    <button
                      className="btn"
                      onClick={() => updateStatus('pending_review')}
                      disabled={selectedDecision.status !== 'in_progress'}
                    >提交流盘</button>
                    <button
                      className="btn"
                      onClick={() => updateStatus('needs_adjustment')}
                      disabled={selectedDecision.status === 'needs_adjustment'}
                    >需调整</button>
                  </div>
                </div>

                <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                  <div className="flywheel-meta-item">
                    <div className="flywheel-meta-item__label">关联商品 (SKU)</div>
                    <div className="flywheel-meta-item__value">{selectedDecision.skuId}</div>
                  </div>
                  <div className="flywheel-meta-item">
                    <div className="flywheel-meta-item__label">目标实体</div>
                    <div className="flywheel-meta-item__value">{translateChannel(selectedDecision.entityId)}</div>
                  </div>
                  <div className="flywheel-meta-item">
                    <div className="flywheel-meta-item__label">负责人</div>
                    <div className="flywheel-meta-item__value">{selectedDecision.owner}</div>
                  </div>
                  <div className="flywheel-meta-item">
                    <div className="flywheel-meta-item__label">当前状态</div>
                    <span className={`status-badge ${getStatusBadgeClass(selectedDecision.status)}`}>
                      {getStatusLabel(selectedDecision.status)}
                    </span>
                  </div>
                  <div className="flywheel-meta-item">
                    <div className="flywheel-meta-item__label">更新时间</div>
                    <div className="flywheel-meta-item__value">{new Date(selectedDecision.updatedAt).toLocaleString()}</div>
                  </div>
                </div>
              </div>

              {/* Simulation Source Summary */}
              {selectedDecision.simulationRunId && (
                <div className="panel flywheel-simulation-source">
                  <div className="flex-between" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                    <h4 className="panel__title" style={{ margin: 0 }}>模拟市场来源摘要</h4>
                    <span className="status-badge status-badge--warning">Derived Result / 非真实市场反馈</span>
                  </div>

                  <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', marginBottom: 12 }}>
                    <div className="flywheel-meta-item">
                      <div className="flywheel-meta-item__label">模拟运行 ID</div>
                      <div className="flywheel-meta-item__value">{selectedDecision.simulationRunId}</div>
                    </div>
                    <div className="flywheel-meta-item">
                      <div className="flywheel-meta-item__label">来源类型</div>
                      <div className="flywheel-meta-item__value">{translateSourceType(selectedDecision.sourceType)}</div>
                    </div>
                    {selectedDecision.sourceRef && (
                      <>
                        <div className="flywheel-meta-item">
                          <div className="flywheel-meta-item__label">来源引用 ID</div>
                          <div className="flywheel-meta-item__value">{selectedDecision.sourceRef.id}</div>
                        </div>
                        <div className="flywheel-meta-item">
                          <div className="flywheel-meta-item__label">来源引用类型</div>
                          <div className="flywheel-meta-item__value">{selectedDecision.sourceRef.type}</div>
                        </div>
                      </>
                    )}
                  </div>

                  {selectedDecision.simulationSummary && (
                    <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', marginBottom: 12 }}>
                      <div className="flywheel-meta-item">
                        <div className="flywheel-meta-item__label">整体接受度</div>
                        <div className="flywheel-meta-item__value">{selectedDecision.simulationSummary.acceptanceScore}</div>
                      </div>
                      <div className="flywheel-meta-item">
                        <div className="flywheel-meta-item__label">购买/互动意向</div>
                        <div className="flywheel-meta-item__value">{selectedDecision.simulationSummary.purchaseIntentScore}</div>
                      </div>
                      <div className="flywheel-meta-item">
                        <div className="flywheel-meta-item__label">置信度</div>
                        <div className="flywheel-meta-item__value">{formatPercent(selectedDecision.simulationSummary.confidence)}</div>
                      </div>
                    </div>
                  )}

                  {selectedDecision.simulationSummary && (
                    <div className="flywheel-simulation-summary-lists">
                      {selectedDecision.simulationSummary.opportunitySummary.length > 0 && (
                        <div className="flywheel-feedback-field">
                          <strong>机会点：</strong>
                          <ul className="risk-list" style={{ marginTop: 4 }}>
                            {selectedDecision.simulationSummary.opportunitySummary.map((item, i) => <li key={i}>{item}</li>)}
                          </ul>
                        </div>
                      )}
                      {selectedDecision.simulationSummary.riskSummary.length > 0 && (
                        <div className="flywheel-feedback-field">
                          <strong>风险点：</strong>
                          <ul className="risk-list" style={{ marginTop: 4 }}>
                            {selectedDecision.simulationSummary.riskSummary.map((item, i) => <li key={i}>{item}</li>)}
                          </ul>
                        </div>
                      )}
                      {selectedDecision.simulationSummary.recommendedAdjustments.length > 0 && (
                        <div className="flywheel-feedback-field">
                          <strong>建议调整：</strong>
                          <ul className="risk-list" style={{ marginTop: 4 }}>
                            {selectedDecision.simulationSummary.recommendedAdjustments.map((item, i) => <li key={i}>{item}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Action Records */}
              <div className="panel">
                <h4 className="panel__title">行动记录</h4>
                {selectedDecision.actions.length === 0 ? (
                  <div className="empty-state" style={{ marginBottom: 14 }}>
                    <div className="empty-state__icon">📝</div>
                    <div className="empty-state__title">暂无行动记录</div>
                    <div>添加您的实际行动。红线：本系统不执行自动化动作。</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                    {selectedDecision.actions.map(act => (
                      <div key={act.actionId} className="flywheel-action-card">
                        <div className="flex-between" style={{ marginBottom: 3 }}>
                          <span style={{ fontWeight: 500, fontSize: 13 }}>{getActionTypeLabel(act.type)}</span>
                          <span className="status-badge status-badge--neutral">{act.status}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>{act.description}</div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <select className="form-control" style={{ flex: '0 1 140px', fontSize: 13 }} value={newActionType} onChange={e => setNewActionType(e.target.value)}>
                    <option value="launch">铺货/投流</option>
                    <option value="adjust_budget">调整预算</option>
                    <option value="optimize_content">优化内容</option>
                  </select>
                  <input 
                    type="text" 
                    className="form-control" 
                    style={{ flex: '1 1 200px', minWidth: 0, fontSize: 13 }} 
                    placeholder="描述具体的行动策略，例如：在核心时段追加预算" 
                    value={newActionDesc}
                    onChange={e => setNewActionDesc(e.target.value)}
                  />
                  <button className="btn btn-primary" onClick={addAction}>添加行动</button>
                </div>
              </div>

              {/* Feedback & Review */}
              <div className="panel">
                <h4 className="panel__title">业务反馈与复盘</h4>
                {selectedDecision.feedback ? (
                  <div className="flywheel-feedback-summary">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                      <div>
                        <div className="flywheel-meta-item__label">效果判定</div>
                        <span className={`status-badge ${
                          selectedDecision.feedback.effectJudgment === 'positive' ? 'status-badge--success' :
                          selectedDecision.feedback.effectJudgment === 'negative' ? 'status-badge--danger' :
                          'status-badge--neutral'
                        }`} style={{ fontSize: 12 }}>
                          {selectedDecision.feedback.effectJudgment === 'positive' ? '符合预期 / 效果好' :
                           selectedDecision.feedback.effectJudgment === 'negative' ? '不及预期 / 需优化' :
                           '效果一般'}
                        </span>
                      </div>
                      <div>
                        <div className="flywheel-meta-item__label">复盘时间</div>
                        <div style={{ fontSize: 13 }}>{new Date(selectedDecision.feedback.submittedAt).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="flywheel-feedback-field">
                      <strong>数据摘要：</strong>
                      <span>{selectedDecision.feedback.summary}</span>
                    </div>
                    <div className="flywheel-feedback-field">
                      <strong>人群偏差说明：</strong>
                      <span>{selectedDecision.feedback.audienceDeviation || '无显著偏差'}</span>
                    </div>
                    {selectedDecision.feedback.adjustments.length > 0 && (
                      <div className="flywheel-feedback-field">
                        <strong>后续调整事项：</strong>
                        <ul className="risk-list" style={{ marginTop: 4 }}>
                          {selectedDecision.feedback.adjustments.map((adj, i) => <li key={i}>{adj}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flywheel-feedback-form">
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <select
                        className="form-control"
                        style={{ flex: '0 1 170px', fontSize: 13 }}
                        value={feedbackEffect}
                        onChange={e => setFeedbackEffect(e.target.value as 'positive' | 'neutral' | 'negative' | 'unknown')}
                      >
                        <option value="unknown">选择效果判断...</option>
                        <option value="positive">符合预期 / 效果好</option>
                        <option value="neutral">效果一般</option>
                        <option value="negative">不及预期 / 需优化</option>
                      </select>
                    </div>
                    <textarea 
                      className="form-control" 
                      placeholder="复盘数据摘要" 
                      rows={2}
                      style={{ fontSize: 13 }}
                      value={feedbackSummary}
                      onChange={e => setFeedbackSummary(e.target.value)}
                    />
                    <textarea 
                      className="form-control" 
                      placeholder="人群特征是否有明显偏移？" 
                      rows={2}
                      style={{ fontSize: 13 }}
                      value={feedbackDeviation}
                      onChange={e => setFeedbackDeviation(e.target.value)}
                    />
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="待调整事项（如：更换素材主图，或者削减预算）" 
                      style={{ fontSize: 13 }}
                      value={feedbackAdjustment}
                      onChange={e => setFeedbackAdjustment(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="btn btn-primary" onClick={submitFeedback}>提交复盘记录</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
