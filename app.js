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

function loadState() {
  try {
    const saved = localStorage.getItem('uni-results-state');
    if (saved) {
      state = JSON.parse(saved);
      // Ensure keys are numbers where needed
      state.modules[2] = state.modules[2] || [];
      state.modules[3] = state.modules[3] || [];
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
  renderModules();
  renderTargets(uni);
}

function renderStats(uni) {
  const rwa = uni.getRwa();
  const hasAnyData = Object.values(state.modules).some(m => m.length > 0);

  // RWA
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

  // Year cards
  for (const year of [2, 3]) {
    const avg = uni.getYearAvg(year);
    const credits = uni.getYearCredits(year);
    const total = state.totalCredits[year] || 120;
    const weight = state.weightings[year] || 0;

    const avgEl = document.getElementById(`year${year}-avg`);
    const credEl = document.getElementById(`year${year}-credits`);
    const progEl = document.getElementById(`year${year}-progress`);
    const pillEl = document.getElementById(`year${year}-weight`);

    if (avg === null) {
      avgEl.textContent = '--';
      avgEl.className = 'year-avg no-data';
    } else {
      avgEl.textContent = fmt(avg) + '%';
      avgEl.className = 'year-avg';
    }

    credEl.textContent = `${credits} / ${total} credits`;
    progEl.style.width = `${Math.min(100, (credits / total) * 100)}%`;
    if (pillEl) pillEl.textContent = `${Math.round(weight * 100)}% of degree`;
  }
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
    const cls = getModuleClassification(mod.grade);
    return `
      <div class="module-item">
        <span class="module-num">${i + 1}.</span>
        <span class="module-grade">${mod.grade}%</span>
        <span class="module-credits-tag">${mod.credits} cr</span>
        <span class="module-cls-tag mc-${cls.key}">${cls.label}</span>
        <button class="delete-btn" onclick="removeModule(${year}, ${i})" title="Remove">✕</button>
      </div>`;
  }).join('');

  container.innerHTML = `<div class="modules-list">${header}${items}</div>`;
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
  state.activeYear = Number(year);
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', Number(t.dataset.year) === state.activeYear);
  });
  renderModules();
}

function addModule() {
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

  if (!state.modules[year]) state.modules[year] = [];
  state.modules[year].push({ grade, credits });

  gradeInput.value = '';
  gradeInput.focus();

  saveState();
  render();
}

function removeModule(year, index) {
  state.modules[year].splice(index, 1);
  saveState();
  render();
}

// Settings

function openSettings() {
  document.getElementById('settings-overlay').classList.remove('hidden');

  document.getElementById('weight-2').value = Math.round(state.weightings[2] * 100);
  document.getElementById('weight-3').value = Math.round(state.weightings[3] * 100);
  document.getElementById('total-2').value = state.totalCredits[2];
  document.getElementById('total-3').value = state.totalCredits[3];
  document.getElementById('targets-input').value = state.targets.join(', ');
}

function closeSettings() {
  document.getElementById('settings-overlay').classList.add('hidden');
}

function applySettings() {
  const w2 = parseFloat(document.getElementById('weight-2').value) / 100;
  const w3 = parseFloat(document.getElementById('weight-3').value) / 100;
  const t2 = parseInt(document.getElementById('total-2').value);
  const t3 = parseInt(document.getElementById('total-3').value);
  const targetsRaw = document.getElementById('targets-input').value;

  if (isNaN(w2) || isNaN(w3) || w2 < 0 || w3 < 0) {
    showToast('Please enter valid weightings');
    return;
  }

  const targets = targetsRaw
    .split(',')
    .map(s => parseFloat(s.trim()))
    .filter(n => !isNaN(n) && n > 0 && n <= 100)
    .sort((a, b) => a - b);

  if (targets.length === 0) {
    showToast('Please enter at least one valid target');
    return;
  }

  state.weightings[2] = w2;
  state.weightings[3] = w3;
  state.totalCredits[2] = isNaN(t2) ? 120 : t2;
  state.totalCredits[3] = isNaN(t3) ? 120 : t3;
  state.targets = targets;

  closeSettings();
  saveState();
  render();
  showToast('Settings updated');
}

function resetSettings() {
  document.getElementById('weight-2').value = 40;
  document.getElementById('weight-3').value = 60;
  document.getElementById('total-2').value = 120;
  document.getElementById('total-3').value = 120;
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

loadState();
render();

// Close settings overlay on background click
document.getElementById('settings-overlay').addEventListener('click', function (e) {
  if (e.target === this) closeSettings();
});
