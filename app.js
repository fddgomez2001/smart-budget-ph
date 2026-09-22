const CATEGORIES = [
  'Rent','Electricity','Water','Internet','Mobile Load','Food','Groceries','Jeepney / Bus / Commute','Fuel','Grab / Taxi','Family Support','Tuition','Medicine','Loans','Giving / Tithes & Offering','Entertainment','Shopping','Travel','Savings','Emergency Fund','Goals','Other'
];

const STORAGE_KEY = 'pinoyhub-smart-budget-v1';
const now = new Date();
const todayISO = now.toISOString().slice(0, 10);

const defaultState = {
  setupComplete: false,
  lastPayday: todayISO,
  incomes: [],
  giving: { enabled: true, mode: 'percentage', percentage: 10, fixedAmount: 0 },
  allocations: { needs: 0, savings: 0, emergency: 0, personal: 0, goals: 0 },
  emergencyTarget: 50000,
  recurringExpenses: [
    { id: crypto.randomUUID(), name: 'Rent', amount: 8000, frequency: 'monthly', category: 'Rent' },
    { id: crypto.randomUUID(), name: 'Electricity', amount: 2500, frequency: 'monthly', category: 'Electricity' },
    { id: crypto.randomUUID(), name: 'Water', amount: 500, frequency: 'monthly', category: 'Water' },
    { id: crypto.randomUUID(), name: 'Internet', amount: 1500, frequency: 'monthly', category: 'Internet' },
    { id: crypto.randomUUID(), name: 'Groceries / Food', amount: 4000, frequency: 'monthly', category: 'Food' },
    { id: crypto.randomUUID(), name: 'Transportation', amount: 2000, frequency: 'monthly', category: 'Jeepney / Bus / Commute' }
  ],
  transactions: [],
  bills: [
    { id: crypto.randomUUID(), provider: 'Meralco (Demo)', amount: 3842.5, dueDate: withMonthOffset(0, 25), frequency: 'recurring', status: 'Upcoming' },
    { id: crypto.randomUUID(), provider: 'Visayan Electric (Demo)', amount: 2156.3, dueDate: withMonthOffset(0, 28), frequency: 'recurring', status: 'Upcoming' },
    { id: crypto.randomUUID(), provider: 'Internet', amount: 1500, dueDate: withMonthOffset(1, 1), frequency: 'recurring', status: 'Upcoming' }
  ],
  goals: [],
  reminders: [],
  filters: { txSearch: '', txPeriod: 'month', txFrom: '', txTo: '', breakdownPeriod: 'month', breakdownFrom: '', breakdownTo: '' }
};

function withMonthOffset(offset, day) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  d.setDate(day);
  return d.toISOString().slice(0, 10);
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return parsed ? { ...defaultState, ...parsed, giving: { ...defaultState.giving, ...parsed.giving }, allocations: { ...defaultState.allocations, ...parsed.allocations }, filters: { ...defaultState.filters, ...parsed.filters } } : { ...defaultState };
  } catch {
    return { ...defaultState };
  }
}

let state = loadState();
const editing = { transactionId: null, recurringExpenseId: null, incomeId: null, billId: null, goalId: null, reminderId: null };

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const els = Object.fromEntries([...document.querySelectorAll('[id]')].map((el) => [el.id, el]));

