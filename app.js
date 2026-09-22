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
  filters: { txSearch: '', txPeriod: 'month', txFrom: '', txTo: '', breakdownPeriod: 'month' }
};

function withMonthOffset(offset, day) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, day);
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

function monthlyEquivalent(amount, frequency, manualMonthly = 0) {
  const a = num(amount);
  if (frequency === 'monthly') return a;
  if (frequency === 'twice_month') return a * 2;
  if (frequency === 'biweekly') return (a * 26) / 12;
  if (frequency === 'weekly') return (a * 52) / 12;
  if (frequency === 'irregular') return num(manualMonthly);
  return 0;
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

function filteredTransactions(period = state.filters.txPeriod) {
  const search = state.filters.txSearch.toLowerCase();
  let start; let end;
  if (period === 'custom' && state.filters.txFrom && state.filters.txTo) {
    start = new Date(state.filters.txFrom); start.setHours(0, 0, 0, 0);
    end = new Date(state.filters.txTo); end.setHours(23, 59, 59, 999);
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
  return givingAmount() + recurringTotal() + num(a.savings) + num(a.emergency) + num(a.personal) + num(a.goals);
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
  if (!primary) return { date: null, days: 0 };
  const base = state.lastPayday ? new Date(state.lastPayday) : new Date();
  const nowDate = new Date();
  let next = new Date(base);
  const frequency = primary.frequency;
  const bump = () => {
    if (frequency === 'weekly') next.setDate(next.getDate() + 7);
    else if (frequency === 'biweekly') next.setDate(next.getDate() + 14);
    else if (frequency === 'twice_month') next.setDate(next.getDate() + 15);
    else next.setMonth(next.getMonth() + 1);
  };
  while (next <= nowDate) bump();
  const days = Math.max(0, Math.ceil((next - nowDate) / (1000 * 60 * 60 * 24)));
  return { date: next, days };
}

function render() {
  saveState();
  const income = totalMonthlyIncome();
  const giving = givingAmount();
  const recurring = recurringTotal();
  const committed = committedTotal();
  const available = remainingBudget();
  const currentEmergency = num(state.allocations.emergency) + state.goals.filter((g) => g.name.toLowerCase().includes('emergency')).reduce((s, g) => s + num(g.current), 0);
  const emergencyPercent = state.emergencyTarget ? Math.min(100, (currentEmergency / state.emergencyTarget) * 100) : 0;

  els.onboarding.classList.toggle('hidden', state.setupComplete);
  els.dashboard.classList.toggle('hidden', !state.setupComplete);

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
  const monthDaysLeft = Math.max(1, new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate() + 1);
  const daily = available / monthDaysLeft;
  els.untilPaydayAvailable.textContent = peso(Math.max(0, daily * payday.days));

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
  els.recurringExpenseList.innerHTML = state.recurringExpenses.map((e) => `<div class="list-item"><div class="row between"><strong>${e.name}</strong><strong>${peso(e.amount)}</strong></div><p class="muted">${e.frequency} • ${e.category} • Monthly eq: ${peso(monthlyEquivalent(e.amount, e.frequency))}</p><div class="row end"><button class="btn" data-edit-recurring="${e.id}">Edit</button><button class="btn warn" data-delete-recurring="${e.id}">Delete</button></div></div>`).join('');
}

function renderTransactions() {
  const txs = filteredTransactions();
  if (!txs.length) {
    els.transactionList.innerHTML = '<p class="muted">No transactions for this filter.</p>';
    return;
  }
  els.transactionList.innerHTML = txs.sort((a, b) => b.date.localeCompare(a.date)).map((t) => `<div class="list-item"><div class="row between"><strong>${peso(t.amount)}</strong><span>${t.category}</span></div><p class="muted">${t.date} ${t.notes ? `• ${t.notes}` : ''}</p><div class="row end"><button class="btn" data-edit-tx="${t.id}">Edit</button><button class="btn warn" data-delete-tx="${t.id}">Delete</button></div></div>`).join('');
}

function renderBills() {
  if (!state.bills.length) {
    els.billList.innerHTML = '<p class="muted">No bills yet.</p>';
    return;
  }
  els.billList.innerHTML = state.bills.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((b) => `<div class="list-item"><div class="row between"><strong>${b.provider}</strong><strong>${peso(b.amount)}</strong></div><p class="muted">Due ${b.dueDate} • ${b.frequency} • ${b.status}</p><div class="row end"><button class="btn" data-mark-paid="${b.id}">Mark Paid</button><button class="btn" data-edit-bill="${b.id}">Edit</button><button class="btn warn" data-delete-bill="${b.id}">Delete</button></div></div>`).join('');
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
    return `<div class="list-item"><div class="row between"><strong>${g.name}</strong><strong>${peso(g.current)} / ${peso(g.target)}</strong></div><p class="muted">Remaining: ${peso(remaining)} • Suggested monthly: ${peso(monthlyNeeded)} • Target: ${g.targetDate}</p><div class="progress"><div style="width:${pct}%"></div></div><div class="row end"><button class="btn" data-edit-goal="${g.id}">Edit</button><button class="btn warn" data-delete-goal="${g.id}">Delete</button></div></div>`;
  }).join('');
}

