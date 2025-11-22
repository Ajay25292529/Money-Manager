// ------------------------
// ELEMENTS
// ------------------------
const form = document.getElementById("expense-form");
const titleEl = document.getElementById("title");
const amountEl = document.getElementById("amount");
const categoryEl = document.getElementById("category");
const dateEl = document.getElementById("date");

const listEl = document.getElementById("transactions-list");
const totalEl = document.getElementById("total-amount");
const countEl = document.getElementById("count");
const filterMonth = document.getElementById("filter-month");
const clearAllBtn = document.getElementById("clear-storage");

const tToday = document.getElementById("tToday");
const tWeek = document.getElementById("tWeek");
const tMonth = document.getElementById("tMonth");
const weekTotal = document.getElementById("weekTotal");
const monthTotal = document.getElementById("monthTotal");
const yearTotal = document.getElementById("yearTotal");

const refreshChartsBtn = document.getElementById("refreshCharts");
const downloadPDFBtn = document.getElementById("downloadPDF");

let transactions = [];
let editId = null;

// charts
let pieChart = null;
let barChart = null;

// category metadata (icon filename + color)
const CATEGORY_META = {
  Food:     { icon: 'assets/images/food.png',     color: '#10b981' },
  Transport:{ icon: 'assets/images/transport.png',color: '#06b6d4' },
  Shopping: { icon: 'assets/images/shopping.png', color: '#7c3aed' },
  Bills:    { icon: 'assets/images/bills.png',    color: '#f97316' },
  Other:    { icon: 'assets/images/other.png',    color: '#64748b' }
};

// ------------------------
// STORAGE & HELPERS
// ------------------------
const KEY = "expenses_v1";
const save = () => localStorage.setItem(KEY, JSON.stringify(transactions));
const load = () => transactions = JSON.parse(localStorage.getItem(KEY) || "[]");
const formatAmount = n => "₹" + Number(n).toFixed(2);
const todayISO = () => (new Date()).toISOString().slice(0,10);

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ------------------------
// CALCULATIONS
// ------------------------
function calcTotals(all = transactions){
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0,0,0,0);

  const monthStr = now.toISOString().slice(0,7);
  const year = now.getFullYear();

  let total = 0, today = 0, week = 0, month = 0, yearSum = 0;
  all.forEach(tx=>{
    const amt = Number(tx.amount);
    const d = new Date(tx.date);
    total += amt;
    if (tx.date === todayISO()) today += amt;
    if (d >= startOfWeek) week += amt;
    if (tx.date.startsWith(monthStr)) month += amt;
    if (d.getFullYear() === year) yearSum += amt;
  });

  return { total, today, week, month, year: yearSum };
}

// monthly totals for last 6 months
function monthlySeries(nMonths=6){
  const now = new Date();
  const series = [];
  for(let i = nMonths-1; i>=0; i--){
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0,7); // YYYY-MM
    series.push({ key, label: d.toLocaleString(undefined,{month:'short', year:'numeric'}), value:0 });
  }
  transactions.forEach(tx=>{
    const m = tx.date.slice(0,7);
    const s = series.find(x=>x.key===m);
    if(s) s.value += Number(tx.amount);
  });
  return series;
}

// category totals
function categoryTotals(){
  const cats = { Food:0, Transport:0, Shopping:0, Bills:0, Other:0 };
  transactions.forEach(tx=>{
    if(!cats[tx.category]) cats[tx.category]=0;
    cats[tx.category] += Number(tx.amount);
  });
  return cats;
}

// ------------------------
// RENDER
// ------------------------
function render(){
  listEl.innerHTML = "";
  const fm = filterMonth.value;
  let filtered = transactions.slice().sort((a,b)=> new Date(b.date) - new Date(a.date));
  if(fm) filtered = filtered.filter(t=> t.date.startsWith(fm));

  // totals
  const totals = calcTotals(filtered);
  totalEl.textContent = formatAmount(totals.total);
  countEl.textContent = filtered.length;

  // mini totals (overall - not filtered)
  const allTotals = calcTotals(transactions);
  tToday.textContent = formatAmount(allTotals.today);
  tWeek.textContent = formatAmount(allTotals.week);
  tMonth.textContent = formatAmount(allTotals.month);
  weekTotal.textContent = formatAmount(allTotals.week);
  monthTotal.textContent = formatAmount(allTotals.month);
  yearTotal.textContent = formatAmount(allTotals.year);

  // render each tx with icon + pill + animation
  filtered.forEach(tx=>{
    const li = document.createElement("li");
    li.className = "tx enter";
    li.dataset.id = tx.id;

    // category metadata
    const meta = CATEGORY_META[tx.category] || CATEGORY_META['Other'];
    const color = meta.color;
    const iconSrc = meta.icon;

    li.innerHTML = `
      <div class="tx-left">
        <div class="cat-icon"><img src="${iconSrc}" alt="${tx.category}"></div>
        <div class="title-wrap">
          <div class="title">${escapeHtml(tx.title)}</div>
          <div class="pill" style="background:${color}">${escapeHtml(tx.category)}</div>
          <div class="category" style="color:var(--muted); font-size:12px; margin-top:6px">${tx.date}</div>
        </div>
      </div>

      <div class="right">
        <div class="amount">${formatAmount(tx.amount)}</div>
        <div class="controls">
          <button class="edit" onclick="editTx('${tx.id}')">Edit</button>
          <button class="del" onclick="deleteTx('${tx.id}')">Delete</button>
        </div>
      </div>
    `;

    listEl.appendChild(li);
    // show animation
    requestAnimationFrame(()=> setTimeout(()=> li.classList.add("show"), 20));
  });

  // update charts
  updateCharts();
}

