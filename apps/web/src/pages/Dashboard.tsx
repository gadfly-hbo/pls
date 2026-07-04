import React, { useState } from 'react';
import { api } from '../services/api';
import type { SKU, ProductProfile } from '../types';
import { translateTag } from '../utils/translate';

interface Props {
  currentSku: SKU | null;
  setCurrentSku: (s: SKU) => void;
  prediction: ProductProfile | null;
  setPrediction: (p: ProductProfile | null) => void;
  goToHeatmap: () => void;
}

export default function Dashboard({ currentSku, setCurrentSku, prediction, setPrediction, goToHeatmap }: Props) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    skuId: 'mock_sku_101',
    title: '',
    categoryLv1: 'apparel',
    categoryLv2: 'dress',
    season: 'spring_summer',
    styleKeywords: 'minimal, commute',
    priceBand: 'mid'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const keywords = formData.styleKeywords.split(',').map(k => k.trim());
      // 1. Create Product
      const prodRes = await api.createProduct({
        skuId: formData.skuId,
        title: formData.title,
        categoryLv1: formData.categoryLv1,
        categoryLv2: formData.categoryLv2,
        season: formData.season,
        attributes: {
          styleKeywords: keywords,
          priceBand: formData.priceBand
        }
      });
      setCurrentSku(prodRes.data);

      // 2. Create Prediction
      const predRes = await api.createPrediction(prodRes.data.skuId);
      setPrediction(predRes.data);
    } catch (err) {
      console.error(err);
      alert('Error creating prediction');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleGoToHeatmap = async () => {
    if (prediction) {
      await api.createMatches(prediction.predictionId);
    }
    goToHeatmap();
  };

  /** Average confidence across top segments */
  const avgConfidence = prediction && prediction.topSegments.length > 0
    ? prediction.topSegments.reduce((sum, s) => sum + s.confidence, 0) / prediction.topSegments.length
    : 0;

  return (
    <div className="prediction-workbench">
      <div className="page-header">
        <div className="page-header__info">
          <h2 className="page-header__title">新品预测工作台</h2>
          <div style={{ color: 'var(--muted-foreground)', fontSize: 13 }}>
            录入新品基础信息，预测潜客画像并衔接人货匹配
          </div>
        </div>
      </div>

      <div className="prediction-workbench__body predict-workbench">
        {/* Left: Compact Input Form */}
        <div className="predict-form">
        <h3 className="predict-form__title">录入新品</h3>
        <p className="predict-form__desc">提供基础信息，预测商品潜客画像及渠道匹配。</p>
        <form onSubmit={handleSubmit}>
          <div className="form-item">
            <label>商品 ID</label>
            <input name="skuId" className="form-control" required value={formData.skuId} onChange={handleChange} placeholder="例：虚拟商品_101" />
          </div>
          <div className="form-item">
            <label>商品名称</label>
            <input name="title" className="form-control" required value={formData.title} onChange={handleChange} placeholder="例：新款法式连衣裙" />
          </div>
          <div className="form-item">
            <label>二级类目</label>
            <select name="categoryLv2" className="form-control" value={formData.categoryLv2} onChange={handleChange}>
              <option value="dress">连衣裙</option>
              <option value="tops">上衣</option>
              <option value="bottoms">下装</option>
            </select>
          </div>
          <div className="form-item">
            <label>季节</label>
            <select name="season" className="form-control" value={formData.season} onChange={handleChange}>
              <option value="spring_summer">春夏</option>
              <option value="autumn_winter">秋冬</option>
            </select>
          </div>
          <div className="form-item">
            <label>设计风格 (逗号分隔)</label>
            <input name="styleKeywords" className="form-control" required value={formData.styleKeywords} onChange={handleChange} />
          </div>
          <div className="form-item">
            <label>价格带</label>
            <select name="priceBand" className="form-control" value={formData.priceBand} onChange={handleChange}>
              <option value="low">低端</option>
              <option value="mid">中端</option>
              <option value="premium">高端</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? '预测中...' : '开始预测画像'}
          </button>
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
                  预测画像结果 {currentSku && `(${currentSku.title})`}
                </h2>
                <div className="predict-result__header-meta">
                  <span className="status-badge status-badge--neutral">
                    模型: {prediction.modelVersion}
                  </span>
                  <span className="status-badge status-badge--neutral">
                    {new Date(prediction.generatedAt).toLocaleString()}
                  </span>
                  {prediction.topSegments.length > 0 && (
                    <span className="status-badge status-badge--success">
                      Top: {prediction.topSegments[0].name}
                    </span>
                  )}
                  <span className={`status-badge ${avgConfidence >= 0.7 ? 'status-badge--success' : 'status-badge--warning'}`}>
                    平均置信度: {(avgConfidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleGoToHeatmap}>
                进行核心人货匹配
              </button>
            </div>

            {/* Quality Flags Warning */}
            {prediction.qualityFlags.length > 0 && (
              <div className="alert-banner alert-banner--warning">
                ⚠️ 注意：该商品画像置信度受限（{prediction.qualityFlags.join(', ')}）
              </div>
            )}

            {/* Prediction Summary Metrics */}
            <div className="metric-grid">
              <div className="metric-card metric-card--compact">
                <div className="metric-title">Top 人群包数量</div>
                <div className="metric-value">{prediction.topSegments.length}</div>
                <div className="metric-sub">
                  <span>核心标签数</span>
                  <span>{prediction.predictedProfileTags.length}</span>
                </div>
              </div>
              <div className="metric-card metric-card--compact">
                <div className="metric-title">平均置信度</div>
                <div className="metric-value">{(avgConfidence * 100).toFixed(0)}%</div>
                <div className="metric-sub">
                  <span>Top 1 置信度</span>
                  <span>{prediction.topSegments.length > 0 ? `${(prediction.topSegments[0].confidence * 100).toFixed(0)}%` : '-'}</span>
                </div>
              </div>
              <div className="metric-card metric-card--compact">
                <div className="metric-title">质量标记</div>
                <div className="metric-value" style={{ fontSize: 15 }}>
                  {prediction.qualityFlags.length === 0 ? '无异常' : prediction.qualityFlags.join(', ')}
                </div>
                <div className="metric-sub">
                  <span>模型路径</span>
                  <span>{prediction.source}</span>
                </div>
              </div>
            </div>

            {/* Top 3 Segments */}
            <div className="panel">
              <h3 className="panel__title">前三名目标人群包</h3>
              <div className="segment-grid">
                {prediction.topSegments.map(seg => (
                  <div key={seg.segmentId} className="segment-card">
                    <div className="segment-card__header">
                      <span className="segment-card__rank">第 {seg.rank} 名</span>
                      <span className={`status-badge ${seg.confidence >= 0.7 ? 'status-badge--success' : 'status-badge--warning'}`}>
                        置信度: {(seg.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="segment-card__name">{seg.name}</div>
                    <div>
                      <div className="segment-card__drivers-label">核心驱动</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {seg.drivers.map(d => <span key={d} className="tag" style={{ margin: 0 }}>{translateTag(d)}</span>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tag Distribution (Score Bars) */}
            <div className="panel">
              <h3 className="panel__title">核心标签分布</h3>
              <div className="score-bar-list">
                {prediction.predictedProfileTags.map(tag => (
                  <div key={tag.tagId} className="score-bar">
                    <span className="score-bar__label">{translateTag(tag.tagId)}</span>
                    <div className="score-bar__track">
                      <div className="score-bar__fill" style={{ width: `${Math.min(tag.score * 100, 100)}%` }} />
                    </div>
                    <span className="score-bar__value">{(tag.score * 100).toFixed(1)}</span>
                    <span className="score-bar__confidence">±{(tag.confidence * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}
