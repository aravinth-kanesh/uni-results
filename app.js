class UniResults {
  constructor(weightings) {
    this.weightings = weightings;
    this.gradesTotal = {};
    this.creditsAchieved = {};

    for (const year of Object.keys(weightings)) {
      this.gradesTotal[year] = 0;
      this.creditsAchieved[year] = 0;
    }
  }

  addModule(year, grade, credits) {
    const y = String(year);
    this.gradesTotal[y] = (this.gradesTotal[y] || 0) + grade * credits;
    this.creditsAchieved[y] = (this.creditsAchieved[y] || 0) + credits;
  }

  getRwa() {
    let rwa = 0;
    let totalWeight = 0;
    for (const [year, weight] of Object.entries(this.weightings)) {
      const credits = this.creditsAchieved[year] || 0;
      if (credits > 0) {
        rwa += weight * (this.gradesTotal[year] / credits);
        totalWeight += weight;
      }
    }
    return totalWeight > 0 ? rwa / totalWeight : 0;
  }

  getYearAvg(year) {
    const y = String(year);
    const credits = this.creditsAchieved[y] || 0;
    if (credits === 0) return null;
    return this.gradesTotal[y] / credits;
  }

  getYearCredits(year) {
    return this.creditsAchieved[String(year)] || 0;
  }

  requiredAverageForTarget(target, totalCreditsPerYear) {
    let completedContribution = 0;
    let denominator = 0;

    for (const [year, weight] of Object.entries(this.weightings)) {
      const totalCredits = totalCreditsPerYear[year];
      const completedCredits = this.creditsAchieved[year] || 0;
      const remainingCredits = totalCredits - completedCredits;

      if (completedCredits > 0) {
        const yearAvg = this.gradesTotal[year] / completedCredits;
        completedContribution += weight * (yearAvg * completedCredits / totalCredits);
      }

      if (remainingCredits > 0) {
        denominator += weight * (remainingCredits / totalCredits);
      }
    }

    if (denominator === 0) {
      return this.getRwa() >= target ? 0 : Infinity;
    }

    return (target - completedContribution) / denominator;
  }
}

// State

const DEFAULT_STATE = {
  weightings: { 2: 0.4, 3: 0.6 },
  totalCredits: { 2: 120, 3: 120 },
  modules: {
    2: [
      { grade: 76, credits: 15 },
      { grade: 84, credits: 15 },
      { grade: 88, credits: 15 },
      { grade: 72, credits: 15 },
      { grade: 78, credits: 15 },
      { grade: 70, credits: 15 },
      { grade: 71, credits: 30 },
    ],
    3: [
      { grade: 69, credits: 15 },
      { grade: 94, credits: 15 },
      { grade: 80, credits: 15 },
    ],
  },
  targets: [70, 75, 80],
  activeYear: 2,
};

let state;
let editingKey = null;
let pendingYearConfig = null;

function loadState() {
  try {
    const saved = localStorage.getItem('uni-results-state');
    if (saved) {
      state = JSON.parse(saved);
      for (const year of Object.keys(state.weightings)) {
        state.modules[year] = state.modules[year] || [];
      }
    } else {
      state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    }
  } catch {
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  }
}

function saveState() {
  try {
    localStorage.setItem('uni-results-state', JSON.stringify(state));
  } catch { /* ignore */ }
}

