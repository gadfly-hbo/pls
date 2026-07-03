import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { HeatmapData, MatchResult, ChannelProfile } from '../types';
import { translateChannel, translateTag } from '../utils/translate';

export default function MatchCoreWorkbench({ goToFlywheel }: { goToFlywheel?: (id?: string) => void }) {
  const [mode, setMode] = useState<'sku-to-channel' | 'channel-to-sku'>('sku-to-channel');
  const [loading, setLoading] = useState(true);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [channels, setChannels] = useState<ChannelProfile[]>([]);
  
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<string>('');
  const [selectedSecondaryId, setSelectedSecondaryId] = useState<string>('');
  
  const [matchDetail, setMatchDetail] = useState<MatchResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterRec, setFilterRec] = useState<string>('all');
  const [sortField, setSortField] = useState<'score' | 'confidence'>('score');
  const [sortDesc] = useState(true);

  const setWorkbenchMode = (nextMode: 'sku-to-channel' | 'channel-to-sku') => {
    setSelectedSecondaryId('');
    setMatchDetail(null);
    setFilterRec('all');
    setMode(nextMode);
  };

  useEffect(() => {
    const loadBaseData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [resHeatmap, resChannels] = await Promise.all([
          api.getHeatmap(),
          api.getMatchEntities()
        ]);
        setHeatmapData(resHeatmap.data);
        setChannels(resChannels.data.items);
        
        // Auto select first primary
        if (resHeatmap.data.rows.length > 0) {
          setSelectedPrimaryId(resHeatmap.data.rows[0].skuId);
        }
      } catch (err: unknown) {
        console.error(err);
        setError('加载基础数据失败');
      } finally {
        setLoading(false);
      }
    };
    loadBaseData();
  }, []);

  // When mode changes, reset selections
  useEffect(() => {
    if (!heatmapData) return;
    setFilterRec('all');
    setSelectedSecondaryId('');
    setMatchDetail(null);
    if (mode === 'sku-to-channel') {
      if (heatmapData.rows.length > 0) setSelectedPrimaryId(heatmapData.rows[0].skuId);
    } else {
      if (channels.length > 0) setSelectedPrimaryId(channels[0].channelId);
    }
  }, [mode, heatmapData, channels]);

  useEffect(() => {
    if (!selectedPrimaryId || !selectedSecondaryId) {
      setMatchDetail(null);
      return;
    }
    const loadDetail = async () => {
      setDetailLoading(true);
      try {
        const skuId = mode === 'sku-to-channel' ? selectedPrimaryId : selectedSecondaryId;
        const channelId = mode === 'sku-to-channel' ? selectedSecondaryId : selectedPrimaryId;
        const res = await api.getMatchDetailBySkuAndChannel(skuId, channelId);
        setMatchDetail(res.data);
      } catch (err) {
        console.error('Failed to load match detail', err);
        setMatchDetail(null);
      } finally {
        setDetailLoading(false);
      }
    };
    loadDetail();
  }, [selectedPrimaryId, selectedSecondaryId, mode]);

  const uniqueSkus = useMemo(() => {
    if (!heatmapData) return [];
    return heatmapData.rows.map(r => r.skuId);
  }, [heatmapData]);

  const listItems = useMemo(() => {
    if (!heatmapData || !selectedPrimaryId) return [];

    let items: Array<{ id: string, name: string, score: number, confidence: number, rec: string }> = [];

    if (mode === 'sku-to-channel') {
      const row = heatmapData.rows.find(r => r.skuId === selectedPrimaryId);
      if (row) {
        items = row.cells.map(c => {
          const ch = channels.find(x => x.channelId === c.channelId);
          return {
            id: c.channelId,
            name: ch?.channelName || translateChannel(c.channelId),
            score: safeScore(c.matchScore),
            confidence: safeScore(c.matchConfidence),
            rec: c.recommendation
          };
        });
      }
    } else {
      heatmapData.rows.forEach(row => {
        const cell = row.cells.find(c => c.channelId === selectedPrimaryId);
        if (cell) {
          items.push({
            id: row.skuId,
            name: row.skuId, // In real app, we'd have product title
            score: safeScore(cell.matchScore),
            confidence: safeScore(cell.matchConfidence),
            rec: cell.recommendation
          });
        }
      });
    }

    // Apply filters
    if (filterRec !== 'all') {
      items = items.filter(item => item.rec === filterRec);
    }

    // Apply sort
    items.sort((a, b) => {
      const valA = sortField === 'score' ? a.score : a.confidence;
      const valB = sortField === 'score' ? b.score : b.confidence;
      return sortDesc ? valB - valA : valA - valB;
    });

    return items;
  }, [heatmapData, selectedPrimaryId, mode, channels, filterRec, sortField, sortDesc]);

  const getRecLabel = (rec: string) => {
    switch (rec) {
      case 'priority_launch': return { label: '重点铺货 / 强投流', color: 'var(--destructive)' };
      case 'test_launch': return { label: '小批次铺货 / 测试', color: 'var(--success)' };
      case 'observe': return { label: '暂缓分货 / 观察', color: 'var(--warning)' };
      case 'avoid': return { label: '熔断拦截 / 避免', color: 'var(--foreground)' };
      default: return { label: '未知', color: 'var(--muted-foreground)' };
    }
  };

  const handleExportCsv = () => {
    if (!matchDetail) return;
    const header = "匹配ID,SKU ID,实体 ID,匹配分,置信度,推荐策略,相似标签,冲突标签,风险提示,数据质量,计算时间\n";
    const pos = matchDetail.positiveDrivers.map(d => translateTag(d.tagId)).join('; ');
    const neg = matchDetail.negativeDrivers.map(d => translateTag(d.tagId)).join('; ');
    const risks = matchDetail.risks.join('; ');
    const flags = matchDetail.qualityFlags.join('; ');
    
    const row = [
      matchDetail.matchId,
      matchDetail.skuId,
      matchDetail.channelId,
      safeScore(matchDetail.matchScore).toFixed(4),
      safeScore(matchDetail.matchConfidence).toFixed(4),
      matchDetail.recommendation,
      `"${pos}"`,
      `"${neg}"`,
      `"${risks}"`,
      `"${flags}"`,
      matchDetail.generatedAt
    ].join(',');

    const blob = new Blob([header + row], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `match_detail_${matchDetail.skuId}_${matchDetail.channelId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted-foreground)' }}>加载匹配数据中...</div>;
  if (error) return <div className="alert alert-warning">{error}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      {/* Top Bar Mode Switcher */}
      <div className="card" style={{ padding: '16px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>人货匹配决策工作台</h2>
        <div style={{ display: 'flex', background: 'var(--secondary)', padding: 4, borderRadius: 8 }}>
          <button 
            onClick={() => setWorkbenchMode('sku-to-channel')}
            style={{
              padding: '6px 16px', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: 'pointer',
              background: mode === 'sku-to-channel' ? 'var(--card)' : 'transparent',
              color: mode === 'sku-to-channel' ? 'var(--foreground)' : 'var(--muted-foreground)',
              boxShadow: mode === 'sku-to-channel' ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            按商品找实体
          </button>
          <button 
            onClick={() => setWorkbenchMode('channel-to-sku')}
            style={{
              padding: '6px 16px', border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 500, cursor: 'pointer',
              background: mode === 'channel-to-sku' ? 'var(--card)' : 'transparent',
              color: mode === 'channel-to-sku' ? 'var(--foreground)' : 'var(--muted-foreground)',
              boxShadow: mode === 'channel-to-sku' ? 'var(--shadow-sm)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            按实体找商品
          </button>
        </div>
      </div>

      <div className="dashboard-grid" style={{ flex: 1, minHeight: 0, gap: 20 }}>
        
        {/* Left Column: Primary Selector + Secondary List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
          
          {/* Primary Selector */}
          <div className="card" style={{ padding: 16, margin: 0 }}>
            <label style={{ display: 'block', marginBottom: 8, fontWeight: 500, fontSize: 14 }}>
              {mode === 'sku-to-channel' ? '选择目标商品 (SKU)' : '选择目标实体 (店铺/账号)'}
            </label>
            <select 
              className="form-control" 
              value={selectedPrimaryId} 
              onChange={e => setSelectedPrimaryId(e.target.value)}
            >
              {mode === 'sku-to-channel' ? (
                uniqueSkus.map(sku => (
                  <option key={sku} value={sku}>{sku}</option>
                ))
              ) : (
                channels.map(ch => (
                  <option key={ch.channelId} value={ch.channelId}>{ch.channelName}</option>
                ))
              )}
            </select>
          </div>

          {/* Secondary List */}
          <div className="card" style={{ padding: 16, margin: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div className="flex-between" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 500 }}>
                匹配的{mode === 'sku-to-channel' ? '实体列表' : '商品列表'} ({listItems.length})
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <select className="form-control" style={{ width: 140, padding: '4px 8px' }} value={filterRec} onChange={e => setFilterRec(e.target.value)}>
                <option value="all">全部分组</option>
                <option value="priority_launch">重点铺货</option>
                <option value="test_launch">测试铺货</option>
                <option value="observe">暂缓铺货</option>
                <option value="avoid">拦截避免</option>
              </select>
              <select
                className="form-control"
                style={{ width: 120, padding: '4px 8px' }}
                value={sortField}
                onChange={(e) => {
                  const nextSort = e.target.value;
                  if (nextSort === 'score' || nextSort === 'confidence') setSortField(nextSort);
                }}
              >
                <option value="score">按得分排序</option>
                <option value="confidence">按置信度排序</option>
              </select>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {listItems.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', padding: 20 }}>暂无匹配记录</div>
              ) : (
                listItems.map(item => (
                  <div 
                    key={item.id}
                    className="match-entity-item"
                    onClick={() => setSelectedSecondaryId(item.id)}
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: '1px solid',
                      borderColor: selectedSecondaryId === item.id ? 'var(--primary)' : 'var(--border)',
                      background: selectedSecondaryId === item.id ? 'var(--accent)' : 'var(--background)',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div className="flex-between" style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: 14 }}>{item.name}</span>
                      <span style={{ color: getRecLabel(item.rec).color, fontWeight: 600 }}>{(item.score * 100).toFixed(0)}分</span>
                    </div>
                    <div className="flex-between" style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
                      <span>置信度: {(item.confidence * 100).toFixed(0)}%</span>
                      <span>{getRecLabel(item.rec).label}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Match Detail (Explainable AI) */}
        <div className="card" style={{ margin: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {!selectedSecondaryId ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--muted-foreground)' }}>
              请在左侧列表中选择一项查看详细的解释型匹配诊断
            </div>
          ) : detailLoading ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--muted-foreground)' }}>
              正在加载智能诊断与解释...
            </div>
          ) : !matchDetail ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--muted-foreground)' }}>
              未能加载该项的详细诊断数据
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              
              <div className="flex-between">
                <h3 style={{ margin: 0, fontSize: 18 }}>匹配决策解释报告</h3>
                <div style={{ display: 'flex', gap: 12 }}>
                  <button className="btn btn-primary" onClick={async () => {
                    try {
                      const res = await api.createDecision({
                        matchId: matchDetail.matchId,
                        skuId: matchDetail.skuId,
                        entityId: matchDetail.channelId,
                        entityType: mode === 'channel-to-sku' ? 'sku' : 'channel',
                        recommendation: matchDetail.recommendation,
                        rationale: `基于匹配分 ${safeScore(matchDetail.matchScore).toFixed(2)} 和置信度 ${safeScore(matchDetail.matchConfidence).toFixed(2)} 创建经营决策`,
                        owner: '运营专员'
                      });
                      if (goToFlywheel) goToFlywheel(res.data.decisionId);
                    } catch (e) {
                      console.error(e);
                    }
                  }}>创建经营决策</button>
                  <button className="btn" onClick={handleExportCsv}>导出明细 (CSV)</button>
                </div>
              </div>

              {matchDetail.qualityFlags.some(f => f.includes('低置信度') || f.includes('不足') || f.includes('unmapped')) && (
                <div className="alert alert-warning" style={{ margin: 0 }}>
                  注意：当前匹配评估包含风险标识（{matchDetail.qualityFlags.join('、')}），匹配解释仅供业务参考，勿作为自动化规则唯一依据。
                </div>
              )}

              <div className="metric-grid">
                <div className="metric-card" style={{ background: 'var(--background)', borderColor: getRecLabel(matchDetail.recommendation).color }}>
                  <div className="metric-title">决策建议 (解释型)</div>
                  <div className="metric-value" style={{ color: getRecLabel(matchDetail.recommendation).color, fontSize: 24 }}>
                    {getRecLabel(matchDetail.recommendation).label}
                  </div>
                  <div className="metric-sub" style={{ marginTop: 12 }}>基于 PLS 数据对象与规则推演</div>
                </div>
                <div className="metric-card" style={{ background: 'var(--background)' }}>
                  <div className="metric-title">综合匹配得分</div>
                  <div className="metric-value">{(safeScore(matchDetail.matchScore) * 100).toFixed(1)} <span style={{fontSize:14, fontWeight:'normal'}}>分</span></div>
                  <div className="metric-sub" style={{ marginTop: 12 }}>
                    <span>算法置信度</span>
                    <span style={{ fontWeight: 600 }}>{(safeScore(matchDetail.matchConfidence) * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <h4 style={{ color: 'var(--success)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>✓</span> 相似/强契合标签 (Positive Drivers)
                </h4>
                {matchDetail.positiveDrivers.length === 0 ? (
                  <div style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>未发现显著的强契合特征</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                    {matchDetail.positiveDrivers.map(d => (
                      <div key={d.tagId} style={{ background: 'var(--success-bg)', padding: '10px 14px', borderRadius: 6, border: '1px solid', borderColor: 'color-mix(in srgb, var(--success) 30%, transparent)' }}>
                        <div style={{ fontWeight: 500, color: 'var(--foreground)' }}>{translateTag(d.tagId)}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
                          商品符合度: {(d.productScore * 100).toFixed(0)}% | 实体符合度: {(d.channelScore * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <h4 style={{ color: 'var(--destructive)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>✗</span> 冲突/分歧标签 (Negative Drivers)
                </h4>
                {matchDetail.negativeDrivers.length === 0 ? (
                  <div style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>未发现显著的人货分歧</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                    {matchDetail.negativeDrivers.map(d => (
                      <div key={d.tagId} style={{ background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', padding: '10px 14px', borderRadius: 6, border: '1px solid', borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)' }}>
                        <div style={{ fontWeight: 500, color: 'var(--foreground)' }}>{translateTag(d.tagId)}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>
                          存在特征偏离 (差距较大)
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <h4 style={{ color: 'var(--warning)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>⚠️</span> 业务风险提示 (Risks & Missing Tags)
                </h4>
                {matchDetail.risks.length === 0 ? (
                  <div style={{ color: 'var(--muted-foreground)', fontSize: 14 }}>当前匹配无明显已知风险或严重标签缺失</div>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--foreground)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {matchDetail.risks.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function safeScore(value: unknown): number {
  const score = Number(value);
  return Number.isFinite(score) ? score : 0;
}
