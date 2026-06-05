
/***************************************************
  자바스크립트 시작
  - 수업 관리, 조건 토글, 시간표 생성 및 렌더링 등
***************************************************/

let courses = [], boolFlags = { avoidFirstPeriod: false, avoidLastPeriod: false, lunchBreak: false, noConsecutive4: false };
let offDays = [], results = [], activeTab = 0;
let toastTimeout;
const DAYS = ['월', '화', '수', '목', '금'];
const COLORS = [
    ['#4cb8c4', '#fff'], ['#5aab7e', '#fff'], ['#e08a5a', '#fff'], ['#9b72c8', '#fff'], ['#d45b7a', '#fff'],
    ['#3a9bb5', '#fff'], ['#6dbd8e', '#fff'], ['#c87941', '#fff'], ['#7b5ec4', '#fff'], ['#2e8c9e', '#fff'],
    ['#45a86e', '#fff'], ['#b85e8a', '#fff'],
];
let colorIdx = 0;

/***************************************************
  수업 관리 함수
  - addCourse        : 수업 추가 및 시간 충돌 검사
  - removeCourse     : 수업 개별 삭제
  - clearCourses     : 수업 전체 삭제
  조건 토글 함수
  - toggleChip : 공강 요일 칩 활성화 여부
  - toggleBool : 수업 조건 칩 활성화 여부
***************************************************/

// addCourse: 수업 추가 및 시간 충돌 검사
function addCourse() {
    const name = document.getElementById('courseName').value.trim();
    if (!name) { showToast('⚠️ 과목명을 입력해주세요!'); return; }
    const day = document.getElementById('courseDay').value;
    const start = parseInt(document.getElementById('courseStart').value);
    const dur = parseInt(document.getElementById('courseDuration').value);
    const isMust = document.getElementById('mustInclude').checked;
    if (isMust) {
        const conflict = courses.find(c => c.day === day && !(start + dur <= c.start || start >= c.start + c.duration));
        if (conflict) {
            showToast(`⚠️ 필수 수업은 다른 수업("${conflict.name}")과 시간이 겹칠 수 없습니다!`);
            return;
        }
    } else {
        const mustConflict = courses.find(c => c.must && c.day === day && !(start + dur <= c.start || start >= c.start + c.duration));
        if (mustConflict) {
            showToast(`⚠️ 필수 수업("${mustConflict.name}")이 있는 시간대에는 후보를 추가할 수 없습니다.`);
            return;
        }
    }
    const color = COLORS[colorIdx % COLORS.length]; colorIdx++;
    courses.push({
        id: Date.now(),
        name,
        credit: parseInt(document.getElementById('courseCredit').value),
        type: document.getElementById('courseType').value,
        professor: document.getElementById('courseProfessor').value || '-',
        day,
        start,
        duration: dur,
        must: isMust,
        color
    });
    document.getElementById('courseName').value = '';
    document.getElementById('courseProfessor').value = '';
    document.getElementById('mustInclude').checked = false;
    renderCourseList();
    showToast(`✅ "${name}" 추가됨`);
}

// removeCourse: 수업 개별 삭제
function removeCourse(id) { courses = courses.filter(c => c.id !== id); renderCourseList(); }
// clearCourses: 수업 전체 삭제
function clearCourses() { if (!courses.length) return; courses = []; colorIdx = 0; renderCourseList(); showToast('전체 삭제됨'); }

// toggleChip: 공강 요일 칩 활성화 여부
function toggleChip(el) { el.classList.toggle('active'); offDays = [...document.querySelectorAll('#offDayChips .chip.active')].map(c => c.dataset.val); }
// toggleBool: 수업 조건 칩 활성화 여부
function toggleBool(el) { el.classList.toggle('active'); boolFlags[el.dataset.key] = el.classList.contains('active'); }

/***************************************************
  유틸 함수
  - getMaxConsec : 특정 요일의 최대 연강 수 계산
  - hasNoLunch   : 특정 요일의 점심 미보장 여부 계산
  - calcScore    : 시간표 적합도 점수 계산
***************************************************/