function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ------------------------
// FORM HANDLING
// ------------------------
form.addEventListener("submit", e=>{
  e.preventDefault();
  const t = titleEl.value.trim();
  const a = Number(amountEl.value);
  const c = categoryEl.value;
  const d = dateEl.value;
  if(!t || !a || !d) return alert("Fill all fields");

  if(editId){
    const idx = transactions.findIndex(x=> x.id === editId);
    transactions[idx] = { ...transactions[idx], title: t, amount: a, category: c, date: d };
    editId = null;
    form.querySelector('button[type="submit"]').textContent = "Add Expense";
  } else {
    transactions.push({ id: uid(), title: t, amount: a, category: c, date: d });
  }

  save();
  form.reset();
  render();
});

// ------------------------
// DELETE with animation
// ------------------------
window.deleteTx = id => {
  const el = document.querySelector(`li.tx[data-id="${id}"]`);
  if(el){
    el.classList.add('removing');
    setTimeout(()=>{
      transactions = transactions.filter(t => t.id !== id);
      save();
      render();
    }, 320);
  } else {
    transactions = transactions.filter(t => t.id !== id);
    save();
    render();
  }
};

// ------------------------
// EDIT
// ------------------------
window.editTx = id => {
  const tx = transactions.find(t => t.id === id);
  if(!tx) return;
  titleEl.value = tx.title;
  amountEl.value = tx.amount;
  categoryEl.value = tx.category;
  dateEl.value = tx.date;
  editId = id;
  form.querySelector('button[type="submit"]').textContent = "Save Changes";
};

// ------------------------
// CLEAR ALL
// ------------------------
clearAllBtn.addEventListener("click", ()=>{
  if(!confirm("Clear all saved expenses?")) return;
  transactions = [];
  save();
  render();
});

// ------------------------
// FILTER & SHOW ALL
// ------------------------
filterMonth.addEventListener("change", render);
document.getElementById("showAll").addEventListener("click", ()=>{
  filterMonth.value = "";
  render();
});

// ------------------------
// CHARTS (Chart.js)
// ------------------------
function createCharts(){
  const pieCtx = document.getElementById("pieChart").getContext("2d");
  const barCtx = document.getElementById("barChart").getContext("2d");

  pieChart = new Chart(pieCtx, {
    type: 'pie',
    data: { labels: [], datasets: [{ data: [], backgroundColor: ['#10b981','#06b6d4','#7c3aed','#f97316','#64748b'] }] },
    options: { plugins:{legend:{position:'bottom'}} }
  });

  barChart = new Chart(barCtx, {
    type: 'bar',
    data: { labels: [], datasets: [{ label:'Amount (₹)', data: [], backgroundColor: '#2563eb' }] },
    options: { scales:{y:{beginAtZero:true}} }
  });
}

function updateCharts(){
  // pie
  const cat = categoryTotals();
  const labels = Object.keys(cat);
  const data = Object.values(cat).map(v=> +v.toFixed(2));
  if(pieChart){
    pieChart.data.labels = labels;
    pieChart.data.datasets[0].data = data;
    pieChart.update();
  }

  // bar
  const series = monthlySeries(6);
  if(barChart){
    barChart.data.labels = series.map(s=> s.label);
    barChart.data.datasets[0].data = series.map(s=> +s.value.toFixed(2));
    barChart.update();
  }
}

// ------------------------
// HELP — category & monthly helpers reuse
// ------------------------
function categoryTotals(){
  const cats = { Food:0, Transport:0, Shopping:0, Bills:0, Other:0 };
  transactions.forEach(tx=>{
    if(!cats[tx.category]) cats[tx.category] = 0;
    cats[tx.category] += Number(tx.amount);
  });
  return cats;
}

function monthlySeries(nMonths=6){
  const now = new Date();
  const series = [];
  for(let i = nMonths-1; i>=0; i--){
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0,7);
    series.push({ key, label: d.toLocaleString(undefined,{month:'short', year:'numeric'}), value:0 });
  }
  transactions.forEach(tx=>{
    const m = tx.date.slice(0,7);
    const s = series.find(x=> x.key === m);
    if(s) s.value += Number(tx.amount);
  });
  return series;
}

// ------------------------
// PDF EXPORT (capture container)
// ------------------------
downloadPDFBtn.addEventListener("click", async ()=>{
  const node = document.getElementById("appContainer");
  const scale = 2;
  const canvas = await html2canvas(node, { scale, useCORS:true, allowTaint:true });
  const imgData = canvas.toDataURL('image/png');
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF('p','pt','a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save('expenses-report.pdf');
});

// refresh charts
refreshChartsBtn.addEventListener("click", updateCharts);

// ------------------------
// INIT
// ------------------------
(function init(){
  load();
  createCharts();
  render();
})();