function renderIncomes() {
  if (!state.incomes.length) {
    els.incomeList.innerHTML = '<p class="muted">No income records yet.</p>';
    return;
  }
  els.incomeList.innerHTML = state.incomes.map((i) => `<div class="list-item"><div class="row between"><strong>${i.type}</strong><strong>${peso(i.amount)}</strong></div><p class="muted">${i.frequency} • Monthly eq: ${peso(monthlyEquivalent(i.amount, i.frequency, i.manualMonthly))}</p><div class="row end"><button class="btn" data-edit-income="${i.id}">Edit</button><button class="btn warn" data-delete-income="${i.id}">Delete</button></div></div>`).join('');
}

function renderReminders() {
  if (!state.reminders.length) {
    els.reminderList.innerHTML = '<p class="muted">No reminders yet.</p>';
    return;
  }
  els.reminderList.innerHTML = state.reminders.map((r) => `<div class="list-item"><div class="row between"><strong>${r.title}</strong><span>${r.date}</span></div><p class="muted">${r.notes || ''}</p><div class="row end"><button class="btn" data-edit-reminder="${r.id}">Edit</button><button class="btn warn" data-delete-reminder="${r.id}">Delete</button></div></div>`).join('');
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
  const txs = filteredTransactions(period);
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
  const savingsGap = Math.max(0, num(state.allocations.savings) - Math.max(0, totalMonthlyIncome() - givingAmount() - recurringTotal() - thisMonth));

  const insights = [
    `You have ${peso(remainingBudget())} remaining in your planned budget.`,
    `You ${transpoThis <= transpoLast ? `spent ${peso(transpoLast - transpoThis)} less` : `spent ${peso(transpoThis - transpoLast)} more`} on transportation than last month.`,
    `Your food spending represents ${foodPct.toFixed(0)}% of this month’s recorded expenses.`,
    `You are ${peso(savingsGap)} away from your monthly savings target.`
  ];
  els.insights.innerHTML = insights.map((i) => `<li>${i}</li>`).join('');
}

