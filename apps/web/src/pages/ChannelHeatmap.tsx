import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { HeatmapData, MatchResult } from '../types';

export default function ChannelHeatmap() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HeatmapData | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<MatchResult | null>(null);
  const [drawerVisible, setDrawerVisible] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.getHeatmap();
      // Deduplicate cells by channelId for each row
      const deduplicatedRows = res.data.rows.map(row => {
        const seenChannels = new Set<string>();
        const uniqueCells = row.cells.filter(cell => {
          if (seenChannels.has(cell.channelId)) return false;
          seenChannels.add(cell.channelId);
          return true;
        });
        return { ...row, cells: uniqueCells };
      });
      setData({ ...res.data, rows: deduplicatedRows });
    } catch (e: unknown) {
      console.error('Failed to load heatmap', e);
      const errorMessage = e instanceof Error ? e.message : '加载热力图失败，请稍后重试';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCellClick = async (skuId: string, channelId: string) => {
    try {
      const res = await api.getMatchDetailBySkuAndChannel(skuId, channelId);
      setSelectedMatch(res.data);
      setDrawerVisible(true);
    } catch {
      alert('未找到该匹配明细，请确认是否已生成匹配结果');
    }
  };

  const exportCSV = () => {
    if (!data) return;
    const header = "skuId,channelId,matchScore,matchConfidence,recommendation\n";
    const rows = data.rows.flatMap(r => 
      r.cells.map(c => `${r.skuId},${c.channelId},${c.matchScore},${c.matchConfidence},${c.recommendation}`)
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

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted-foreground)' }}>加载热力图中...</div>;
  if (error) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--destructive)' }}>{error}</div>;

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <h2>人货匹配热力图</h2>
        <button className="btn btn-primary" onClick={exportCSV}>导出匹配报告 (CSV)</button>
      </div>

      <div className="card">
        {(!data?.rows || data.rows.length === 0) ? (
           <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted-foreground)' }}>暂无匹配数据，请先录入新品并生成渠道匹配。</div>
        ) : (
          <div className="heatmap-wrapper">
            <table className="heatmap-table">
              <thead>
                <tr>
                  <th>SKU ID</th>
                  {data?.rows[0]?.cells.map(c => <th key={c.channelId}>{c.channelId}</th>)}
                </tr>
              </thead>
              <tbody>
                {data?.rows.map(row => (
                  <tr key={row.skuId}>
                    <td>{row.skuId}</td>
                    {row.cells.map(cell => (
                      <td 
                        key={`${row.skuId}-${cell.channelId}`} 
                        className="heatmap-cell"
                        style={{ backgroundColor: getCellColor(cell.recommendation, cell.matchScore), color: cell.recommendation === 'avoid' ? 'var(--background)' : 'var(--foreground)' }}
                        onClick={() => handleCellClick(row.skuId, cell.channelId)}
                      >
                        {(cell.matchScore * 100).toFixed(0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {drawerVisible && selectedMatch && (
        <div className="drawer-mask" onClick={() => setDrawerVisible(false)}>
          <div className="drawer-content" onClick={e => e.stopPropagation()}>
            <div className="drawer-header">
              <h3>匹配详情</h3>
              <button className="close-btn" onClick={() => setDrawerVisible(false)}>×</button>
            </div>
            <div className="drawer-body">
              <div style={{ marginBottom: 32, textAlign: 'center', background: 'var(--background)', padding: 24, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 40, fontWeight: 'bold', color: getRecLabel(selectedMatch.recommendation).color, lineHeight: 1 }}>
                  {(selectedMatch.matchScore * 100).toFixed(0)} <span style={{ fontSize: 16, fontWeight: 'normal' }}>分</span>
                </div>
                <div style={{ color: 'var(--muted-foreground)', marginTop: 8, fontSize: 14 }}>
                  置信度 {(selectedMatch.matchConfidence * 100).toFixed(1)}%
                </div>
                <div style={{ marginTop: 16, padding: '6px 16px', background: getRecLabel(selectedMatch.recommendation).color, color: 'var(--background)', borderRadius: 9999, display: 'inline-block', fontWeight: '500', fontSize: 14 }}>
                  {getRecLabel(selectedMatch.recommendation).label}
                </div>
              </div>

              {selectedMatch.risks.length > 0 && (
                <div className="alert alert-warning">
                  ⚠️ <strong>风险提示</strong>
                  <ul style={{ paddingLeft: 20, margin: '8px 0 0 0', color: 'var(--warning)' }}>
                    {selectedMatch.risks.map(r => <li key={r}>{r}</li>)}
                  </ul>
                </div>
              )}

              <div style={{ marginBottom: 32 }}>
                <h4 style={{ color: 'var(--success)' }}>正向驱动因素 (Positive Drivers)</h4>
                {selectedMatch.positiveDrivers.length === 0 ? <p style={{color:'var(--muted-foreground)'}}>暂无</p> : (
                  <ul style={{ paddingLeft: 20, color: 'var(--muted-foreground)' }}>
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
                <h4 style={{ color: 'var(--destructive)' }}>负向拦截因素 (Negative Drivers)</h4>
                {selectedMatch.negativeDrivers.length === 0 ? <p style={{color:'var(--muted-foreground)'}}>暂无</p> : (
                  <ul style={{ paddingLeft: 20, color: 'var(--muted-foreground)' }}>
                    {selectedMatch.negativeDrivers.map(d => (
                      <li key={d.tagId} style={{ marginBottom: 8 }}>
                        <strong style={{ color: 'var(--foreground)' }}>{d.tagId}</strong> 
                        <span style={{ marginLeft: 8 }}>(商品/渠道分歧)</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
