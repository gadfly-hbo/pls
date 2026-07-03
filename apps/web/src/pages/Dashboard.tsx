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

  return (
    <div className="dashboard-grid">
      <div className="card" style={{ padding: 32 }}>
        <h3 style={{ fontSize: 20, marginBottom: 8 }}>录入新品</h3>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 14, marginBottom: 24 }}>提供基础信息，预测商品潜客画像及渠道匹配。</p>
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

      <div>
        {!prediction ? (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, color: 'var(--muted-foreground)', background: 'var(--background)' }}>
            请先在左侧录入新品信息，系统将生成画像预测结果。
          </div>
        ) : (
          <div>
            <div className="flex-between" style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 style={{ fontSize: 24, margin: '0 0 8px 0' }}>预测画像结果 {currentSku && `(${currentSku.title})`}</h2>
                <div style={{ color: 'var(--muted-foreground)' }}>模型版本: {prediction.modelVersion} | 运行生成时间: {new Date(prediction.generatedAt).toLocaleString()}</div>
              </div>
              <button className="btn btn-primary" onClick={handleGoToHeatmap}>进行核心人货匹配</button>
            </div>

            {prediction.qualityFlags.length > 0 && (
              <div className="alert alert-warning">
                ⚠️ 注意：该商品画像置信度受限（{prediction.qualityFlags.join(', ')}）
              </div>
            )}

            <div className="card" style={{ padding: 32 }}>
              <h3 style={{ fontSize: 18, marginBottom: 16 }}>前三名目标人群包</h3>
              <div className="segments-grid">
                {prediction.topSegments.map(seg => (
                  <div key={seg.segmentId} style={{ 
                    flex: 1, 
                    border: '1px solid var(--border)', 
                    background: 'var(--background)', 
                    padding: 20, 
                    borderRadius: 12,
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'transform 0.2s',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: '700', fontSize: 16 }}>第 {seg.rank} 名</div>
                      <div style={{ color: 'var(--muted-foreground)', fontSize: 12, background: 'var(--secondary)', padding: '2px 8px', borderRadius: 12 }}>
                        置信度: {(seg.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 500, margin: '12px 0' }}>{seg.name}</div>
                    
                    <div>
                      <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>核心驱动</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                        {seg.drivers.map(d => <span key={d} className="tag">{translateTag(d)}</span>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3>核心标签分布</h3>
              <ul style={{ paddingLeft: 20, margin: 0, color: 'var(--muted-foreground)' }}>
                {prediction.predictedProfileTags.map(tag => (
                  <li key={tag.tagId} style={{ marginBottom: 12 }}>
                    <strong style={{ color: 'var(--foreground)' }}>{translateTag(tag.tagId)}</strong> 
                    <span style={{ marginLeft: 8 }}>分数 {(tag.score * 100).toFixed(1)} (置信度: {(tag.confidence * 100).toFixed(1)}%)</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
