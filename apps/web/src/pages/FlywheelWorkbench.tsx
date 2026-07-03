import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { DecisionRecord, ActionRecord } from '../types';
import { translateChannel } from '../utils/translate';

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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending_execution': return { label: '待执行', color: 'var(--muted-foreground)' };
      case 'in_progress': return { label: '执行中', color: 'var(--primary)' };
      case 'pending_review': return { label: '待复盘', color: 'var(--warning)' };
      case 'verified': return { label: '已验证', color: 'var(--success)' };
      case 'needs_adjustment': return { label: '需调整', color: 'var(--destructive)' };
      default: return { label: '未知', color: 'var(--foreground)' };
    }
  };

  if (loading && decisions.length === 0) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted-foreground)' }}>加载飞轮数据中...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 120px)' }}>
      <div className="card" style={{ padding: '16px 24px', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>经营飞轮与策略闭环</h2>
        <div style={{ color: 'var(--muted-foreground)', marginTop: 8, fontSize: 14 }}>从匹配建议到行动执行，追踪反馈并闭环优化</div>
      </div>

      <div className="dashboard-grid" style={{ flex: 1, minHeight: 0, gap: 20 }}>
        {/* Left Column: Decision List */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16, margin: 0, minHeight: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>决策追踪列表</h3>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
            {decisions.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', padding: 20 }}>暂无决策记录</div>
            ) : (
              decisions.map(d => (
                <div 
                  key={d.decisionId}
                  className="flywheel-decision-item"
                  onClick={() => setSelectedDecisionId(d.decisionId)}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: '1px solid',
                    borderColor: selectedDecisionId === d.decisionId ? 'var(--primary)' : 'var(--border)',
                    background: selectedDecisionId === d.decisionId ? 'var(--accent)' : 'var(--background)',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <div className="flex-between" style={{ marginBottom: 8 }}>
                    <span style={{ fontWeight: 500, fontSize: 14 }}>{d.skuId}</span>
                    <span style={{ 
                      fontSize: 12, 
                      padding: '2px 8px', 
                      borderRadius: 12,
                      background: 'var(--background)',
                      color: getStatusLabel(d.status).color,
                      border: `1px solid ${getStatusLabel(d.status).color}`
                    }}>
                      {getStatusLabel(d.status).label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>实体: {translateChannel(d.entityId)}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>创建于: {new Date(d.createdAt).toLocaleDateString()}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Flywheel Detail */}
        <div className="card" style={{ margin: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {!selectedDecision ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--muted-foreground)' }}>
              请在左侧选择一条决策记录
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                <div className="flex-between" style={{ marginBottom: 12, gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <h3 style={{ margin: 0, fontSize: 18, flex: '1 1 220px', minWidth: 0 }}>决策执行与追踪看板</h3>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => updateStatus('in_progress')} disabled={selectedDecision.status !== 'pending_execution'}>标记执行中</button>
                    <button className="btn" onClick={() => updateStatus('pending_review')} disabled={selectedDecision.status !== 'in_progress'}>提交流盘</button>
                    <button className="btn" onClick={() => updateStatus('needs_adjustment')} disabled={selectedDecision.status === 'needs_adjustment'}>需调整</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, fontSize: 14, color: 'var(--muted-foreground)' }}>
                  <div>关联商品 (SKU)：<strong style={{color:'var(--foreground)'}}>{selectedDecision.skuId}</strong></div>
                  <div>目标实体：<strong style={{color:'var(--foreground)'}}>{translateChannel(selectedDecision.entityId)}</strong></div>
                  <div>负责人：{selectedDecision.owner}</div>
                  <div>更新时间：{new Date(selectedDecision.updatedAt).toLocaleString()}</div>
                </div>
              </div>

              {/* Actions */}
              <div>
                <h4 style={{ margin: '0 0 16px 0', fontSize: 16 }}>行动记录</h4>
                {selectedDecision.actions.length === 0 ? (
                  <div style={{ color: 'var(--muted-foreground)', fontSize: 14, marginBottom: 16 }}>暂无行动记录，添加您的实际行动。红线：本系统不执行自动化动作。</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                    {selectedDecision.actions.map(act => (
                      <div key={act.actionId} style={{ background: 'var(--secondary)', padding: 12, borderRadius: 8 }}>
                        <div className="flex-between" style={{ marginBottom: 4 }}>
                          <span style={{ fontWeight: 500 }}>{act.type === 'launch' ? '铺货/投流' : act.type === 'adjust_budget' ? '调整预算' : '优化内容'}</span>
                          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>状态: {act.status}</span>
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>{act.description}</div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select className="form-control" style={{ flex: '0 1 160px' }} value={newActionType} onChange={e => setNewActionType(e.target.value)}>
                    <option value="launch">铺货/投流</option>
                    <option value="adjust_budget">调整预算</option>
                    <option value="optimize_content">优化内容</option>
                  </select>
                  <input 
                    type="text" 
                    className="form-control" 
                    style={{ flex: '1 1 220px', minWidth: 0 }} 
                    placeholder="描述具体的行动策略，例如：在核心时段追加预算" 
                    value={newActionDesc}
                    onChange={e => setNewActionDesc(e.target.value)}
                  />
                  <button className="btn btn-primary" onClick={addAction}>添加行动</button>
                </div>
              </div>

              {/* Feedback & Review */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
                <h4 style={{ margin: '0 0 16px 0', fontSize: 16 }}>业务反馈与复盘</h4>
                {selectedDecision.feedback ? (
                  <div style={{ background: 'var(--success-bg)', padding: 16, borderRadius: 8, border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 4 }}>效果判定</div>
                        <strong style={{ color: selectedDecision.feedback.effectJudgment === 'positive' ? 'var(--success)' : selectedDecision.feedback.effectJudgment === 'negative' ? 'var(--destructive)' : 'var(--foreground)' }}>
                          {selectedDecision.feedback.effectJudgment === 'positive' ? '符合预期 / 效果好' : selectedDecision.feedback.effectJudgment === 'negative' ? '不及预期 / 需优化' : '效果一般'}
                        </strong>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 4 }}>复盘时间</div>
                        <div style={{ fontSize: 14 }}>{new Date(selectedDecision.feedback.submittedAt).toLocaleString()}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 14, marginBottom: 12 }}>
                      <strong style={{ display: 'block', marginBottom: 4 }}>数据摘要：</strong>
                      <div style={{ color: 'var(--muted-foreground)' }}>{selectedDecision.feedback.summary}</div>
                    </div>
                    <div style={{ fontSize: 14, marginBottom: 12 }}>
                      <strong style={{ display: 'block', marginBottom: 4 }}>人群偏差说明：</strong>
                      <div style={{ color: 'var(--muted-foreground)' }}>{selectedDecision.feedback.audienceDeviation || '无显著偏差'}</div>
                    </div>
                    {selectedDecision.feedback.adjustments.length > 0 && (
                      <div style={{ fontSize: 14 }}>
                        <strong style={{ display: 'block', marginBottom: 4 }}>后续调整事项：</strong>
                        <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--muted-foreground)' }}>
                          {selectedDecision.feedback.adjustments.map((adj, i) => <li key={i}>{adj}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--background)', padding: 16, borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <select className="form-control" style={{ flex: '0 1 180px' }} value={feedbackEffect} onChange={e => setFeedbackEffect(e.target.value as any)}>
                        <option value="unknown">选择效果判断...</option>
                        <option value="positive">符合预期 / 效果好</option>
                        <option value="neutral">效果一般</option>
                        <option value="negative">不及预期 / 需优化</option>
                      </select>
                    </div>
                    <textarea 
                      className="form-control" 
                      placeholder="复盘数据摘要（如：CTR、转化率、ROI 等指标变动）" 
                      rows={2}
                      value={feedbackSummary}
                      onChange={e => setFeedbackSummary(e.target.value)}
                    />
                    <textarea 
                      className="form-control" 
                      placeholder="人群特征是否有明显偏移？（如：实际触达人群偏年轻化）" 
                      rows={2}
                      value={feedbackDeviation}
                      onChange={e => setFeedbackDeviation(e.target.value)}
                    />
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder="待调整事项（如：更换素材主图，或者削减预算）" 
                      value={feedbackAdjustment}
                      onChange={e => setFeedbackAdjustment(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
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
