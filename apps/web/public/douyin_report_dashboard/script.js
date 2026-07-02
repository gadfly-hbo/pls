/* eslint-disable no-unused-vars */
// Initialize Lucide icons
lucide.createIcons();

// --- Configuration & State ---
const COLUMN_GROUPS = {
    '基础信息': ['季度', '款号', '商品名称', '货品属性', '性别修正', '中类', '小类', '场景', '年龄段', '商品群', '商品定位', '故事线', '全域款', '延续款', '主题', '商品分层'],
    '销售表现': ['2026合计净销量', '2026合计零售额', '实销排名', '实销层级', '商品链接数量'],
    '人群画像': ['预测性别_提取结果(占比)', '预测年龄段_提取结果(占比)', '地域分布_提取结果(占比)', '八大消费群体_提取结果(占比)', '预测消费能力_提取结果(占比)', '预测人生阶段_提取结果(占比)', '预测职业_提取结果(占比)', '城市_提取结果(占比)', '城市等级_提取结果(占比)'],
    '设备信息': ['手机品牌_提取结果(占比)', '手机价格_提取结果(占比)'],
    '活跃度': ['抖音活跃用户_提取结果(占比)', '头条活跃用户_提取结果(占比)', '西瓜活跃用户_提取结果(占比)', '火山活跃用户_提取结果(占比)'],
    '兴趣与行为': ['头条用户阅读兴趣分类_提取结果(占比)', '抖音视频观看兴趣分类_提取结果(占比)', '西瓜视频观看兴趣分类_提取结果(占比)', '抖音视频观看兴趣分类v2_提取结果(占比)', '美妆行业特色人群_提取结果(占比)', '电商品类成交偏好_提取结果(占比)', '电商品牌成交偏好_提取结果(占比)', '电商消费频次_提取结果(占比)', '电商消费金额_提取结果(占比)', '触点互动偏好_提取结果(占比)'],
    '综合分析': ['八大群体_TOP1占比', '八大群体_TOP1-TOP2差距', '八大群体_TOP3合计占比', '号货匹配度']
};

const PRESETS = {
    'all': Object.values(COLUMN_GROUPS).flat(),
    'sales': [...COLUMN_GROUPS['基础信息'].slice(0, 8), ...COLUMN_GROUPS['销售表现'], '号货匹配度'],
    'audience': ['款号', '商品名称', '2026合计净销量', '号货匹配度', ...COLUMN_GROUPS['人群画像'], ...COLUMN_GROUPS['兴趣与行为']]
};

const EXCLUDE_COLUMNS = ['预测性别_取数要求', '预测年龄段_取数要求', '地域分布_取数要求', '八大消费群体_取数要求', '预测消费能力_取数要求', '手机品牌_取数要求', '预测人生阶段_取数要求', '预测职业_取数要求', '手机价格_取数要求', '抖音活跃用户_取数要求', '头条活跃用户_取数要求', '西瓜活跃用户_取数要求', '火山活跃用户_取数要求', '头条用户阅读兴趣分类_取数要求', '抖音视频观看兴趣分类_取数要求', '西瓜视频观看兴趣分类_取数要求', '美妆行业特色人群_取数要求', '电商品类成交偏好_取数要求', '电商品牌成交偏好_取数要求', '电商消费频次_取数要求', '电商消费金额_取数要求', '触点互动偏好_取数要求', '城市_取数要求', '城市等级_取数要求', '抖音视频观看兴趣分类v2_取数要求'];

let allColumns = [];
let visibleColumns = new Set();
let searchQuery = '';
let filterValues = { level: '', category: '', gender: '' };
let sortState = { column: null, dir: 'asc' };
let currentView = 'viewTable';
let isAdvantageMode = false;

