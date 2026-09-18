const DATA_URL = '/data/nutrients.csv';
let foods = [];
const aliases = {
  '鸡胸肉':'chicken breast', '鸡肉':'chicken', '鸡腿肉':'chicken thigh', '熟白米饭':'rice white boiled', '白米饭':'rice white boiled', '米饭':'rice white boiled', '大米':'rice white uncooked',
  '西兰花':'broccoli', '胡萝卜':'carrot', '洋葱':'onion', '大蒜':'garlic', '鸡蛋':'egg chicken whole', '三文鱼':'salmon', '牛肉':'beef', '猪肉':'pork', '豆腐':'tofu firm',
  '酱油':'sauce soy commercial', '低盐酱油':'sauce soy commercial reduced salt', '植物油':'oil vegetable', '芝麻油':'oil sesame', '糖':'sugar white', '盐':'salt table iodised', '味噌':'miso',
  'silken tofu':'tofu firm', 'rich unsweetened soy milk':'soy beverage regular fat unfortified', 'sugar':'sugar white', 'glucose syrup':'glucose liquid syrup', 'salt':'salt table iodised'
};
const nutrients = [
  ['Energy (能量)', 'energy', 'kJ', 0], ['Protein (蛋白质)', 'protein', 'g', 1], ['Fat, total (脂肪)', 'fat', 'g', 1],
  ['– saturated (饱和脂肪)', 'satFat', 'g', 1], ['Carbohydrate (碳水化合物)', 'carb', 'g', 1], ['– sugars (糖)', 'sugars', 'g', 1], ['Sodium (钠)', 'sodium', 'mg', 0]
];

function parseCSV(text) {
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (c === '"' && quoted && next === '"') { value += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(value); value = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && next === '\n') i++; row.push(value); if (row.some(v => v.trim())) rows.push(row); row = []; value = ''; }
    else value += c;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}