// getMaxConsec: 특정 요일의 최대 연강 수 계산
function getMaxConsec(courseList, day) {
    const slots = [];
    courseList
        .filter(c => c.day === day)
        .forEach(c => {
            for (let i = c.start; i < c.start + c.duration; i++) slots.push(i);
        });
    slots.sort((a, b) => a - b);
    let consec = 0, max = 0, prev = -1;
    slots.forEach(s => {
        consec = (s === prev + 1) ? consec + 1 : 1;
        max = Math.max(max, consec);
        prev = s;
    });
    return max;
}

// hasNoLunch: 특정 요일의 점심 미보장 여부 계산
function hasNoLunch(courseList, day) {
    const slots = new Set();
    courseList
        .filter(c => c.day === day)
        .forEach(c => {
            for (let i = c.start; i < c.start + c.duration; i++) slots.add(i);
        });
    return slots.has(3) && slots.has(4) && slots.has(5); // true/false 반환
}

// calcScore: 시간표 적합도 점수 계산
function calcScore(tt) {
    let score = 100;
    const w = {
        early: +document.getElementById('w_early').value,
        late: +document.getElementById('w_late').value,
        consec: +document.getElementById('w_consecutive').value,
        lunch: +document.getElementById('w_lunch').value
    };
    const activeDays = new Set(tt.map(c => c.day));
    const firstPeriodCount = tt.filter(c => c.start === 1).length;
    score -= firstPeriodCount * 2 * w.early;
    const latePeriodCount = tt.filter(c => c.start + c.duration - 1 >= 9).length;
    score -= latePeriodCount * 2 * w.late;
    DAYS.forEach(day => {
        const maxConsec = getMaxConsec(tt, day);
        if (maxConsec > 2) score -= (maxConsec - 2) * 1 * w.consec;
        if (hasNoLunch(tt, day)) score -= 2 * w.lunch;
    });
    return Math.round(score);
}

/*****************************************************
  시간표 생성 함수
  - generate        : 조건 검증 및 시간표 조합 생성
  - getCombinations : 선택 수업의 모든 조합 반환
  - overlap         : 두 수업의 시간 겹침 여부 반환
  - hasOverlap      : 수업 목록 내 시간 겹침 여부 반환
******************************************************/

// getCombinations: 선택 수업의 모든 조합 반환
function getCombinations(arr) {
    const result = [[]];
    const st = [[[], 0]];
    while (st.length) { const [cur, idx] = st.pop(); for (let i = idx; i < arr.length; i++) { const next = [...cur, arr[i]]; result.push(next); st.push([next, i + 1]); } }
    return result;
}

// overlap: 두 수업의 시간 겹침 여부 반환
function overlap(a, b) { return a.day === b.day && !(a.start + a.duration <= b.start || a.start >= b.start + b.duration); }
// hasOverlap: 수업 목록 내 시간 겹침 여부 반환
function hasOverlap(list) { for (let i = 0; i < list.length; i++)for (let j = i + 1; j < list.length; j++)if (overlap(list[i], list[j])) return true; return false; }