// DOM Elements
const elements = {
    searchInput: document.getElementById('searchInput'),
    filterLevel: document.getElementById('filterLevel'),
    filterCategory: document.getElementById('filterCategory'),
    filterGender: document.getElementById('filterGender'),
    
    // Removed KPI references
    
    tableHeadRow: document.getElementById('tableHeadRow'),
    tableBody: document.getElementById('tableBody'),
    noDataMessage: document.getElementById('noDataMessage'),
    tableContainer: document.getElementById('tableContainer'),
    
    columnModal: document.getElementById('columnModal'),
    columnGroupsContainer: document.getElementById('columnGroupsContainer'),
    columnSearchInput: document.getElementById('columnSearchInput'),

    // Navigation & Layout
    navBtns: document.querySelectorAll('.nav-btn'),
    viewTable: document.getElementById('viewTable'),
    viewInsightsS1: document.getElementById('viewInsightsS1'),
    viewCompare: document.getElementById('viewCompare'),
    viewInsightsS3: document.getElementById('viewInsightsS3'),
    sidebarTableTools: document.getElementById('sidebarTableTools'),
    pageTitleText: document.getElementById('pageTitleText'),
    pageSubtitleText: document.getElementById('pageSubtitleText'),
    topBarActions: document.getElementById('topBarActions'),
    insightsContainer: document.getElementById('insightsContainer'),
    accountSelect: document.getElementById('accountSelect')
};

// Data Sources
let actualTableData = [];
let actualAdvantageData = [];
let insightsSheet1 = [];
let insightsSheet2 = [];
let insightsSheet3 = [];
let insightsSheet4 = [];
let multiAccountInsights = null;
let multiAccountInsightsRawHTML = null;
let selectedAccount = null;

// Initialize
function init() {
    if (typeof dashboardData !== 'undefined') {
        actualTableData = dashboardData.tableData || [];
        actualAdvantageData = dashboardData.advantageData || [];
        insightsSheet1 = dashboardData.insightsSheet1 || [];
        insightsSheet2 = dashboardData.insightsSheet2 || [];
        insightsSheet3 = dashboardData.insightsSheet3 || [];
        insightsSheet4 = dashboardData.insightsSheet4 || [];
        multiAccountInsightsRawHTML = dashboardData.multiAccountInsightsRawHTML || null;
    } else if (typeof tableData !== 'undefined') {
        actualTableData = tableData;
    }

    const dataSource = multiAccountInsightsRawHTML;
    if (dataSource) {
        elements.accountSelect.innerHTML = '';
        for (const acct of Object.keys(dataSource)) {
            const opt = document.createElement('option');
            opt.value = acct;
            opt.textContent = acct;
            elements.accountSelect.appendChild(opt);
        }
        selectedAccount = Object.keys(dataSource)[0];
        elements.accountSelect.value = selectedAccount;
        elements.accountSelect.addEventListener('change', (e) => {
            selectedAccount = e.target.value;
            renderInsightsS1();
        });
    }

    if (actualTableData.length === 0) {
        showNoData();
        return;
    }

    // Process columns
    const rawColumns = Object.keys(actualTableData[0]);
    allColumns = rawColumns.filter(c => !EXCLUDE_COLUMNS.includes(c));
    
    applyPreset('all');
    populateFilters();
    renderColumnModal();
    
    // Event Listeners
    setupEventListeners();
    
    // Switch to default view
    switchView('viewTable');
}

