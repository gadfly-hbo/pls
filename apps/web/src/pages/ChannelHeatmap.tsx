import { useEffect, useState, useMemo } from 'react';
import { api } from '../services/api';
import type { HeatmapData, MatchResult, ChannelProfile } from '../types';

export default function ChannelHeatmap() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatmapData | null>(null);
  const [channels, setChannels] = useState<ChannelProfile[]>([]);
  const [matchDetails, setMatchDetails] = useState<Record<string, Record<string, MatchResult>>>({});
  const [selectedMatch, setSelectedMatch] = useState<MatchResult | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  // Filters and Sorting for Multi-SKU (C2)
  const [filterRec, setFilterRec] = useState<string>('all');
  const [sortByChannel, setSortByChannel] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [resHeatmap, resChannels] = await Promise.all([
        api.getHeatmap(),
        api.getChannels()
      ]);
      
      const rows = resHeatmap.data.rows;
      const deduplicatedRows = rows.map(row => {
        const seenChannels = new Set<string>();
        const uniqueCells = row.cells.filter(cell => {
          if (seenChannels.has(cell.channelId)) return false;
          seenChannels.add(cell.channelId);
          return true;
        });
        return { ...row, cells: uniqueCells };
      });

      setHeatmapData({ ...resHeatmap.data, rows: deduplicatedRows });
      setChannels(resChannels.data.items);

      // Fetch match details for all SKUs to support drivers/risks in heatmap & export (C2, C3)
      const skuIds = deduplicatedRows.map(r => r.skuId);
      const matchMap: Record<string, Record<string, MatchResult>> = {};
      
      await Promise.all(skuIds.map(async (skuId) => {
        try {
          // Since getMatchDetailBySkuAndChannel is slow for many, we simulate fetching all matches for an SKU
          // Since api.ts mock uses fetchApi('/matches?skuId=...'), we can use it via fetch directly if it wasn't mocked.
          // But using the available api.ts:
          matchMap[skuId] = {};
          const row = deduplicatedRows.find(r => r.skuId === skuId);
          if (row) {
            await Promise.all(row.cells.map(async (c) => {
               try {
                 const detailRes = await api.getMatchDetailBySkuAndChannel(skuId, c.channelId);
                 matchMap[skuId][c.channelId] = detailRes.data;
               } catch {
                 // ignore
               }
            }));
          }
        } catch {
          // ignore
        }
      }));
      setMatchDetails(matchMap);

    } catch (e: unknown) {
      console.error('Failed to load heatmap data', e);
      setError(e instanceof Error ? e.message : '加载热力图失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleCellClick = (skuId: string, channelId: string) => {
    const detail = matchDetails[skuId]?.[channelId];
    if (detail) {
      setSelectedMatch(detail);
      setDrawerVisible(true);
    } else {
      alert('未找到该匹配明细，请确认是否已生成匹配结果');
    }
  };

  // C3: P1 demo report 导出
  const escapeCsvCell = (value: string | number | undefined | null) => {
    if (value == null) return '""';
    const str = String(value);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`;
  };

  const exportCSV = () => {
    if (!heatmapData) return;
    const header = "SKU,Channel,Match Score,Confidence,Recommendation,Positive Drivers,Negative Drivers,Risks,generatedAt\n";
    const rows = heatmapData.rows.flatMap(r => 
      r.cells.map(c => {
        const detail = matchDetails[r.skuId]?.[c.channelId];
        const posDrivers = detail?.positiveDrivers.map(d => d.tagId).join(';') || '';
        const negDrivers = detail?.negativeDrivers.map(d => d.tagId).join(';') || '';
        const risks = detail?.risks.join(';') || '';
        const generatedAt = detail?.generatedAt || heatmapData.generatedAt;
        return [
          r.skuId,
          c.channelId,
          c.matchScore,
          c.matchConfidence,
          c.recommendation,
          posDrivers,
          negDrivers,
          risks,
          generatedAt
        ].map(escapeCsvCell).join(',');
      })
    ).join('\n');
    
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `match_report_${new Date().getTime()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getCellColor = (recommendation: string, score: number) => {
    const percentage = (score * 100).toFixed(0);
    if (recommendation === 'priority_launch') return `color-mix(in srgb, var(--destructive) ${percentage}%, transparent)`;
    if (recommendation === 'test_launch') return `color-mix(in srgb, var(--success) ${percentage}%, transparent)`;
    if (recommendation === 'observe') return `color-mix(in srgb, var(--warning) ${percentage}%, transparent)`;
    if (recommendation === 'avoid') return `color-mix(in srgb, var(--foreground) 50%, transparent)`;
    return 'var(--background)';
  };

  const getRecLabel = (rec: string) => {
    switch (rec) {
      case 'priority_launch': return { label: '重点铺货 / 强投流', color: 'var(--destructive)' };
      case 'test_launch': return { label: '小批次铺货 / 小额测试', color: 'var(--success)' };
      case 'observe': return { label: '暂缓分货 / 自然流量观察', color: 'var(--warning)' };
      case 'avoid': return { label: '熔断拦截 / 避免铺货', color: 'var(--foreground)' };
      default: return { label: '未知', color: 'var(--muted-foreground)' };
    }
  };

  // Process data for multi-SKU comparison view (C2)
  const processedRows = useMemo(() => {
    if (!heatmapData?.rows) return [];
    let rows = [...heatmapData.rows];

    // Filter by recommendation
    if (filterRec !== 'all') {
      rows = rows.filter(row => row.cells.some(c => c.recommendation === filterRec));
    }

    // Sort by channel score
    if (sortByChannel) {
      rows.sort((a, b) => {
        const cellA = a.cells.find(c => c.channelId === sortByChannel);
        const cellB = b.cells.find(c => c.channelId === sortByChannel);
        const scoreA = cellA?.matchScore || 0;
        const scoreB = cellB?.matchScore || 0;
        return sortDesc ? scoreB - scoreA : scoreA - scoreB;
      });
    }

    return rows;
  }, [heatmapData, filterRec, sortByChannel, sortDesc]);

  const toggleSort = (channelId: string) => {
    if (sortByChannel === channelId) {
      setSortDesc(!sortDesc);
    } else {
      setSortByChannel(channelId);
      setSortDesc(true);
    }
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted-foreground)' }}>加载热力图中...</div>;
  if (error) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--destructive)' }}>{error}</div>;

  const allChannels = heatmapData?.rows[0]?.cells.map(c => c.channelId) || [];

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h2>人货匹配热力图</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select 
            className="input" 
            style={{ width: 180 }}
            value={filterRec} 
            onChange={e => setFilterRec(e.target.value)}
          >
            <option value="all">全部分组 (All)</option>
            <option value="priority_launch">重点铺货 (Priority)</option>
            <option value="test_launch">测试铺货 (Test)</option>
            <option value="observe">暂缓铺货 (Observe)</option>
            <option value="avoid">熔断拦截 (Avoid)</option>
          </select>
          <button className="btn btn-primary" onClick={exportCSV}>导出匹配报告 (CSV)</button>
        </div>
      </div>

      <div className="card">
        {(!processedRows || processedRows.length === 0) ? (
           <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted-foreground)' }}>暂无匹配数据，请先录入新品并生成渠道匹配。</div>
        ) : (
          <div className="heatmap-wrapper" style={{ overflowX: 'auto' }}>
            <table className="heatmap-table" style={{ minWidth: 800 }}>
              <thead>
                <tr>
                  <th style={{ width: 150 }}>SKU ID</th>
                  {allChannels.map(channelId => (
                    <th 
                      key={channelId} 
                      onClick={() => toggleSort(channelId)}
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      {channelId} {sortByChannel === channelId ? (sortDesc ? '↓' : '↑') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {processedRows.map(row => (
                  <tr key={row.skuId}>
                    <td>{row.skuId}</td>
                    {allChannels.map(channelId => {
                      const cell = row.cells.find(c => c.channelId === channelId);
                      if (!cell) return <td key={channelId} className="heatmap-cell" style={{ background: 'var(--background)' }}>-</td>;
                      
                      // Show drivers/risks summary in cell tooltip or small text (C2)
                      const detail = matchDetails[row.skuId]?.[channelId];
                      const topDriver = detail?.positiveDrivers[0]?.tagId || '';
                      const riskCount = detail?.risks.length || 0;

                      return (
                        <td 
                          key={`${row.skuId}-${cell.channelId}`} 
                          className="heatmap-cell"
                          style={{ 
                            backgroundColor: getCellColor(cell.recommendation, cell.matchScore), 
                            color: cell.recommendation === 'avoid' ? 'var(--background)' : 'var(--foreground)',
                            position: 'relative'
                          }}
                          onClick={() => handleCellClick(row.skuId, cell.channelId)}
                        >
                          <div style={{ fontWeight: 600, fontSize: 16 }}>{(cell.matchScore * 100).toFixed(0)}</div>
                          {detail && (
                            <div style={{ fontSize: 11, opacity: 0.8, marginTop: 4, lineHeight: 1.2 }}>
                              {topDriver && <div title="Top Driver">{topDriver}</div>}
                              {riskCount > 0 && <div title="Risks" style={{ color: cell.recommendation === 'avoid' ? '#fff' : 'var(--destructive)', marginTop: 2 }}>⚠️ {riskCount} 风险</div>}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* C1: 渠道推荐详情页增强 */}
      {drawerVisible && selectedMatch && (() => {
        const channelInfo = channels.find(c => c.channelId === selectedMatch.channelId);
        
        return (
          <div className="drawer-mask" onClick={() => setDrawerVisible(false)}>
            <div className="drawer-content" onClick={e => e.stopPropagation()}>
              <div className="drawer-header">
                <h3>渠道推荐详情</h3>
                <button className="close-btn" onClick={() => setDrawerVisible(false)}>×</button>
              </div>
              <div className="drawer-body">
                
                {/* Channel Profile 摘要 */}
                <div style={{ marginBottom: 24, padding: 16, background: 'var(--panel)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <h4 style={{ margin: '0 0 12px 0' }}>渠道画像摘要</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, color: 'var(--muted-foreground)' }}>
                    <div><strong>渠道名称：</strong> {channelInfo?.channelName || selectedMatch.channelId}</div>
                    <div><strong>渠道类型：</strong> {channelInfo?.channelType || selectedMatch.channelType}</div>
                    <div><strong>平台类型：</strong> {channelInfo?.platformType || '未知'}</div>
                    <div><strong>样本量：</strong> {channelInfo?.sampleSize || '未提供'}</div>
                    <div><strong>时间窗口：</strong> {channelInfo?.timeWindow || '未提供'}</div>
                    {channelInfo?.qualityFlags && channelInfo.qualityFlags.length > 0 && (
                      <div style={{ gridColumn: 'span 2' }}><strong>质量标识：</strong> {channelInfo.qualityFlags.join(', ')}</div>
                    )}
                  </div>
                </div>

                <div style={{ marginBottom: 32, textAlign: 'center', background: 'var(--background)', padding: 24, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 40, fontWeight: 'bold', color: getRecLabel(selectedMatch.recommendation).color, lineHeight: 1 }}>
                    {(selectedMatch.matchScore * 100).toFixed(0)} <span style={{ fontSize: 16, fontWeight: 'normal' }}>分</span>
                  </div>
                  <div style={{ color: 'var(--muted-foreground)', marginTop: 8, fontSize: 14 }}>
                    匹配置信度 {(selectedMatch.matchConfidence * 100).toFixed(1)}%
                  </div>
                  <div style={{ marginTop: 16, padding: '6px 16px', background: getRecLabel(selectedMatch.recommendation).color, color: 'var(--background)', borderRadius: 9999, display: 'inline-block', fontWeight: '500', fontSize: 14 }}>
                    {getRecLabel(selectedMatch.recommendation).label}
                  </div>
                </div>

                {selectedMatch.risks.length > 0 && (
                  <div className="alert alert-warning" style={{ marginBottom: 24 }}>
                    ⚠️ <strong>风险提示</strong>
                    <ul style={{ paddingLeft: 20, margin: '8px 0 0 0', color: 'var(--warning)' }}>
                      {selectedMatch.risks.map(r => <li key={r}>{r}</li>)}
                    </ul>
                  </div>
                )}

                <div style={{ marginBottom: 32 }}>
                  <h4 style={{ color: 'var(--success)', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>正向驱动因素 (Positive Drivers)</h4>
                  {selectedMatch.positiveDrivers.length === 0 ? <p style={{color:'var(--muted-foreground)'}}>暂无</p> : (
                    <ul style={{ paddingLeft: 20, color: 'var(--muted-foreground)', marginTop: 12 }}>
                      {selectedMatch.positiveDrivers.map(d => (
                        <li key={d.tagId} style={{ marginBottom: 8 }}>
                          <strong style={{ color: 'var(--foreground)' }}>{d.tagId}</strong> 
                          <span style={{ marginLeft: 8 }}>(匹配度: {(Math.min(d.productScore, d.channelScore)*100).toFixed(0)}%)</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div style={{ marginBottom: 32 }}>
                  <h4 style={{ color: 'var(--destructive)', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>负向拦截因素 (Negative Drivers)</h4>
                  {selectedMatch.negativeDrivers.length === 0 ? <p style={{color:'var(--muted-foreground)'}}>暂无</p> : (
                    <ul style={{ paddingLeft: 20, color: 'var(--muted-foreground)', marginTop: 12 }}>
                      {selectedMatch.negativeDrivers.map(d => (
                        <li key={d.tagId} style={{ marginBottom: 8 }}>
                          <strong style={{ color: 'var(--foreground)' }}>{d.tagId}</strong> 
                          <span style={{ marginLeft: 8 }}>(商品/渠道分歧)</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                
                {selectedMatch.qualityFlags && selectedMatch.qualityFlags.length > 0 && (
                  <div style={{ marginBottom: 32 }}>
                    <h4 style={{ color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>匹配质量声明</h4>
                    <ul style={{ paddingLeft: 20, color: 'var(--muted-foreground)', marginTop: 12, fontSize: 13 }}>
                      {selectedMatch.qualityFlags.map(q => (
                        <li key={q} style={{ marginBottom: 4 }}>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

