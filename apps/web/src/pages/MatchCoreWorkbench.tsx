import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import type { HeatmapData, MatchResult, ChannelProfile, SimulatedMarketPrefill, MatchCorePrefill } from '../types';
import { translateChannel, translateTag } from '../utils/translate';

function safeScore(value: unknown): number {
  const score = Number(value);
  return Number.isFinite(score) ? score : 0;
}

/** Recommendation label & CSS class mapping */
function getRecMeta(rec: string): { label: string; cls: string } {
  switch (rec) {
    case 'priority_launch': return { label: '重点铺货 / 强投流', cls: 'rec-priority' };
    case 'test_launch': return { label: '小批次铺货 / 测试', cls: 'rec-test' };
    case 'observe': return { label: '暂缓分货 / 观察', cls: 'rec-observe' };
    case 'avoid': return { label: '熔断拦截 / 避免', cls: 'rec-avoid' };
    default: return { label: '未知', cls: '' };
  }
}

/** Map recommendation to StatusBadge variant */
function getRecBadgeClass(rec: string): string {
  switch (rec) {
    case 'priority_launch': return 'status-badge--danger';
    case 'test_launch': return 'status-badge--success';
    case 'observe': return 'status-badge--warning';
    case 'avoid': return 'status-badge--neutral';
    default: return 'status-badge--neutral';
  }
}

function buildMatchPrefill(matchDetail: MatchResult, channelName: string): SimulatedMarketPrefill {
  const recMeta = getRecMeta(matchDetail.recommendation);
  const posTags = matchDetail.positiveDrivers.map((d) => translateTag(d.tagId)).join('、') || '无';
  const negTags = matchDetail.negativeDrivers.map((d) => translateTag(d.tagId)).join('、') || '无';
  const risks = matchDetail.risks.join('、') || '无';

  const strategyText = [
    `SKU: ${matchDetail.skuId}`,
    `渠道: ${matchDetail.channelId}${channelName ? `（${channelName}）` : ''}`,
    `匹配分: ${(safeScore(matchDetail.matchScore) * 100).toFixed(1)}`,
    `置信度: ${(safeScore(matchDetail.matchConfidence) * 100).toFixed(1)}%`,
    `推荐策略: ${recMeta.label}`,
    `相似/强契合标签: ${posTags}`,
    `冲突/分歧标签: ${negTags}`,
    `风险提示: ${risks}`,
  ].join('\n');

  return {
    sourceType: 'product_channel_match',
    sourceRef: { id: matchDetail.matchId, type: 'product_channel_match' },
    strategyText,
    marketContext: { channelEntityId: matchDetail.channelId },
  };
}

