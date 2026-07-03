import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { AccountProfile, ProductCompass, AccountMatchResult } from '../types';

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
    <div className="account-comparison-page" style={{ padding: '0 24px', maxWidth: 1200, margin: '0 auto' }}>
      <div className="flex-between" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>账号画像与匹配诊断</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ fontSize: 14 }}>
            SKU ID: 
            <input 
              className="form-control" 
              style={{ marginLeft: 8, width: 140 }} 
              value={selectedSkuId} 
              onChange={e => setSelectedSkuId(e.target.value)} 
            />
          </label>
          <label style={{ fontSize: 14 }}>
            选择账号: 
            <select 
              className="form-control" 
              style={{ marginLeft: 8, width: 200 }} 
              value={selectedAccountId} 
              onChange={e => setSelectedAccountId(e.target.value)}
            >
              {accounts.map(acc => (
                <option key={acc.accountId} value={acc.accountId}>{acc.accountName}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '1px solid var(--border)' }}>
        <button 
          className={`tab-btn ${activeTab === 'benchmark' ? 'active' : ''}`}
          onClick={() => setActiveTab('benchmark')}
          style={{ background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer', borderBottom: activeTab === 'benchmark' ? '2px solid var(--primary)' : '2px solid transparent', fontWeight: activeTab === 'benchmark' ? 600 : 400, color: activeTab === 'benchmark' ? 'var(--foreground)' : 'var(--muted-foreground)' }}
        >
          账号画像与商品罗盘
        </button>
        <button 
          className={`tab-btn ${activeTab === 'comparison' ? 'active' : ''}`}
          onClick={() => setActiveTab('comparison')}
          style={{ background: 'none', border: 'none', padding: '8px 16px', cursor: 'pointer', borderBottom: activeTab === 'comparison' ? '2px solid var(--primary)' : '2px solid transparent', fontWeight: activeTab === 'comparison' ? 600 : 400, color: activeTab === 'comparison' ? 'var(--foreground)' : 'var(--muted-foreground)' }}
        >
          款账号对比与优化建议
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>加载中...</div>
      ) : activeTab === 'benchmark' ? (
        <div style={{ display: 'flex', gap: 24 }}>
          {/* F4: 账号画像基准页 */}
          <div className="card" style={{ flex: 1 }}>
            <h3>账号画像基准 ({accountProfile?.accountName})</h3>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>账号类型</div>
                  <div style={{ fontWeight: 500 }}>{accountProfile?.accountType}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>样本量 / 窗口</div>
                  <div style={{ fontWeight: 500 }}>{accountProfile?.sampleSize.toLocaleString()} / {accountProfile?.timeWindow}</div>
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8 }}>账号核心标签</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {accountProfile?.coreTags.map(tag => (
                    <span key={tag.tagId} className="tag" style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                      {tag.tagId} ({(tag.score * 100).toFixed(1)})
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8 }}>触点偏好</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {accountProfile?.interactionPreference.map(pref => (
                    <span key={pref} className="tag">{pref}</span>
                  ))}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8 }}>表现指数 (Performance Index)</div>
                <div style={{ background: 'var(--background)', padding: 12, borderRadius: 'var(--radius)', fontSize: 13 }}>
                  <div>粉丝数: {accountProfile?.performanceIndex.followerCount.toLocaleString()}</div>
                  <div style={{ marginTop: 4 }}>互动率: {((accountProfile?.performanceIndex.engagementRate || 0) * 100).toFixed(2)}%</div>
                  <div style={{ marginTop: 4 }}>转化率: {((accountProfile?.performanceIndex.conversionRate || 0) * 100).toFixed(2)}%</div>
                </div>
              </div>
            </div>
          </div>

          {/* F4: 商品人群罗盘页 */}
          <div className="card" style={{ flex: 1 }}>
            <h3>商品人群罗盘 ({productCompass?.skuId})</h3>
            <div style={{ marginTop: 16 }}>
              {productCompass?.qualityFlags.length ? (
                <div className="alert alert-warning" style={{ marginBottom: 16 }}>
                  标志: {productCompass.qualityFlags.join(', ')}
                </div>
              ) : null}

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8 }}>商品 DNA</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {productCompass?.dna.map(d => <span key={d} className="tag">{d}</span>)}
                </div>
              </div>

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8 }}>人群标签分布</div>
                <ul style={{ paddingLeft: 20, margin: 0, fontSize: 14 }}>
                  {productCompass?.audienceDistribution.map((tag, i) => (
                    <li key={`${tag.tagId}-${i}`} style={{ marginBottom: 6 }}>
                      {tag.tagId}: {(tag.score * 100).toFixed(1)}%
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginBottom: 8 }}>销售与互动指标</div>
                <div style={{ background: 'var(--background)', padding: 12, borderRadius: 'var(--radius)', fontSize: 13 }}>
                  <div>总销量: {productCompass?.salesMetrics.salesVolume.toLocaleString()}</div>
                  <div style={{ marginTop: 4 }}>客单价: ¥{productCompass?.salesMetrics.avgOrderValue.toFixed(2)}</div>
                  <div style={{ marginTop: 4 }}>转化率: {((productCompass?.salesMetrics.conversionRate || 0) * 100).toFixed(2)}%</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* F5: 款账号对比与优化建议 */}
          <div style={{ display: 'flex', gap: 24 }}>
            <div className="card" style={{ flex: 1 }}>
              <div className="flex-between">
                <h3>号货匹配诊断</h3>
                {matchResult?.qualityFlags.length ? (
                  <span className="tag" style={{ background: 'var(--destructive)', color: 'white' }}>
                    {matchResult.qualityFlags[0]}
                  </span>
                ) : null}
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 24 }}>
                <div style={{ flex: 1, background: 'var(--background)', padding: 16, borderRadius: 'var(--radius)', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>匹配得分 (Fit Score)</div>
                  <div style={{ fontSize: 32, fontWeight: 'bold', color: 'var(--primary)', marginTop: 8 }}>
                    {((matchResult?.fitScore || 0) * 100).toFixed(0)}
                  </div>
                </div>
                <div style={{ flex: 1, background: 'var(--background)', padding: 16, borderRadius: 'var(--radius)', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>置信度 (Confidence)</div>
                  <div style={{ fontSize: 32, fontWeight: 'bold', marginTop: 8 }}>
                    {((matchResult?.fitConfidence || 0) * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ flex: 2 }}>
              <h3>维度 TOP1 对比</h3>
              <div style={{ marginTop: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 4px' }}>维度</th>
                      <th style={{ padding: '8px 4px' }}>账号特征</th>
                      <th style={{ padding: '8px 4px' }}>商品特征</th>
                      <th style={{ padding: '8px 4px' }}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchResult?.comparison.map(comp => (
                      <tr key={comp.dimension} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '8px 4px' }}>{comp.dimension}</td>
                        <td style={{ padding: '8px 4px' }}>{comp.accountTop1.label}</td>
                        <td style={{ padding: '8px 4px' }}>{comp.skuTop1.label}</td>
                        <td style={{ padding: '8px 4px' }}>
                          <span className="tag" style={{ background: comp.isAligned ? 'var(--primary)' : 'var(--destructive)', color: 'white', opacity: comp.isAligned ? 0.9 : 0.8 }}>
                            {comp.isAligned ? '吻合' : '存在偏离'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex-between">
              <h3>优化调整清单</h3>
              <button className="btn btn-secondary" onClick={handleExportCsv}>导出 CSV</button>
            </div>
            <div style={{ marginTop: 16 }}>
              {matchResult?.adjustmentAdvice.length === 0 ? (
                <div style={{ color: 'var(--muted-foreground)', padding: 20, textAlign: 'center' }}>暂无优化建议</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                      <th style={{ padding: '12px 8px' }}>调整项</th>
                      <th style={{ padding: '12px 8px' }}>优化建议 / rationale</th>
                      <th style={{ padding: '12px 8px', width: 100 }}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchResult?.adjustmentAdvice.map(adv => (
                      <tr key={adv.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 8px', fontWeight: 500 }}>{adv.item}</td>
                        <td style={{ padding: '12px 8px', color: 'var(--muted-foreground)' }}>{adv.suggestion}</td>
                        <td style={{ padding: '12px 8px' }}>
                          <span className="tag">{adv.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