function peso(v) {
  const n = Number(v);
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number.isFinite(n) ? n : 0);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function monthlyEquivalent(amount, frequency, manualMonthly = 0) {
  const a = num(amount);
  if (frequency === 'monthly') return a;
  if (frequency === 'twice_month') return a * 2;
  if (frequency === 'biweekly') return (a * 26) / 12;
  if (frequency === 'weekly') return (a * 52) / 12;
  if (frequency === 'irregular') return num(manualMonthly);
  return 0;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function totalMonthlyIncome() {
  return state.incomes.reduce((sum, i) => sum + monthlyEquivalent(i.amount, i.frequency, i.manualMonthly), 0);
}

function givingAmount() {
  if (!state.giving.enabled) return 0;
  const income = totalMonthlyIncome();
  if (state.giving.mode === 'fixed') return Math.min(num(state.giving.fixedAmount), income);
  return income * (Math.min(Math.max(num(state.giving.percentage), 0), 100) / 100);
}

function recurringTotal() {
  return state.recurringExpenses.reduce((sum, e) => sum + monthlyEquivalent(e.amount, e.frequency), 0);
}

function monthBounds(which) {
  const d = new Date();
  let start;
  let end;
  if (which === 'week') {
    const day = d.getDay() || 7;
    start = new Date(d); start.setDate(d.getDate() - day + 1); start.setHours(0, 0, 0, 0);
    end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
  } else if (which === 'lastMonth') {
    start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    end = new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
  } else {
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  }
  return { start, end };
}

function filteredTransactions(period = state.filters.txPeriod, customFrom = state.filters.txFrom, customTo = state.filters.txTo) {
  const search = state.filters.txSearch.toLowerCase();
  let start; let end;
  if (period === 'custom') {
    if (!customFrom || !customTo) return [];
    start = new Date(customFrom); start.setHours(0, 0, 0, 0);
    end = new Date(customTo); end.setHours(23, 59, 59, 999);
  } else {
    ({ start, end } = monthBounds(period));
  }
  return state.transactions.filter((t) => {
    const date = new Date(t.date);
    const hitsDate = date >= start && date <= end;
    const hitsSearch = !search || `${t.category} ${t.notes || ''}`.toLowerCase().includes(search);
    return hitsDate && hitsSearch;
  });
}

function committedTotal() {
  const a = state.allocations;
  const plannedNeeds = Math.max(recurringTotal(), num(a.needs));
  return givingAmount() + plannedNeeds + num(a.savings) + num(a.emergency) + num(a.personal) + num(a.goals);
}

function remainingBudget() {
  return Math.max(0, totalMonthlyIncome() - committedTotal());
}

function setSuggestedAllocations() {
  const income = totalMonthlyIncome();
  if (!income) return;
  if (Object.values(state.allocations).every((v) => !num(v))) {
    state.allocations = {
      needs: income * 0.5,
      savings: income * 0.17,
      emergency: income * 0.1,
      personal: income * 0.07,
      goals: income * 0.06
    };
  }
}

function spendingTotal(period = 'month') {
  return filteredTransactions(period).reduce((s, t) => s + num(t.amount), 0);
}

function personalSpent() {
  return filteredTransactions('month').filter((t) => ['Entertainment', 'Shopping', 'Travel'].includes(t.category)).reduce((s, t) => s + num(t.amount), 0);
}

function nextPayday() {
  const primary = state.incomes[0];
  if (!primary) return { date: null, days: 0, cycleDays: 30 };
  const base = state.lastPayday ? new Date(state.lastPayday) : new Date();
  const nowDate = new Date();
  const frequency = primary.frequency;
  let next = new Date(base);
  let cycleDays = 30;
  const baseDay = Math.max(1, Math.min(28, base.getDate()));

  if (frequency === 'twice_month') {
    const secondDay = baseDay <= 15 ? Math.min(28, baseDay + 15) : Math.max(1, baseDay - 15);
    const days = [baseDay, secondDay].sort((a, b) => a - b);
    const candidates = [];
    for (let monthOffset = 0; monthOffset <= 2; monthOffset += 1) {
      const probe = new Date(nowDate.getFullYear(), nowDate.getMonth() + monthOffset, 1);
      const maxDay = daysInMonth(probe.getFullYear(), probe.getMonth());
      days.forEach((day) => candidates.push(new Date(probe.getFullYear(), probe.getMonth(), Math.min(day, maxDay))));
    }
    candidates.sort((a, b) => a - b);
    next = candidates.find((d) => d > nowDate) || candidates[candidates.length - 1];
    const gapA = Math.max(1, days[1] - days[0]);
    const gapB = Math.max(1, 30 - gapA);
    cycleDays = Math.max(gapA, gapB);
  } else if (frequency === 'monthly') {
    const candidates = [];
    for (let monthOffset = 0; monthOffset <= 2; monthOffset += 1) {
      const probe = new Date(nowDate.getFullYear(), nowDate.getMonth() + monthOffset, 1);
      const candidateDay = Math.min(baseDay, daysInMonth(probe.getFullYear(), probe.getMonth()));
      candidates.push(new Date(probe.getFullYear(), probe.getMonth(), candidateDay));
    }
    next = candidates.find((d) => d > nowDate) || candidates[candidates.length - 1];
    cycleDays = daysInMonth(next.getFullYear(), next.getMonth());
  } else {
    const bump = () => {
      if (frequency === 'weekly') { next.setDate(next.getDate() + 7); cycleDays = 7; }
      else if (frequency === 'biweekly') { next.setDate(next.getDate() + 14); cycleDays = 14; }
      else {
        const probe = new Date(next.getFullYear(), next.getMonth() + 1, 1);
        const candidateDay = Math.min(baseDay, daysInMonth(probe.getFullYear(), probe.getMonth()));
        next = new Date(probe.getFullYear(), probe.getMonth(), candidateDay);
        cycleDays = daysInMonth(next.getFullYear(), next.getMonth());
      }
    };
    while (next <= nowDate) bump();
  }
  const days = Math.max(0, Math.ceil((next - nowDate) / (1000 * 60 * 60 * 24)));
  return { date: next, days, cycleDays: Math.max(1, cycleDays) };
}

function render() {
  saveState();
  const income = totalMonthlyIncome();
  const giving = givingAmount();
  const recurring = recurringTotal();
  const committed = committedTotal();
  const available = remainingBudget();
  const currentEmergency = filteredTransactions('month').filter((t) => t.category === 'Emergency Fund').reduce((s, t) => s + num(t.amount), 0);
  const emergencyPercent = state.emergencyTarget ? Math.min(100, (currentEmergency / state.emergencyTarget) * 100) : 0;

  els.onboarding.classList.toggle('hidden', state.setupComplete);
  els.dashboard.classList.toggle('hidden', !state.setupComplete);
  els.mobileNav.classList.toggle('hidden', !state.setupComplete);

  els.monthlyIncomeDisplay.textContent = peso(income);
  els.committedDisplay.textContent = peso(committed);
  els.availableDisplay.textContent = peso(available);
  els.givingAmountDisplay.textContent = peso(giving);

  renderAllocationInputs();
  renderProgress(income, giving, recurring);
  renderRecurringExpenses();
  renderTransactions();
  renderBills();
  renderGoals();
  renderIncomes();
  renderReminders();
  renderWeek();
  renderBreakdown();
  renderInsights();

  els.emergencyCurrent.textContent = peso(currentEmergency);
  els.emergencyTargetDisplay.textContent = peso(state.emergencyTarget);
  els.emergencyProgress.textContent = `${emergencyPercent.toFixed(0)}%`;
  els.emergencyBar.style.width = `${emergencyPercent}%`;
  els.emergencyTarget.value = state.emergencyTarget;

  const payday = nextPayday();
  els.nextPaydayDate.textContent = payday.date ? payday.date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : '-';
  els.daysToPayday.textContent = String(payday.days);
  const daily = available / payday.cycleDays;
  els.untilPaydayAvailable.textContent = peso(Math.min(available, Math.max(0, daily * payday.days)));

  els.givingEnabled.checked = state.giving.enabled;
  els.givingMode.value = state.giving.mode;
  els.givingPercentage.value = state.giving.percentage;
  els.givingFixedAmount.value = state.giving.fixedAmount;
  els.givingPercentWrap.classList.toggle('hidden', state.giving.mode !== 'percentage');
  els.givingAmountWrap.classList.toggle('hidden', state.giving.mode !== 'fixed');
  els.txSearch.value = state.filters.txSearch;
  els.txPeriod.value = state.filters.txPeriod;
  els.txFrom.value = state.filters.txFrom;
  els.txTo.value = state.filters.txTo;
  els.breakdownPeriod.value = state.filters.breakdownPeriod;
  els.customRange.classList.toggle('hidden', state.filters.txPeriod !== 'custom');
  els.breakdownFrom.value = state.filters.breakdownFrom;
  els.breakdownTo.value = state.filters.breakdownTo;
  els.breakdownRange.classList.toggle('hidden', state.filters.breakdownPeriod !== 'custom');
}

function renderAllocationInputs() {
  const entries = [
    ['needs', '🏠 Needs'], ['savings', '💰 Savings'], ['emergency', '🛡️ Emergency Fund'], ['personal', '🎉 Personal / Wants'], ['goals', '🎯 Goals']
  ];
  els.allocationInputs.innerHTML = entries.map(([k, label]) => `<label>${label}<input data-allocation="${k}" type="number" min="0" step="0.01" value="${num(state.allocations[k]).toFixed(2)}" /></label>`).join('');
}

function progressRow(label, used, total) {
  const safeTotal = total > 0 ? total : used;
  const pct = safeTotal ? Math.min(100, (used / safeTotal) * 100) : 0;
  return `<div class="progress-row"><div class="row between"><span>${label}</span><strong>${peso(used)} / ${peso(safeTotal)}</strong></div><div class="progress"><div style="width:${pct}%"></div></div></div>`;
}

function renderProgress(income, giving, recurring) {
  const a = state.allocations;
  const personalBudget = num(a.personal);
  const personalUse = personalSpent();
  els.progressList.innerHTML = [
    progressRow('🙏 Giving', giving, giving),
    progressRow('🏠 Needs', recurring, Math.max(num(a.needs), recurring)),
    progressRow('💰 Savings', num(a.savings), num(a.savings)),
    progressRow('🛡️ Emergency', num(a.emergency), num(a.emergency)),
    progressRow('🎉 Personal', personalUse, personalBudget),
    progressRow('🎯 Goals', num(a.goals), num(a.goals))
  ].join('');
}

function renderRecurringExpenses() {
  if (!state.recurringExpenses.length) {
    els.recurringExpenseList.innerHTML = '<p class="muted">No recurring expenses yet.</p>';
    return;
  }
  els.recurringExpenseList.innerHTML = state.recurringExpenses.map((e) => `<div class="list-item"><div class="row between"><strong>${esc(e.name)}</strong><strong>${peso(e.amount)}</strong></div><p class="muted">${esc(e.frequency)} • ${esc(e.category)} • Monthly eq: ${peso(monthlyEquivalent(e.amount, e.frequency))}</p><div class="row end"><button class="btn" data-edit-recurring="${e.id}">Edit</button><button class="btn warn" data-delete-recurring="${e.id}">Delete</button></div></div>`).join('');
}

function renderTransactions() {
  const txs = filteredTransactions();
  if (!txs.length) {
    els.transactionList.innerHTML = '<p class="muted">No transactions for this filter.</p>';
    return;
  }
  els.transactionList.innerHTML = txs.sort((a, b) => b.date.localeCompare(a.date)).map((t) => `<div class="list-item"><div class="row between"><strong>${peso(t.amount)}</strong><span>${esc(t.category)}</span></div><p class="muted">${esc(t.date)} ${t.notes ? `• ${esc(t.notes)}` : ''}</p><div class="row end"><button class="btn" data-edit-tx="${t.id}">Edit</button><button class="btn warn" data-delete-tx="${t.id}">Delete</button></div></div>`).join('');
}

function renderBills() {
  if (!state.bills.length) {
    els.billList.innerHTML = '<p class="muted">No bills yet.</p>';
    return;
  }
  els.billList.innerHTML = state.bills.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((b) => `<div class="list-item"><div class="row between"><strong>${esc(b.provider)}</strong><strong>${peso(b.amount)}</strong></div><p class="muted">Due ${esc(b.dueDate)} • ${esc(b.frequency)} • ${esc(b.status)}</p><div class="row end"><button class="btn" data-mark-paid="${b.id}">Mark Paid</button><button class="btn" data-edit-bill="${b.id}">Edit</button><button class="btn warn" data-delete-bill="${b.id}">Delete</button></div></div>`).join('');
}

function renderGoals() {
  if (!state.goals.length) {
    els.goalList.innerHTML = '<p class="muted">No goals yet.</p>';
    return;
  }
  els.goalList.innerHTML = state.goals.map((g) => {
    const remaining = Math.max(0, num(g.target) - num(g.current));
    const months = Math.max(1, monthsUntil(g.targetDate));
    const monthlyNeeded = remaining / months;
    const pct = g.target ? Math.min(100, (num(g.current) / num(g.target)) * 100) : 0;
    return `<div class="list-item"><div class="row between"><strong>${esc(g.name)}</strong><strong>${peso(g.current)} / ${peso(g.target)}</strong></div><p class="muted">Remaining: ${peso(remaining)} • Suggested monthly: ${peso(monthlyNeeded)} • Target: ${esc(g.targetDate)}</p><div class="progress"><div style="width:${pct}%"></div></div><div class="row end"><button class="btn" data-edit-goal="${g.id}">Edit</button><button class="btn warn" data-delete-goal="${g.id}">Delete</button></div></div>`;
  }).join('');
}

function renderIncomes() {
  if (!state.incomes.length) {
    els.incomeList.innerHTML = '<p class="muted">No income records yet.</p>';
    return;
  }
  els.incomeList.innerHTML = state.incomes.map((i) => `<div class="list-item"><div class="row between"><strong>${esc(i.type)}</strong><strong>${peso(i.amount)}</strong></div><p class="muted">${esc(i.frequency)} • Monthly eq: ${peso(monthlyEquivalent(i.amount, i.frequency, i.manualMonthly))}</p><div class="row end"><button class="btn" data-edit-income="${i.id}">Edit</button><button class="btn warn" data-delete-income="${i.id}">Delete</button></div></div>`).join('');
}

function renderReminders() {
  if (!state.reminders.length) {
    els.reminderList.innerHTML = '<p class="muted">No reminders yet.</p>';
    return;
  }
  els.reminderList.innerHTML = state.reminders.map((r) => `<div class="list-item"><div class="row between"><strong>${esc(r.title)}</strong><span>${esc(r.date)}</span></div><p class="muted">${esc(r.notes || '')}</p><div class="row end"><button class="btn" data-edit-reminder="${r.id}">Edit</button><button class="btn warn" data-delete-reminder="${r.id}">Delete</button></div></div>`).join('');
}

function renderWeek() {
  const txs = filteredTransactions('week');
  const names = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const values = names.map((_, idx) => {
    const day = idx + 1;
    return txs.filter((t) => {
      const d = new Date(t.date);
      const dow = d.getDay() || 7;
      return dow === day;
    }).reduce((s, t) => s + num(t.amount), 0);
  });
  const max = Math.max(...values, 1);
  els.weeklyChart.innerHTML = names.map((n, i) => `<div class="week-row"><span>${n}</span><div class="week-bar"><div style="width:${(values[i] / max) * 100}%"></div></div><span>${peso(values[i])}</span></div>`).join('');
  const total = values.reduce((s, v) => s + v, 0);
  els.weeklyTotal.textContent = peso(total);
  els.weeklyAverage.textContent = peso(total / 7);
}

function renderBreakdown() {
  const period = state.filters.breakdownPeriod;
  const txs = filteredTransactions(period, state.filters.breakdownFrom, state.filters.breakdownTo);
  const sums = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  txs.forEach((t) => { sums[t.category] = (sums[t.category] || 0) + num(t.amount); });
  const entries = Object.entries(sums).filter(([, amt]) => amt > 0).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, a]) => s + a, 0);
  if (!entries.length || total === 0) {
    els.breakdown.innerHTML = '<p class="muted">No spending data for this period.</p>';
    return;
  }
  els.breakdown.innerHTML = entries.map(([cat, amt]) => {
    const pct = (amt / total) * 100;
    return `<div class="breakdown-row"><span>${cat}</span><div class="bar"><div style="width:${pct}%"></div></div><strong>${pct.toFixed(0)}%</strong></div>`;
  }).join('');
}

