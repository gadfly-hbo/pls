import React, { useState } from 'react';
import { api } from '../services/api';
import type { SKU, ProductProfile } from '../types';

interface Props {
  currentSku: SKU | null;
  setCurrentSku: (s: SKU) => void;
  prediction: ProductProfile | null;
  setPrediction: (p: ProductProfile) => void;
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
      <div className="card">
        <h3>录入新品</h3>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 13, marginTop: 4 }}>请勿上传含个人隐私或高敏经营机密的文件</p>
        <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
          <div className="form-item">
            <label>SKU ID (联调用)</label>
            <input name="skuId" className="form-control" required value={formData.skuId} onChange={handleChange} placeholder="例：mock_sku_101" />
          </div>
          <div className="form-item">
            <label>商品名称 (SPU Title)</label>
            <input name="title" className="form-control" required value={formData.title} onChange={handleChange} placeholder="例：新款法式连衣裙" />
          </div>
          <div className="form-item">
            <label>二级类目 (Category)</label>
            <select name="categoryLv2" className="form-control" value={formData.categoryLv2} onChange={handleChange}>
              <option value="dress">连衣裙 (Dress)</option>
              <option value="tops">上衣 (Tops)</option>
              <option value="bottoms">下装 (Bottoms)</option>
            </select>
          </div>
          <div className="form-item">
            <label>季节 (Season)</label>
            <select name="season" className="form-control" value={formData.season} onChange={handleChange}>
              <option value="spring_summer">春夏 (Spring/Summer)</option>
              <option value="autumn_winter">秋冬 (Autumn/Winter)</option>
            </select>
          </div>
          <div className="form-item">
            <label>设计风格 (Style Keywords，逗号分隔)</label>
            <input name="styleKeywords" className="form-control" required value={formData.styleKeywords} onChange={handleChange} />
          </div>
          <div className="form-item">
            <label>价格带 (Price Band)</label>
            <select name="priceBand" className="form-control" value={formData.priceBand} onChange={handleChange}>
              <option value="low">低端 (Low)</option>
              <option value="mid">中端 (Mid)</option>
              <option value="premium">高端 (Premium)</option>
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
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h2>预测画像结果 ({currentSku?.title})</h2>
              <button className="btn btn-primary" onClick={handleGoToHeatmap}>去匹配渠道</button>
            </div>

            {prediction.qualityFlags.length > 0 && (
              <div className="alert alert-warning">
                ⚠️ 注意：该商品画像置信度受限（{prediction.qualityFlags.join(', ')}）
              </div>
            )}

            <div className="card">
              <h3>Top 3 目标人群包 (Top Segments)</h3>
              <div className="segments-grid">
                {prediction.topSegments.map(seg => (
                  <div key={seg.segmentId} style={{ flex: 1, border: '1px solid var(--border)', background: 'var(--background)', padding: 16, borderRadius: 'var(--radius)' }}>
                    <div style={{ fontWeight: '600', fontSize: 15 }}>Top {seg.rank} - {seg.name}</div>
                    <div style={{ color: 'var(--muted-foreground)', marginTop: 8, fontSize: 13 }}>
                      置信度: {(seg.confidence * 100).toFixed(1)}%
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8 }}>核心驱动因素</div>
                      {seg.drivers.map(d => <span key={d} className="tag">{d}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3>核心标签分布 (Profile Tags)</h3>
              <ul style={{ paddingLeft: 20, margin: 0, color: 'var(--muted-foreground)' }}>
                {prediction.predictedProfileTags.map(tag => (
                  <li key={tag.tagId} style={{ marginBottom: 12 }}>
                    <strong style={{ color: 'var(--foreground)' }}>{tag.tagId}</strong> 
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
