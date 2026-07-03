import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { AccountProfile, ProductCompass, AccountMatchResult } from '../types';
import { translateTag } from '../utils/translate';

export default function AccountComparison() {
  const [activeTab, setActiveTab] = useState<'benchmark' | 'comparison'>('benchmark');
  const [accounts, setAccounts] = useState<AccountProfile[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedSkuId, setSelectedSkuId] = useState<string>('');
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [productCompass, setProductCompass] = useState<ProductCompass | null>(null);
  const [matchResult, setMatchResult] = useState<AccountMatchResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const initData = async () => {
      try {
        const [accRes, prodRes] = await Promise.all([
          api.getAccountProfiles(),
          api.getProducts()
        ]);
        setAccounts(accRes.data);
        if (accRes.data.length > 0) {
          setSelectedAccountId(accRes.data[0].accountId);
        }
        if (prodRes.data.length > 0) {
          setSelectedSkuId(prodRes.data[0].skuId);
        } else {
          setSelectedSkuId('mock_sku_101');
        }
      } catch (err) {
        console.error('Failed to init accounts and products', err);
      }
    };
    initData();
  }, []);

  useEffect(() => {
    if (!selectedAccountId || !selectedSkuId) return;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        const accRes = await api.getAccountProfileDetail(selectedAccountId);
        setAccountProfile(accRes.data);

        const compassRes = await api.getProductCompass(selectedSkuId);
        setProductCompass(compassRes.data);

        const matchRes = await api.getAccountMatch(selectedSkuId, selectedAccountId);
        setMatchResult(matchRes.data);
      } catch (err) {
        console.error('Failed to fetch comparison data', err);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [selectedAccountId, selectedSkuId, accounts]);

  const handleExportCsv = () => {
    if (!matchResult) return;
    const header = "skuId,accountId,fitScore,fitConfidence,qualityFlags,generatedAt,advice\n";
    const adviceStr = matchResult.adjustmentAdvice.map(a => `${a.item}: ${a.suggestion}`).join('; ');
    const row = `${matchResult.skuId},${matchResult.accountId},${matchResult.fitScore},${matchResult.fitConfidence},"${matchResult.qualityFlags.join('|')}",${new Date().toISOString()},"${adviceStr}"\n`;
    
    const blob = new Blob([header + row], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `account_comparison_${matchResult.skuId}_${matchResult.accountId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="account-comparison-page" style={{ padding: '0', maxWidth: 1440, margin: '0 auto' }}>
      
      {/* Top Filter Bar */}
      <div style={{ background: 'var(--card)', padding: '16px 32px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>数据概览</h2>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--background)', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: 'var(--muted-foreground)', marginRight: 8 }}>商品:</span>
            <input 
              className="form-control" 
              style={{ width: 140, height: 28, padding: '0 8px', border: 'none', background: 'transparent' }} 
              value={selectedSkuId} 
              onChange={e => setSelectedSkuId(e.target.value)} 
              placeholder="输入商品 ID"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--background)', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: 'var(--muted-foreground)', marginRight: 8 }}>对比账号:</span>
            <select 
              className="form-control" 
              style={{ width: 180, height: 28, padding: '0 8px', border: 'none', background: 'transparent' }} 
              value={selectedAccountId} 
              onChange={e => setSelectedAccountId(e.target.value)}
            >
              {accounts.map(acc => (
                <option key={acc.accountId} value={acc.accountId}>{acc.accountName}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 32px', background: 'var(--card)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 24 }}>
        <button 
          className={`tab-btn ${activeTab === 'benchmark' ? 'active' : ''}`}
          onClick={() => setActiveTab('benchmark')}
          style={{ background: 'none', border: 'none', padding: '16px 8px', cursor: 'pointer', borderBottom: activeTab === 'benchmark' ? '2px solid var(--primary)' : '2px solid transparent', fontWeight: activeTab === 'benchmark' ? 600 : 400, color: activeTab === 'benchmark' ? 'var(--foreground)' : 'var(--muted-foreground)' }}
        >
          数据基准
        </button>
        <button 
          className={`tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparison')}
          style={{ background: 'none', border: 'none', padding: '16px 8px', cursor: 'pointer', borderBottom: activeTab === 'comparison' ? '2px solid var(--primary)' : '2px solid transparent', fontWeight: activeTab === 'comparison' ? 600 : 400, color: activeTab === 'comparison' ? 'var(--foreground)' : 'var(--muted-foreground)' }}
        >
          号货匹配与智能诊断
        </button>
      </div>

      <div style={{ padding: 32 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>加载中...</div>
        ) : activeTab === 'benchmark' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            
            {/* F4: 账号画像基准页 */}
            <div className="card" style={{ padding: 24, margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, margin: 0 }}>账号数据概览 - {accountProfile?.accountName}</h3>
                <span className="tag" style={{ margin: 0 }}>{accountProfile?.accountType}</span>
              </div>
              
              <div className="metric-grid">
                <div className="metric-card">
                  <div className="metric-title">粉丝总数 <span>ⓘ</span></div>
                  <div className="metric-value">{accountProfile?.performanceIndex.followerCount.toLocaleString() || 0}</div>
                  <div className="metric-sub">
                    <span>较前一日</span>
                    <span className="trend-up">▲ 0.02%</span>
                  </div>
                </div>
                
                <div className="metric-card">
                  <div className="metric-title">互动率 <span>ⓘ</span></div>
                  <div className="metric-value">{((accountProfile?.performanceIndex.engagementRate || 0) * 100).toFixed(2)}%</div>
                  <div className="metric-sub">
                    <span>较前一日</span>
                    <span className="trend-down">▼ 1.15%</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-title">转化率 <span>ⓘ</span></div>
                  <div className="metric-value">{((accountProfile?.performanceIndex.conversionRate || 0) * 100).toFixed(2)}%</div>
                  <div className="metric-sub">
                    <span>较前一日</span>
                    <span className="trend-up">▲ 5.28%</span>
                  </div>
                </div>
                
                <div className="metric-card">
                  <div className="metric-title">数据样本量 <span>ⓘ</span></div>
                  <div className="metric-value">{accountProfile?.sampleSize.toLocaleString()}</div>
                  <div className="metric-sub">
                    <span>统计窗口</span>
                    <span>{accountProfile?.timeWindow}</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 24, display: 'flex', gap: 40 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 12 }}>核心画像标签分布</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {accountProfile?.coreTags.map(tag => (
                      <div key={tag.tagId} className="metric-sub" style={{ background: 'var(--panel)', padding: '6px 12px', borderRadius: 4, marginBottom: 8 }}>
                        <span>{translateTag(tag.tagId)}</span>
                        <span style={{ color: 'var(--primary)', fontWeight: 600 }}>{(tag.score * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 12 }}>触点偏好</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {accountProfile?.interactionPreference.map(pref => (
                      <span key={pref} className="tag" style={{ padding: '4px 12px', background: 'var(--background)' }}>{pref}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* F4: 商品人群罗盘页 */}
            <div className="card" style={{ padding: 24, margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, margin: 0 }}>商品罗盘概览 - {productCompass?.skuId}</h3>
                {productCompass?.qualityFlags.length ? (
                  <span className="tag tag-orange" style={{ margin: 0 }}>
                    {productCompass.qualityFlags.join(', ')}
                  </span>
                ) : null}
              </div>

              <div className="metric-grid">
                <div className="metric-card">
                  <div className="metric-title">支付金额 <span>ⓘ</span></div>
                  <div className="metric-value">¥{productCompass?.salesMetrics.salesVolume.toLocaleString() || 0}</div>
                  <div className="metric-sub">
                    <span>较前一日</span>
                    <span className="trend-up">▲ 14.17%</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-title">客单价 <span>ⓘ</span></div>
                  <div className="metric-value">¥{productCompass?.salesMetrics.avgOrderValue.toFixed(2) || '0.00'}</div>
                  <div className="metric-sub">
                    <span>全店客单价</span>
                    <span>¥124.75</span>
                  </div>
                </div>

                <div className="metric-card">
                  <div className="metric-title">商品转化率 <span>ⓘ</span></div>
                  <div className="metric-value">{((productCompass?.salesMetrics.conversionRate || 0) * 100).toFixed(2)}%</div>
                  <div className="metric-sub">
                    <span>较前一日</span>
                    <span className="trend-down">▼ 6.99%</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 24, display: 'flex', gap: 40 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 12 }}>商品核心 DNA</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {productCompass?.dna.map(d => <span key={d} className="tag" style={{ padding: '4px 12px', background: 'var(--background)' }}>{d}</span>)}
                  </div>
                </div>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 12 }}>潜客人群标签分布</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {productCompass?.audienceDistribution.map((tag, i) => (
                      <span key={`${tag.tagId}-${i}`} className="tag" style={{ padding: '4px 12px', background: 'var(--background)' }}>
                        {translateTag(tag.tagId)} <span style={{ color: 'var(--primary)', marginLeft: 4 }}>{(tag.score * 100).toFixed(1)}%</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* F5: 号货匹配诊断 - Data Overview Style */}
            <div className="card" style={{ padding: 24, margin: 0 }}>
              <div className="flex-between" style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, margin: 0 }}>智能诊断指标</h3>
                {matchResult?.qualityFlags.length ? (
                  <span className="tag tag-red" style={{ margin: 0 }}>
                    {matchResult.qualityFlags[0]}
                  </span>
                ) : null}
              </div>

              <div className="metric-grid">
                <div className="metric-card" style={{ background: 'var(--background)' }}>
                  <div className="metric-title">号货匹配综合得分 <span>ⓘ</span></div>
                  <div className="metric-value" style={{ color: 'var(--primary)', fontSize: 32 }}>
                    {((matchResult?.fitScore || 0) * 100).toFixed(0)} <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--muted-foreground)' }}>分</span>
                  </div>
                  <div className="metric-sub">
                    <span>同行占比</span>
                    <span>前 15%</span>
                  </div>
                </div>

                <div className="metric-card" style={{ background: 'var(--background)' }}>
                  <div className="metric-title">算法置信度 <span>ⓘ</span></div>
                  <div className="metric-value" style={{ fontSize: 32 }}>
                    {((matchResult?.fitConfidence || 0) * 100).toFixed(0)}%
                  </div>
                  <div className="metric-sub">
                    <span>数据时效</span>
                    <span>{new Date().toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 24, margin: 0 }}>
              <h3 style={{ fontSize: 16, margin: '0 0 16px 0' }}>核心维度主要特征对比</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>匹配维度</th>
                    <th>账号当前特征</th>
                    <th>商品目标特征</th>
                    <th style={{ width: 100 }}>对齐状态</th>
                  </tr>
                </thead>
                <tbody>
                  {matchResult?.comparison.map(comp => (
                    <tr key={comp.dimension}>
                      <td style={{ fontWeight: 500 }}>{comp.dimension}</td>
                      <td>{comp.accountTop1.label}</td>
                      <td>{comp.skuTop1.label}</td>
                      <td>
                        <span className={`tag ${comp.isAligned ? 'tag-green' : 'tag-red'}`} style={{ margin: 0 }}>
                          {comp.isAligned ? '高度吻合' : '存在偏离'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          <div className="card" style={{ padding: 24, margin: 0 }}>
            <div className="flex-between" style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, margin: 0 }}>优化调整清单与建议</h3>
              <button className="btn btn-primary" style={{ height: 32, padding: '0 12px' }} onClick={handleExportCsv}>导出完整报告</button>
            </div>
            {matchResult?.adjustmentAdvice.length === 0 ? (
              <div style={{ color: 'var(--muted-foreground)', padding: 40, textAlign: 'center', background: 'var(--background)', borderRadius: 8 }}>
                数据模型表明当前匹配度极高，暂无优化建议。
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 200 }}>优化项目</th>
                    <th>行动建议</th>
                    <th style={{ width: 120 }}>紧急度状态</th>
                  </tr>
                </thead>
                <tbody>
                  {matchResult?.adjustmentAdvice.map(adv => (
                    <tr key={adv.id}>
                      <td style={{ fontWeight: 500 }}>{adv.item}</td>
                      <td style={{ color: 'var(--muted-foreground)' }}>{adv.suggestion}</td>
                      <td>
                        <span className="tag" style={{ margin: 0 }}>{adv.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