// generate: 조건 검증 및 시간표 조합 생성
function generate() {
    results = [];
    activeTab = 0;
    if (courses.length < 2) { showToast('수업을 2개 이상 추가해주세요!'); return; }
    const minInput = parseInt(document.getElementById('minCredits').value);
    const maxInput = parseInt(document.getElementById('maxCredits').value);
    const minC = isNaN(minInput) ? 0 : minInput;
    const maxC = isNaN(maxInput) ? 30 : maxInput;
    if (minC > maxC) {
        showToast('⚠️ 최소 학점과 최대 학점이 충돌합니다!');
        return;
    }
    if (minC < 0) {
        showToast('⚠️ 최소 학점에 음수를 입력할 수 없습니다.');
        return;
    }
    if (maxC > 30) {
        showToast('⚠️ 최대 학점은 30학점으로 제한됩니다.');
        return;
    }
    const mustCourses = courses.filter(c => c.must), optCourses = courses.filter(c => !c.must);
    for (let i = 0; i < mustCourses.length; i++)for (let j = i + 1; j < mustCourses.length; j++)
        if (overlap(mustCourses[i], mustCourses[j])) { showToast('⚠️ 필수 수업끼리 시간이 겹칩니다!'); return; }
    const combos = getCombinations(optCourses), valid = [];
    for (const combo of combos) {
        const all = [...mustCourses, ...combo];
        const tc = all.reduce((s, c) => s + c.credit, 0);
        if (tc === 0 || tc < minC || tc > maxC) continue;
        if (hasOverlap(all)) continue;
        if (offDays.length > 0) {
            if (all.some(c => offDays.includes(c.day))) continue;
        }
        if (boolFlags.avoidFirstPeriod) {
            if (all.some(c => c.start === 1)) continue;
        }
        if (boolFlags.avoidLastPeriod) {
            if (all.some(c => (c.start + c.duration - 1) >= 9)) continue;
        }
        if (boolFlags.noConsecutive4) {
            if (DAYS.some(day => getMaxConsec(all, day) > 3)) continue;
        }
        if (boolFlags.lunchBreak) {
            if (DAYS.some(day => hasNoLunch(all, day))) continue;
        }
        valid.push(all);
    }
    if (!valid.length) {
        let reason = "조건을 만족하는 시간표가 없습니다.";
        const totalPossibleCredits = courses.reduce((s, c) => s + c.credit, 0);
        if (totalPossibleCredits < minC) {
            reason = `⚠️ 등록된 학점의 합(${totalPossibleCredits}학점)이 최소 학점(${minC}학점)보다 적습니다. 수업을 더 추가하세요.`;
        }
        else if (boolFlags.avoidFirstPeriod && mustCourses.some(c => c.start === 1)) {
            reason = "⚠️ 필수 수업에 1교시가 포함되어 '1교시 피하기'를 적용할 수 없습니다.";
        }
        else if (boolFlags.avoidLastPeriod && mustCourses.some(c => (c.start + c.duration - 1) >= 9)) {
            reason = "⚠️ 필수 수업에 9교시 이후 수업이 있어 '9·10교시 피하기'를 적용할 수 없습니다.";
        }
        else if (offDays.length > 0 && mustCourses.some(c => offDays.includes(c.day))) {
            reason = `⚠️ 필수 수업이 선택한 공강 요일(${offDays.join(', ')})에 포함되어 있습니다.`;
        }
        else if (boolFlags.lunchBreak && DAYS.some(day => hasNoLunch(mustCourses, day))) {
            reason = "⚠️ 필수 수업이 점심시간(3~5교시)을 모두 포함하여 '점심 보장'을 적용할 수 없습니다.";
        }
        else {
            const filteredCourses = courses.filter(c => {
                if (boolFlags.avoidFirstPeriod && c.start === 1) return false;
                if (boolFlags.avoidLastPeriod && (c.start + c.duration - 1) >= 9) return false;
                return true;
            });
            const filteredTotalCredits = filteredCourses.reduce((s, c) => s + c.credit, 0);

            if (filteredTotalCredits < minC) {
                reason = `⚠️ 설정한 조건을 만족하는 수업들의 총합(${filteredTotalCredits}학점)이 최소 학점(${minC}학점)보다 적습니다.`;
            }
            else {
                const mustCredits = mustCourses.reduce((s, c) => s + c.credit, 0);
                if (mustCredits > maxC) {
                    reason = `⚠️ 필수 수업의 학점(${mustCredits}학점)이 설정한 최대 학점(${maxC}학점)을 넘었습니다.`;
                } else {
                    reason = "⚠️ 설정한 조건을 만족하는 조합이 없습니다. 조건을 완화해보세요.";
                }
            }
        }
        document.getElementById('resultPanel').innerHTML = `
    <div class="card-title">추천 시간표</div>
    <div class="error-container">
        <div class="error-icon">🔍</div>
        <div class="error-title">시간표를 조합할 수 없습니다</div>
        <p class="error-text">${reason}</p>
    </div>`;
        showToast(reason);
        return;
    }
    const preference = document.querySelector('input[name="preference"]:checked').value;
    const maxPossibleCredits = Math.max(
        ...valid.map(tt => tt.reduce((s, c) => s + c.credit, 0))
    );
    const scored = valid.map(tt => {
        const totalCredits = tt.reduce((s, c) => s + c.credit, 0);
        const activeDays = new Set(tt.map(c => c.day)).size;
        const offDayCount = 5 - activeDays;
        let noLunchCount = 0;
        let maxConsec = 0;
        DAYS.forEach(day => {
            if (hasNoLunch(tt, day)) noLunchCount++;
            maxConsec = Math.max(maxConsec, getMaxConsec(tt, day));
        });
        return {
            courses: tt,
            score: preference === 'credits'
                ? calcScore(tt) - (maxPossibleCredits - totalCredits)
                : calcScore(tt),
            totalCredits: totalCredits,
            offDayCount: offDayCount,
            noLunchCount: noLunchCount,
            maxConsec: maxConsec
        };
    });
    scored.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        if (preference === 'credits') {
            return b.totalCredits - a.totalCredits;
        }
        else {
            const aIsComfort = (a.noLunchCount === 0 && a.maxConsec <= 3);
            const bIsComfort = (b.noLunchCount === 0 && b.maxConsec <= 3);
            if (aIsComfort !== bIsComfort) {
                return bIsComfort ? 1 : -1;
            }
            if (b.totalCredits !== a.totalCredits) return b.totalCredits - a.totalCredits;
            return b.offDayCount - a.offDayCount;
        }
    });
    results = scored.slice(0, 7);
    activeTab = 0;
    renderResults();
    showToast(`⚡ ${results.length}개의 시간표를 생성했습니다!`);
    showMascot();
}

