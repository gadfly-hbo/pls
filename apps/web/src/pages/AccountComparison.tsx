export default function AccountComparison() {
  return (
    <section className="embedded-bi-page">
      <div className="flex-between embedded-bi-page__header">
        <h2>账号画像与匹配对比</h2>
        <a
          className="btn secondary"
          href="/douyin_report_dashboard/index.html"
          target="_blank"
          rel="noreferrer"
        >
          打开完整 BI
        </a>
      </div>
      <iframe
        className="embedded-bi-page__frame"
        title="抖音商品全景分析"
        src="/douyin_report_dashboard/index.html"
      />
    </section>
  );
}