function switchView(targetId) {
    currentView = targetId;
    
    // Toggle views
    const allViews = [elements.viewTable, elements.viewInsightsS1, elements.viewCompare, elements.viewInsightsS3];
    allViews.forEach(v => v?.classList.add('hidden'));

    if (targetId === 'viewTable') {
        elements.viewTable.classList.remove('hidden');
        elements.sidebarTableTools.classList.remove('hidden');
        elements.accountSelect.classList.add('hidden');
        document.getElementById('columnToggleBtn').classList.remove('hidden');
        renderTableDashboard(); // Updates title and action visibility automatically
    } else if (targetId === 'viewInsightsS1') {
        elements.viewInsightsS1.classList.remove('hidden');
        elements.sidebarTableTools.classList.add('hidden');
        document.getElementById('columnToggleBtn').classList.add('hidden');
        if (multiAccountInsightsRawHTML) elements.accountSelect.classList.remove('hidden');
        elements.pageTitleText.textContent = '账号画像基准';
        elements.pageSubtitleText.textContent = '基于大盘全局数据的策略洞察';
        
        // Remove semir tag header if exists in this view
        const existingTags = document.getElementById('injectedSemirTags');
        if (existingTags) existingTags.remove();
        
        renderInsightsS1();
    } else if (targetId === 'viewCompare') {
        elements.viewCompare.classList.remove('hidden');
        elements.sidebarTableTools.classList.add('hidden');
        document.getElementById('columnToggleBtn').classList.add('hidden');
        elements.accountSelect.classList.add('hidden');
        elements.pageTitleText.textContent = '款vs账号TOP1对比';
        elements.pageSubtitleText.textContent = '账号标签偏离度分析与优化方向';
        
        // Inject the core tags into S2 view
        const existingTags = document.getElementById('injectedSemirTags');
        if (existingTags) existingTags.remove();
        if (dashboardData.semirCoreTagsHtml) {
            const tagWrapper = document.createElement('div');
            tagWrapper.id = 'injectedSemirTags';
            tagWrapper.innerHTML = dashboardData.semirCoreTagsHtml;
            elements.viewCompare.insertBefore(tagWrapper, elements.viewCompare.firstChild);
            // Re-run icons for newly injected tags
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        renderCompareTable();
    } else if (targetId === 'viewInsightsS3') {
        elements.viewInsightsS3.classList.remove('hidden');
        elements.sidebarTableTools.classList.add('hidden');
        document.getElementById('columnToggleBtn').classList.add('hidden');
        elements.accountSelect.classList.add('hidden');
        elements.pageTitleText.textContent = '优化调整清单';
        elements.pageSubtitleText.textContent = '具体款型的核心标签调整建议';
        renderSummaryKPIs();
        renderSuggestionsTable();
    }
}

function applyPreset(presetName) {
    visibleColumns.clear();
    
    if (presetName === 'advantage') {
        isAdvantageMode = true;
        presetName = 'audience'; // use audience cols
    } else {
        isAdvantageMode = false;
    }

    const cols = PRESETS[presetName] || PRESETS['all'];
    cols.forEach(c => {
        if (allColumns.includes(c)) visibleColumns.add(c);
    });
}

function populateFilters() {
    const levels = new Set();
    const categories = new Set();
    const genders = new Set();

    actualTableData.forEach(row => {
        if (row['实销层级']) levels.add(row['实销层级']);
        if (row['中类']) categories.add(row['中类']);
        if (row['性别修正']) genders.add(row['性别修正']);
    });

    populateSelect(elements.filterLevel, levels);
    populateSelect(elements.filterCategory, categories);
    populateSelect(elements.filterGender, genders);
}

function populateSelect(selectEl, dataSet) {
    Array.from(dataSet).sort().forEach(val => {
        const option = document.createElement('option');
        option.value = val;
        option.textContent = val;
        selectEl.appendChild(option);
    });
}

function setupEventListeners() {
    // Navigation (Unified for all sidebar items)
    document.querySelectorAll('[data-target], [data-preset]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Manage active states visually
            document.querySelectorAll('[data-target], [data-preset]').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');

            // Handle behavior
            if (e.currentTarget.dataset.target) {
                switchView(e.currentTarget.dataset.target);
            } else if (e.currentTarget.dataset.preset) {
                applyPreset(e.currentTarget.dataset.preset);
                switchView('viewTable');
            }
        });
    });

    // Sidebar Searches & Filters
    elements.searchInput.addEventListener('input', (e) => { searchQuery = e.target.value.trim().toLowerCase(); renderTableDashboard(); });
    elements.filterLevel.addEventListener('change', (e) => { filterValues.level = e.target.value; renderTableDashboard(); });
    elements.filterCategory.addEventListener('change', (e) => { filterValues.category = e.target.value; renderTableDashboard(); });
    elements.filterGender.addEventListener('change', (e) => { filterValues.gender = e.target.value; renderTableDashboard(); });

    // Theme Toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    function updateThemeIcon() {
        if (document.documentElement.getAttribute('data-theme') === 'light') {
            themeBtn.innerHTML = '<i data-lucide="moon"></i>';
        } else {
            themeBtn.innerHTML = '<i data-lucide="sun"></i>';
        }
        lucide.createIcons();
    }
    
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
    }
    updateThemeIcon();
    
    themeBtn.addEventListener('click', () => {
        if (document.documentElement.getAttribute('data-theme') === 'light') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
        }
        updateThemeIcon();
    });

    // Modal toggles
    document.getElementById('columnToggleBtn').addEventListener('click', () => {
        elements.columnSearchInput.value = '';
        renderColumnModal();
        elements.columnModal.classList.remove('hidden');
    });

    document.getElementById('closeModalBtn').addEventListener('click', () => { elements.columnModal.classList.add('hidden'); });
    elements.columnModal.addEventListener('click', (e) => { if (e.target === elements.columnModal) elements.columnModal.classList.add('hidden'); });

    // Modal Actions
    document.getElementById('applyColumnsBtn').addEventListener('click', () => {
        visibleColumns.clear();
        document.querySelectorAll('.column-checkbox:checked').forEach(cb => {
            visibleColumns.add(cb.value);
        });
        document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.remove('active'));
        renderTableDashboard();
        elements.columnModal.classList.add('hidden');
    });

    document.getElementById('selectAllBtn').addEventListener('click', () => { document.querySelectorAll('.column-checkbox:not([closest-hidden])').forEach(cb => cb.checked = true); });
    document.getElementById('deselectAllBtn').addEventListener('click', () => { document.querySelectorAll('.column-checkbox:not([closest-hidden])').forEach(cb => cb.checked = false); });

    elements.columnSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.checkbox-item').forEach(item => {
            if (item.textContent.toLowerCase().includes(query)) {
                item.style.display = 'flex'; item.removeAttribute('closest-hidden');
            } else {
                item.style.display = 'none'; item.setAttribute('closest-hidden', 'true');
            }
        });
        document.querySelectorAll('.column-group').forEach(group => {
            const hasVisible = Array.from(group.querySelectorAll('.checkbox-item')).some(item => item.style.display !== 'none');
            group.style.display = hasVisible ? 'block' : 'none';
        });
    });

    // Table Sorting
    elements.tableHeadRow.addEventListener('click', (e) => {
        const th = e.target.closest('th');
        if (!th) return;
        const col = th.dataset.col;
        if (!col) return;

        if (sortState.column === col) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
        else { sortState.column = col; sortState.dir = 'desc'; }
        renderTableDashboard();
    });
}