/*****************************************************
  렌더링 함수
  - renderCourseList    : 수업 목록 UI 렌더링
  - renderInputSummary  : 수업 입력 요약 렌더링
  - renderResults       : 결과 탭 목록 렌더링
  - switchTab           : 결과 탭 전환
  - renderTab           : 선택된 탭의 시간표 상세 렌더링
  - buildTimetableHTML  : 시간표 테이블 HTML 생성
  - buildInfoTable      : 수업 정보 목록 HTML 생성
*****************************************************/

// renderCourseList: 수업 목록 UI 렌더링
function renderCourseList() {
    const list = document.getElementById('courseList');
    document.getElementById('courseCount').textContent = courses.length + '개';
    if (!courses.length) { list.innerHTML = `<div class="empty-state" style="padding:16px;"><div class="empty-icon" style="font-size:28px;">📚</div><small>수업을 추가해주세요</small></div>`; renderInputSummary(); return; }
    const recentCourses = [...courses].reverse();
    list.innerHTML = recentCourses.map(c => `
    <div class="course-item">
      <div class="course-dot" style="background:${c.color[0]}"></div>
      <div class="course-info">
        <div class="course-name">${c.name}${c.must ? '<span class="must-badge">필수</span>' : ''}</div>
        <div class="course-meta">${c.day}요일 ${c.start}~${c.start + c.duration - 1}교시 · ${c.credit}학점 · ${c.type}</div>
      </div>
      <button class="course-remove" onclick="removeCourse(${c.id})">×</button>
    </div>`).join('');
    renderInputSummary();
}

// renderInputSummary: 수업 입력 요약 렌더링
function renderInputSummary() {
    const panel = document.getElementById('inputSummary');
    if (!panel) return;
    if (!courses.length) {
        panel.innerHTML = `
          <div class="empty-icon">📋</div>
          <p>수업을 추가하면 여기에 요약이 표시됩니다</p>
          <small>시간표 생성은 상단 네비게이션의 '시간표 생성' 탭에서 진행하세요</small>`;
        return;
    }
    const total = courses.reduce((s, c) => s + c.credit, 0);
    const dayOrder = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5 };
    const sortedCourses = [...courses].sort((a, b) => {
        if (dayOrder[a.day] !== dayOrder[b.day]) {
            return dayOrder[a.day] - dayOrder[b.day];
        }
        return a.start - b.start;
    });
    const groupedCourses = DAYS
        .map(day => ({
            day,
            courses: sortedCourses.filter(c => c.day === day)
        }))
        .filter(group => group.courses.length > 0);
    panel.innerHTML = `
        <div style="width:100%">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">총 ${courses.length}개 수업 · ${total}학점 등록됨</div>
          ${groupedCourses.map(group => `
  <div class="day-folder">
    <div class="day-folder-label">${group.day}요일</div>
    ${group.courses.map(c => `
      <div class="info-row">
        <span style="display:flex;align-items:center;gap:8px;">
          <span style="width:9px;height:9px;border-radius:50%;background:${c.color[0]};display:inline-block;flex-shrink:0;"></span>
          <span style="font-size:13px;font-weight:500;">${c.name}</span>
          ${c.must ? '<span class="must-badge">필수</span>' : ''}
        </span>
        <span class="info-val">${c.day} ${c.start}~${c.start + c.duration - 1}교시 · ${c.credit}학점</span>
      </div>`).join('')}
  </div>`).join('')}

        </div>`;
}