function renderInsights() {
  const thisMonth = spendingTotal('month');
  const lastMonth = spendingTotal('lastMonth');
  const transpoThis = filteredTransactions('month').filter((t) => /commute|bus|jeepney|taxi|grab|fuel|transport/i.test(t.category)).reduce((s, t) => s + num(t.amount), 0);
  const transpoLast = filteredTransactions('lastMonth').filter((t) => /commute|bus|jeepney|taxi|grab|fuel|transport/i.test(t.category)).reduce((s, t) => s + num(t.amount), 0);
  const food = filteredTransactions('month').filter((t) => /food|grocer/i.test(t.category)).reduce((s, t) => s + num(t.amount), 0);
  const foodPct = thisMonth ? (food / thisMonth) * 100 : 0;
  const savingsDeposits = filteredTransactions('month').filter((t) => t.category === 'Savings').reduce((s, t) => s + num(t.amount), 0);
  const savingsGap = Math.max(0, num(state.allocations.savings) - savingsDeposits);

  const insights = [
    `You have ${peso(remainingBudget())} remaining in your planned budget.`,
    `You ${transpoThis <= transpoLast ? `spent ${peso(transpoLast - transpoThis)} less` : `spent ${peso(transpoThis - transpoLast)} more`} on transportation than last month.`,
    `Your food spending represents ${foodPct.toFixed(0)}% of this month’s recorded expenses.`,
    `You are ${peso(savingsGap)} away from your monthly savings target.`
  ];
  els.insights.innerHTML = '';
  insights.forEach((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    els.insights.appendChild(li);
  });
}