function renderColumnModal() {
    let html = '';
    const mappedCols = Object.values(COLUMN_GROUPS).flat();
    const unmappedCols = allColumns.filter(c => !mappedCols.includes(c));
    const groupsToRender = { ...COLUMN_GROUPS };
    if (unmappedCols.length > 0) groupsToRender['其他字段'] = unmappedCols;

    for (const [groupName, cols] of Object.entries(groupsToRender)) {
        const validCols = cols.filter(c => allColumns.includes(c));
        if (validCols.length === 0) continue;

        html += `
            <div class="column-group">
                <div class="column-group-header">
                    <span>${groupName}</span>
                    <div class="group-actions">
                        <button onclick="toggleGroup('${groupName}', true)">全选</button>
                        <button onclick="toggleGroup('${groupName}', false)">清空</button>
                    </div>
                </div>
                <div class="column-list" id="group-${groupName}">
        `;
        validCols.forEach(col => {
            const isChecked = visibleColumns.has(col) ? 'checked' : '';
            html += `<label class="checkbox-item"><input type="checkbox" class="column-checkbox" value="${col}" ${isChecked}> ${col.replace('_提取结果(占比)', '')}</label>`;
        });
        html += `</div></div>`;
    }
    elements.columnGroupsContainer.innerHTML = html;
}

window.toggleGroup = function(groupName, state) {
    const group = document.getElementById(`group-${groupName}`);
    if (group) group.querySelectorAll('.column-checkbox:not([closest-hidden])').forEach(cb => cb.checked = state);
}