// renderResults: 결과 탭 목록 렌더링
function renderResults() {
    const panel = document.getElementById('resultPanel');
    panel.innerHTML = `
    <div class="card-title">추천 시간표</div>
    <div class="result-tab-group" id="resultTabs">
      ${results.map((r, i) => `
        <button class="result-tab ${i === activeTab ? 'active' : ''}" onclick="switchTab(${i})">
          ${i === 0 ? '🏆 ' : ''}후보 ${i + 1}
        </button>`).join('')}
    </div>
    <div id="tabContent"></div>`;
    if (results.length > 0) {
        renderTab(activeTab);
    }
}

// switchTab: 결과 탭 전환
function switchTab(idx) { activeTab = idx; document.querySelectorAll('.result-tab').forEach((t, i) => t.classList.toggle('active', i === idx)); renderTab(idx); }
// renderTab: 선택된 탭의 시간표 상세 렌더링
function renderTab(idx) {
    const { courses: tt, score } = results[idx];
    const content = document.getElementById('tabContent');
    const totalCred = tt.reduce((s, c) => s + c.credit, 0);
    const activeDays = new Set(tt.map(c => c.day));
    const freeDays = DAYS.filter(d => !activeDays.has(d));
    const maxConsec = Math.max(...DAYS.map(day => getMaxConsec(tt, day)));
    const noLunchDays = [];
    DAYS.filter(d => activeDays.has(d)).forEach(day => {
        if (hasNoLunch(tt, day)) noLunchDays.push(day);
    });
    const lunchOk = noLunchDays.length === 0;
    content.innerHTML = `
    <div class="result-header">
      <span class="total-score">${score}%</span>
      <span class="score-sub-text">추천 적합도</span>
    </div>
    <div class="score-pills">
      <span class="score-pill">총 ${totalCred}학점</span>
      ${freeDays.length ? `<span class="score-pill good">공강: ${freeDays.join('·')}요일</span>` : ''}
      ${lunchOk ? '<span class="score-pill good">점심 보장 (1시간) ✓</span>' : `<span class="score-pill bad">${noLunchDays.join('·')}요일 점심 미보장</span>`}
      ${maxConsec > 3 ? `<span class="score-pill bad">최대 ${maxConsec}연강</span>` : `<span class="score-pill good">최대 ${maxConsec}연강</span>`}
    </div>
    <div class="divider"></div>
    <div class="timetable-wrap">${buildTimetableHTML(tt)}</div>
    <div class="divider"></div>
    ${buildInfoTable(tt)}`;
}

