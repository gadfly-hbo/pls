import React, { useState } from 'react';
import { api } from '../services/api';
import type { SingleProductPortraitPrediction } from '../types';
import { translateTag } from '../utils/translate';

interface Props {
  currentSku: string | null;
  setCurrentSku: (s: string) => void;
  prediction: SingleProductPortraitPrediction | null;
  setPrediction: (p: SingleProductPortraitPrediction | null) => void;
  goToHeatmap: () => void;
}

export default function Dashboard({ currentSku, setCurrentSku, prediction, setPrediction, goToHeatmap }: Props) {
  const [loading, setLoading] = useState(false);
  const [showLongTail, setShowLongTail] = useState(false);
  const [formData, setFormData] = useState({
    skuId: 'mock_sku_portrait_001',
    packageId: 'sample'
  });
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runWarnings, setRunWarnings] = useState<string[]>([]);
  const [runErrors, setRunErrors] = useState<string[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setRunStatus('Starting tool run...');
    setRunWarnings([]);
    setRunErrors([]);
    setPrediction(null);
    setCurrentSku(formData.skuId);
    
    try {
      const runRes = await api.runSingleProductPortrait({
        skuId: formData.skuId,
        packageId: formData.packageId
      });
      
      let run = runRes.data;
      setRunStatus(`Run ${run.status}`);
      
      // Poll if running
      while (run.status === 'running' || run.status === 'queued') {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const checkRes = await api.getToolRun(run.runId);
        run = checkRes.data;
        setRunStatus(`Run ${run.status}`);
      }
      
      if (run.warnings?.length) {
        setRunWarnings(run.warnings);
      }
      if (run.errors?.length) {
        setRunErrors(run.errors);
      }
      
      if (run.status === 'succeeded') {
        setRunStatus('Fetching artifact...');
        const artifactRes = await api.getToolArtifact(run.runId, 'prediction.json');
        setPrediction(artifactRes.data);
      }
    } catch (err: any) {
      console.error(err);
      setRunErrors([err.message || 'Error running tool']);
    } finally {
      setLoading(false);
      setRunStatus(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleGoToHeatmap = async () => {
    // skip for now or create matches using something else
    goToHeatmap();
  };

  const coreDimensions = new Set(['预测性别', '预测年龄段', '八大消费群体', '预测消费能力', '城市等级', '抖音视频观看兴趣分类']);

  return (
    <div className="prediction-workbench">
      <div className="page-header">
        <div className="page-header__info">
          <h2 className="page-header__title">新品预测</h2>
          <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
            录入新品基础信息，预测潜客画像并衔接人货匹配
          </div>
        </div>
      </div>

      <div className="prediction-workbench__body predict-workbench">
        {/* Left: Compact Input Form */}
        <div className="predict-form">
        <h3 className="predict-form__title">单品画像预测</h3>
        <p className="predict-form__desc">输入商品 ID 和受控样本包 ID，运行特征提取与先验规则。</p>
        <form onSubmit={handleSubmit}>
          <div className="form-item">
            <label htmlFor="skuId">商品 ID</label>
            <input id="skuId" name="skuId" className="form-control" required value={formData.skuId} onChange={handleChange} placeholder="例：mock_sku_101" />
          </div>
          <div className="form-item">
            <label htmlFor="packageId">受控样本包 ID</label>
            <input id="packageId" name="packageId" className="form-control" required value={formData.packageId} onChange={handleChange} placeholder="例：sample" />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? '运行中...' : '开始预测画像'}
          </button>
          
          {runStatus && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--muted)' }}>{runStatus}</div>}
          
          {runErrors.length > 0 && (
            <div className="alert-banner alert-banner--error" style={{ marginTop: 12 }}>
              ⚠️ 运行失败：
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {runErrors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}
          
          {runWarnings.length > 0 && (
            <div className="alert-banner alert-banner--warning" style={{ marginTop: 12 }}>
              ⚠️ 警告：
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {runWarnings.map((warn, i) => <li key={i}>{warn}</li>)}
              </ul>
            </div>
          )}
        </form>
        </div>

        {/* Right: Prediction Results */}
        <div className="predict-result">
        {!prediction ? (
          <div className="empty-state" style={{ minHeight: 300 }}>
            <div className="empty-state__icon">🔮</div>
            <div className="empty-state__title">请先在左侧录入新品信息</div>
            <div>系统将生成画像预测结果</div>
          </div>
        ) : (
          <>
            {/* Prediction Summary Header */}
            <div className="predict-result__header">
              <div className="predict-result__header-info">
                <h2 className="predict-result__header-title">
                  预测画像结果 {currentSku && `(${currentSku})`}
                </h2>
                <div className="predict-result__header-meta">
                  <span className="status-badge status-badge--neutral">
                    模型: {prediction.modelVersion}
                  </span>
                  <span className="status-badge status-badge--neutral">
                    {new Date(prediction.generatedAt).toLocaleString()}
                  </span>
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleGoToHeatmap}>
                进行核心人货匹配
              </button>
            </div>

            {/* Risk Flags Warning */}
            {prediction.riskFlags && prediction.riskFlags.length > 0 && (
              <div className="alert-banner alert-banner--warning">
                ⚠️ 注意：该结果为基于规则的预测 baseline，非已训练模型。
                包含的风险标记：{prediction.riskFlags.join(', ')}
              </div>
            )}

            {/* Prediction Summary Metrics */}
            <div className="metric-grid">
              <div className="metric-card metric-card--compact">
                <div className="metric-title">PLS Bridge 覆盖率</div>
                <div className="metric-value">
                  {prediction.plsBridge ? `${(prediction.plsBridge.bridgeCoverageRate * 100).toFixed(0)}%` : '-'}
                </div>
                <div className="metric-sub">
                  <span title={prediction.plsBridge?.unmappedPlatformLabels.map(l => l.label).join(', ')}>
                    未映射长尾: {prediction.plsBridge?.unmappedPlatformLabels.length || 0}
                  </span>
                </div>
              </div>
              <div className="metric-card metric-card--compact">
                <div className="metric-title">核心标签映射数</div>
                <div className="metric-value">
                  {prediction.plsBridge?.predictedProfileTags.length || 0}
                </div>
              </div>
            </div>

            {/* Portrait Dimensions */}
            {prediction.dimensionSummaries && prediction.dimensionSummaries.length > 0 ? (
              <div className="panel">
                <h3 className="panel__title">画像维度分布</h3>
                <div className="dimension-list">
                  {prediction.dimensionSummaries.filter(d => coreDimensions.has(d.labelType)).map(dim => (
                    <div key={dim.labelType} className="dimension-item" style={{ marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>{dim.labelType}</div>
                      <div className="score-bar-list">
                        {dim.topLabels.map(tag => (
                          <div key={tag.label} className="score-bar">
                            <span className="score-bar__label">{translateTag(tag.label)}</span>
                            <div className="score-bar__track">
                              <div className="score-bar__fill" style={{ width: `${Math.min((tag.share || 0) * 100, 100)}%` }} />
                            </div>
                            <span className="score-bar__value">{((tag.share || 0) * 100).toFixed(1)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Long Tail Folding */}
                  {prediction.dimensionSummaries.some(d => !coreDimensions.has(d.labelType)) && (
                    <div style={{ marginTop: 16 }}>
                      <button 
                        className="btn" 
                        style={{ background: 'var(--panel2)', border: '1px solid var(--border)', fontSize: 13, padding: '4px 12px' }}
                        onClick={() => setShowLongTail(!showLongTail)}
                      >
                        {showLongTail ? '收起长尾画像' : '展开长尾画像 (地域、品牌偏好等)'}
                      </button>
                      
                      {showLongTail && (
                        <div style={{ marginTop: 16, borderTop: '1px dashed var(--border)', paddingTop: 16 }}>
                          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>注：以下长尾维度为锚点弱先验或平台原始长尾，仅供参考。</div>
                          {prediction.dimensionSummaries.filter(d => !coreDimensions.has(d.labelType)).map(dim => (
                            <div key={dim.labelType} className="dimension-item" style={{ marginBottom: 12 }}>
                              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>{dim.labelType}</div>
                              <div className="score-bar-list">
                                {dim.topLabels.map(tag => (
                                  <div key={tag.label} className="score-bar">
                                    <span className="score-bar__label">{translateTag(tag.label)}</span>
                                    <div className="score-bar__track">
                                      <div className="score-bar__fill" style={{ width: `${Math.min((tag.share || 0) * 100, 100)}%` }} />
                                    </div>
                                    <span className="score-bar__value">{((tag.share || 0) * 100).toFixed(1)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Evidence */}
            {prediction.explanationSources && prediction.explanationSources.length > 0 && (
              <div className="panel">
                <h3 className="panel__title">预测证据 (Evidence)</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="data-table" style={{ fontSize: 13, width: '100%', minWidth: 600, textAlign: 'left', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '8px 4px' }}>来源字段</th>
                        <th style={{ padding: '8px 4px' }}>提取值</th>
                        <th style={{ padding: '8px 4px' }}>映射维度</th>
                        <th style={{ padding: '8px 4px' }}>目标标签</th>
                        <th style={{ padding: '8px 4px' }}>权重</th>
                        <th style={{ padding: '8px 4px' }}>说明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prediction.explanationSources.map((ev, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 4px' }}>{ev.sourceField}</td>
                          <td style={{ padding: '8px 4px' }}>{ev.sourceValue}</td>
                          <td style={{ padding: '8px 4px' }}>{ev.targetLabelType}</td>
                          <td style={{ padding: '8px 4px' }}>{translateTag(ev.targetLabel)}</td>
                          <td style={{ padding: '8px 4px' }}>{ev.weight}</td>
                          <td style={{ padding: '8px 4px', color: 'var(--muted)' }}>{ev.rationale}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