// ---- TABLE VIEW LOGIC ----
function renderTableDashboard() {
    const isAdvantage = isAdvantageMode;
    const sourceData = isAdvantage ? actualAdvantageData : actualTableData;
    
    // Inject core tags above table if in broad table views
    const existingTags = document.getElementById('injectedSemirTags');
    if (existingTags) existingTags.remove();
    if (dashboardData.semirCoreTagsHtml) {
        const tagWrapper = document.createElement('div');
        tagWrapper.id = 'injectedSemirTags';
        tagWrapper.innerHTML = dashboardData.semirCoreTagsHtml;
        elements.tableContainer.parentNode.insertBefore(tagWrapper, elements.tableContainer);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    
    if (currentView === 'viewTable') {
        elements.topBarActions.classList.remove('hidden');
        if (isAdvantage) {
            elements.pageTitleText.textContent = '商品优势标签';
        } else {
            elements.pageTitleText.textContent = '商品人群数据宽表';
        }
    }
    
    let filteredData = sourceData.filter(row => {
        if (searchQuery) {
            const kuhao = String(row['款号'] || '').toLowerCase();
            const name = String(row['商品名称'] || '').toLowerCase();
            if (!kuhao.includes(searchQuery) && !name.includes(searchQuery)) return false;
        }
        if (filterValues.level && row['实销层级'] !== filterValues.level) return false;
        if (filterValues.category && row['中类'] !== filterValues.category) return false;
        if (filterValues.gender && row['性别修正'] !== filterValues.gender) return false;
        return true;
    });

    if (sortState.column) {
        filteredData.sort((a, b) => {
            const actualCol = isAdvantage ? sortState.column.replace('_提取结果(占比)', '') : sortState.column;
            let valA = a[actualCol], valB = b[actualCol];
            if (valA === '' || valA == null) valA = -Infinity;
            if (valB === '' || valB == null) valB = -Infinity;
            if (valA < valB) return sortState.dir === 'asc' ? -1 : 1;
            if (valA > valB) return sortState.dir === 'asc' ? 1 : -1;
            return 0;
        });
    }

    if (isAdvantageMode) {
        elements.pageSubtitleText.textContent = `共 ${filteredData.length} 款商品匹配筛选条件：占比-TOP3与TGI-TOP3重合，且TGI大于100；表明该标签对于公域获客有相对优势`;
    } else {
        elements.pageSubtitleText.textContent = `共 ${filteredData.length} 款商品匹配筛选条件`;
    }

    // KPI updates removed

    if (filteredData.length === 0) { showNoData(); return; }
    hideNoData();

    const colsToRender = allColumns.filter(c => visibleColumns.has(c));
    let headHtml = '';
    colsToRender.forEach(col => {
        const stickyClass = (col === '款号' || col === '商品名称') ? 'sticky-col-1' : '';
        const sortIcon = sortState.column === col ? (sortState.dir === 'asc' ? '<i data-lucide="chevron-up"></i>' : '<i data-lucide="chevron-down"></i>') : '';
        headHtml += `<th class="${stickyClass}" data-col="${col}">${col.replace('_提取结果(占比)', '')} ${sortIcon}</th>`;
    });
    elements.tableHeadRow.innerHTML = headHtml;

    let bodyHtml = '';
    filteredData.forEach(row => {
        bodyHtml += '<tr>';
        colsToRender.forEach(col => {
            const actualCol = isAdvantage ? col.replace('_提取结果(占比)', '') : col;
            let val = row[actualCol];
            const stickyClass = (col === '款号' || col === '商品名称') ? 'sticky-col-1' : '';
            
            if (col === '款号') bodyHtml += `<td class="${stickyClass} cell-kuanhao">${val}</td>`;
            else if (col === '商品名称') {
                bodyHtml += `<td class="${stickyClass} cell-name" title="${val}">${val}</td>`;
            }
            else if (col === '实销层级') bodyHtml += `<td class="${stickyClass}"><span class="badge badge-${String(val).toLowerCase()}">${val || '-'}</span></td>`;
            else if (col === '号货匹配度') {
                const num = Number(val);
                if (!isNaN(num)) {
                    const pct = Math.round(num * 100);
                    bodyHtml += `<td class="${stickyClass}"><div class="data-bar-container"><div class="data-bar-bg"><div class="data-bar-fill" style="width: ${pct}%"></div></div><span class="data-bar-text">${pct}%</span></div></td>`;
                } else bodyHtml += `<td class="${stickyClass}">-</td>`;
            } else if (col.includes('占比') && typeof val === 'number' && !isAdvantage) {
                 bodyHtml += `<td class="${stickyClass}"><div class="data-bar-container"><div class="data-bar-bg"><div class="data-bar-fill" style="width: ${val}%; background: var(--success)"></div></div><span class="data-bar-text">${val}%</span></div></td>`;
            } else if (typeof val === 'number') {
                bodyHtml += `<td class="${stickyClass} cell-numeric">${Number.isInteger(val) ? val : val.toFixed(2)}</td>`;
            } else bodyHtml += `<td class="${stickyClass}">${val || '-'}</td>`;
        });
        bodyHtml += '</tr>';
    });
    
    elements.tableBody.innerHTML = bodyHtml;
    lucide.createIcons();
}

// ---- INSIGHTS VIEW LOGIC ----
function renderInsightsS1() {
    if (multiAccountInsightsRawHTML && selectedAccount && multiAccountInsightsRawHTML[selectedAccount]) {
        elements.insightsContainer.style.display = 'block'; // Override grid for full width html flow
        elements.insightsContainer.innerHTML = `
            <div class="insight-card" style="padding: 2rem; overflow-x: auto; background: var(--bg-card); border-radius: 0.75rem;">
                ${multiAccountInsightsRawHTML[selectedAccount]}
            </div>
        `;
    } else {
        elements.insightsContainer.innerHTML = `<div style="padding: 2rem; color: var(--text-secondary);">暂无数据 (No Data)</div>`;
    }
}

function renderCompareTable() {
    if (insightsSheet2.length === 0) return;
    const headRow = document.getElementById('compareHeadRow');
    const body = document.getElementById('compareBody');
    
    const cols = Object.keys(insightsSheet2[0]);
    let headHtml = '';
    cols.forEach(col => {
        const stickyClass = (col === '款号' || col === '商品名称') ? 'sticky-col-1' : '';
        headHtml += `<th class="${stickyClass}">${col}</th>`;
    });
    headRow.innerHTML = headHtml;

    let bodyHtml = '';
    insightsSheet2.forEach(row => {
        bodyHtml += '<tr>';
        cols.forEach(col => {
            let val = row[col];
            const stickyClass = (col === '款号' || col === '商品名称') ? 'sticky-col-1' : '';
            if (col === '款号') bodyHtml += `<td class="${stickyClass} cell-kuanhao">${val}</td>`;
            else if (col === '商品名称') bodyHtml += `<td class="${stickyClass} cell-name" title="${val}">${val}</td>`;
            else if (String(val).includes('匹配')) {
                 const isMatch = String(val).includes('✓');
                 const color = isMatch ? 'var(--success)' : 'var(--danger)';
                 bodyHtml += `<td class="${stickyClass}"><span style="color:${color};font-weight:600">${val}</span></td>`;
            } else if (typeof val === 'number') {
                bodyHtml += `<td class="${stickyClass} cell-numeric">${Number.isInteger(val) ? val : val.toFixed(2)}</td>`;
            } else bodyHtml += `<td class="${stickyClass}">${val || '-'}</td>`;
        });
        bodyHtml += '</tr>';
    });
    body.innerHTML = bodyHtml;
}

function renderSuggestionsTable() {
    if (insightsSheet3.length === 0) return;
    const headRow = document.getElementById('suggestionsHeadRow');
    const body = document.getElementById('suggestionsBody');
    
    const cols = Object.keys(insightsSheet3[0]);
    let headHtml = '';
    cols.forEach(col => {
        const stickyClass = (col === '款号' || col === '商品名称') ? 'sticky-col-1' : '';
        headHtml += `<th class="${stickyClass}">${col}</th>`;
    });
    headRow.innerHTML = headHtml;

    let bodyHtml = '';
    insightsSheet3.forEach(row => {
        bodyHtml += '<tr>';
        cols.forEach(col => {
            let val = row[col];
            const stickyClass = (col === '款号' || col === '商品名称') ? 'sticky-col-1' : '';
            if (col === '款号') bodyHtml += `<td class="${stickyClass} cell-kuanhao">${val}</td>`;
            else if (col === '商品名称') bodyHtml += `<td class="${stickyClass} cell-name" title="${val}">${val}</td>`;
            else if (col === '优先级') {
                const badge = val === '高优' ? 'badge-s' : 'badge-a';
                bodyHtml += `<td class="${stickyClass}"><span class="badge ${badge}">${val}</span></td>`;
            } else if (typeof val === 'number') {
                bodyHtml += `<td class="${stickyClass} cell-numeric">${Number.isInteger(val) ? val : val.toFixed(2)}</td>`;
            } else bodyHtml += `<td class="${stickyClass}">${val || '-'}</td>`;
        });
        bodyHtml += '</tr>';
    });
    body.innerHTML = bodyHtml;
}

function renderSummaryKPIs() {
    if (insightsSheet4.length === 0) return;
    const container = document.getElementById('summaryKPIs');
    
    // Parse structured data from insightsSheet4
    let sections = [];
    let currentSection = { title: '概览', items: [] };

    insightsSheet4.forEach(row => {
        let key = row['统计指标'] || '';
        let val = row['数值'] || '';
        
        if (!key && !val) return; // skip empty rows
        
        if (key.startsWith('【') && key.endsWith('】')) {
            if (currentSection.items.length > 0 || currentSection.title !== '概览') {
                sections.push(currentSection);
            }
            let title = key.replace(/【|】/g, '');
            currentSection = { title, items: [] };
        } else {
            currentSection.items.push({ key, val: String(val) });
        }
    });
    if (currentSection.items.length > 0) sections.push(currentSection);

    // Filter to only requested sections to save space
    const allowedSections = ['概览', '各维度不匹配款数'];
    sections = sections.filter(sec => allowedSections.includes(sec.title));

    // Render Compact HTML
    let html = `<div style="background: var(--bg-card); padding: 0.75rem 1.25rem; border-radius: 0.5rem; border: 1px solid var(--border-color); font-size: 0.8rem; width: 100%; display: flex; flex-direction: column; gap: 0.5rem; box-shadow: var(--shadow-sm);">`;
    
    sections.forEach(sec => {
        html += `<div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center;">
            <span style="color: var(--text-secondary); min-width: 90px; font-weight: 600;">${sec.title === '概览' ? '📊 核心概览' : '🏷️ 各维度详情'}</span>
            <div style="display: flex; gap: 1.25rem; flex-wrap: wrap; flex: 1;">`;
        
        sec.items.forEach(item => {
            let cleanKey = item.key;
            // Shorten some keys to save space
            if (cleanKey === '有不匹配维度的款数') cleanKey = '不匹配款数';
            if (cleanKey === '总不匹配记录数') cleanKey = '错配记录总数';
            
            html += `<span style="display: inline-flex; gap: 0.35rem; align-items: baseline; white-space: nowrap;">
                <span style="color: var(--text-secondary);">${cleanKey}</span>
                <span style="color: ${sec.title === '概览' ? 'var(--accent-color)' : 'var(--text-primary)'}; font-weight: 600; font-variant-numeric: tabular-nums;">${item.val}</span>
            </span>`;
        });
        
        html += `</div></div>`;
    });
    
    html += `</div>`;
    container.innerHTML = html;
}

function formatNumber(num) { return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function showNoData() { elements.tableContainer.style.display = 'none'; elements.noDataMessage.classList.remove('hidden'); }
function hideNoData() { elements.tableContainer.style.display = 'block'; elements.noDataMessage.classList.add('hidden'); }

// Start
init();

// ---- EXPORT TO CSV LOGIC ----
function exportTableToCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    let csv = [];
    const rows = table.querySelectorAll('tr');
    
    for (let i = 0; i < rows.length; i++) {
        let row = [], cols = rows[i].querySelectorAll('td, th');
        
        for (let j = 0; j < cols.length; j++) {
            // Escape double quotes and remove newlines
            let data = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, ' ').replace(/"/g, '""');
            row.push('"' + data + '"');
        }
        csv.push(row.join(','));
    }
    
    const csvFile = new Blob(["\uFEFF" + csv.join('\n')], {type: "text/csv;charset=utf-8;"});
    const downloadLink = document.createElement("a");
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}

document.getElementById('exportCsvBtn').addEventListener('click', () => {
    const activeNav = document.querySelector('.sidebar-nav .nav-item.active');
    const target = activeNav ? activeNav.dataset.target : 'viewTable';
    
    if (target === 'viewTable') {
        exportTableToCSV('dataTable', '商品人群数据宽表.csv');
    } else if (target === 'viewCompare') {
        exportTableToCSV('compareTable', '款vs账号对比.csv');
    } else if (target === 'viewInsightsS3') {
        exportTableToCSV('suggestionsTable', '优化调整清单.csv');
    } else if (target === 'viewInsightsS1') {
        alert('当前视图为画像大盘，暂不支持整表导出，请查阅相关图表。');
    }
});