function computeResults() {
  const weightingsStr = {};
  for (const [y, w] of Object.entries(state.weightings)) {
    weightingsStr[String(y)] = w;
  }

  const uni = new UniResults(weightingsStr);

  for (const [year, mods] of Object.entries(state.modules)) {
    for (const mod of mods) {
      uni.addModule(year, mod.grade, mod.credits);
    }
  }

  return uni;
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Classification helpers

function getClassification(avg) {
  if (avg === null || avg === undefined) return null;
  if (avg >= 70) return { label: 'First Class', key: 'first' };
  if (avg >= 60) return { label: 'Upper Second (2:1)', key: 'upper' };
  if (avg >= 50) return { label: 'Lower Second (2:2)', key: 'lower' };
  if (avg >= 40) return { label: 'Third Class', key: 'third' };
  return { label: 'Fail', key: 'fail' };
}

function getModuleClassification(grade) {
  if (grade >= 70) return { label: '1st', key: 'first' };
  if (grade >= 60) return { label: '2:1', key: 'upper' };
  if (grade >= 50) return { label: '2:2', key: 'lower' };
  if (grade >= 40) return { label: '3rd', key: 'third' };
  return { label: 'Fail', key: 'fail' };
}

function getTargetTheme(req) {
  if (req === 0) return { row: 'tr-achieved', status: 'ts-achieved', label: '✓ Achieved' };
  if (req === Infinity || req > 100) return { row: 'tr-impossible', status: 'ts-impossible', label: 'Impossible' };
  if (req >= 90) return { row: 'tr-vhard', status: 'ts-vhard', label: 'Very Hard' };
  if (req >= 75) return { row: 'tr-hard', status: 'ts-hard', label: 'Hard' };
  if (req >= 60) return { row: 'tr-moderate', status: 'ts-moderate', label: 'Moderate' };
  return { row: 'tr-easy', status: 'ts-easy', label: 'On Track' };
}

function fmt(n, dp = 1) {
  return Number(n).toFixed(dp);
}

// Render

function render() {
  const uni = computeResults();
  renderStats(uni);
  renderTabs();
  renderModules();
  renderTargets(uni);
  updateWhatIf();
}

function renderStats(uni) {
  const rwa = uni.getRwa();
  const hasAnyData = Object.values(state.modules).some(m => m.length > 0);

  // RWA card
  const rwaEl = document.getElementById('rwa-display');
  const badgeEl = document.getElementById('classification-badge');
  const breakdownEl = document.getElementById('rwa-breakdown');

  if (!hasAnyData) {
    rwaEl.textContent = '--';
    rwaEl.className = 'rwa-value no-data';
    badgeEl.textContent = 'No data yet';
    breakdownEl.innerHTML = '';
  } else {
    rwaEl.textContent = fmt(rwa) + '%';
    rwaEl.className = 'rwa-value';
    const cls = getClassification(rwa);
    badgeEl.textContent = cls ? cls.label : '--';

    // Breakdown lines: use normalised weights so contributions sum to the displayed RWA
    const activeWeight = Object.entries(state.weightings)
      .reduce((sum, [y, w]) => sum + (uni.getYearAvg(y) !== null ? w : 0), 0);

    const lines = [];
    for (const [year, weight] of Object.entries(state.weightings)) {
      const avg = uni.getYearAvg(year);
      if (avg !== null) {
        const normWeight = weight / activeWeight;
        lines.push(`Year ${year}: ${fmt(avg)}% × ${Math.round(normWeight * 100)}% = ${fmt(normWeight * avg)}%`);
      }
    }
    breakdownEl.innerHTML = lines.join('<br>');
  }

  // Year cards: remove old, re-render
  const overview = document.querySelector('.stats-overview');
  overview.querySelectorAll('.year-stat-card').forEach(el => el.remove());

  const years = Object.keys(state.weightings).map(Number).sort();
  for (const year of years) {
    const avg = uni.getYearAvg(year);
    const credits = uni.getYearCredits(year);
    const total = state.totalCredits[year] || 120;
    const weight = state.weightings[year] || 0;

    const card = document.createElement('div');
    card.className = 'year-stat-card';
    card.innerHTML = `
      <div class="year-stat-header">
        <span class="year-label">Year ${year}</span>
        <span class="year-weight-pill">${Math.round(weight * 100)}% of degree</span>
      </div>
      <div class="year-avg${avg === null ? ' no-data' : ''}">${avg === null ? '--' : fmt(avg) + '%'}</div>
      <div class="year-credits-label">${credits} / ${total} credits</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${Math.min(100, (credits / total) * 100)}%"></div>
      </div>`;
    overview.appendChild(card);
  }
}

function renderTabs() {
  const years = Object.keys(state.weightings).map(Number).sort();
  document.querySelector('.year-tabs').innerHTML = years.map(year =>
    `<button class="tab${year === state.activeYear ? ' active' : ''}" data-year="${year}" onclick="switchTab(${year})">Year ${year}</button>`
  ).join('');
}

function renderModules() {
  const year = state.activeYear;
  const mods = state.modules[year] || [];
  const container = document.getElementById('modules-container');

  if (mods.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        No modules added for Year ${year} yet.<br>Enter a grade above to get started.
      </div>`;
    return;
  }

  let totalCredits = 0;
  let weightedSum = 0;
  mods.forEach(m => { totalCredits += m.credits; weightedSum += m.grade * m.credits; });
  const avg = weightedSum / totalCredits;

  const header = `
    <div class="modules-header">
      <span class="modules-title">Year ${year}: ${mods.length} module${mods.length !== 1 ? 's' : ''}</span>
      <span class="modules-summary">${totalCredits} credits · avg ${fmt(avg)}%</span>
    </div>`;

  const items = mods.map((mod, i) => {
    if (editingKey && editingKey.year === year && editingKey.index === i) {
      const opts = [15, 20, 30, 40, 45, 60]
        .map(c => `<option value="${c}"${c === mod.credits ? ' selected' : ''}>${c} cr</option>`)
        .join('');
      return `
        <div class="module-item module-editing">
          <input class="edit-name" id="edit-name" type="text" value="${escHtml(mod.name || '')}" placeholder="Name" onkeydown="handleEditKey(event,${year},${i})">
          <input class="edit-grade" id="edit-grade" type="number" value="${mod.grade}" min="0" max="100" onkeydown="handleEditKey(event,${year},${i})">
          <select class="edit-credits" id="edit-credits" onkeydown="handleEditKey(event,${year},${i})">${opts}</select>
          <button class="edit-save-btn" onclick="saveEdit(${year},${i})">Save</button>
          <button class="edit-cancel-btn" onclick="cancelEdit()">✕</button>
        </div>`;
    }

    const cls = getModuleClassification(mod.grade);
    const nameHtml = mod.name ? `<span class="module-name">${escHtml(mod.name)}</span>` : '';
    return `
      <div class="module-item">
        <span class="module-num">${i + 1}.</span>
        ${nameHtml}
        <span class="module-grade">${mod.grade}%</span>
        <span class="module-credits-tag">${mod.credits} cr</span>
        <span class="module-cls-tag mc-${cls.key}">${cls.label}</span>
        <button class="edit-btn" onclick="startEdit(${year},${i})" title="Edit">✎</button>
        <button class="delete-btn" onclick="removeModule(${year},${i})" title="Remove">✕</button>
      </div>`;
  }).join('');

  container.innerHTML = `<div class="modules-list">${header}${items}</div>`;
}

function projectedRwa(hypothetical) {
  let numerator = 0;
  let denominator = 0;
  for (const [year, weight] of Object.entries(state.weightings)) {
    const total = state.totalCredits[year] || 0;
    if (total === 0) continue;
    const mods = state.modules[year] || [];
    const completedCredits = mods.reduce((s, m) => s + m.credits, 0);
    const weightedSum = mods.reduce((s, m) => s + m.grade * m.credits, 0);
    const remaining = Math.max(0, total - completedCredits);
    const projYearAvg = (weightedSum + hypothetical * remaining) / total;
    numerator += weight * projYearAvg;
    denominator += weight;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

function updateWhatIf() {
  const input = document.getElementById('whatif-input');
  const resultEl = document.getElementById('whatif-result');
  const val = parseFloat(input.value);
  if (isNaN(val) || val < 0 || val > 100) {
    resultEl.innerHTML = '';
    return;
  }
  const projected = projectedRwa(val);
  const cls = getClassification(projected);
  resultEl.innerHTML = `<span class="whatif-rwa">${fmt(projected)}%</span><span class="whatif-cls">${cls ? cls.label : ''}</span>`;
}

function renderTargets(uni) {
  const container = document.getElementById('targets-display');
  const totalCred = {};
  for (const [y, t] of Object.entries(state.totalCredits)) {
    totalCred[String(y)] = t;
  }

  const rows = state.targets.map(target => {
    const req = uni.requiredAverageForTarget(target, totalCred);
    const theme = getTargetTheme(req);

    let reqStr;
    if (req === 0) {
      reqStr = `${fmt(uni.getRwa())}%`;
    } else if (req === Infinity || req > 100) {
      reqStr = 'N/A';
    } else {
      reqStr = `${fmt(req)}%`;
    }

    return `
      <div class="target-row ${theme.row}">
        <span class="target-percent">${target}%</span>
        <div class="target-body">
          <div class="target-req-label">${req === 0 ? 'Current avg' : 'Needed in remaining'}</div>
          <div class="target-req-value">${reqStr}</div>
        </div>
        <span class="target-status-tag ${theme.status}">${theme.label}</span>
      </div>`;
  }).join('');

  container.innerHTML = rows;
}

// Event handlers

function switchTab(year) {
  editingKey = null;
  state.activeYear = Number(year);
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', Number(t.dataset.year) === state.activeYear);
  });
  renderModules();
}

function addModule() {
  const nameInput = document.getElementById('name-input');
  const gradeInput = document.getElementById('grade-input');
  const creditsInput = document.getElementById('credits-input');

  const grade = parseFloat(gradeInput.value);
  const credits = parseInt(creditsInput.value);

  if (isNaN(grade) || grade < 0 || grade > 100) {
    shake(gradeInput);
    showToast('Please enter a valid grade between 0 and 100');
    return;
  }

  const year = state.activeYear;
  const totalUsed = (state.modules[year] || []).reduce((s, m) => s + m.credits, 0);
  const totalAllowed = state.totalCredits[year] || 120;

  if (totalUsed + credits > totalAllowed) {
    showToast(`Adding ${credits} credits would exceed the ${totalAllowed}-credit limit for Year ${year}`);
    return;
  }

  const name = nameInput.value.trim();
  if (!state.modules[year]) state.modules[year] = [];
  state.modules[year].push({ name, grade, credits });

  nameInput.value = '';
  gradeInput.value = '';
  gradeInput.focus();

  saveState();
  render();
}

function removeModule(year, index) {
  editingKey = null;
  state.modules[year].splice(index, 1);
  saveState();
  render();
}

function startEdit(year, index) {
  editingKey = { year, index };
  renderModules();
}

function saveEdit(year, index) {
  const grade = parseFloat(document.getElementById('edit-grade').value);
  if (isNaN(grade) || grade < 0 || grade > 100) {
    shake(document.getElementById('edit-grade'));
    showToast('Please enter a valid grade between 0 and 100');
    return;
  }

  const credits = parseInt(document.getElementById('edit-credits').value);
  const name = document.getElementById('edit-name').value.trim();

  const otherCredits = state.modules[year].reduce((s, m, i) => i === index ? s : s + m.credits, 0);
  const totalAllowed = state.totalCredits[year] || 120;
  if (otherCredits + credits > totalAllowed) {
    showToast(`Credits would exceed the ${totalAllowed}-credit limit for Year ${year}`);
    return;
  }

  state.modules[year][index] = { name, grade, credits };
  editingKey = null;
  saveState();
  render();
}

function cancelEdit() {
  editingKey = null;
  renderModules();
}

function handleEditKey(event, year, index) {
  if (event.key === 'Enter') saveEdit(year, index);
  if (event.key === 'Escape') cancelEdit();
}

// Settings

function openSettings() {
  pendingYearConfig = {
    weightings: { ...state.weightings },
    totalCredits: { ...state.totalCredits },
  };
  document.getElementById('settings-overlay').classList.remove('hidden');
  renderYearSettings();
  document.getElementById('targets-input').value = state.targets.join(', ');
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.add('hidden');
}

function renderYearSettings() {
  const years = Object.keys(pendingYearConfig.weightings).map(Number).sort();
  const canRemove = years.length > 2;
  document.getElementById('year-settings').innerHTML = years.map(year => {
    const w = Math.round(pendingYearConfig.weightings[year] * 100);
    const t = pendingYearConfig.totalCredits[year] || 120;
    return `
      <div class="year-config-row">
        <span class="year-config-label">Year ${year}</span>
        <div class="input-unit-group">
          <input type="number" name="weight" data-year="${year}" min="0" max="100" value="${w}">
          <span class="unit">%</span>
        </div>
        <div class="input-unit-group">
          <input type="number" name="credits" data-year="${year}" min="1" value="${t}" style="width:60px">
          <span class="unit">cr</span>
        </div>
        ${canRemove ? `<button class="year-remove-btn" onclick="removeYearConfig(${year})" title="Remove Year ${year}">✕</button>` : '<span class="year-remove-placeholder"></span>'}
      </div>`;
  }).join('');
}

function syncPendingFromUI() {
  document.querySelectorAll('#year-settings [name="weight"]').forEach(input => {
    const year = Number(input.dataset.year);
    pendingYearConfig.weightings[year] = parseFloat(input.value) / 100 || 0;
  });
  document.querySelectorAll('#year-settings [name="credits"]').forEach(input => {
    const year = Number(input.dataset.year);
    pendingYearConfig.totalCredits[year] = parseInt(input.value) || 120;
  });
}

function addYearConfig() {
  syncPendingFromUI();
  const years = Object.keys(pendingYearConfig.weightings).map(Number).sort();
  const nextYear = Math.max(...years) + 1;
  pendingYearConfig.weightings[nextYear] = 0;
  pendingYearConfig.totalCredits[nextYear] = 120;
  renderYearSettings();
}

function removeYearConfig(year) {
  if ((state.modules[year] || []).length > 0) {
    showToast(`Year ${year} still has modules. Remove them first.`);
    return;
  }
  syncPendingFromUI();
  const years = Object.keys(pendingYearConfig.weightings).map(Number);
  if (years.length <= 2) return;
  delete pendingYearConfig.weightings[year];
  delete pendingYearConfig.totalCredits[year];
  renderYearSettings();
}

function applySettings() {
  syncPendingFromUI();

  const newWeightings = {};
  for (const [year, w] of Object.entries(pendingYearConfig.weightings)) {
    if (isNaN(w) || w < 0 || w > 1) {
      showToast('Each weighting must be between 0 and 100');
      return;
    }
    newWeightings[Number(year)] = w;
  }

  const totalWeight = Object.values(newWeightings).reduce((s, w) => s + w, 0);
  if (totalWeight > 1.001) {
    showToast('Year weightings cannot exceed 100% in total');
    return;
  }

  const targetsRaw = document.getElementById('targets-input').value;
  const targets = targetsRaw
    .split(',')
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n) && n > 0 && n <= 100)
    .sort((a, b) => a - b);

  if (targets.length === 0) {
    showToast('Please enter at least one valid target');
    return;
  }

  state.weightings = newWeightings;
  state.totalCredits = { ...pendingYearConfig.totalCredits };
  state.targets = targets;

  for (const year of Object.keys(newWeightings)) {
    if (!state.modules[year]) state.modules[year] = [];
  }

  if (!state.weightings[state.activeYear]) {
    state.activeYear = Math.min(...Object.keys(state.weightings).map(Number));
  }

  closeSettings();
  saveState();
  render();
  showToast('Settings updated');
}

function resetSettings() {
  pendingYearConfig = {
    weightings: { 2: 0.4, 3: 0.6 },
    totalCredits: { 2: 120, 3: 120 },
  };
  renderYearSettings();
  document.getElementById('targets-input').value = '70, 75, 80';
}

function handleEnter(event) {
  if (event.key === 'Enter') addModule();
}

let toastTimer;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function shake(el) {
  el.style.animation = 'none';
  el.offsetHeight; // reflow
  el.style.animation = 'shake 0.3s ease';
  setTimeout(() => el.style.animation = '', 300);
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.weightings || !data.totalCredits || !data.modules || !Array.isArray(data.targets)) {
        showToast('Invalid file: missing required fields');
        return;
      }
      for (const mods of Object.values(data.modules)) {
        if (!Array.isArray(mods)) { showToast('Invalid file: modules data is malformed'); return; }
        for (const mod of mods) {
          if (typeof mod.grade !== 'number' || typeof mod.credits !== 'number') {
            showToast('Invalid file: module data is malformed');
            return;
          }
        }
      }
      state = data;
      for (const year of Object.keys(state.weightings)) {
        state.modules[year] = state.modules[year] || [];
      }
      if (!state.weightings[state.activeYear]) {
        state.activeYear = Math.min(...Object.keys(state.weightings).map(Number));
      }
      saveState();
      closeSettings();
      render();
      showToast('Data imported');
    } catch {
      showToast('Could not read file - is it valid JSON?');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function exportCSV() {
  const rows = ['Year,Name,Grade (%),Credits'];
  for (const year of Object.keys(state.modules).map(Number).sort()) {
    for (const mod of (state.modules[year] || [])) {
      const name = (mod.name || '').replace(/"/g, '""');
      rows.push(`${year},"${name}",${mod.grade},${mod.credits}`);
    }
  }
  triggerDownload('uni-results.csv', rows.join('\n'), 'text/csv');
}

function exportJSON() {
  triggerDownload('uni-results.json', JSON.stringify(state, null, 2), 'application/json');
}

function triggerDownload(filename, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

loadState();
render();

// Close settings overlay on background click
document.getElementById('settings-overlay').addEventListener('click', function (e) {
  if (e.target === this) closeSettings();
});