function num(v) { return Number(String(v || '0').replace(/[,$\s]/g, '')) || 0; }
function normalize(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim(); }
function score(query, food) {
  const q = normalize(query), name = food.normalized;
  if (name.includes(q)) return 100 + q.length;
  const qs = q.split(' ').filter(Boolean), ns = new Set(name.split(' '));
  const overlap = qs.filter(x => ns.has(x)).length;
  return overlap ? (overlap / qs.length) * 70 + (overlap / ns.size) * 20 : 0;
}
function findCandidates(name) {
  const source = aliases[normalize(name)] || name;
  return foods.map(food => ({ food, score: score(source, food) }))
    .filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0, 5);
}
function parseLine(line) {
  const compact = line.trim();
  if (/^total\b|^总计|^合计/i.test(compact)) return { raw: compact, ignored: true };
  const match = compact.match(/([\d,]+(?:\.\d+)?)\s*(kg|公斤|grams?|g|克|ml|毫升)(?=\s|$|[,，;；)）])/i);
  if (!match) return { raw: compact, error: '找不到用量。请使用如“鸡胸肉 300g”的格式。' };
  let grams = Number(match[1].replace(/,/g, '')); const unit = match[2].toLowerCase();
  if (unit === 'kg' || unit === '公斤') grams *= 1000;
  if (unit === 'ml' || unit === '毫升') return { raw: compact, error: '请将液体换算为克，或按供应商规格提供密度后再输入。' };
  const name = compact.replace(match[0], ' ').replace(/[,:：()]/g, ' ').trim();
  if (!name) return { raw: compact, error: '找不到配料名称。' };
  const candidates = findCandidates(name);
  return { raw:compact, name, grams, candidates, selected: candidates.length ? 0 : -1 };
}
function format(value, decimals) { return Number(value || 0).toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); }
function analysisAdvice(perServe, unresolved, targetWeight, ingredientWeight) {
  const result = [];
  if (unresolved) result.push(`有 ${unresolved} 项未能可靠匹配。请先选择准确的食品条目或录入供应商规格，勿以此草稿直接印刷。`);
  if (Math.abs(targetWeight - ingredientWeight) > Math.max(10, targetWeight * .03)) result.push('配料重量与填写的烹饪后成品重量不同；这是正常的水分变化，但请用实际称重的平均出品重量确认。');
  if (perServe.sodium >= 800) result.push(`每份钠为 ${format(perServe.sodium, 0)} mg，偏高。优先核对酱油、味噌、调味酱和腌料；可考虑低盐版本或减少用量。`);
  if (perServe.satFat >= 6) result.push(`每份饱和脂肪为 ${format(perServe.satFat, 1)} g。可评估较瘦肉类、减少黄油/椰浆或改用不饱和植物油。`);
  if (perServe.protein >= 20) result.push(`每份蛋白质约 ${format(perServe.protein, 1)} g。可作为内部产品定位参考；对外使用“高蛋白”等宣称前须单独核对 FSANZ 宣称规则。`);
  if (!result.length) result.push('未发现基于本工具阈值的明显提示；仍请复核配料匹配、品牌差异、烹饪损耗、过敏原及实际出品重量。');
  return result;
}
function renderAnalysis(lines, servings, finishedWeight) {
  const total = { energy:0, protein:0, fat:0, satFat:0, carb:0, sugars:0, sodium:0 };
  let ingredientWeight = 0, matchedCount = 0, unresolved = 0;
  for (const item of lines) {
    const selected = item.candidates?.[item.selected];
    if (!selected || item.error) { unresolved++; continue; }
    item.food = selected.food; item.confidence = selected.score;
    ingredientWeight += item.grams; matchedCount++;
    for (const [, key] of nutrients) total[key] += item.food[key] * item.grams / 100;
  }
  const per100 = Object.fromEntries(Object.entries(total).map(([k,v]) => [k, v / finishedWeight * 100]));
  const perServe = Object.fromEntries(Object.entries(total).map(([k,v]) => [k, v / servings]));
  document.querySelector('#totalWeight').textContent = `${format(finishedWeight, 0)} g`;
  document.querySelector('#serveWeight').textContent = `${format(finishedWeight / servings, 0)} g`;
  document.querySelector('#matchCount').textContent = `${matchedCount} / ${lines.length}`;
  document.querySelector('#ingredientTable').innerHTML = lines.map(item => {
    const selected = item.candidates?.[item.selected];
    const source = item.error ? '需补充用量' : selected ? `${selected.food.name} (${selected.food.key})` : '未计入／待补充规格';
    const proportion = item.grams ? `${format(item.grams / finishedWeight * 100, 2)}%` : '—';
    return `<tr><td>${item.name || item.raw}</td><td>${item.grams ? `${format(item.grams, 1)} g` : '—'}</td><td>${proportion}</td><td>${source}</td></tr>`;
  }).join('');
  document.querySelector('#nutritionTable').innerHTML = nutrients.map(([label,key,unit,decimals]) => `<tr><td>${label}</td><td>${format(perServe[key], decimals)} ${unit}</td><td>${format(per100[key], decimals)} ${unit}</td></tr>`).join('');
  document.querySelector('#matches').innerHTML = lines.map((item, itemIndex) => {
    if (item.error) return `<div class="match"><strong>${item.raw}<span class="tag bad">需补充</span></strong><span class="muted">${item.error}</span></div>`;
    const selected = item.candidates?.[item.selected];
    const options = (item.candidates || []).map((candidate, index) => `<option value="${index}" ${index === item.selected ? 'selected' : ''}>${candidate.food.name} [${candidate.food.key}] — 匹配 ${Math.round(candidate.score)}%</option>`).join('');
    const tag = !selected ? '<span class="tag bad">未计入</span>' : item.confidence < 80 ? '<span class="tag warn">请确认匹配</span>' : '<span class="tag">已匹配</span>';
    return `<div class="match"><strong>${item.name} — ${item.grams}g ${tag}</strong><label class="candidate-label">数据集条目<select class="candidate-select" data-index="${itemIndex}"><option value="-1" ${item.selected === -1 ? 'selected' : ''}>不计入本次计算</option>${options}</select></label>${selected ? `<span class="muted">当前：${selected.food.description || '无描述'}</span>` : '<span class="muted">请从候选项选择，或补充供应商营养规格。</span>'}</div>`;
  }).join('');
  document.querySelectorAll('.candidate-select').forEach(select => select.addEventListener('change', event => {
    lines[Number(event.target.dataset.index)].selected = Number(event.target.value);
    renderAnalysis(lines, servings, finishedWeight);
  }));
  document.querySelector('#advice').innerHTML = analysisAdvice(perServe, unresolved, finishedWeight, ingredientWeight).map(x => `<li>${x}</li>`).join('');
}
function analyse() {
  const servings = Number(document.querySelector('#servings').value), finishedWeight = Number(document.querySelector('#finishedWeight').value);
  const lines = document.querySelector('#recipe').value.split(/\r?\n/).map(parseLine).filter(x => x.raw && !x.ignored);
  if (!servings || !finishedWeight) return alert('请填写有效的份数和烹饪后总重量。');
  renderAnalysis(lines, servings, finishedWeight);
  document.querySelector('#results').hidden = false;
  document.querySelector('#results').scrollIntoView({ behavior:'smooth', block:'start' });
}
async function boot() {
  try {
    const response = await fetch(DATA_URL); const text = await response.text(); const rows = parseCSV(text);
    foods = rows.slice(2).map(row => ({ key:row[0], name:row[1], description:row[2], energy:num(row[3]), protein:num(row[4]), fat:num(row[5]), satFat:num(row[6]), carb:num(row[7]), sugars:num(row[8]), sodium:num(row[9]), normalized:normalize(row[1]) })).filter(x => x.key && x.name);
    document.querySelector('#datasetStatus').textContent = `已载入 ${foods.length.toLocaleString()} 个食品条目`;
    const button = document.querySelector('#analyse'); button.disabled = false; button.textContent = '分析菜谱'; button.addEventListener('click', analyse);
  } catch (error) { document.querySelector('#datasetStatus').textContent = `数据集载入失败：${error.message}`; }
}
boot();