export default function MatchCoreWorkbench({ initialPrefill, goToFlywheel, goToSimulatedMarket }: { initialPrefill?: MatchCorePrefill | null; goToFlywheel?: (id?: string) => void; goToSimulatedMarket?: (prefill: SimulatedMarketPrefill) => void }) {
  const [mode, setMode] = useState<'sku-to-channel' | 'channel-to-sku'>('sku-to-channel');
  const [loading, setLoading] = useState(true);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [channels, setChannels] = useState<ChannelProfile[]>([]);
  
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<string>('');
  const [selectedSecondaryId, setSelectedSecondaryId] = useState<string>('');
  
  const [matchDetail, setMatchDetail] = useState<MatchResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);

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
    if (!initialPrefill || !heatmapData) return;
    const channelId = initialPrefill.channelId;
    const skuId = initialPrefill.skuId;

    if (channelId && channels.some((channel) => channel.channelId === channelId)) {
      setMode('channel-to-sku');
      setSelectedPrimaryId(channelId);
      setSelectedSecondaryId(skuId && heatmapData.rows.some((row) => row.skuId === skuId) ? skuId : '');
      setPrefillNotice(`已从渠道画像带入：${initialPrefill.sourceLabel || channelId}`);
      return;
    }

    if (skuId && heatmapData.rows.some((row) => row.skuId === skuId)) {
      setMode('sku-to-channel');
      setSelectedPrimaryId(skuId);
      setSelectedSecondaryId('');
      setPrefillNotice(`已从渠道画像带入 SKU：${skuId}`);
      return;
    }

    setPrefillNotice(`已收到渠道画像预填：${initialPrefill.sourceLabel || channelId || skuId || '未命名对象'}；当前货渠匹配数据暂未包含可直接打开的匹配记录。`);
  }, [initialPrefill, heatmapData, channels]);

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

  if (loading) {
    return (
      <div className="empty-state" style={{ minHeight: 300 }}>
        <div className="empty-state__title">加载匹配数据中...</div>
      </div>
    );
  }

  if (error) {
    return <div className="alert-banner alert-banner--warning">⚠️ {error}</div>;
  }

  return (
      <div className="match-workbench">

      {prefillNotice && (
        <div className="alert-banner alert-banner--info">
          {prefillNotice}
        </div>
      )}

      {/* Top Toolbar */}
      <div className="toolbar">
        <h2 className="toolbar__label" style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>货渠匹配决策工作台</h2>

        <div className="segmented-control">
          <button
            className={`segmented-control__btn${mode === 'sku-to-channel' ? ' segmented-control__btn--active' : ''}`}
            onClick={() => setWorkbenchMode('sku-to-channel')}
          >
            按商品找实体
          </button>
          <button
            className={`segmented-control__btn${mode === 'channel-to-sku' ? ' segmented-control__btn--active' : ''}`}
            onClick={() => setWorkbenchMode('channel-to-sku')}
          >
            按实体找商品
          </button>
        </div>

        <div className="toolbar__spacer" />

        <select
          className="form-control"
          style={{ width: 'auto', maxWidth: 200, flex: '0 1 180px' }}
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

      {/* Body: Left (List) + Right (Detail) */}
      <div className="match-workbench__body">
        
        {/* Left Column: Match List */}
        <div className="match-workbench__left">
          
          {/* Match List */}
          <div className="match-list-container">
            <div className="match-list-container__header">
              <span>匹配的{mode === 'sku-to-channel' ? '实体列表' : '商品列表'} ({listItems.length})</span>
            </div>

            <div className="match-list-container__filters">
              <select
                className="form-control"
                style={{ width: 120, padding: '4px 8px', fontSize: 12 }}
                value={filterRec}
                onChange={e => setFilterRec(e.target.value)}
              >
                <option value="all">全部分组</option>
                <option value="priority_launch">重点铺货</option>
                <option value="test_launch">测试铺货</option>
                <option value="observe">暂缓铺货</option>
                <option value="avoid">拦截避免</option>
              </select>
              <select
                className="form-control"
                style={{ width: 110, padding: '4px 8px', fontSize: 12 }}
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

            <div className="match-list-container__scroll">
              {listItems.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state__icon">📋</div>
                  <div className="empty-state__title">暂无匹配记录</div>
                  <div>请选择商品或实体后查看匹配结果</div>
                </div>
              ) : (
                listItems.map(item => {
                  const meta = getRecMeta(item.rec);
                  return (
                    <div 
                      key={item.id}
                      className={`match-entity-item${selectedSecondaryId === item.id ? ' match-entity-item--selected' : ''}`}
                      onClick={() => setSelectedSecondaryId(item.id)}
                    >
                      <div className="flex-between" style={{ marginBottom: 4 }}>
                        <span className="entity-list-item__name">{item.name}</span>
                        <span className={meta.cls} style={{ fontWeight: 600, fontSize: 14 }}>
                          {(item.score * 100).toFixed(0)}分
                        </span>
                      </div>
                      <div className="flex-between" style={{ fontSize: 12 }}>
                        <span className="match-entity-item__confidence">
                          置信度: {(item.confidence * 100).toFixed(0)}%
                        </span>
                        <span className={`status-badge ${getRecBadgeClass(item.rec)}`}>
                          {meta.label}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Match Detail (Explainable AI) */}
        <div className="match-workbench__right">
          {listItems.length === 0 ? (
            <div className="match-workbench__right-empty">
              <div className="empty-state">
                <div className="empty-state__icon">📭</div>
                <div className="empty-state__title">当前无匹配数据</div>
                <div>由于无匹配记录，无法查看详细的诊断报告</div>
              </div>
            </div>
          ) : !selectedSecondaryId ? (
            <div className="match-workbench__right-empty">
              <div className="empty-state">
                <div className="empty-state__icon">🔍</div>
                <div className="empty-state__title">请在左侧列表中选择一项</div>
                <div>查看详细的解释型匹配诊断报告</div>
              </div>
            </div>
          ) : detailLoading ? (
            <div className="match-workbench__right-empty">
              <div className="empty-state">
                <div className="empty-state__title">正在加载智能诊断与解释...</div>
              </div>
            </div>
          ) : !matchDetail ? (
            <div className="match-workbench__right-empty">
              <div className="empty-state">
                <div className="empty-state__icon">⚠️</div>
                <div className="empty-state__title">未能加载该项的详细诊断数据</div>
              </div>
            </div>
          ) : (
              <div className="match-workbench__right-content">
              
              {/* Report Header + Actions */}
              <div className="flex-between" style={{ flexWrap: 'wrap', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>匹配决策解释报告</h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={() => {
                    if (!matchDetail || !goToSimulatedMarket) return;
                    const channel = channels.find((c) => c.channelId === matchDetail.channelId);
                    goToSimulatedMarket(buildMatchPrefill(matchDetail, channel?.channelName ?? ''));
                  }} disabled={!goToSimulatedMarket}>模拟目标用户反馈</button>
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

              {/* Quality Flags Warning */}
              {matchDetail.qualityFlags.some(f => f.includes('低置信度') || f.includes('不足') || f.includes('unmapped')) && (
                <div className="alert-banner alert-banner--warning">
                  ⚠️ 注意：当前匹配评估包含风险标识（{matchDetail.qualityFlags.join('、')}），匹配解释仅供业务参考，勿作为自动化规则唯一依据。
                </div>
              )}

              {/* Decision Recommendation + Score Metrics */}
              <div className="metric-grid">
                <div className="metric-card metric-card--compact" style={{ borderLeft: '3px solid' }}>
                  <div className="metric-title">决策建议 (解释型)</div>
                  <div className={`metric-value ${getRecMeta(matchDetail.recommendation).cls}`} style={{ fontSize: 18 }}>
                    {getRecMeta(matchDetail.recommendation).label}
                  </div>
                  <div className="metric-sub" style={{ marginTop: 6 }}>基于 PLS 数据对象与规则推演</div>
                </div>
                <div className="metric-card metric-card--compact">
                  <div className="metric-title">综合匹配得分</div>
                  <div className="metric-value">
                    {(safeScore(matchDetail.matchScore) * 100).toFixed(1)} <span style={{ fontSize: 13, fontWeight: 'normal' }}>分</span>
                  </div>
                  <div className="metric-sub" style={{ marginTop: 6 }}>
                    <span>算法置信度</span>
                    <span style={{ fontWeight: 600 }}>{(safeScore(matchDetail.matchConfidence) * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>

              {/* Positive Drivers */}
              <div className="section-divider">
                <h4 className="section-divider__heading section-divider__heading--success">
                  <span>✓</span> 相似/强契合标签 (Positive Drivers)
                </h4>
                {matchDetail.positiveDrivers.length === 0 ? (
                  <div className="empty-state" style={{ padding: '16px 12px' }}>
                    <div className="empty-state__title">未发现显著的强契合特征</div>
                  </div>
                ) : (
                  <div className="driver-grid">
                    {matchDetail.positiveDrivers.map(d => (
                      <div key={d.tagId} className="driver-card driver-card--positive">
                        <div className="driver-card__label">{translateTag(d.tagId)}</div>
                        <div className="driver-card__sub">
                          商品符合度: {(d.productScore * 100).toFixed(0)}% | 实体符合度: {(d.channelScore * 100).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Negative Drivers */}
              <div className="section-divider">
                <h4 className="section-divider__heading section-divider__heading--danger">
                  <span>✗</span> 冲突/分歧标签 (Negative Drivers)
                </h4>
                {matchDetail.negativeDrivers.length === 0 ? (
                  <div className="empty-state" style={{ padding: '16px 12px' }}>
                    <div className="empty-state__title">未发现显著的人货分歧</div>
                  </div>
                ) : (
                  <div className="driver-grid">
                    {matchDetail.negativeDrivers.map(d => (
                      <div key={d.tagId} className="driver-card driver-card--negative">
                        <div className="driver-card__label">{translateTag(d.tagId)}</div>
                        <div className="driver-card__sub">存在特征偏离 (差距较大)</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Risks */}
              <div className="section-divider">
                <h4 className="section-divider__heading section-divider__heading--warning">
                  <span>⚠️</span> 业务风险提示 (Risks & Missing Tags)
                </h4>
                {matchDetail.risks.length === 0 ? (
                  <div className="empty-state" style={{ padding: '16px 12px' }}>
                    <div className="empty-state__title">当前匹配无明显已知风险或严重标签缺失</div>
                  </div>
                ) : (
                  <ul className="risk-list">
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