function monthsUntil(targetDate) {
  const t = new Date(targetDate);
  const n = new Date();
  const months = (t.getFullYear() - n.getFullYear()) * 12 + (t.getMonth() - n.getMonth());
  return months <= 0 ? 1 : months;
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

function editWithPrompts(item, fields, onSave) {
  const updates = { ...item };
  for (const f of fields) {
    const next = prompt(f.label, updates[f.key] ?? '');
    if (next === null) return;
    updates[f.key] = f.number ? num(next) : next;
  }
  onSave(updates);
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

  document.querySelectorAll('[data-open]').forEach((btn) => btn.addEventListener('click', () => openModal(btn.dataset.open)));

  els.expenseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.transactions.push({ id: crypto.randomUUID(), amount: num(f.get('amount')), category: String(f.get('category')), date: String(f.get('date')), notes: String(f.get('notes') || '') });
    e.target.reset();
    render();
    document.getElementById('expenseModal').close();
  });

  els.recurringExpenseForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.recurringExpenses.push({ id: crypto.randomUUID(), name: String(f.get('name')), amount: num(f.get('amount')), frequency: String(f.get('frequency')), category: String(f.get('category')) });
    e.target.reset();
    render();
    document.getElementById('recurringExpenseModal').close();
  });

  els.incomeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.incomes.push({ id: crypto.randomUUID(), type: String(f.get('type')), amount: num(f.get('amount')), frequency: String(f.get('frequency')), manualMonthly: num(f.get('manualMonthly')) });
    e.target.reset();
    setSuggestedAllocations();
    render();
    document.getElementById('incomeModal').close();
  });

  els.billForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.bills.push({ id: crypto.randomUUID(), provider: String(f.get('provider')), amount: num(f.get('amount')), dueDate: String(f.get('dueDate')), frequency: String(f.get('frequency')), status: String(f.get('status')) });
    e.target.reset();
    render();
    document.getElementById('billModal').close();
  });

  els.goalForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.goals.push({ id: crypto.randomUUID(), name: String(f.get('name')), target: num(f.get('target')), current: num(f.get('current')), targetDate: String(f.get('targetDate')) });
    e.target.reset();
    render();
    document.getElementById('goalModal').close();
  });

  els.reminderForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.reminders.push({ id: crypto.randomUUID(), title: String(f.get('title')), date: String(f.get('date')), notes: String(f.get('notes') || '') });
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

    if (target.dataset.editTx) editWithPrompts(find('transactions', target.dataset.editTx), [{ key: 'amount', label: 'Amount', number: true }, { key: 'category', label: 'Category' }, { key: 'date', label: 'Date (YYYY-MM-DD)' }, { key: 'notes', label: 'Notes' }], (u) => Object.assign(find('transactions', target.dataset.editTx), u));
    if (target.dataset.editRecurring) editWithPrompts(find('recurringExpenses', target.dataset.editRecurring), [{ key: 'name', label: 'Name' }, { key: 'amount', label: 'Amount', number: true }, { key: 'frequency', label: 'Frequency' }, { key: 'category', label: 'Category' }], (u) => Object.assign(find('recurringExpenses', target.dataset.editRecurring), u));
    if (target.dataset.editBill) editWithPrompts(find('bills', target.dataset.editBill), [{ key: 'provider', label: 'Provider' }, { key: 'amount', label: 'Amount', number: true }, { key: 'dueDate', label: 'Due Date (YYYY-MM-DD)' }, { key: 'frequency', label: 'recurring/one_time' }, { key: 'status', label: 'Upcoming/Paid/Overdue' }], (u) => Object.assign(find('bills', target.dataset.editBill), u));
    if (target.dataset.editGoal) editWithPrompts(find('goals', target.dataset.editGoal), [{ key: 'name', label: 'Goal Name' }, { key: 'target', label: 'Target', number: true }, { key: 'current', label: 'Current', number: true }, { key: 'targetDate', label: 'Target Date (YYYY-MM-DD)' }], (u) => Object.assign(find('goals', target.dataset.editGoal), u));
    if (target.dataset.editIncome) editWithPrompts(find('incomes', target.dataset.editIncome), [{ key: 'type', label: 'Type' }, { key: 'amount', label: 'Amount', number: true }, { key: 'frequency', label: 'Frequency' }, { key: 'manualMonthly', label: 'Manual monthly', number: true }], (u) => Object.assign(find('incomes', target.dataset.editIncome), u));
    if (target.dataset.editReminder) editWithPrompts(find('reminders', target.dataset.editReminder), [{ key: 'title', label: 'Title' }, { key: 'date', label: 'Date (YYYY-MM-DD)' }, { key: 'notes', label: 'Notes' }], (u) => Object.assign(find('reminders', target.dataset.editReminder), u));

    if (target.dataset.deleteTx || target.dataset.deleteRecurring || target.dataset.deleteBill || target.dataset.deleteGoal || target.dataset.deleteIncome || target.dataset.deleteReminder || target.dataset.markPaid || target.dataset.editTx || target.dataset.editRecurring || target.dataset.editBill || target.dataset.editGoal || target.dataset.editIncome || target.dataset.editReminder) render();
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
