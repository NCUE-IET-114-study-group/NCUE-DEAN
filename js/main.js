// js/main.js

// 全域變數
let allCourses = [];
let filteredCourses = [];
let currentSort = { field: null, direction: 'asc' };

document.addEventListener('DOMContentLoaded', function () {
    const initLoading = document.getElementById('init-loading');
    const form = document.getElementById('courseForm');
    const loading = document.getElementById('loading');
    const resultsSection = document.querySelector('.results-section');
    const resultsStats = document.getElementById('results-stats');

    // 表格相關元素
    const filterCrossclass = document.getElementById('filter-crossclass');
    const filterType = document.getElementById('filter-type');
    const toggleEnglishBtn = document.getElementById('toggle-english');
    const toggleColumnsBtn = document.getElementById('toggle-columns');
    const exportCsvBtn = document.getElementById('export-csv');
    const tableBody = document.getElementById('course-table-body');
    const visibleCountSpan = document.getElementById('visible-count');
    const totalCountSpan = document.getElementById('total-count');

    // 需滿足其中之一才允許搜尋的欄位 id
    const monitorIds = [
        'course_code', 'course_name', 'teacher_name',
        'class_dept', 'week_day', 'english_course', 'distance_learning'
    ];

    const submitBtn = document.querySelector('button[type="submit"]');

    /**
     * 檢查是否至少有一項過濾條件被設定
     * @returns {boolean}
     */
    function hasFilterCondition() {
        return monitorIds.some(id =>
            document.getElementById(id).value.trim() !== ''
        );
    }

    // 從 URL 讀取參數，自動填入並執行搜尋（需檢查 hasFilterCondition）
    async function applyParamsToForm() {
        const params = new URLSearchParams(window.location.search);
        let hasAnyParam = false;

        for (const [key, value] of params.entries()) {
            const el = form.elements[key];
            if (el) {
                el.value = value;
                hasAnyParam = true;
            }
        }

        if (!hasAnyParam) return;

        // 先載入班別選項
        const yr = document.getElementById('academic_year').value;
        const sm = document.getElementById('semester').value;
        const br = document.getElementById('cls_branch').value;
        if (yr && sm && br) {
            await loadClassOptions();
            // 班別載入完成後，若有 sel_cls_id 參數也帶入
            const clsParam = params.get('sel_cls_id');
            if (clsParam) {
                document.getElementById('class_dept').value = clsParam;
            }
        }

        // 自動搜尋前，再次檢查安全條件
        if (!hasFilterCondition()) {
            console.warn('自動搜尋被阻擋：未設定任何過濾條件');
            alert('自動帶入參數時，請至少設定「課程代碼、課程名稱、教師姓名」或「修課班別、上課時間、全英語、遠距」其中一項');
            return;
        }

        // 通過檢查後再執行搜尋
        searchCourses();
    }

    // 送出時，把參數寫入 URL 並執行搜尋
    submitBtn.addEventListener('click', function (e) {
        e.preventDefault();

        if (!hasFilterCondition()) {
            alert('請至少輸入「課程代碼、課程名稱、教師姓名」或選擇「修課班別、上課時間、全英語、遠距」其中一項');
            return;
        }

        // 更新網址列參數
        const params = new URLSearchParams(new FormData(form));
        const newUrl = window.location.pathname + '?' + params.toString();
        window.history.replaceState(null, '', newUrl);

        searchCourses();
    });

    // 重置時清除結果並移除 URL 參數
    form.addEventListener('reset', () => {
        clearResults();
        window.history.replaceState(null, '', window.location.pathname);
    });

    // 顯示初始載入遮罩
    initLoading.style.display = 'flex';
    loadSystemOptions()
        .then(() => {
            initLoading.style.display = 'none';
            // 啟動時讀取 URL 參數
            applyParamsToForm();
        })
        .catch(() => {
            initLoading.style.display = 'none';
        });

    // 篩選和排序事件監聽
    filterCrossclass.addEventListener('change', applyFilters);
    filterType.addEventListener('change', applyFilters);

    // 英文顯示切換
    toggleEnglishBtn.addEventListener('click', function () {
        const table = document.getElementById('course-table');
        const isShowingEnglish = table.classList.contains('show-english');

        if (isShowingEnglish) {
            table.classList.remove('show-english');
            toggleEnglishBtn.setAttribute('title', '顯示英文');
        } else {
            table.classList.add('show-english');
            toggleEnglishBtn.setAttribute('title', '隱藏英文');
        }
    });

    // 欄位顯示切換
    toggleColumnsBtn.addEventListener('click', function () {
        const table = document.getElementById('course-table');
        const isShowingAll = table.classList.contains('show-all-columns');

        if (isShowingAll) {
            table.classList.remove('show-all-columns');
            toggleColumnsBtn.innerHTML = '<i class="fas fa-columns me-1"></i>展開全部欄位';
        } else {
            table.classList.add('show-all-columns');
            toggleColumnsBtn.innerHTML = '<i class="fas fa-columns me-1"></i>收合欄位';
        }
    });

    // CSV 匯出功能
    exportCsvBtn.addEventListener('click', function () {
        exportToCSV();
    });

    // 表格排序
    document.getElementById('course-table').addEventListener('click', function (e) {
        const th = e.target.closest('th.sortable');
        if (th) {
            const field = th.getAttribute('data-sort');
            sortTable(field);
        }
    });

    function showErrorScreen() {
        // 隱藏任何載入或結果區塊
        document.getElementById('init-loading').style.display = 'none';
        document.getElementById('loading').style.display = 'none';
        document.querySelector('.results-section').style.display = 'none';
        // 顯示錯誤訊息
        document.getElementById('error-screen').style.display = 'flex';
    }

    async function loadSystemOptions() {
        try {
            console.log('開始載入彰師大教務系統選項...');
            const targetUrl = 'https://webapt.ncue.edu.tw/deanv2/other/ob010';
            const response = await fetch(targetUrl, {
                method: 'GET',
                mode: 'cors'
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const html = await response.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            analyzeAndUpdateOptions(doc);
            console.log('彰師大教務系統選項載入完成！');
        } catch (error) {
            console.error('載入系統選項時發生錯誤:', error);
            showErrorScreen();
        }
    }

    function analyzeAndUpdateOptions(doc) {
        console.log('分析系統選項...');
        const mappings = [
            { id: 'cls_branch', src: '#ddl_cls_branch' },
            { id: 'academic_year', src: '#ddl_yms_year' },
            { id: 'semester', src: '#ddl_yms_smester' },
            { id: 'english_course', src: '#ddl_cls_type' },
            { id: 'distance_learning', src: '#ddl_SCR_IS_DIS_LEARN' },
            { id: 'week_day', src: '#ddl_sct_week' }
        ];
        mappings.forEach(m => {
            const src = doc.querySelector(m.src);
            if (src) {
                updateSelectOptions(m.id, src);
            }
        });
        // 修課班別預設值
        if (doc.querySelector('#ddl_scj_cls_id')) {
            document.getElementById('class_dept').innerHTML =
                '<option value="">請選擇學年度和學期後自動載入</option>';
        }
        console.log('系統選項分析完成');
        // 自動初始載入班別
        setTimeout(() => {
            const yr = document.getElementById('academic_year').value;
            const sm = document.getElementById('semester').value;
            const br = document.getElementById('cls_branch').value;
            if (yr && sm && br) loadClassOptions();
        }, 300);
    }

    function updateSelectOptions(targetId, sourceSelect) {
        const tgt = document.getElementById(targetId);
        tgt.innerHTML = '';
        Array.from(sourceSelect.options).forEach(opt => {
            const o = document.createElement('option');
            o.value = opt.value;
            o.textContent = opt.textContent;
            o.selected = opt.selected;
            tgt.appendChild(o);
        });
        if (['english_course', 'distance_learning', 'week_day'].includes(targetId)) {
            const first = tgt.options[0];
            if (first && first.value === '') first.textContent = '不限';
        }
    }

    async function loadClassOptions() {
        const yr = document.getElementById('academic_year').value;
        const sm = document.getElementById('semester').value;
        const br = document.getElementById('cls_branch').value;
        const sel = document.getElementById('class_dept');
        if (!yr || !sm || !br) {
            sel.innerHTML = '<option value="">請先選擇學年度、學期和日夜間別</option>';
            return;
        }
        sel.innerHTML = '<option value="">載入班別選項中...</option>';
        try {
            console.log(`載入班別: ${yr}學年度 第${sm}學期 ${br}`);
            const url = `https://webapt.ncue.edu.tw/DEANV2/Other/ob010/GetJson_ddl_scj_cls_id?year=${yr}&smester=${sm}&CLS_BRANCH=${br}`;
            const resp = await fetch(url, {
                method: 'GET',
                mode: 'cors'
            });
            if (!resp.ok) throw new Error(resp.status);
            const list = await resp.json();
            const prev = sel.value;
            sel.innerHTML = '<option value="">請選擇班別</option>';
            list.forEach(item => {
                const o = document.createElement('option');
                o.value = item.Value; o.textContent = item.Text;
                sel.appendChild(o);
            });
            if (prev) sel.value = prev;
            console.log(`班別更新，共 ${list.length} 筆`);
        } catch (err) {
            console.error('載入班別失敗', err);
            sel.innerHTML = '<option value="">載入班別失敗，請重新選擇條件</option>';
        }
    }

    document.getElementById('academic_year').addEventListener('change', loadClassOptions);
    document.getElementById('semester').addEventListener('change', loadClassOptions);
    document.getElementById('cls_branch').addEventListener('change', loadClassOptions);

    async function searchCourses() {
        loading.style.display = 'flex';
        resultsSection.style.display = 'none';

        const courses = await searchCoursesFromAPI();

        await new Promise(r => setTimeout(r, 1000));
        loading.style.display = 'none';
        resultsSection.style.display = 'block';

        allCourses = courses;
        updateCourseTypeFilter();
        displayResults(courses);
        updateStatistics(courses);
        resultsStats.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    async function searchCoursesFromAPI() {
        try {
            const fd = new FormData(form);
            const up = new URLSearchParams(fd);
            const r = await fetch(
                'https://webapt.ncue.edu.tw/DEANV2/Other/OB010',
                {
                    method: 'POST',
                    mode: 'cors',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: up
                }
            );
            if (!r.ok) throw new Error(`HTTP ${r.status}`);

            const html = await r.text();
            return parseCoursesFromHTML(html);

        } catch (err) {
            console.error('錯誤', err);
            alert('資料讀取失敗');
            return [];
        }
    }


    function parseCoursesFromHTML(html) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const base = doc.createElement('base');
        base.href = 'https://webapt.ncue.edu.tw';
        doc.head.appendChild(base);

        const tbl = doc.querySelector('#table1');
        if (!tbl) {
            console.warn('表格不存在');
            alert('資料解析失敗');
            return [];
        }

        const arr = [];
        tbl.querySelectorAll('tbody tr').forEach((row, i) => {
            const c = row.querySelectorAll('td');
            if (c.length >= 16) {
                const teacherCell = c[9];
                const teacherLinks = Array.from(
                    teacherCell.querySelectorAll('a')
                ).map(a => {
                    const href = a.getAttribute('href') || '';
                    const m = href.match(/OpenWin\('([^']+)'\)/);
                    const url = m ? m[1] : href;
                    const name = a.textContent.trim();
                    return { name, url };
                });

                const nameCell = c[3];
                const en = nameCell.querySelector('b')?.textContent.trim() || '';
                const nm = nameCell.textContent
                    .trim()
                    .split('\n')[0]
                    .replace(en, '')
                    .trim();
                const syl = c[4].querySelector('a')?.href || null;

                arr.push({
                    id: i + 1,
                    code: c[1].textContent.trim(),
                    class: c[2].textContent.trim(),
                    name: nm,
                    englishName: en,
                    syllabus: syl,
                    type: c[5].textContent.trim(),
                    type2: c[6].textContent.trim(),
                    english: c[7].textContent.trim(),
                    credit: parseInt(c[8].textContent.trim()) || 0,
                    teacherLinks: teacherLinks,
                    building: c[10].textContent.trim(),
                    schedule: c[11].textContent.trim(),
                    maxStudents: parseInt(c[12].textContent.trim()) || 0,
                    registered: parseInt(c[13].textContent.trim()) || 0,
                    selected: parseInt(c[14].textContent.trim()) || 0,
                    crossClass: c[15].textContent.trim(),
                    note: c[16]?.textContent.trim() || ''
                });
            }
        });

        console.log('完成', arr.length, '筆');
        return arr;
    }

    function updateCourseTypeFilter() {
        const types = [...new Set(allCourses.map(course => course.type))].sort();
        filterType.innerHTML = '<option value="">全部性質</option>';
        types.forEach(type => {
            if (type.trim()) {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = type;
                filterType.appendChild(option);
            }
        });
    }

    function applyFilters() {
        const crossClassFilter = filterCrossclass.value;
        const typeFilter = filterType.value;

        filteredCourses = allCourses.filter(course => {
            // 跨班篩選
            if (crossClassFilter && course.crossClass !== crossClassFilter) {
                return false;
            }

            // 課程性質篩選
            if (typeFilter && course.type !== typeFilter) {
                return false;
            }

            return true;
        });

        displayFilteredResults();
        updateVisibleCount();
    }

    function sortTable(field) {
        // 更新排序狀態
        if (currentSort.field === field) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.field = field;
            currentSort.direction = 'asc';
        }

        // 更新表頭樣式
        document.querySelectorAll('th.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });

        const currentTh = document.querySelector(`th[data-sort="${field}"]`);
        currentTh.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');

        // 排序資料
        const coursesToSort = filteredCourses.length > 0 ? filteredCourses : allCourses;
        const sortedCourses = [...coursesToSort].sort((a, b) => {
            let aVal = a[field];
            let bVal = b[field];

            // 特殊處理
            if (field === 'teacher') {
                aVal = a.teacherLinks.map(t => t.name).join(', ');
                bVal = b.teacherLinks.map(t => t.name).join(', ');
            }

            // 數字排序
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return currentSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
            }

            // 字串排序
            const result = String(aVal).localeCompare(String(bVal), 'zh-TW');
            return currentSort.direction === 'asc' ? result : -result;
        });

        if (filteredCourses.length > 0) {
            filteredCourses = sortedCourses;
        } else {
            allCourses = sortedCourses;
        }

        displayFilteredResults();
    }

    function displayResults(courses) {
        filteredCourses = [];
        displayCourses(courses);
        updateVisibleCount();
    }

    function displayFilteredResults() {
        const coursesToDisplay = filteredCourses.length > 0 ? filteredCourses : allCourses;
        displayCourses(coursesToDisplay);
    }

    function displayCourses(courses) {
        const tb = tableBody;
        const mb = document.getElementById('mobile-cards');
        tb.innerHTML = '';
        mb.innerHTML = '';

        if (!courses.length) {
            tb.innerHTML = `<tr><td colspan="17" class="text-center py-4">
                <i class="fas fa-search me-2"></i>找不到符合條件的課程
            </td></tr>`;
            mb.innerHTML = `<div class="course-card text-center">
                <i class="fas fa-search me-2"></i>找不到符合條件的課程
            </div>`;
            return;
        }

        courses.forEach((course, idx) => {
            const cls = getStatusClass(course.registered, course.maxStudents);
            const syl = course.syllabus
                ? `<a href="${course.syllabus}" target="_blank" class="syllabus-link">
                    <i class="fas fa-download me-1"></i>下載
                    </a>`
                : '-';

            const tlinks = (course.teacherLinks && course.teacherLinks.length > 0)
                ? course.teacherLinks.map(link =>
                    `<a href="${link.url}" target="_blank" rel="noopener" class="teacher-link">
                            ${link.name}
                        </a>`
                ).join('<br>')
                : '-';

            tb.innerHTML += `
                <tr>
                    <td class="hideable-column">${course.id}</td>
                    <td><span class="course-code">${course.code}</span></td>
                    <td>${course.class}</td>
                    <td class="course-name">
                        <strong>${course.name}</strong>
                        <em>${course.englishName}</em>
                    </td>
                    <td class="hideable-column">${syl}</td>
                    <td>${course.type}</td>
                    <td class="hideable-column">${course.type2}</td>
                    <td class="hideable-column">${course.english}</td>
                    <td>${course.credit}</td>
                    <td class="teacher-links">${tlinks}</td>
                    <td>${course.building}</td>
                    <td class="schedule-cell">${course.schedule}</td>
                    <td>${course.maxStudents}</td>
                    <td><span class="status-badge ${cls}">${course.registered}</span></td>
                    <td class="hideable-column">${course.selected}</td>
                    <td>${course.crossClass}</td>
                    <td class="hideable-column">${course.note || '-'}</td>
                </tr>`;

            mb.innerHTML += `
                <article class="course-card">
                    <div class="course-header">
                        <h3 class="course-title">${course.name}</h3>
                        <div class="course-code">課程代碼：${course.code}</div>
                    </div>
                    <div class="course-info">
                        <div class="info-row">
                            <div class="info-item">
                                <span class="info-label">開課班別</span>
                                <div class="info-value">${course.class}</div>
                            </div>
                            <div class="info-item">
                                <span class="info-label">學分數</span>
                                <div class="info-value">${course.credit} 學分</div>
                            </div>
                        </div>
                        <div class="info-row">
                            <div class="info-item">
                                <span class="info-label">課程性質</span>
                                <div class="info-value">${course.type}</div>
                            </div>
                            <div class="info-item">
                                <span class="info-label">全英語授課</span>
                                <div class="info-value">${course.english}</div>
                            </div>
                        </div>
                        <div class="info-row">
                            <div class="info-item">
                                <span class="info-label">授課教師</span>
                                <div class="info-value">${tlinks}</div>
                            </div>
                        </div>
                        <div class="info-row">
                            <div class="info-item">
                                <span class="info-label">上課地點</span>
                                <div class="info-value">${course.building} ${course.schedule}</div>
                            </div>
                        </div>
                        <div class="info-row">
                            <div class="info-item">
                                <span class="info-label">人數狀況</span>
                                <div class="info-value">
                                    登記：<span class="status-badge ${cls}">${course.registered}</span> /
                                    上限：${course.maxStudents} /
                                    選上：${course.selected}
                                </div>
                            </div>
                        </div>
                        <div class="info-row">
                            <div class="info-item">
                                <span class="info-label">可跨班系</span>
                                <div class="info-value">${course.crossClass}</div>
                            </div>
                            <div class="info-item">
                                <span class="info-label">教學大綱</span>
                                <div class="info-value">${syl}</div>
                            </div>
                        </div>
                        ${course.note ? `
                        <div class="info-row">
                            <div class="info-item" style="flex:1;">
                                <span class="info-label">備註</span>
                                <div class="info-value">${course.note}</div>
                            </div>
                        </div>` : ''}
                    </div>
                </article>`;
        });
    }

    function updateStatistics(courses) {
        const totalCourses = courses.length;
        const availableCourses = courses.filter(c => c.registered < c.maxStudents).length;
        const crossClassCourses = courses.filter(c => c.crossClass === '可跨班' || c.crossClass === '可跨班系').length;
        const englishCourses = courses.filter(c => c.english === '是').length;

        document.getElementById('total-courses').textContent = totalCourses;
        document.getElementById('available-courses').textContent = availableCourses;
        document.getElementById('cross-class-courses').textContent = crossClassCourses;
        document.getElementById('english-courses').textContent = englishCourses;
    }

    function updateVisibleCount() {
        const visibleCourses = filteredCourses.length > 0 ? filteredCourses.length : allCourses.length;
        visibleCountSpan.textContent = visibleCourses;
        totalCountSpan.textContent = allCourses.length;
    }

    function clearResults() {
        allCourses = [];
        filteredCourses = [];
        tableBody.innerHTML = '';
        document.getElementById('mobile-cards').innerHTML = '';
        resultsStats.style.display = 'none';
        resultsSection.style.display = 'none';

        // 重置篩選器
        filterCrossclass.value = '';
        filterType.value = '';

        // 重置排序
        currentSort = { field: null, direction: 'asc' };
        document.querySelectorAll('th.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });

        // 重置英文顯示和欄位顯示
        const table = document.getElementById('course-table');
        table.classList.remove('show-english', 'show-all-columns');
        toggleEnglishBtn.setAttribute('title', '顯示英文');
        toggleColumnsBtn.innerHTML = '<i class="fas fa-columns me-1"></i>展開全部欄位';
    }

    function exportToCSV() {
        const coursesToExport = filteredCourses.length > 0 ? filteredCourses : allCourses;

        if (!coursesToExport.length) {
            alert('沒有資料可以匯出');
            return;
        }

        // CSV 標題行
        const headers = [
            '序號', '課程代碼', '開課班別', '課程名稱', '英文課程名稱',
            '課程性質', '課程性質2', '全英語授課', '學分', '教師姓名',
            '上課大樓', '上課節次+地點', '上限人數', '登記人數', '選上人數',
            '可跨班', '備註'
        ];

        // 轉換資料
        const csvData = coursesToExport.map(course => [
            course.id,
            course.code,
            course.class,
            course.name,
            course.englishName,
            course.type,
            course.type2,
            course.english,
            course.credit,
            course.teacherLinks.map(t => t.name).join(', '),
            course.building,
            course.schedule,
            course.maxStudents,
            course.registered,
            course.selected,
            course.crossClass,
            course.note
        ]);

        // 組合 CSV 內容
        const csvContent = [headers, ...csvData]
            .map(row => row.map(field => `"${String(field || '').replace(/"/g, '""')}"`).join(','))
            .join('\n');

        // 加上 BOM 以支援中文
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });

        // 下載檔案
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);

        const now = new Date();
        const dateStr = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0') + '_' +
            String(now.getHours()).padStart(2, '0') +
            String(now.getMinutes()).padStart(2, '0');

        link.setAttribute('download', `彰師大課程查詢_${dateStr}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    function getStatusClass(reg, max) {
        const r = max ? (reg / max) : 0;
        if (r === 0) return 'status-available';
        if (r >= 1) return 'status-full';
        if (r >= 0.8) return 'status-limited';
        return 'status-available';
    }

    // 無障礙鍵盤導航
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (confirm('確定要清除搜尋結果嗎？')) {
                form.reset();
                clearResults();
                window.history.replaceState(null, '', window.location.pathname);
            }
        }
    });

    // 表單驗證
    Array.from(form.querySelectorAll('[required]')).forEach(field => {
        field.addEventListener('invalid', e => {
            e.preventDefault();
            field.setAttribute('aria-invalid', 'true');
            let err = document.getElementById(field.id + '_error');
            if (!err) {
                err = document.createElement('div');
                err.id = field.id + '_error';
                err.className = 'text-danger mt-1';
                err.setAttribute('role', 'alert');
                field.parentNode.appendChild(err);
            }
            err.textContent = field.validationMessage;
            field.setAttribute('aria-describedby', field.id + '_error');
        });
        field.addEventListener('input', () => {
            if (field.validity.valid) {
                field.removeAttribute('aria-invalid');
                const err = document.getElementById(field.id + '_error');
                if (err) {
                    err.remove();
                    field.removeAttribute('aria-describedby');
                }
            }
        });
    });
});

// 快捷鍵說明
function showKeyboardHelp() {
    alert(`鍵盤快捷鍵說明：
    • Tab - 在表單欄位間切換
    • Enter - 提交查詢表單
    • Escape - 清除搜尋結果
    • Alt + S - 跳到搜尋表單
    • Alt + R - 跳到搜尋結果

    表格操作：
    • 點擊表頭 - 排序該欄位
    • 使用篩選器 - 快速篩選課程

    無障礙功能：
    • 支援螢幕閱讀器
    • 高對比度顯示
    • 鍵盤完整操作
    • 語意化標籤結構`);
}

document.addEventListener('keydown', e => {
    if (e.altKey) {
        switch (e.key) {
            case 's': case 'S':
                e.preventDefault();
                document.getElementById('courseForm').focus();
                break;
            case 'r': case 'R':
                e.preventDefault();
                document.getElementById('results-heading')?.focus();
                break;
            case 'h': case 'H':
                e.preventDefault();
                showKeyboardHelp();
                break;
        }
    }
});