// buildTimetableHTML: 시간표 테이블 HTML 생성
function buildTimetableHTML(tt) {
    const TIMES = ['', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
    const DC = { 월: 'var(--mon)', 화: 'var(--tue)', 수: 'var(--wed)', 목: 'var(--thu)', 금: 'var(--fri)' };
    const cellMap = {}; DAYS.forEach(d => { cellMap[d] = {}; });
    tt.forEach(c => { for (let i = c.start; i < c.start + c.duration; i++)cellMap[c.day][i] = i === c.start ? c : 'span'; });
    let html = `<table class="timetable"><thead><tr><th style="width:58px"></th>${DAYS.map(d => `<th style="color:${DC[d]}">${d}</th>`).join('')}</tr></thead><tbody>`;
    for (let p = 1; p <= 10; p++) {
        html += `<tr><td class="time-col">${TIMES[p]}</td>`;
        DAYS.forEach(d => {
            const cell = cellMap[d][p];
            if (cell === 'span') return;
            if (!cell) { html += `<td></td>`; }
            else {
                const [bg, fg] = cell.color;
                html += `
    <td class="has-class" rowspan="${cell.duration}">
      <div class="course-block" style="background:${bg}; color:${fg};" title="${cell.name}">
        <div class="course-block-name">${cell.name}</div>
        <div class="course-block-info">${cell.professor !== '-' ? cell.professor : ''}</div>
      </div>
    </td>`;
            }
        });
        html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
}

// buildInfoTable: 수업 정보 목록 HTML 생성
function buildInfoTable(tt) {
    return tt.map(c => `
    <div class="info-row">
      <span style="display:flex;align-items:center;gap:8px;">
        <span style="width:9px;height:9px;border-radius:50%;background:${c.color[0]};display:inline-block;flex-shrink:0;"></span>
        <span style="font-size:13px;font-weight:500;">${c.name}</span>
        ${c.must ? '<span class="must-badge">필수</span>' : ''}
        <span style="font-size:11px;color:var(--text-muted);">${c.type}</span>
      </span>
      <span class="info-val">${c.day} ${c.start}~${c.start + c.duration - 1}교시 · ${c.credit}학점</span>
    </div>`).join('');
}

/***************************************************
  UI 유틸 함수
  - showPage       : 내비게이션 탭 전환 (페이지 전환)
  - showToast      : 하단 토스트 메시지 표시
  - showMascot     : 개구리 마스코트 등장 애니메이션
***************************************************/

// showPage: 내비게이션 탭 전환
function showPage(pageId, btn) {
    document.querySelectorAll('.page-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    if (btn) btn.classList.add('active');
    if (pageId === 'page-input') renderInputSummary();
}

// showToast: 하단 토스트 메시지 표시
function showToast(msg) {
    if (typeof settings !== 'undefined' && !settings.toast && !msg.startsWith('⚠️') && !msg.startsWith('❌')) return;
    const t = document.getElementById('toast');
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    t.textContent = msg;
    t.classList.add('show');
    toastTimeout = setTimeout(() => {
        t.classList.remove('show');
        toastTimeout = null;
    }, 4000);
}

// showMascot: 개구리 마스코트 등장 애니메이션
function showMascot() {
    const mascot = document.getElementById('Mascot');
    mascot.classList.remove('hide');
    mascot.classList.add('show');
    setTimeout(() => {
        mascot.classList.remove('show');
        mascot.classList.add('hide');
    }, 2000);
}

/***************************************************
  시스템 설정 및 개인화 함수
  - toggleSettings      : 설정 패널 열기/닫기
  - closeSettingsOnBg   : 설정 패널 외부 클릭 시 닫기
  - applyDark           : 다크 모드 토글
  - setCharacterTheme   : 캐릭터 테마 전환
  - toggleBgEffect      : 배경 그라디언트 효과 토글
  - toggleReduceMotion  : 애니메이션 최소화 설정
  - resetAll            : 전체 데이터 초기화
  - renderInputSummary  : 수업 입력 요약 렌더링
  - setToastEnabled     : 토스트 표시 여부 설정
***************************************************/
const settings = { toast: true };

// toggleSettings: 설정 패널 열기/닫기
function toggleSettings() {
    const overlay = document.getElementById('settingsOverlay');
    const btn = document.getElementById('settingsNavBtn');
    const isOpen = overlay.classList.toggle('open');
    btn.classList.toggle('active', isOpen);
}

// closeSettingsOnBg: 설정 패널 외부 클릭 시 닫기
function closeSettingsOnBg(e) {
    if (e.target === document.getElementById('settingsOverlay')) toggleSettings();
}

// applyDark: 다크 모드 토글
function applyDark(on) {
    document.body.classList.toggle('dark', on);
    document.getElementById('themeLabel').textContent = on ? '🌙' : '☀️';
}

// characterThemes: 캐릭터 테마 전환
const characterThemes = {
    frogwizard: {
        logoImage: 'frogwizard.png',
        mascotImage: 'frogwizard.png',
        colors: {
            bg: '#f5f7f6',
            white: '#ffffff',
            surface2: '#f0f5f4',
            border: '#dde8e5',
            borderSoft: '#eef3f1',
            lake: '#4cb8c4',
            lakeDark: '#369aa6',
            lakeSoft: '#e6f6f8',
            lakeMid: '#b2e0e6',
            sage: '#5aab7e',
            sageDark: '#3d8a60',
            sageSoft: '#e8f5ee',
            sageMid: '#a8d9bc',
            text: '#1e2d2b',
            textSub: '#4d6b65',
            textMuted: '#8aaba4',
            textDim: '#b8cdc9'
        }
    },

    kgu: {
        logoImage: 'kgublue.png',
        mascotImage: 'kgupink.png',
        colors: {
            bg: '#f9fbfd',
            white: '#ffffff',
            surface2: '#eef8ff',
            border: '#d8e4ec',
            borderSoft: '#e3f2fc',
            lake: '#73bdf2',
            lakeDark: '#2f73b8',
            lakeSoft: '#e8f6ff',
            lakeMid: '#b7dcf6',
            sage: '#ffa6ad',
            sageDark: '#e9828c',
            sageSoft: '#fff1f2',
            sageMid: '#ffcbd0',
            text: '#25557d',
            textSub: '#5682a5',
            textMuted: '#8fb2cc',
            textDim: '#bdd4e4'
        }
    }



};

function setCharacterTheme(themeName, btnEl) {
    const theme = characterThemes[themeName];
    if (!theme) return;
    const r = document.documentElement.style;
    r.setProperty('--bg', theme.colors.bg);
    r.setProperty('--white', theme.colors.white);
    r.setProperty('--surface2', theme.colors.surface2);
    r.setProperty('--border', theme.colors.border);
    r.setProperty('--border-soft', theme.colors.borderSoft);
    r.setProperty('--lake', theme.colors.lake);
    r.setProperty('--lake-dark', theme.colors.lakeDark);
    r.setProperty('--lake-soft', theme.colors.lakeSoft);
    r.setProperty('--lake-mid', theme.colors.lakeMid);
    r.setProperty('--sage', theme.colors.sage);
    r.setProperty('--sage-dark', theme.colors.sageDark);
    r.setProperty('--sage-soft', theme.colors.sageSoft);
    r.setProperty('--sage-mid', theme.colors.sageMid);
    r.setProperty('--text', theme.colors.text);
    r.setProperty('--text-sub', theme.colors.textSub);
    r.setProperty('--text-muted', theme.colors.textMuted);
    r.setProperty('--text-dim', theme.colors.textDim);
    document.querySelectorAll('.character-theme-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    btnEl.classList.add('active');
    const logoImg = document.querySelector('.logo img');
    if (logoImg) logoImg.src = theme.logoImage;
    const mascotImg = document.getElementById('Mascot');
    if (mascotImg) mascotImg.src = theme.mascotImage;
}

// toggleBgEffect: 배경 그라디언트 효과 토글
function toggleBgEffect(on) {
    document.body.style.setProperty('--bg-gradient-opacity', on ? '1' : '0');
    const pseudo = document.getElementById('bgStyleOverride');
    if (!pseudo) {
        const s = document.createElement('style');
        s.id = 'bgStyleOverride';
        document.head.appendChild(s);
    }
    document.getElementById('bgStyleOverride').textContent = on ? '' :
        'body::before { opacity: 0 !important; }';
}

// toggleReduceMotion: 애니메이션 최소화 설정
function toggleReduceMotion(on) {
    document.body.classList.toggle('reduce-motion', on);
}

// resetAll: 전체 데이터 초기화
function resetAll() {
    if (!confirm('모든 수업 데이터를 초기화할까요?')) return;
    courses = [];
    colorIdx = 0;
    results = [];
    activeTab = 0;
    renderCourseList();
    document.getElementById('resultPanel').innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✨</div>
          <p>조건을 설정하고 생성 버튼을 눌러주세요</p>
          <small>최대 7개의 시간표 후보를 추천해드립니다</small>
        </div>`;
    toggleSettings();
    if (settings.toast) showToast('🗑️ 모든 데이터가 초기화되었습니다');
}

// setToastEnabled: 토스트 표시 여부 설정
function setToastEnabled(on) {
    settings.toast = on;
}