function monthsUntil(targetDate) {
  const t = new Date(targetDate);
  const n = new Date();
  const diffDays = Math.ceil((t - n) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 1;
  return Math.max(1, Math.ceil(diffDays / 30.4375));
}

function fillCategorySelects() {
  ['expenseForm', 'recurringExpenseForm'].forEach((id) => {
    const select = document.querySelector(`#${id} select[name="category"]`);
    if (select) select.innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join('');
  });
}

function openModal(id) {
  document.getElementById(id).showModal();
}

function setFormValues(form, values) {
  Object.entries(values).forEach(([key, value]) => {
    const el = form.elements.namedItem(key);
    if (el) el.value = value ?? '';
  });
}

function byId(list, id) {
  return list.find((item) => item.id === id);
}

function setupEvents() {
  fillCategorySelects();
  els.lastPayday.value = state.lastPayday;

  ['incomeAmount', 'incomeFrequency', 'manualMonthlyIncome'].forEach((id) => els[id].addEventListener('input', updateEstimate));
  els.incomeFrequency.addEventListener('change', () => {
    els.manualMonthlyWrap.classList.toggle('hidden', els.incomeFrequency.value !== 'irregular');
    updateEstimate();
  });

  els.startBudget.addEventListener('click', () => {
    const amount = num(els.incomeAmount.value);
    const frequency = els.incomeFrequency.value;
    const manualMonthly = num(els.manualMonthlyIncome.value);
    state.incomes = [{ id: crypto.randomUUID(), type: 'Salary', amount, frequency, manualMonthly }];
    state.lastPayday = els.lastPayday.value || todayISO;
    state.setupComplete = true;
    setSuggestedAllocations();
    render();
  });

  document.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => {
    const modal = btn.dataset.open;
    if (modal === 'expenseModal') { editing.transactionId = null; els.expenseForm.reset(); }
    if (modal === 'recurringExpenseModal') { editing.recurringExpenseId = null; els.recurringExpenseForm.reset(); }
    if (modal === 'incomeModal') { editing.incomeId = null; els.incomeForm.reset(); }
    if (modal === 'billModal') { editing.billId = null; els.billForm.reset(); }
    if (modal === 'goalModal') { editing.goalId = null; els.goalForm.reset(); }
    if (modal === 'reminderModal') { editing.reminderId = null; els.reminderForm.reset(); }
    openModal(modal);
  }));
  document.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => {
    const modal = btn.dataset.close;
    if (modal === 'expenseModal') editing.transactionId = null;
    if (modal === 'recurringExpenseModal') editing.recurringExpenseId = null;
    if (modal === 'incomeModal') editing.incomeId = null;
    if (modal === 'billModal') editing.billId = null;
    if (modal === 'goalModal') editing.goalId = null;
    if (modal === 'reminderModal') editing.reminderId = null;
    document.getElementById(modal).close();
  }));
  els.mobileNav.querySelectorAll('a[href^=\"#\"]').forEach((link) => {
    link.addEventListener('click', () => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) setTimeout(() => target.focus(), 0);
    });
  });

  els.expenseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (editing.transactionId) {
      const tx = byId(state.transactions, editing.transactionId);
      if (tx) Object.assign(tx, { amount: num(f.get('amount')), category: String(f.get('category')), date: String(f.get('date')), notes: String(f.get('notes') || '') });
      editing.transactionId = null;
    } else {
      state.transactions.push({ id: crypto.randomUUID(), amount: num(f.get('amount')), category: String(f.get('category')), date: String(f.get('date')), notes: String(f.get('notes') || '') });
    }
    e.target.reset();
    render();
    document.getElementById('expenseModal').close();
  });

  els.recurringExpenseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (editing.recurringExpenseId) {
      const item = byId(state.recurringExpenses, editing.recurringExpenseId);
      if (item) Object.assign(item, { name: String(f.get('name')), amount: num(f.get('amount')), frequency: String(f.get('frequency')), category: String(f.get('category')) });
      editing.recurringExpenseId = null;
    } else {
      state.recurringExpenses.push({ id: crypto.randomUUID(), name: String(f.get('name')), amount: num(f.get('amount')), frequency: String(f.get('frequency')), category: String(f.get('category')) });
    }
    e.target.reset();
    render();
    document.getElementById('recurringExpenseModal').close();
  });

  els.incomeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (editing.incomeId) {
      const item = byId(state.incomes, editing.incomeId);
      if (item) Object.assign(item, { type: String(f.get('type')), amount: num(f.get('amount')), frequency: String(f.get('frequency')), manualMonthly: num(f.get('manualMonthly')) });
      editing.incomeId = null;
    } else {
      state.incomes.push({ id: crypto.randomUUID(), type: String(f.get('type')), amount: num(f.get('amount')), frequency: String(f.get('frequency')), manualMonthly: num(f.get('manualMonthly')) });
    }
    e.target.reset();
    setSuggestedAllocations();
    render();
    document.getElementById('incomeModal').close();
  });

  els.billForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (editing.billId) {
      const item = byId(state.bills, editing.billId);
      if (item) Object.assign(item, { provider: String(f.get('provider')), amount: num(f.get('amount')), dueDate: String(f.get('dueDate')), frequency: String(f.get('frequency')), status: String(f.get('status')) });
      editing.billId = null;
    } else {
      state.bills.push({ id: crypto.randomUUID(), provider: String(f.get('provider')), amount: num(f.get('amount')), dueDate: String(f.get('dueDate')), frequency: String(f.get('frequency')), status: String(f.get('status')) });
    }
    e.target.reset();
    render();
    document.getElementById('billModal').close();
  });

  els.goalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (editing.goalId) {
      const item = byId(state.goals, editing.goalId);
      if (item) Object.assign(item, { name: String(f.get('name')), target: num(f.get('target')), current: num(f.get('current')), targetDate: String(f.get('targetDate')) });
      editing.goalId = null;
    } else {
      state.goals.push({ id: crypto.randomUUID(), name: String(f.get('name')), target: num(f.get('target')), current: num(f.get('current')), targetDate: String(f.get('targetDate')) });
    }
    e.target.reset();
    render();
    document.getElementById('goalModal').close();
  });

  els.reminderForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (editing.reminderId) {
      const item = byId(state.reminders, editing.reminderId);
      if (item) Object.assign(item, { title: String(f.get('title')), date: String(f.get('date')), notes: String(f.get('notes') || '') });
      editing.reminderId = null;
    } else {
      state.reminders.push({ id: crypto.randomUUID(), title: String(f.get('title')), date: String(f.get('date')), notes: String(f.get('notes') || '') });
    }
    e.target.reset();
    render();
    document.getElementById('reminderModal').close();
  });

  document.body.addEventListener('click', (e) => {
    const { target } = e;
    const del = (arr, key) => state[arr] = state[arr].filter((x) => x.id !== key);
    const find = (arr, key) => state[arr].find((x) => x.id === key);

    if (target.dataset.deleteTx) del('transactions', target.dataset.deleteTx);
    if (target.dataset.deleteRecurring) del('recurringExpenses', target.dataset.deleteRecurring);
    if (target.dataset.deleteBill) del('bills', target.dataset.deleteBill);
    if (target.dataset.deleteGoal) del('goals', target.dataset.deleteGoal);
    if (target.dataset.deleteIncome) del('incomes', target.dataset.deleteIncome);
    if (target.dataset.deleteReminder) del('reminders', target.dataset.deleteReminder);

    if (target.dataset.markPaid) {
      const bill = find('bills', target.dataset.markPaid);
      if (bill) bill.status = 'Paid';
    }

    if (target.dataset.editTx) {
      const tx = find('transactions', target.dataset.editTx);
      if (tx) {
        editing.transactionId = tx.id;
        setFormValues(els.expenseForm, { amount: tx.amount, category: tx.category, date: tx.date, notes: tx.notes || '' });
        openModal('expenseModal');
      }
    }
    if (target.dataset.editRecurring) {
      const item = find('recurringExpenses', target.dataset.editRecurring);
      if (item) {
        editing.recurringExpenseId = item.id;
        setFormValues(els.recurringExpenseForm, { name: item.name, amount: item.amount, frequency: item.frequency, category: item.category });
        openModal('recurringExpenseModal');
      }
    }
    if (target.dataset.editBill) {
      const item = find('bills', target.dataset.editBill);
      if (item) {
        editing.billId = item.id;
        setFormValues(els.billForm, { provider: item.provider, amount: item.amount, dueDate: item.dueDate, frequency: item.frequency, status: item.status });
        openModal('billModal');
      }
    }
    if (target.dataset.editGoal) {
      const item = find('goals', target.dataset.editGoal);
      if (item) {
        editing.goalId = item.id;
        setFormValues(els.goalForm, { name: item.name, target: item.target, current: item.current, targetDate: item.targetDate });
        openModal('goalModal');
      }
    }
    if (target.dataset.editIncome) {
      const item = find('incomes', target.dataset.editIncome);
      if (item) {
        editing.incomeId = item.id;
        setFormValues(els.incomeForm, { type: item.type, amount: item.amount, frequency: item.frequency, manualMonthly: item.manualMonthly || '' });
        openModal('incomeModal');
      }
    }
    if (target.dataset.editReminder) {
      const item = find('reminders', target.dataset.editReminder);
      if (item) {
        editing.reminderId = item.id;
        setFormValues(els.reminderForm, { title: item.title, date: item.date, notes: item.notes || '' });
        openModal('reminderModal');
      }
    }

    if (target.dataset.deleteTx || target.dataset.deleteRecurring || target.dataset.deleteBill || target.dataset.deleteGoal || target.dataset.deleteIncome || target.dataset.deleteReminder || target.dataset.markPaid) render();
  });

  document.body.addEventListener('input', (e) => {
    const key = e.target.dataset.allocation;
    if (key) {
      state.allocations[key] = num(e.target.value);
      render();
    }
  });

  els.txSearch.addEventListener('input', () => { state.filters.txSearch = els.txSearch.value; render(); });
  els.txPeriod.addEventListener('change', () => { state.filters.txPeriod = els.txPeriod.value; render(); });
  els.txFrom.addEventListener('change', () => { state.filters.txFrom = els.txFrom.value; render(); });
  els.txTo.addEventListener('change', () => { state.filters.txTo = els.txTo.value; render(); });
  els.breakdownPeriod.addEventListener('change', () => { state.filters.breakdownPeriod = els.breakdownPeriod.value; render(); });
  els.breakdownFrom.addEventListener('change', () => { state.filters.breakdownFrom = els.breakdownFrom.value; render(); });
  els.breakdownTo.addEventListener('change', () => { state.filters.breakdownTo = els.breakdownTo.value; render(); });

  ['givingEnabled', 'givingMode', 'givingPercentage', 'givingFixedAmount'].forEach((id) => {
    els[id].addEventListener('input', () => {
      state.giving.enabled = els.givingEnabled.checked;
      state.giving.mode = els.givingMode.value;
      state.giving.percentage = num(els.givingPercentage.value);
      state.giving.fixedAmount = num(els.givingFixedAmount.value);
      render();
    });
  });

  els.emergencyTarget.addEventListener('input', () => { state.emergencyTarget = num(els.emergencyTarget.value); render(); });

  els.checkAffordability.addEventListener('click', () => {
    const item = els.affordName.value || 'This purchase';
    const amount = num(els.affordAmount.value);
    const discretionary = Math.max(0, num(state.allocations.personal) - personalSpent());
    const diff = discretionary - amount;
    if (!amount) {
      els.affordResult.textContent = 'Enter an amount to compare with your budget.';
      return;
    }
    els.affordResult.textContent = diff >= 0
      ? `${item} fits your current personal spending budget. You still have ${peso(diff)} available.`
      : `This purchase is ${peso(Math.abs(diff))} above your current personal spending budget.`;
  });

  els.saveForIt.addEventListener('click', () => {
    const name = (els.affordName.value || '').trim();
    const amount = num(els.affordAmount.value);
    if (!name || !amount) return;
    state.goals.push({ id: crypto.randomUUID(), name, target: amount, current: 0, targetDate: withMonthOffset(6, 1) });
    render();
  });

  els.adjustBudget.addEventListener('click', () => {
    const input = document.querySelector('input[data-allocation=\"personal\"]');
    if (input) input.focus();
  });

  els.addWishlist.addEventListener('click', () => {
    const name = (els.affordName.value || '').trim();
    if (!name) return;
    state.reminders.push({ id: crypto.randomUUID(), title: `Wishlist: ${name}`, date: todayISO, notes: 'Saved from affordability check' });
    render();
  });
}

function updateEstimate() {
  const amount = num(els.incomeAmount.value);
  const frequency = els.incomeFrequency.value;
  const manual = num(els.manualMonthlyIncome.value);
  els.monthlyEstimate.textContent = `Estimated monthly income: ${peso(monthlyEquivalent(amount, frequency, manual))}`;
}

setupEvents();
updateEstimate();
render();
